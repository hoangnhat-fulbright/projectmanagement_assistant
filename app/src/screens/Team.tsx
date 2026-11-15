import { useEffect, useState } from 'react';
import { Check, Copy, FastForward, FileText, FlaskConical, FolderOpen, LogOut, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { canEdit, isLead, me, newMember, ROLE_EN, ROLE_LABEL, scrubPolls, todayISO, uid, useStore } from '../store';
import type { GoalResult, Role } from '../types';
import { fmtDay, fmtShort } from '../lib/dates';
import { Avatar, Modal } from '../components/ui';
import { FilePick } from './Onboarding';

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const RESULT_LABEL: Record<GoalResult, string> = { yes: 'Đạt', partial: 'Đạt một phần', no: 'Chưa đạt' };

export function Team() {
  const { state, set, reset, cloud } = useStore();
  const [working, setWorking] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const user = me(state);
  const isOwner = isLead(state);
  const editable = canEdit(state);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member');
  const [refText, setRefText] = useState('');
  const [dodText, setDodText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  // Tên dự án: gõ vào bản nháp, chỉ lưu khi không rỗng (tên rỗng làm danh sách dự án mất tên).
  const [projectName, setProjectName] = useState<string | null>(null);
  // Hai việc khó hoàn lại: hỏi lại trước khi làm.
  const [confirmObserver, setConfirmObserver] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const openTasksOf = (id: string) => state.items.filter((it) => it.assigneeId === id && it.status !== 'done');
  const tasksOf = (id: string) => state.items.filter((it) => it.assigneeId === id);
  const nameOf = (id: string | null) => state.members.find((m) => m.id === id)?.name ?? '';

  function commitProjectName() {
    const n = (projectName ?? '').trim();
    if (projectName !== null && n && n !== state.settings.company) set((d) => void (d.settings.company = n));
    setProjectName(null);
  }
  const closed = state.sprints.filter((s) => s.state === 'closed').reverse();

  function addMember() {
    const n = name.trim();
    if (!n) return;
    // Mã TV-xx không dùng lại số của người đã rời đội.
    const next = Math.max(0, ...state.members.map((m) => Number(m.code.replace(/\D/g, '')) || 0));
    const member = newMember(state, n, role, { code: `TV-${String(next + 1).padStart(2, '0')}` });
    set((d) => void d.members.push(member));
    setName('');
  }

  function addRef() {
    const t = refText.trim();
    if (!t) return;
    set((d) => void d.settings.references.push(t));
    setRefText('');
  }

  function updateMe(fn: (m: (typeof state.members)[number]) => void) {
    set((d) => {
      const m = d.members.find((x) => x.id === user.id);
      if (m) fn(m);
    });
  }

  /** Bản trên mạng: đổi vai trò / xoá người phải qua máy chủ để quyền truy cập đổi theo. */
  async function onServer(job: () => Promise<void>) {
    if (!cloud) return;
    setWorking(true);
    setTeamError(null);
    try {
      await job();
      await cloud.refresh();
    } catch {
      setTeamError('Chưa đổi được. Kiểm tra mạng rồi thử lại.');
    } finally {
      setWorking(false);
    }
  }

  function changeRole(id: string, next: Exclude<Role, 'owner'>) {
    if (cloud) {
      void onServer(() => cloud.backend.setMemberRole(cloud.project.id, id, next));
      return;
    }
    set((d) => {
      const x = d.members.find((y) => y.id === id);
      if (!x) return;
      x.role = next;
      // Người quan sát không nhận việc: trả các việc chưa xong về "chưa ai nhận".
      if (next === 'observer') {
        for (const it of d.items) if (it.assigneeId === id && it.status !== 'done') it.assigneeId = null;
      }
      scrubPolls(d);
    });
  }

  function removeMember(id: string) {
    if (cloud) {
      void onServer(() => cloud.backend.removeMember(cloud.project.id, id));
      return;
    }
    set((d) => {
      d.members = d.members.filter((m) => m.id !== id);
      for (const it of d.items) if (it.assigneeId === id) it.assigneeId = null;
      if (d.currentMemberId === id) d.currentMemberId = d.members[0].id;
      scrubPolls(d);
    });
  }

  function addDod() {
    const t = dodText.trim();
    if (!t) return;
    const id = uid();
    set((d) => void d.settings.dod.push({ id, text: t }));
    setDodText('');
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Đội</h1>
          <p className="muted prose">Dự án, thành viên, nhịp làm việc và các tuần đã qua.</p>
        </div>
      </div>

      <section className="card stack enter" aria-labelledby="project-title">
        <h2 id="project-title">Dự án</h2>
        <div className="two-col">
          <div className="field">
            <label htmlFor="p-name">Tên dự án tổng</label>
            <input
              id="p-name"
              className="input"
              disabled={!isOwner}
              value={projectName ?? state.settings.company}
              maxLength={120}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={commitProjectName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              aria-describedby={projectName !== null && !projectName.trim() ? 'p-name-err' : undefined}
            />
            {projectName !== null && !projectName.trim() && (
              <p id="p-name-err" className="error">
                Dự án cần có tên. Bỏ trống thì app giữ tên cũ.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="p-field">Mô tả lĩnh vực</label>
            <textarea
              id="p-field"
              className="textarea"
              style={{ minHeight: 72 }}
              disabled={!isOwner}
              value={state.settings.field}
              onChange={(e) => set((d) => void (d.settings.field = e.target.value))}
            />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="p-guide">Guideline của đội</label>
            <textarea
              id="p-guide"
              className="textarea"
              style={{ minHeight: 120 }}
              disabled={!isOwner}
              value={state.settings.guideline}
              onChange={(e) => set((d) => void (d.settings.guideline = e.target.value))}
              placeholder={isOwner ? 'Mỗi dòng một quy ước làm việc của nhóm.' : 'Chưa có guideline.'}
            />
          </div>
          <div className="stack-sm">
            <span className="label">Tham khảo data</span>
            {state.settings.references.length === 0 && <p className="small muted">Chưa có tài liệu tham khảo nào.</p>}
            {state.settings.references.map((r, i) => (
              <div key={`${r}-${i}`} className="row">
                <FileText size={16} aria-hidden style={{ flex: 'none', color: 'var(--blue-ink)' }} />
                {/^https?:\/\//.test(r) ? (
                  <a className="link grow" href={r} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>
                    {r}
                  </a>
                ) : (
                  <span className="grow" style={{ overflowWrap: 'anywhere' }}>
                    {r}
                  </span>
                )}
                {isOwner && (
                  <button
                    className="btn-icon"
                    aria-label={`Bỏ "${r}"`}
                    onClick={() => set((d) => void d.settings.references.splice(i, 1))}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRef();
                }}
              >
                <input
                  className="input grow"
                  value={refText}
                  onChange={(e) => setRefText(e.target.value)}
                  placeholder="Dán link hoặc gõ tên nguồn"
                  aria-label="Thêm tài liệu tham khảo"
                />
                <button className="btn btn-ghost" type="submit" disabled={!refText.trim()}>
                  <Plus size={18} aria-hidden />
                  Thêm
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {editable && (
        <section className="card stack enter" aria-labelledby="me-title">
          <h2 id="me-title">Hồ sơ của tôi</h2>
          <p className="small muted">
            {user.name} · ID <span className="mono">{user.code}</span> · {ROLE_LABEL[user.role]} ({ROLE_EN[user.role]})
          </p>
          <div className="two-col">
            <div className="field">
              <label htmlFor="me-bg">Background</label>
              <textarea
                id="me-bg"
                className="textarea"
                style={{ minHeight: 96 }}
                value={user.background}
                onChange={(e) => updateMe((m) => void (m.background = e.target.value))}
                placeholder="Bạn giỏi việc gì, đã làm dự án nào. Nhóm trưởng xem phần này khi chia việc."
              />
            </div>
            <FilePick
              id="me-cv"
              label="CV"
              names={user.cvName ? [user.cvName] : []}
              accept=".pdf,.doc,.docx"
              onPick={(names) => updateMe((m) => void (m.cvName = names[0] ?? null))}
              onClear={() => updateMe((m) => void (m.cvName = null))}
            />
          </div>
        </section>
      )}

      <div className="two-col">
        <section className="card stack enter" aria-labelledby="members-title">
          <h2 id="members-title">Thành viên</h2>
          <div className="stack-sm">
            {state.members.map((m) => (
              <div key={m.id} className="row-wrap member-row">
                <Avatar state={state} memberId={m.id} />
                <div className="member-info">
                  <strong>{m.name}</strong>
                  <span className="small muted mono"> · {m.code}</span>
                  <div className="small muted">
                    {ROLE_LABEL[m.role]} ({ROLE_EN[m.role]})
                    {m.cvName ? ` · CV: ${m.cvName}` : ''}
                  </div>
                  {m.background && (
                    <div className="small" style={{ overflowWrap: 'anywhere' }}>
                      {m.background}
                    </div>
                  )}
                </div>
                {isOwner && m.role !== 'owner' && (
                  <select
                    className="select"
                    style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }}
                    value={m.role}
                    disabled={working}
                    aria-label={`Vai trò của ${m.name}`}
                    onChange={(e) => {
                      const next = e.target.value as Exclude<Role, 'owner'>;
                      // Chuyển sang quan sát làm các việc đang dở của người này mất người làm: hỏi lại trước.
                      if (next === 'observer' && openTasksOf(m.id).length > 0) setConfirmObserver(m.id);
                      else changeRole(m.id, next);
                    }}
                  >
                    <option value="member">{ROLE_LABEL.member}</option>
                    <option value="observer">{ROLE_LABEL.observer}</option>
                  </select>
                )}
                {isOwner && m.role !== 'owner' && (
                  <button className="btn-icon" disabled={working} aria-label={`Xóa ${m.name} khỏi đội`} onClick={() => setConfirmRemove(m.id)}>
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {teamError && (
            <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
              {teamError}
            </p>
          )}
          {cloud && isOwner && <Invites />}
          {cloud && !isOwner && <p className="small muted">Người mới vào dự án bằng mã mời do nhóm trưởng gửi.</p>}
          {!cloud && isOwner && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                addMember();
              }}
            >
              <input
                className="input grow"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên người mới"
                aria-label="Tên người mới"
              />
              <select
                className="select"
                style={{ width: 'auto' }}
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)}
                aria-label="Vai trò của người mới"
              >
                <option value="member">{ROLE_LABEL.member}</option>
                <option value="observer">{ROLE_LABEL.observer}</option>
              </select>
              <button className="btn btn-ghost" type="submit" disabled={!name.trim()}>
                <Plus size={18} aria-hidden />
                Thêm
              </button>
            </form>
          )}
        </section>

        <section className="card stack enter" style={{ ['--i' as string]: 1 }} aria-labelledby="rhythm-title">
          <h2 id="rhythm-title">Nhịp làm việc</h2>
          <p className="small muted">Tuần làm việc từ Thứ Hai tới Thứ Sáu.</p>
          <div className="field">
            <label htmlFor="t-ci">Giờ check-in mỗi ngày</label>
            <select
              id="t-ci"
              className="select"
              disabled={!isOwner}
              value={state.settings.checkinHour}
              onChange={(e) => set((d) => void (d.settings.checkinHour = Number(e.target.value)))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-rv">Giờ xem kết quả ngày cuối tuần làm việc</label>
            <select
              id="t-rv"
              className="select"
              disabled={!isOwner}
              value={state.settings.reviewHour}
              onChange={(e) => set((d) => void (d.settings.reviewHour = Number(e.target.value)))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-goal">Mục tiêu lớn</label>
            <input
              id="t-goal"
              className="input"
              disabled={!isOwner}
              value={state.settings.bigGoal}
              onChange={(e) => set((d) => void (d.settings.bigGoal = e.target.value))}
            />
          </div>
        </section>
      </div>

      <section className="card stack" aria-labelledby="dod-title">
        <h2 id="dod-title">Tiêu chuẩn "Xong"</h2>
        <p className="small muted prose">Danh sách kiểm tra để một việc được tính là xong. Áp dụng cho mọi việc.</p>
        <div className="stack-sm">
          {state.settings.dod.length === 0 && <p className="muted small">Chưa có tiêu chuẩn nào.</p>}
          {state.settings.dod.map((d) => (
            <div key={d.id} className="row">
              <span className="grow">{d.text}</span>
              {isOwner && (
                <button
                  className="btn-icon"
                  aria-label={`Xóa tiêu chuẩn "${d.text}"`}
                  onClick={() => set((s) => void (s.settings.dod = s.settings.dod.filter((x) => x.id !== d.id)))}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        {isOwner && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              addDod();
            }}
          >
            <input
              className="input grow"
              value={dodText}
              onChange={(e) => setDodText(e.target.value)}
              placeholder="Thêm một tiêu chuẩn"
              aria-label="Thêm một tiêu chuẩn Xong"
            />
            <button className="btn btn-ghost" type="submit" disabled={!dodText.trim()}>
              <Plus size={18} aria-hidden />
              Thêm
            </button>
          </form>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="history-title">
        <h2 id="history-title">Các tuần đã qua</h2>
        {closed.length === 0 ? (
          <p className="muted small">Chưa có tuần nào đóng. Báo cáo tuần sẽ tự sinh ra ở đây.</p>
        ) : (
          closed.map((s) => {
            const imp = state.improvements.find((i) => i.id === s.improvementId);
            return (
              <div key={s.id} className="card card-tight stack-sm">
                <div className="row-wrap">
                  <strong>Tuần {s.number}</strong>
                  <span className="small muted mono">
                    {fmtShort(s.start)} – {fmtShort(s.end)}
                  </span>
                  {s.goalResult && (
                    <span className={`tag ${s.goalResult === 'yes' ? 'tag-ok' : s.goalResult === 'no' ? 'tag-warn' : 'tag-blue'}`}>
                      {RESULT_LABEL[s.goalResult]}
                    </span>
                  )}
                  <span className="right small mono">
                    {s.doneCount}/{s.plannedCount} việc xong
                  </span>
                </div>
                <p>
                  <span className="muted">Mục tiêu tuần: </span>
                  {s.goal}
                </p>
                <p className="small">
                  <span className="muted">Cải tiến đã chọn: </span>
                  {imp ? imp.text : 'Không chọn'}
                </p>
              </div>
            );
          })
        )}
      </section>

      {cloud && (
        <section className="card stack" aria-labelledby="account-title">
          <h2 id="account-title">Tài khoản</h2>
          <p className="small muted" style={{ overflowWrap: 'anywhere' }}>
            Đang đăng nhập bằng {cloud.email}. Dữ liệu dự án được lưu trên máy chủ và mọi thành viên cùng thấy.
          </p>
          <div className="row-wrap">
            <button className="btn btn-ghost" onClick={cloud.leave}>
              <FolderOpen size={18} aria-hidden />
              Đổi dự án
            </button>
            <button className="btn btn-ghost" onClick={cloud.signOut}>
              <LogOut size={18} aria-hidden />
              Đăng xuất
            </button>
          </div>
        </section>
      )}

      {!cloud && (
      <section className="card stack" style={{ borderStyle: 'dashed' }} aria-labelledby="lab-title">
        <div className="row">
          <FlaskConical size={20} aria-hidden style={{ color: 'var(--blue-ink)' }} />
          <h2 id="lab-title">Công cụ thử nghiệm</h2>
        </div>
        <p className="small muted prose">
          Bản này lưu dữ liệu ngay trên trình duyệt của bạn và chưa có tài khoản. Để thử vai của từng người, đổi người
          dùng ở góc trên. Để thử cả tuần mà không phải chờ, tua ngày ở đây.
        </p>
        <p>
          Ngày trong app: <strong>{fmtDay(todayISO(state))}</strong>
          {state.dayOffset !== 0 && <span className="muted"> (giả lập, lệch {state.dayOffset} ngày)</span>}
        </p>
        <div className="row-wrap">
          <button className="btn btn-ghost" onClick={() => set((d) => void (d.dayOffset += 1))}>
            <FastForward size={18} aria-hidden />
            Sang ngày kế tiếp
          </button>
          {state.dayOffset !== 0 && (
            <button className="btn btn-ghost" onClick={() => set((d) => void (d.dayOffset = 0))}>
              <RotateCcw size={18} aria-hidden />
              Về ngày thật
            </button>
          )}
          {editable && (
            <button className="btn btn-danger right" onClick={() => setConfirmReset(true)}>
              <Trash2 size={18} aria-hidden />
              Xóa toàn bộ dữ liệu
            </button>
          )}
        </div>
      </section>
      )}

      {confirmObserver && (
        <Modal title={`Chuyển ${nameOf(confirmObserver)} thành ${ROLE_LABEL.observer.toLowerCase()}?`} onClose={() => setConfirmObserver(null)}>
          <p>
            {ROLE_LABEL.observer} chỉ xem, không nhận việc. {openTasksOf(confirmObserver).length} việc chưa xong của{' '}
            {nameOf(confirmObserver)} sẽ trở về "chưa ai nhận". Đổi lại vai trò sau này không tự giao lại các việc đó.
          </p>
          <ul className="small" style={{ paddingLeft: 20 }}>
            {openTasksOf(confirmObserver)
              .slice(0, 5)
              .map((it) => (
                <li key={it.id}>{it.title}</li>
              ))}
            {openTasksOf(confirmObserver).length > 5 && <li>và {openTasksOf(confirmObserver).length - 5} việc khác</li>}
          </ul>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmObserver(null)}>
              Giữ là {ROLE_LABEL.member.toLowerCase()}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                changeRole(confirmObserver, 'observer');
                setConfirmObserver(null);
              }}
            >
              Chuyển và bỏ giao việc
            </button>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <Modal title={`Xóa ${nameOf(confirmRemove)} khỏi đội?`} onClose={() => setConfirmRemove(null)}>
          <p>
            {nameOf(confirmRemove)} sẽ không còn xem được dự án này.
            {tasksOf(confirmRemove).length > 0
              ? ` ${tasksOf(confirmRemove).length} việc đang giao cho người này sẽ trở về "chưa ai nhận".`
              : ''}{' '}
            Muốn vào lại, họ phải nhập mã mời và được tính là người mới.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmRemove(null)}>
              Giữ lại
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                removeMember(confirmRemove);
                setConfirmRemove(null);
              }}
            >
              Xóa khỏi đội
            </button>
          </div>
        </Modal>
      )}

      {confirmReset && (
        <Modal title="Xóa toàn bộ dữ liệu?" onClose={() => setConfirmReset(false)}>
          <p>Mọi việc, tuần làm việc và thành viên sẽ bị xóa khỏi trình duyệt này. Không khôi phục lại được.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Giữ lại
            </button>
            <button className="btn btn-danger" onClick={reset}>
              Xóa và bắt đầu lại
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Hai mã mời của dự án (chỉ nhóm trưởng thấy). Ai có mã thì vào được, nên chỉ gửi cho đúng người. */
function Invites() {
  const { cloud } = useStore();
  const [codes, setCodes] = useState<{ member: string; observer: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const backend = cloud?.backend;
  const projectId = cloud?.project.id;

  useEffect(() => {
    if (!backend || !projectId) return;
    let alive = true;
    backend
      .invites(projectId)
      .then((c) => alive && setCodes(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [backend, projectId]);

  async function copy(label: string, code: string) {
    const text = `Vào ${window.location.origin}, đăng nhập bằng email của bạn rồi nhập mã mời: ${code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  if (failed) return <p className="small muted">Chưa lấy được mã mời. Tải lại trang để thử lại.</p>;
  if (!codes) return <p className="small muted">Đang lấy mã mời…</p>;

  const rows: { label: string; code: string }[] = [
    { label: ROLE_LABEL.member, code: codes.member },
    { label: ROLE_LABEL.observer, code: codes.observer },
  ];

  return (
    <div className="stack-sm invites">
      <span className="label">Mã mời người mới</span>
      {rows.map((r) => (
        <div key={r.label} className="row">
          <span className="grow">
            {r.label}: <strong className="mono invite-code">{r.code}</strong>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => void copy(r.label, r.code)}>
            {copied === r.label ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied === r.label ? 'Đã chép' : 'Chép lời mời'}
          </button>
        </div>
      ))}
      <p className="small muted">Ai có mã là vào được dự án với vai trò tương ứng, nên chỉ gửi cho đúng người.</p>
    </div>
  );
}
