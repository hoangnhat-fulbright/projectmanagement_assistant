#!/usr/bin/env node
/*
 * Đưa app lên mạng bằng một lệnh:  npm run deploy
 *
 * Script tự làm: tạo project Supabase, nạp supabase/schema.sql, ghi địa chỉ + khoá công khai vào .env,
 * tạo project Vercel, đặt biến môi trường, đưa app lên, rồi khai báo địa chỉ web và mẫu thư cho Supabase.
 *
 * Script KHÔNG làm thay bạn: tạo tài khoản Supabase / Vercel, bấm xác nhận đăng nhập trên trình duyệt
 * (hai lần, mỗi dịch vụ một lần), và điền khoá Anthropic vào .env.
 *
 * Chạy lại an toàn: tiến độ được ghi ở .deploy-state.json, bước đã xong sẽ được bỏ qua hoặc làm lại không hại gì.
 * Tuỳ chọn:  --name <tên>   --region <vùng Supabase>   --skip-vercel   --dry-run (chỉ in các lệnh sẽ chạy)
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, '.env');
const STATE_FILE = join(ROOT, '.deploy-state.json');
const SUPABASE = ['--yes', 'supabase@3.1.0'];
const VERCEL = ['--yes', 'vercel@65.16.0'];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DRY = flag('dry-run');
const REGION = opt('region', 'ap-southeast-1');

/* ---------- tiện ích ---------- */

const say = (msg) => console.log(msg);
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const fail = (msg) => {
  console.error(`\nDừng lại: ${msg}`);
  console.error('Sửa xong, chạy lại "npm run deploy" — các bước đã xong không bị làm lại.');
  process.exit(1);
};

/** Che mật khẩu / khoá khi in lệnh ra màn hình. */
const shown = (args) => args.map((a, i) => (args[i - 1] === '--db-password' ? '********' : a)).join(' ');

/**
 * Chạy một công cụ dòng lệnh qua npx.
 * mode 'show' = in thẳng ra màn hình (dùng cho bước cần bạn thao tác); 'capture' = lấy kết quả về xử lý.
 */
function cli(pkg, args, { mode = 'capture', input, mutates = false } = {}) {
  if (DRY && mutates) {
    say(`   (dry-run) npx ${pkg[1]} ${shown(args)}`);
    return { ok: true, out: '', err: '' };
  }
  const res = spawnSync('npx', [...pkg, ...args], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    stdio: mode === 'show' ? 'inherit' : [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: res.status === 0, out: res.stdout ?? '', err: res.stderr ?? '' };
}
const sb = (args, o) => cli(SUPABASE, args, o);
const vc = (args, o) => cli(VERCEL, args, o);

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveState(state) {
  if (!DRY) writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

/** Đọc một biến trong .env (không in ra màn hình). */
export function envGet(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}
/** Ghi một biến vào .env, giữ nguyên các dòng khác. */
export function envSet(text, key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=.*$`, 'm').test(text)) return text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  return `${text.replace(/\n*$/, '\n')}${line}\n`;
}

/** Tìm trong một cấu trúc JSON bất kỳ chuỗi đầu tiên thoả điều kiện. */
export function findString(value, test) {
  if (typeof value === 'string') return test(value) ? value : null;
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      const hit = findString(v, test);
      if (hit) return hit;
    }
  }
  return null;
}
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/[[{]/);
    if (start < 0) return null;
    try {
      return JSON.parse(text.slice(start));
    } catch {
      return null;
    }
  }
};
const asList = (json) => (Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : json ? Object.values(json).find(Array.isArray) ?? [] : []);
const REF = /\b[a-z]{20}\b/;

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(question, fallback = '') {
  if (!process.stdin.isTTY) return fallback;
  const a = (await rl.question(fallback ? `${question} [${fallback}] ` : `${question} `)).trim();
  return a || fallback;
}
const yes = async (question, def = false) => /^(y|yes|c|co|có)$/i.test(await ask(`${question} (${def ? 'Y/n' : 'y/N'})`, def ? 'y' : 'n'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- các bước ---------- */

async function main() {
  const state = loadState();
  say('Đưa app lên mạng (Supabase + Vercel).');
  say('Bạn cần sẵn: một tài khoản Supabase và một tài khoản Vercel (tạo trên trang web của họ).');
  if (DRY) say('Chế độ dry-run: không tạo hay sửa gì trên Supabase / Vercel.');

  /* 0. .env và khoá AI */
  step(0, 'Kiểm tra file .env');
  if (!existsSync(ENV_FILE)) {
    copyFileSync(join(ROOT, '.env.example'), ENV_FILE);
    say('   Đã tạo .env từ .env.example.');
  }
  let env = readFileSync(ENV_FILE, 'utf8');
  const hasAi = envGet(env, 'ANTHROPIC_API_KEY') !== '';
  if (!hasAi) {
    say('   .env chưa có ANTHROPIC_API_KEY. Bản trên mạng sẽ chạy không có AI (dùng gợi ý theo mẫu).');
    if (!(await yes('   Tiếp tục không có AI?', true))) fail('Điền ANTHROPIC_API_KEY vào app/.env rồi chạy lại.');
  } else {
    say('   Đã có khoá AI trong .env (sẽ được chuyển sang Vercel, không in ra màn hình).');
  }

  const name = opt('name', state.name) || (await ask('Tên project (chữ thường, số, gạch nối):', 'tro-ly-tuan'));
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(name)) fail('Tên project chỉ gồm chữ thường, số và gạch nối.');
  state.name = name;
  saveState(state);

  /* 1. Đăng nhập Supabase */
  step(1, 'Đăng nhập Supabase');
  if (!DRY && !sb(['whoami']).ok) {
    say('   Một trang trình duyệt sẽ mở ra. Đăng nhập Supabase và bấm xác nhận, rồi quay lại đây.');
    sb(['login'], { mode: 'show' });
    if (!sb(['whoami']).ok) fail('Chưa đăng nhập được Supabase.');
  }
  say('   Đã đăng nhập.');

  /* 2. Project Supabase */
  step(2, 'Project Supabase');
  if (!state.supabaseRef) {
    const projects = DRY ? [] : asList(parseJson(sb(['projects', 'list', '--output-format', 'json']).out));
    const same = projects.find((p) => p?.name === name);
    const sameRef = same ? findString(same, (s) => /^[a-z]{20}$/.test(s)) : null;
    if (sameRef && (await yes(`   Đã có project Supabase tên "${name}". Dùng lại project này?`, true))) {
      state.supabaseRef = sameRef;
    } else {
      const orgs = DRY
        ? [{ id: 'dry-run-org', name: '(dry-run)' }]
        : asList(parseJson(sb(['orgs', 'list', '--output-format', 'json']).out)).filter((o) => o?.id);
      if (orgs.length === 0) {
        fail('Tài khoản Supabase chưa có tổ chức (organization) nào. Vào https://supabase.com/dashboard tạo một tổ chức miễn phí rồi chạy lại.');
      }
      let org = orgs[0];
      if (orgs.length > 1) {
        orgs.forEach((o, i) => say(`   ${i + 1}. ${o.name ?? o.id}`));
        const pick = Number(await ask('   Tạo project trong tổ chức số mấy?', '1'));
        org = orgs[pick - 1] ?? orgs[0];
      }
      // Mật khẩu cơ sở dữ liệu: sinh ngẫu nhiên, cất vào file riêng để bạn dùng khi cần. Script không cần tới nó nữa.
      const password = randomBytes(18).toString('base64url');
      if (!DRY) {
        const pwFile = join(ROOT, 'supabase', '.db-password');
        writeFileSync(pwFile, `${password}\n`);
        chmodSync(pwFile, 0o600);
      }
      say(`   Đang tạo project "${name}" ở vùng ${REGION} (gói miễn phí)…`);
      const made = sb(
        ['projects', 'create', name, '--org-id', String(org.id), '--db-password', password, '--region', REGION, '--output-format', 'json', '--yes'],
        { mutates: true },
      );
      if (!made.ok) fail(`Supabase không tạo được project.\n${made.err || made.out}`);
      state.supabaseRef = DRY ? 'abcdefghijklmnopqrst' : (findString(parseJson(made.out), (s) => /^[a-z]{20}$/.test(s)) ?? made.out.match(REF)?.[0]);
      if (!state.supabaseRef) fail(`Không đọc được mã project từ kết quả của Supabase:\n${made.out}`);
      if (!DRY) say('   Đã tạo. Mật khẩu cơ sở dữ liệu nằm ở app/supabase/.db-password (không đưa file này cho ai).');
    }
    saveState(state);
  }
  const ref = state.supabaseRef;
  const supabaseUrl = `https://${ref}.supabase.co`;
  say(`   Project: ${ref}`);

  /* 3. Chờ cơ sở dữ liệu sẵn sàng rồi nạp schema */
  step(3, 'Nạp cơ sở dữ liệu (supabase/schema.sql)');
  if (!DRY) {
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      ready = sb(['db', 'query', `--remote=${ref}`, '--read-only', 'select 1']).ok;
      if (!ready) {
        if (i === 0) say('   Project mới cần vài phút để khởi động. Đang chờ…');
        await sleep(10_000);
      }
    }
    if (!ready) fail('Cơ sở dữ liệu chưa sẵn sàng sau 6 phút. Chờ thêm rồi chạy lại.');
  }
  const applied = sb(['db', 'query', `--remote=${ref}`, '--file', 'supabase/schema.sql', '--yes'], { mutates: true });
  if (!applied.ok) fail(`Nạp schema.sql bị lỗi.\n${applied.err || applied.out}`);
  say('   Đã tạo bảng, quyền truy cập và các hàm.');

  /* 4. Ghi địa chỉ + khoá công khai vào .env */
  step(4, 'Ghi thông tin Supabase vào .env');
  let publishable = 'sb_publishable_dry_run';
  if (!DRY) {
    const keys = parseJson(sb(['projects', 'api-keys', `--remote=${ref}`, '--output-format', 'json']).out);
    publishable =
      findString(keys, (s) => s.startsWith('sb_publishable_')) ??
      findString(asList(keys).find((k) => k?.name === 'anon'), (s) => s.startsWith('eyJ'));
    if (!publishable) {
      fail(`Không lấy được khoá công khai. Mở https://supabase.com/dashboard/project/${ref}/settings/api-keys, chép Publishable key vào dòng VITE_SUPABASE_KEY trong app/.env rồi chạy lại.`);
    }
    env = envSet(envSet(env, 'VITE_SUPABASE_URL', supabaseUrl), 'VITE_SUPABASE_KEY', publishable);
    writeFileSync(ENV_FILE, env);
  }
  say('   Đã ghi VITE_SUPABASE_URL và VITE_SUPABASE_KEY (khoá công khai, dùng được trên trình duyệt).');

  let siteUrl = state.url ?? null;

  if (flag('skip-vercel')) {
    say('\nBỏ qua Vercel theo yêu cầu (--skip-vercel). Chạy "npm run dev" để thử đăng nhập thật trên máy.');
  } else {
    /* 5. Đăng nhập Vercel */
    step(5, 'Đăng nhập Vercel');
    if (!DRY && !vc(['whoami']).ok) {
      say('   Làm theo hướng dẫn hiện ra (mở link, xác nhận trên trình duyệt), rồi quay lại đây.');
      vc(['login'], { mode: 'show' });
      if (!vc(['whoami']).ok) fail('Chưa đăng nhập được Vercel.');
    }
    say('   Đã đăng nhập.');

    /* 6. Project Vercel + biến môi trường */
    step(6, 'Project Vercel và biến môi trường');
    let linked = vc(['link', '--yes', '--project', name], { mutates: true });
    if (!linked.ok) {
      vc(['project', 'add', name], { mutates: true });
      linked = vc(['link', '--yes', '--project', name], { mutates: true });
    }
    if (!linked.ok) fail(`Không tạo / nối được project Vercel "${name}".\n${linked.err || linked.out}`);
    const vars = [
      ['VITE_SUPABASE_URL', supabaseUrl, '--no-sensitive'],
      ['VITE_SUPABASE_KEY', publishable, '--no-sensitive'],
    ];
    if (hasAi) vars.push(['ANTHROPIC_API_KEY', envGet(env, 'ANTHROPIC_API_KEY'), '--sensitive']);
    for (const [key, value, kind] of vars) {
      // Giá trị đi qua stdin, không nằm trong dòng lệnh.
      const set = vc(['env', 'add', key, '--environment', 'production,preview', '--force', '--yes', kind], { input: value, mutates: true });
      if (!set.ok) fail(`Không đặt được biến ${key} trên Vercel.\n${set.err || set.out}`);
      say(`   Đã đặt ${key}.`);
    }

    /* 7. Đưa lên */
    step(7, 'Build và đưa app lên Vercel (mất 1–2 phút)');
    const deployed = vc(['deploy', '--prod', '--yes'], { mutates: true });
    if (!deployed.ok) fail(`Vercel báo lỗi khi đưa app lên.\n${deployed.err || deployed.out}`);
    if (DRY) {
      siteUrl = `https://${name}.vercel.app`;
    } else {
      const deployment = (deployed.out.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/g) ?? []).pop();
      const inspected = deployment ? vc(['inspect', deployment]) : { out: '', err: '' };
      const hosts = [...new Set(`${deployed.out}\n${deployed.err}\n${inspected.out}\n${inspected.err}`.match(/[a-z0-9-]+\.vercel\.app/g) ?? [])];
      // Địa chỉ chính thức là tên ngắn nhất; địa chỉ riêng của từng lần đưa lên dài hơn và có thể bị khoá.
      hosts.sort((a, b) => a.length - b.length);
      siteUrl = hosts.length ? `https://${hosts[0]}` : deployment;
      if (!siteUrl) fail(`Không đọc được địa chỉ web từ kết quả của Vercel:\n${deployed.out}`);
    }
    state.url = siteUrl;
    saveState(state);
    say(`   Địa chỉ web: ${siteUrl}`);
  }

  /* 8. Khai báo địa chỉ web và mẫu thư cho Supabase */
  step(8, 'Thiết lập đăng nhập trên Supabase (địa chỉ web, mẫu thư có mã 6 số)');
  const redirects = [...new Set([siteUrl, 'http://localhost:5173'].filter(Boolean))];
  const configText = (withTemplates) =>
    [
      '# File này do scripts/deploy.mjs sinh ra. Chỉ những mục khai báo ở đây mới được đẩy lên Supabase;',
      '# các thiết lập khác của project giữ nguyên.',
      `project_id = "${name}"`,
      '',
      '[auth]',
      `site_url = "${siteUrl ?? 'http://localhost:5173'}"`,
      `additional_redirect_urls = [${redirects.map((u) => `"${u}"`).join(', ')}]`,
      '',
      ...(withTemplates
        ? [
            '# Người đã có tài khoản nhận mẫu magic_link; người mới nhận mẫu confirmation.',
            '[auth.email.template.magic_link]',
            'subject = "Mã đăng nhập của bạn"',
            'content_path = "./supabase/templates/login.html"',
            '',
            '[auth.email.template.confirmation]',
            'subject = "Mã đăng nhập của bạn"',
            'content_path = "./supabase/templates/login.html"',
            '',
          ]
        : [
            '# Chưa khai báo mẫu thư: gói miễn phí chỉ cho sửa mẫu thư sau khi gắn dịch vụ gửi thư riêng (SMTP).',
            '# Gắn xong, chạy lại "npm run deploy" để thư có mã 6 số.',
            '',
          ]),
    ].join('\n');
  const pushConfig = (withTemplates) => {
    if (!DRY) {
      mkdirSync(join(ROOT, 'supabase', 'templates'), { recursive: true });
      writeFileSync(join(ROOT, 'supabase', 'config.toml'), configText(withTemplates));
    }
    return sb(['config', 'push', `--remote=${ref}`, '--yes'], { mutates: true });
  };
  const manual = [];
  let pushed = pushConfig(true);
  if (pushed.ok) {
    say('   Đã đặt địa chỉ web và mẫu thư.');
  } else if (/email_templates|Email template modification/i.test(`${pushed.err}\n${pushed.out}`)) {
    // Gói miễn phí + thư mặc định của Supabase: không được sửa mẫu thư. Vẫn đặt địa chỉ web để đăng nhập bằng link chạy được.
    pushed = pushConfig(false);
    if (pushed.ok) {
      say('   Đã đặt địa chỉ web. Mẫu thư CHƯA đổi được: Supabase chỉ cho sửa mẫu thư sau khi gắn dịch vụ gửi thư riêng.');
      say('   Trước mắt thư đăng nhập chỉ có link (bấm vào là vào app), chưa có mã 6 số.');
      manual.push('Sau khi gắn dịch vụ gửi thư riêng (mục dưới), chạy lại "npm run deploy" để thư đăng nhập có mã 6 số.');
    }
  }
  if (!pushed.ok) {
    say('   Chưa đặt tự động được. Lý do Supabase báo:');
    say(`   ${(pushed.err || pushed.out).trim().split('\n').slice(-6).join('\n   ')}`);
    manual.push(
      `Đặt Site URL = ${siteUrl ?? '(địa chỉ web của app)'} và thêm vào Redirect URLs: https://supabase.com/dashboard/project/${ref}/auth/url-configuration`,
      `Dán nội dung app/supabase/templates/login.html vào hai mẫu "Magic Link" và "Confirm signup": https://supabase.com/dashboard/project/${ref}/auth/templates`,
    );
  }

  /* 9. Kiểm tra nhanh */
  if (siteUrl && !DRY) {
    step(9, 'Kiểm tra nhanh');
    try {
      const page = await fetch(siteUrl);
      say(`   Trang web trả mã ${page.status}${page.status === 200 ? ' (mở được)' : ''}.`);
      if (page.status === 401) {
        manual.push('Trang đang bị khoá (Deployment Protection). Vào Vercel → Settings → Deployment Protection để mở cho mọi người.');
      }
      const ai = await fetch(`${siteUrl}/api/ai?do=status`);
      const info = ai.ok ? await ai.json() : null;
      say(info ? `   Phần AI: ${info.enabled ? 'đang bật' : 'đang tắt'}; kiểm tra đăng nhập: ${info.protected ? 'có' : 'KHÔNG'}.` : `   Phần AI trả mã ${ai.status}.`);
      if (info && info.enabled && !info.protected) manual.push('Phần AI chưa kiểm tra đăng nhập. Kiểm tra lại hai biến VITE_SUPABASE_... trên Vercel rồi chạy lại script.');
    } catch {
      say('   Chưa mở được trang (có thể cần thêm một phút). Thử mở bằng trình duyệt.');
    }
  }

  /* Tổng kết */
  manual.push(
    `Gắn dịch vụ gửi thư riêng (thư mặc định của Supabase chỉ gửi 2 thư mỗi giờ): https://supabase.com/dashboard/project/${ref}/auth/smtp`,
  );
  say('\n==============================================');
  say(siteUrl ? `Xong. App của bạn: ${siteUrl}` : 'Xong phần Supabase.');
  say('Việc còn lại bạn tự làm:');
  manual.forEach((m, i) => say(`  ${i + 1}. ${m}`));
  say('Muốn đưa bản mới lên sau khi sửa mã: chạy lại "npm run deploy".');
  say('==============================================');
}

// Chỉ chạy khi được gọi trực tiếp (để phần kiểm thử có thể import các hàm tiện ích).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((err) => fail(err?.message ?? String(err)))
    .finally(() => rl.close());
} else {
  rl.close();
}
