/*
 * Thử schema.sql trên Postgres chạy trong bộ nhớ (PGlite), không cần tài khoản Supabase.
 * Chạy: node supabase/test.mjs   (từ thư mục app). Thoát mã khác 0 nếu có mục FAIL.
 *
 * Dựng sẵn những thứ Supabase có: schema auth, auth.users, auth.uid(), role authenticated / anon,
 * publication supabase_realtime. Mỗi "người dùng" được giả lập bằng: set role authenticated + đổi claim sub.
 */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const db = new PGlite();

const A = '00000000-0000-4000-8000-00000000000a'; // nhóm trưởng dự án 1
const B = '00000000-0000-4000-8000-00000000000b'; // nhóm trưởng dự án 2 (người ngoài của dự án 1)
const C = '00000000-0000-4000-8000-00000000000c'; // thành viên dự án 1
const D = '00000000-0000-4000-8000-00000000000d'; // người quan sát dự án 1

let pass = 0;
let fail = 0;
const notChecked = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`);
}

async function setUser(role, uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
}

/** Chạy `fn` với tư cách một người đã đăng nhập. */
async function as(uid, fn, role = 'authenticated') {
  await setUser(role, uid);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

/** Trả về thông điệp lỗi, hoặc null nếu câu lệnh chạy được. */
async function errorOf(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return String(e?.message ?? e);
  }
}

const state = (extra = {}) => ({
  version: 1,
  onboarded: true,
  members: [{ id: 'lead-1', code: 'TV-01', name: 'Lan', role: 'owner', background: '', cvName: null }],
  items: [],
  ...extra,
});

// ---------- Dựng môi trường giống Supabase ----------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  insert into auth.users (id, email) values
    ('${A}', 'a@example.test'), ('${B}', 'b@example.test'), ('${C}', 'c@example.test'), ('${D}', 'd@example.test');
`);

let publicationReady = true;
try {
  await db.exec(`create publication supabase_realtime;`);
} catch (e) {
  publicationReady = false;
  notChecked.push(`publication supabase_realtime (PGlite không tạo được: ${e.message})`);
}

// ---------- Nạp schema (hai lần: phải chạy lại được) ----------
const loadErr1 = await errorOf(() => db.exec(schema));
check('schema.sql nạp được', loadErr1 === null, loadErr1 ?? '');
const loadErr2 = await errorOf(() => db.exec(schema));
check('schema.sql chạy lại lần hai không lỗi', loadErr2 === null, loadErr2 ?? '');

if (loadErr1 !== null) {
  console.log('\nKhông nạp được schema nên dừng ở đây.');
  process.exit(1);
}

if (publicationReady) {
  const pub = await q(
    `select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_state'`,
  );
  check('project_state nằm trong publication supabase_realtime', pub.length === 1);
}

// ---------- Lập dự án ----------
const p1 = await as(A, () => one(`select create_project($1, $2::jsonb, $3) as r`, ['Hội chợ sách', JSON.stringify(state()), 'lead-1']));
const P1 = p1.r.project_id;
check('create_project trả project_id và version 1', Boolean(P1) && p1.r.version === 1, JSON.stringify(p1.r));

const p2 = await as(B, () =>
  one(`select create_project($1, $2::jsonb, $3) as r`, [
    'Giải bóng rổ',
    JSON.stringify(state({ members: [{ id: 'lead-2', code: 'TV-01', name: 'Bình', role: 'owner', background: '', cvName: null }] })),
    'lead-2',
  ]),
);
const P2 = p2.r.project_id;

const inv = (await as(A, () => one(`select project_invites($1) as r`, [P1]))).r;
const codeRe = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
check(
  'mã mời: 8 ký tự dễ đọc, hai mã khác nhau',
  codeRe.test(inv.member) && codeRe.test(inv.observer) && inv.member !== inv.observer,
  JSON.stringify(inv),
);

const badCreate = await as(A, () => errorOf(() => q(`select create_project('  ', '{}'::jsonb, 'x')`)));
check('create_project từ chối tên rỗng', /bad_input/.test(badCreate ?? ''), badCreate ?? 'không báo lỗi');

// ---------- Tách biệt giữa hai dự án ----------
const mine = await as(A, () => q(`select * from my_projects()`));
check('my_projects chỉ trả dự án của mình', mine.length === 1 && mine[0].project_id === P1 && mine[0].role === 'owner', JSON.stringify(mine));

const ownState = await as(A, () => q(`select data, version from project_state where project_id = $1`, [P1]));
check('nhóm trưởng đọc được trạng thái dự án mình', ownState.length === 1 && ownState[0].data.members.length === 1);

const otherState = await as(A, () => q(`select data from project_state where project_id = $1`, [P2]));
const allStates = await as(A, () => q(`select project_id from project_state`));
check('không đọc được trạng thái dự án khác', otherState.length === 0 && allStates.length === 1, `${otherState.length}/${allStates.length}`);

const otherMembers = await as(B, () => q(`select * from project_members where project_id = $1`, [P1]));
const otherProject = await as(B, () => q(`select id, name from projects where id = $1`, [P1]));
check('người ngoài không thấy thành viên và tên dự án', otherMembers.length === 0 && otherProject.length === 0);

const outsiderSave = await as(B, () => errorOf(() => q(`select save_state($1, 1, $2::jsonb)`, [P1, JSON.stringify(state())])));
check('người ngoài không lưu được (forbidden)', /forbidden/.test(outsiderSave ?? ''), outsiderSave ?? 'không báo lỗi');

const outsiderInv = await as(B, () => errorOf(() => q(`select project_invites($1)`, [P1])));
check('người ngoài không lấy được mã mời', /forbidden/.test(outsiderInv ?? ''), outsiderInv ?? 'không báo lỗi');

// ---------- Vào dự án bằng mã ----------
const jc = (await as(C, () => one(`select join_project($1, $2) as r`, [`  ${inv.member.toLowerCase().replace(/(.{4})/, '$1 ')} `, 'Minh']))).r;
check('vào bằng mã thành viên (chữ thường, có khoảng trắng) → member', jc.project_id === P1 && jc.role === 'member' && jc.member_id.length === 12, JSON.stringify(jc));

let st = await one(`select data, version from project_state where project_id = $1`, [P1]);
const addedC = st.data.members.find((m) => m.id === jc.member_id);
check(
  'thành viên mới được nối vào data.members với mã TV-02',
  st.data.members.length === 2 && addedC?.code === 'TV-02' && addedC?.name === 'Minh' && addedC?.role === 'member' && addedC?.cvName === null && addedC?.background === '' && Number(st.version) === 2,
  JSON.stringify({ addedC, version: st.version }),
);

const jc2 = (await as(C, () => one(`select join_project($1, $2) as r`, [inv.member, 'Minh lần hai']))).r;
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
check('vào lại không nhân đôi', jc2.member_id === jc.member_id && st.data.members.length === 2 && Number(st.version) === 2);

const jd = (await as(D, () => one(`select join_project($1, $2) as r`, [inv.observer, 'Thầy Hùng']))).r;
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
const addedD = st.data.members.find((m) => m.id === jd.member_id);
check('vào bằng mã quan sát → observer, mã TV-03', jd.role === 'observer' && addedD?.code === 'TV-03' && addedD?.role === 'observer' && Number(st.version) === 3, JSON.stringify(addedD));

const badInvite = await as(D, () => errorOf(() => q(`select join_project('ZZZZZZZZ', 'Ai đó')`)));
check('mã sai → bad_invite', /bad_invite/.test(badInvite ?? ''), badInvite ?? 'không báo lỗi');

// ---------- Lưu trạng thái ----------
const obsRead = await as(D, () => q(`select version from project_state where project_id = $1`, [P1]));
const obsSave = await as(D, () => errorOf(() => q(`select save_state($1, 3, $2::jsonb)`, [P1, JSON.stringify(st.data)])));
check('người quan sát đọc được nhưng không lưu được', obsRead.length === 1 && /forbidden/.test(obsSave ?? ''), obsSave ?? 'không báo lỗi');

const withItems = {
  ...st.data,
  items: [
    { id: 'i1', title: 'Việc đang làm của Minh', status: 'doing', assigneeId: jc.member_id },
    { id: 'i2', title: 'Việc đã xong của Minh', status: 'done', assigneeId: jc.member_id },
    { id: 'i3', title: 'Việc của Lan', status: 'todo', assigneeId: 'lead-1' },
  ],
};
const saved = await as(C, () => one(`select save_state($1, 3, $2::jsonb) as v`, [P1, JSON.stringify(withItems)]));
check('thành viên lưu được, phiên bản tăng lên 4', Number(saved.v) === 4, String(saved.v));

const stale = await as(A, () => one(`select save_state($1, 3, $2::jsonb) as v`, [P1, JSON.stringify({ ...withItems, items: [] })]));
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
check('lưu với phiên bản cũ trả -1 và không ghi đè', Number(stale.v) === -1 && st.data.items.length === 3 && Number(st.version) === 4, `${stale.v} / ${st.data.items.length} việc`);

const escalate = { ...st.data, members: st.data.members.map((m) => (m.id === jc.member_id ? { ...m, role: 'owner' } : m)) };
await as(C, () => q(`select save_state($1, 4, $2::jsonb)`, [P1, JSON.stringify(escalate)]));
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
check('tự sửa vai trò trong tài liệu không có tác dụng (theo bảng project_members)', st.data.members.find((m) => m.id === jc.member_id).role === 'member');

const big = { ...st.data, blob: 'x'.repeat(2 * 1024 * 1024 + 10) };
const tooLarge = await as(A, () => errorOf(() => q(`select save_state($1, $2, $3::jsonb)`, [P1, st.version, JSON.stringify(big)])));
check('tài liệu quá 2 MB bị từ chối (too_large)', /too_large/.test(tooLarge ?? ''), tooLarge ?? 'không báo lỗi');

// ---------- Đổi vai trò ----------
const memberSetsRole = await as(C, () => errorOf(() => q(`select set_member_role($1, $2, 'member')`, [P1, jd.member_id])));
check('thành viên không đổi được vai trò người khác', /forbidden/.test(memberSetsRole ?? ''), memberSetsRole ?? 'không báo lỗi');

await as(A, () => q(`select set_member_role($1, $2, 'observer')`, [P1, jc.member_id]));
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
const rowC = await one(`select role from project_members where project_id = $1 and member_id = $2`, [P1, jc.member_id]);
const item = (id) => st.data.items.find((i) => i.id === id);
check(
  'nhóm trưởng đổi thành viên → người quan sát: bảng, tài liệu, và việc chưa xong được bỏ người làm',
  rowC.role === 'observer' &&
    st.data.members.find((m) => m.id === jc.member_id).role === 'observer' &&
    item('i1').assigneeId === null &&
    item('i2').assigneeId === jc.member_id &&
    item('i3').assigneeId === 'lead-1',
  JSON.stringify({ rowC, items: st.data.items }),
);

const demotedSave = await as(C, () => errorOf(() => q(`select save_state($1, $2, $3::jsonb)`, [P1, st.version, JSON.stringify(st.data)])));
check('sau khi thành người quan sát thì không lưu được nữa', /forbidden/.test(demotedSave ?? ''), demotedSave ?? 'không báo lỗi');

await as(A, () => q(`select set_member_role($1, $2, 'member')`, [P1, jc.member_id]));
const ownerRole = await as(A, () => errorOf(() => q(`select set_member_role($1, 'lead-1', 'member')`, [P1])));
const badRole = await as(A, () => errorOf(() => q(`select set_member_role($1, $2, 'owner')`, [P1, jc.member_id])));
check('không đổi được vai trò của nhóm trưởng, không phong ai làm owner', /forbidden/.test(ownerRole ?? '') && /bad_input/.test(badRole ?? ''), `${ownerRole} / ${badRole}`);

// ---------- Mã mời và ghi trực tiếp ----------
const memberInv = await as(C, () => errorOf(() => q(`select project_invites($1)`, [P1])));
const memberCols = await as(C, () => errorOf(() => q(`select invite_member from projects`)));
const memberProj = await as(C, () => q(`select id, name from projects`));
check(
  'thành viên không đọc được mã mời (qua hàm lẫn qua bảng) nhưng thấy tên dự án',
  /forbidden/.test(memberInv ?? '') && /permission denied/.test(memberCols ?? '') && memberProj.length === 1,
  `${memberInv} / ${memberCols} / ${memberProj.length}`,
);

const direct = await as(A, async () => [
  await errorOf(() => q(`update project_state set data = '{}'::jsonb where project_id = $1`, [P1])),
  await errorOf(() => q(`insert into project_members (project_id, user_id, member_id, role) values ($1, $2, 'hack', 'owner')`, [P2, A])),
  await errorOf(() => q(`delete from projects where id = $1`, [P1])),
  await errorOf(() => q(`update project_members set role = 'owner' where project_id = $1`, [P1])),
  await errorOf(() => q(`insert into ai_usage (project_id, day, count) values ($1, current_date, -100)`, [P1])),
]);
check('ghi trực tiếp vào bảng bị từ chối (kể cả nhóm trưởng)', direct.every((e) => /permission denied/.test(e ?? '')), JSON.stringify(direct));

const anonRead = await as(null, () => errorOf(() => q(`select * from project_state`)), 'anon');
const anonRpc = await as(null, () => errorOf(() => q(`select create_project('x', '{}'::jsonb, 'x')`)), 'anon');
const anonJoin = await as(null, () => errorOf(() => q(`select join_project($1, 'x')`, [inv.member])), 'anon');
check(
  'người chưa đăng nhập (anon) không đọc được bảng, không gọi được hàm',
  /permission denied/.test(anonRead ?? '') && /permission denied/.test(anonRpc ?? '') && /permission denied/.test(anonJoin ?? ''),
  `${anonRead} / ${anonRpc} / ${anonJoin}`,
);

const noUid = await as(null, () => errorOf(() => q(`select create_project('x', '{}'::jsonb, 'x')`)));
check('role authenticated nhưng không có danh tính → unauthenticated', /unauthenticated/.test(noUid ?? ''), noUid ?? 'không báo lỗi');

// ---------- Hạn mức AI ----------
const aiMember = await as(C, () => errorOf(() => q(`select use_ai($1)`, [P1])));
const aiOutsider = await as(B, () => errorOf(() => q(`select use_ai($1)`, [P1])));
check('thành viên và người ngoài không dùng được AI (forbidden)', /forbidden/.test(aiMember ?? '') && /forbidden/.test(aiOutsider ?? ''), `${aiMember} / ${aiOutsider}`);

const remaining = [];
await as(A, async () => {
  for (let i = 0; i < 20; i++) remaining.push((await one(`select use_ai($1) as n`, [P1])).n);
});
check('nhóm trưởng dùng 20 lượt: số lượt còn lại giảm từ 19 về 0', remaining[0] === 19 && remaining[19] === 0 && remaining.length === 20, remaining.join(','));

const ai21 = await as(A, () => errorOf(() => q(`select use_ai($1)`, [P1])));
const usage = await one(`select count from ai_usage where project_id = $1`, [P1]);
check('lượt thứ 21 bị chặn (quota) và bộ đếm dừng ở 20', /quota/.test(ai21 ?? '') && usage.count === 20, `${ai21} / ${usage.count}`);

const aiOther = await as(B, () => one(`select use_ai($1) as n`, [P2]));
check('hạn mức tính riêng từng dự án', aiOther.n === 19, String(aiOther.n));

// ---------- Xoá thành viên ----------
const memberRemoves = await as(C, () => errorOf(() => q(`select remove_member($1, $2)`, [P1, jd.member_id])));
const removeOwner = await as(A, () => errorOf(() => q(`select remove_member($1, 'lead-1')`, [P1])));
check('thành viên không xoá được ai; nhóm trưởng không tự xoá mình', /forbidden/.test(memberRemoves ?? '') && /forbidden/.test(removeOwner ?? ''), `${memberRemoves} / ${removeOwner}`);

// Giao lại một việc cho Minh rồi xoá Minh: mọi việc của Minh (kể cả đã xong) phải mất người làm.
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
const reassigned = { ...st.data, items: st.data.items.map((i) => (i.id === 'i1' ? { ...i, assigneeId: jc.member_id } : i)) };
await as(A, () => q(`select save_state($1, $2, $3::jsonb)`, [P1, st.version, JSON.stringify(reassigned)]));
await as(A, () => q(`select remove_member($1, $2)`, [P1, jc.member_id]));
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
const rowsC = await q(`select 1 from project_members where project_id = $1 and user_id = $2`, [P1, C]);
check(
  'xoá thành viên: mất membership, mất khỏi data.members, việc của họ bỏ người làm',
  rowsC.length === 0 &&
    !st.data.members.some((m) => m.id === jc.member_id) &&
    item('i1').assigneeId === null &&
    item('i2').assigneeId === null &&
    item('i3').assigneeId === 'lead-1',
  JSON.stringify(st.data.items),
);

const removedRead = await as(C, () => q(`select 1 from project_state where project_id = $1`, [P1]));
const removedSave = await as(C, () => errorOf(() => q(`select save_state($1, $2, $3::jsonb)`, [P1, st.version, JSON.stringify(st.data)])));
check('người bị xoá không đọc, không lưu được nữa', removedRead.length === 0 && /forbidden/.test(removedSave ?? ''), `${removedRead.length} / ${removedSave}`);

const rejoin = (await as(C, () => one(`select join_project($1, $2) as r`, [inv.member, 'Minh']))).r;
st = await one(`select data from project_state where project_id = $1`, [P1]);
check('người bị xoá vào lại bằng mã thì thành thành viên mới, mã TV-04', rejoin.member_id !== jc.member_id && st.data.members.find((m) => m.id === rejoin.member_id)?.code === 'TV-04', JSON.stringify(st.data.members));

// ---------- Đổi tên dự án ----------
// Nhóm trưởng đổi settings.company → tên ở danh sách dự án đổi theo; thành viên đổi thì không; tên rỗng thì giữ tên cũ.
const nameOf = async () => (await q(`select name from projects where id = $1`, [P1]))[0].name;
const before = await nameOf();
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
const renameBy = (uid, company) =>
  as(uid, () => one(`select save_state($1, $2, $3::jsonb) as v`, [P1, st.version, JSON.stringify({ ...st.data, settings: { ...st.data.settings, company } })]));
await renameBy(C, 'Tên do thành viên đặt');
const afterMember = await nameOf();
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
await renameBy(A, '   ');
const afterEmpty = await nameOf();
st = await one(`select data, version from project_state where project_id = $1`, [P1]);
await renameBy(A, '  Dự án đổi tên  ');
const afterOwner = await nameOf();
const listed = await as(A, () => q(`select name from my_projects()`));
check(
  'đổi tên dự án: chỉ nhóm trưởng, tên rỗng thì giữ tên cũ, danh sách dự án đổi theo',
  afterMember === before && afterEmpty === before && afterOwner === 'Dự án đổi tên' && listed[0]?.name === 'Dự án đổi tên',
  `${before} / ${afterMember} / ${afterEmpty} / ${afterOwner} / ${JSON.stringify(listed)}`,
);

// ---------- Kết quả ----------
console.log(`\n${pass} mục qua, ${fail} mục hỏng.`);
if (notChecked.length > 0) console.log(`Chưa kiểm được: ${notChecked.join('; ')}`);
await db.close();
process.exit(fail === 0 ? 0 : 1);
