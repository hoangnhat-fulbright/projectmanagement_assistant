import { Fragment, useState } from 'react';
import { ArrowRight, Check, Copy, Inbox, Plus, Printer, RotateCcw } from 'lucide-react';
import type { Tab } from '../App';
import { memberName, newItem, useStore } from '../store';
import { fmtShort } from '../lib/dates';
import { Modal } from '../components/ui';
import { NOTE_KIND, PriorityTag, Term, useBrainstorm } from './common';
import { BriefModal } from './PlanStep';
import { CONTACT_LABEL, QUADRANT, byPriorityThenDeadline, planText, quadrant } from './logic';
import { COORD } from './types';

/** Tổng kết: Goal + Milestone + WBS + ưu tiên + Deadline + Task brief + Stakeholder (nếu có); copy, in, đưa vào Kho việc. */
export function Summary({ go }: { go: (t: Tab) => void }) {
  const { state, s, isLeader, update } = useBrainstorm();
  const { set } = useStore();
  const [copied, setCopied] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const milestones = s.milestones.filter((m) => m.status !== 'removed');
  const tasks = s.tasks.filter((t) => t.status !== 'removed');
  const coord = tasks.filter((t) => t.milestoneId === COORD);
  const general = s.notes.filter((n) => n.status === 'approved' && !n.taskId);
  const exportable = tasks.filter((t) => t.milestoneId !== COORD);
  const briefTask = s.tasks.find((t) => t.id === brief);

  async function copy() {
    try {
      await navigator.clipboard.writeText(planText(s, (id) => memberName(state, id)));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  /**
   * Cầu nối sang phần chạy tuần: mỗi task thành một việc "Đã rõ" trong Kho việc,
   * xếp theo thứ tự ưu tiên (Cao trước) rồi tới Deadline; mang theo Deadline và mức ưu tiên.
   */
  function toBacklog() {
    const items = [...exportable].sort(byPriorityThenDeadline).map((t) => {
      const m = s.milestones.find((x) => x.id === t.milestoneId);
      const note = t.doneWhen || m?.doneWhen || '';
      return newItem(t.title, {
        note,
        clear: note !== '',
        assigneeId: t.assigneeId,
        bigGoal: true,
        deadline: t.deadline || null,
        priority: t.priority,
      });
    });
    set((d) => {
      d.items = [...items, ...d.items];
      if (d.brainstorm) d.brainstorm.exported = true;
    });
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-wrap no-print">
        <h1 className="grow">Kế hoạch của nhóm</h1>
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? 'Đã copy' : 'Copy để gửi nhóm chat'}
        </button>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          <Printer size={18} aria-hidden />
          In / lưu PDF
        </button>
      </div>

      <section className="card goal-box stack-sm">
        <span className="label">
          {s.entry === 'prompt' ? 'Prompt của nhóm trưởng' : <Term k="Goal" />} · {s.name}
        </span>
        <p className="goal-text">{s.goal}</p>
      </section>

      <section className="card stack">
        <h2>
          <Term k="Milestone" /> và <Term k="WBS" />
        </h2>
        <div className="table-wrap">
          <table className="plan-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="col-main">Milestone / Task</th>
                <th>Người làm</th>
                <th>Ưu tiên</th>
                <th>Deadline</th>
                <th className="no-print">Brief</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, i) => (
                <Fragment key={m.id}>
                  <tr>
                    <td className="num">{i + 1}</td>
                    <td>
                      <strong>{m.name}</strong>
                      <div className="small muted">Xong khi: {m.doneWhen}</div>
                    </td>
                    <td />
                    <td />
                    <td className="num">
                      <strong>{fmtShort(m.deadline)}</strong>
                    </td>
                    <td className="no-print" />
                  </tr>
                  {tasks
                    .filter((t) => t.milestoneId === m.id)
                    .map((t, j) => (
                      <tr key={t.id}>
                        <td className="num muted">
                          {i + 1}.{j + 1}
                        </td>
                        <td>{t.title}</td>
                        <td>{memberName(state, t.assigneeId)}</td>
                        <td>
                          <PriorityTag value={t.priority} />
                        </td>
                        <td className="num">{fmtShort(t.deadline)}</td>
                        <td className="no-print">
                          <button className="link small" onClick={() => setBrief(t.id)}>
                            Xem
                          </button>
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
              {coord.length > 0 && (
                <tr>
                  <td className="num">{milestones.length + 1}</td>
                  <td>
                    <strong>Phối hợp nhóm</strong>
                  </td>
                  <td />
                  <td />
                  <td />
                  <td className="no-print" />
                </tr>
              )}
              {coord.map((t, j) => (
                <tr key={t.id}>
                  <td className="num muted">
                    {milestones.length + 1}.{j + 1}
                  </td>
                  <td>{t.title}</td>
                  <td>{memberName(state, t.assigneeId)}</td>
                  <td>
                    <PriorityTag value={t.priority} />
                  </td>
                  <td>Mỗi tuần</td>
                  <td className="no-print">
                    <button className="link small" onClick={() => setBrief(t.id)}>
                      Xem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {s.stakeholders.length > 0 && (
        <section className="card stack">
          <h2>
            <Term k="Stakeholder" />
          </h2>
          <div className="table-wrap">
            <table className="plan-table">
              <thead>
                <tr>
                  <th>Ai</th>
                  <th>Ô</th>
                  <th>Gắn milestone</th>
                  <th>Người phụ trách</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {s.stakeholders.map((sh) => {
                  const q = quadrant(sh);
                  const m = s.milestones.find((x) => x.id === sh.milestoneId);
                  return (
                    <tr key={sh.id}>
                      <td>
                        <strong>{sh.name}</strong>
                      </td>
                      <td>{q ? QUADRANT[q].label : 'Chưa xếp'}</td>
                      <td>{m ? m.name : 'Chưa gắn'}</td>
                      <td>{memberName(state, sh.ownerId)}</td>
                      <td>{CONTACT_LABEL[sh.contact]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {general.length > 0 && (
        <section className="card stack-sm">
          <h2>Ghi chú chung của dự án</h2>
          {general.map((n) => {
            const K = NOTE_KIND[n.kind];
            return (
              <p key={n.id} className="row" style={{ alignItems: 'flex-start' }}>
                <K.icon size={18} aria-hidden style={{ flex: 'none', marginTop: 4 }} />
                <span>
                  {n.text} <em className="muted">— {memberName(state, n.authorId)}</em>
                </span>
              </p>
            );
          })}
        </section>
      )}

      <section className="card card-float stack-sm no-print">
        <h2>Bắt tay vào làm</h2>
        {s.exported ? (
          <>
            <p>Các task đã nằm trong Kho việc, xếp theo thứ tự ưu tiên rồi tới Deadline. Bước tiếp theo là chọn việc cho tuần.</p>
            <button className="btn btn-primary btn-lg" style={{ alignSelf: 'flex-start' }} onClick={() => go('backlog')}>
              Mở Task tuần này
              <ArrowRight size={20} aria-hidden />
            </button>
          </>
        ) : (
          <>
            <p>
              Đưa {exportable.length} task vào Kho việc, xếp theo thứ tự ưu tiên rồi tới Deadline. Từ đó mỗi tuần nhóm
              chọn việc để làm và app nhắc từng ngày.
            </p>
            {isLeader ? (
              <button className="btn btn-primary btn-lg" style={{ alignSelf: 'flex-start' }} onClick={toBacklog}>
                <Inbox size={20} aria-hidden />
                Đưa {exportable.length} task vào Kho việc
              </button>
            ) : (
              <p className="small muted">Nhóm trưởng / phó là người đưa task vào Kho việc.</p>
            )}
          </>
        )}
        <p className="small muted">
          Link chỉ xem cho người ngoài nhóm cần máy chủ nên chưa có trong bản này. Tạm thời dùng Copy hoặc In / lưu PDF.
        </p>
      </section>

      {isLeader && s.stakeholders.length === 0 && (
        <button className="link small no-print" style={{ alignSelf: 'flex-start' }} onClick={() => update((b) => void (b.step = 4))}>
          <Plus size={14} aria-hidden /> Thêm Stakeholder (tuỳ chọn)
        </button>
      )}

      {isLeader && (
        <button className="link small no-print" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmNew(true)}>
          <RotateCcw size={14} aria-hidden /> Brainstorm một dự án khác
        </button>
      )}

      {briefTask && <BriefModal task={briefTask} onClose={() => setBrief(null)} />}
      {confirmNew && (
        <Modal title="Bắt đầu dự án khác?" onClose={() => setConfirmNew(false)}>
          <p>
            Phiên brainstorm "{s.name}" sẽ bị xoá: goal, milestone, WBS, ghi chú, stakeholder. Việc đã đưa vào Kho việc
            vẫn giữ nguyên.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmNew(false)}>
              Giữ lại
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                update((_b, d) => void (d.brainstorm = null));
                setConfirmNew(false);
              }}
            >
              Xoá và bắt đầu dự án khác
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
