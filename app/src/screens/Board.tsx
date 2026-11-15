import { useState } from 'react';
import { ArrowRight, Check, CornerUpLeft, Plus, Send, Star, Undo2 } from 'lucide-react';
import type { Flow } from '../App';
import {
  canEdit,
  currentSprint,
  isLead,
  me,
  memberName,
  newItem,
  ROLE_LABEL,
  sprintItems,
  todayISO,
  useStore,
  workers,
} from '../store';
import type { Item, ItemStatus } from '../types';
import { fmtShort } from '../lib/dates';
import { Avatar, Choice, Modal, Tip } from '../components/ui';
import { EmptyBlocks } from '../components/Voxel';
import { DueTag, HelpLine, PRIORITIES, PRIORITY_SHORT, PriorityTag, STATUS_LABEL } from '../components/task';

/* Bảng việc của tuần. Wiki: features/sprint-board (D-011: Bị trả lại, nộp việc, số ngày còn lại). */

const COLUMNS: ItemStatus[] = ['todo', 'doing', 'checking', 'returned', 'done'];

export function Board({ start }: { start: (f: Flow) => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const lead = isLead(state);
  const editable = canEdit(state);
  const sprint = currentSprint(state);
  const [onlyMine, setOnlyMine] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!sprint) {
    return (
      <div className="card empty enter">
        <EmptyBlocks />
        <h2>Chưa có tuần làm việc nào đang chạy</h2>
        <p className="muted prose">Bảng việc sẽ hiện ra sau khi lên kế hoạch tuần.</p>
        {lead && (
          <button className="btn btn-primary" onClick={() => start('planning')}>
            Lên kế hoạch tuần
            <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  const all = sprintItems(state, sprint.id);
  const items = onlyMine ? all.filter((i) => i.assigneeId === user.id) : all;

  function move(id: string, to: ItemStatus) {
    set((d) => {
      const it = d.items.find((i) => i.id === id);
      if (!it) return;
      it.status = to;
      if (to !== 'todo' && !it.assigneeId) it.assigneeId = user.id;
    });
  }

  function approve(item: Item) {
    if (state.settings.dod.length > 0) setFinishing(item.id);
    else move(item.id, 'done');
  }

  /** Nút trên thẻ theo trạng thái và vai trò. Observer không có nút nào. */
  function actions(i: Item) {
    if (!editable || !sprint || sprint.state !== 'active') return null;
    const mine = lead || i.assigneeId === user.id;
    const undo = (to: ItemStatus, label: string) => (
      <button className="btn-icon" aria-label={label} title={label} onClick={() => move(i.id, to)}>
        <Undo2 size={16} />
      </button>
    );
    if (i.status === 'todo') {
      if (i.assigneeId && !mine) return <span className="small muted">Việc của {memberName(state, i.assigneeId)}</span>;
      return (
        <div className="row">
          <button className="btn btn-primary btn-sm grow" onClick={() => move(i.id, 'doing')}>
            <ArrowRight size={16} aria-hidden />
            {i.assigneeId ? 'Bắt đầu làm' : 'Nhận và bắt đầu'}
          </button>
        </div>
      );
    }
    if (i.status === 'doing') {
      if (!mine) return <span className="small muted">{memberName(state, i.assigneeId)} đang làm</span>;
      return (
        <div className="row">
          <button className="btn btn-primary btn-sm grow" onClick={() => setSubmitting(i.id)}>
            <Send size={16} aria-hidden />
            Nộp việc
          </button>
          {undo('todo', 'Đưa về Chưa làm')}
        </div>
      );
    }
    if (i.status === 'checking') {
      if (!lead) {
        return (
          <div className="row">
            <span className="small muted grow">Chờ {ROLE_LABEL.owner.toLowerCase()} kiểm tra</span>
            {mine && undo('doing', 'Rút lại để làm tiếp')}
          </div>
        );
      }
      return (
        <div className="stack-sm">
          <button className="btn btn-primary btn-sm" onClick={() => approve(i)}>
            <Check size={16} aria-hidden />
            Duyệt xong
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setReturning(i.id)}>
            <CornerUpLeft size={16} aria-hidden />
            Trả lại
          </button>
        </div>
      );
    }
    if (i.status === 'returned') {
      if (!mine) return <span className="small muted">Chờ {memberName(state, i.assigneeId)} làm lại</span>;
      return (
        <div className="row">
          <button className="btn btn-primary btn-sm grow" onClick={() => move(i.id, 'doing')}>
            <ArrowRight size={16} aria-hidden />
            Làm lại
          </button>
        </div>
      );
    }
    return (
      <div className="row">
        <span className="small grow" style={{ color: '#2e6b32', fontWeight: 600 }}>
          Đã xong
        </span>
        {lead && undo('checking', 'Mở lại để kiểm tra')}
      </div>
    );
  }

  const finishingItem = all.find((i) => i.id === finishing);
  const submittingItem = all.find((i) => i.id === submitting);
  const returningItem = all.find((i) => i.id === returning);
  const detailItem = all.find((i) => i.id === detail);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Bảng việc của tuần</h1>
          <p className="muted">
            Mục tiêu tuần: <strong style={{ color: 'var(--text-strong)' }}>{sprint.goal}</strong>
          </p>
        </div>
        <div className="row-wrap">
          <div className="chips" role="group" aria-label="Lọc việc">
            <button className={`chip${!onlyMine ? ' on' : ''}`} aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>
              Cả đội
            </button>
            <button className={`chip${onlyMine ? ' on' : ''}`} aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>
              Việc của tôi
            </button>
          </div>
          {sprint.state === 'active' && editable && (
            <button className="btn btn-ghost" onClick={() => setAdding(true)}>
              <Plus size={18} aria-hidden />
              Thêm việc
            </button>
          )}
        </div>
      </div>

      <Tip id="submit-flow">
        Làm xong thì bấm "Nộp việc". {ROLE_LABEL.owner} kiểm tra rồi duyệt xong, hoặc trả lại kèm lý do để làm lại.
      </Tip>
      <HelpLine state={state} />

      <div className="board">
        {COLUMNS.map((col, ci) => {
          const list = items.filter((i) => i.status === col);
          return (
            <section key={col} className="column enter" style={{ ['--i' as string]: ci }} aria-label={STATUS_LABEL[col]}>
              <div className="column-head">
                <span>{STATUS_LABEL[col]}</span>
                <span className="tag mono">{list.length}</span>
              </div>
              {list.length === 0 && <p className="small muted">Trống</p>}
              {list.map((i) => (
                <article
                  key={i.id}
                  className={`task${i.stuck ? ' stuck' : ''}${i.status === 'done' ? ' done' : ''}${i.status === 'returned' ? ' returned' : ''}`}
                >
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    {i.forSprintGoal && (
                      <Star className="star" size={16} fill="currentColor" style={{ marginTop: 4 }} aria-label="Phục vụ mục tiêu tuần" />
                    )}
                    <button className="task-title grow" onClick={() => setDetail(i.id)}>
                      {i.title}
                    </button>
                    <Avatar state={state} memberId={i.assigneeId} small />
                  </div>
                  <div className="row-wrap">
                    <DueTag state={state} item={i} />
                    <PriorityTag priority={i.priority} />
                    {i.stuck && <span className="tag tag-warn">Bị kẹt</span>}
                    {i.urgentAdd && <span className="tag tag-warn">Thêm giữa tuần</span>}
                    {i.size && <span className="tag mono">{i.size}</span>}
                    {i.steps.length > 0 && (
                      <span className="tag mono">
                        {i.steps.filter((s) => s.done).length}/{i.steps.length} bước
                      </span>
                    )}
                  </div>
                  {i.status === 'returned' && i.returned && (
                    <p className="small return-note">
                      <strong>{memberName(state, i.returned.byId)} trả lại:</strong> {i.returned.reason}
                    </p>
                  )}
                  {i.status === 'checking' && i.submission?.note && (
                    <p className="small muted clamp-2">Đã nộp: {i.submission.note}</p>
                  )}
                  {actions(i)}
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {finishingItem && (
        <DoneModal
          item={finishingItem}
          onClose={() => setFinishing(null)}
          onConfirm={() => {
            move(finishingItem.id, 'done');
            setFinishing(null);
          }}
        />
      )}
      {submittingItem && <SubmitModal item={submittingItem} onClose={() => setSubmitting(null)} />}
      {returningItem && <ReturnModal item={returningItem} onClose={() => setReturning(null)} />}
      {detailItem && <DetailModal item={detailItem} onClose={() => setDetail(null)} />}
      {adding && <AddMidWeekModal sprintId={sprint.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Tiêu chuẩn "Xong": phải tick đủ mới được chuyển sang cột Xong. */
function DoneModal({ item, onClose, onConfirm }: { item: Item; onClose: () => void; onConfirm: () => void }) {
  const { state } = useStore();
  const [ticked, setTicked] = useState<string[]>([]);
  const dod = state.settings.dod;
  const all = ticked.length === dod.length;
  return (
    <Modal title='Việc này đã thật sự "Xong" chưa?' onClose={onClose}>
      <p>
        <strong>{item.title}</strong>
      </p>
      <div>
        {dod.map((d) => (
          <label key={d.id} className="check-row">
            <input
              type="checkbox"
              checked={ticked.includes(d.id)}
              onChange={(e) => setTicked(e.target.checked ? [...ticked, d.id] : ticked.filter((t) => t !== d.id))}
            />
            <span>{d.text}</span>
          </label>
        ))}
      </div>
      {!all && <p className="small muted">Tick đủ {dod.length} mục để đánh dấu xong.</p>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Chưa xong
        </button>
        <button className="btn btn-primary" disabled={!all} onClick={onConfirm}>
          <Check size={18} aria-hidden />
          Đánh dấu xong
        </button>
      </div>
    </Modal>
  );
}

/** Nộp việc: người làm ghi kết quả hoặc dán link, việc chuyển sang "Chờ kiểm tra". */
function SubmitModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { state, set } = useStore();
  const [note, setNote] = useState(item.submission?.note ?? '');
  const user = me(state);

  function submit() {
    const date = todayISO(state);
    set((d) => {
      const it = d.items.find((i) => i.id === item.id);
      if (!it) return;
      it.status = 'checking';
      it.submission = { byId: user.id, date, note: note.trim() };
    });
    onClose();
  }

  return (
    <Modal title="Nộp việc" onClose={onClose}>
      <p>
        <strong>{item.title}</strong>
      </p>
      {item.note && (
        <p className="small">
          <span className="muted">Xong khi: </span>
          {item.note}
        </p>
      )}
      {item.returned && (
        <p className="small return-note">
          <strong>Lần trước bị trả lại:</strong> {item.returned.reason}
        </p>
      )}
      <div className="field">
        <label htmlFor="submit-note">Kết quả: link hoặc vài dòng mô tả</label>
        <textarea
          id="submit-note"
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: https://… hoặc Đã gửi bản đề xuất cho thầy Hùng, thầy hẹn trả lời thứ Sáu."
          autoFocus
        />
      </div>
      <p className="small muted">
        Sau khi nộp, {ROLE_LABEL.owner.toLowerCase()} {memberName(state, state.members.find((m) => m.role === 'owner')?.id ?? null)}{' '}
        sẽ kiểm tra.
      </p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Chưa nộp
        </button>
        <button className="btn btn-primary" disabled={!note.trim()} onClick={submit}>
          <Send size={18} aria-hidden />
          Nộp việc
        </button>
      </div>
    </Modal>
  );
}

/** Trả lại (Return): nhóm trưởng đưa việc đã nộp về cho người làm, bắt buộc ghi lý do. */
function ReturnModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { state, set } = useStore();
  const [reason, setReason] = useState('');
  const user = me(state);

  function send() {
    const date = todayISO(state);
    set((d) => {
      const it = d.items.find((i) => i.id === item.id);
      if (!it) return;
      it.status = 'returned';
      it.returned = { byId: user.id, date, reason: reason.trim() };
      it.returnCount += 1;
    });
    onClose();
  }

  return (
    <Modal title="Trả lại việc này?" onClose={onClose}>
      <p>
        <strong>{item.title}</strong>
        <span className="muted"> · {memberName(state, item.assigneeId)}</span>
      </p>
      {item.submission?.note && (
        <p className="small">
          <span className="muted">Đã nộp: </span>
          {item.submission.note}
        </p>
      )}
      <div className="field">
        <label htmlFor="return-reason">Cần sửa gì?</label>
        <textarea
          id="return-reason"
          className="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ghi rõ còn thiếu gì để người làm biết sửa ở đâu."
          autoFocus
        />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Không trả lại
        </button>
        <button className="btn btn-primary" disabled={!reason.trim()} onClick={send}>
          <CornerUpLeft size={18} aria-hidden />
          Trả lại
        </button>
      </div>
    </Modal>
  );
}

function DetailModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { state, set } = useStore();
  const [stepText, setStepText] = useState('');
  const user = me(state);
  const lead = isLead(state);
  const editable = canEdit(state);
  const mine = lead || item.assigneeId === user.id;

  function update(fn: (it: Item) => void) {
    set((d) => {
      const it = d.items.find((i) => i.id === item.id);
      if (it) fn(it);
    });
  }

  function addStep() {
    const text = stepText.trim();
    if (!text) return;
    const id = Math.random().toString(36).slice(2, 10);
    update((it) => void it.steps.push({ id, text, done: false }));
    setStepText('');
  }

  return (
    <Modal title={item.title} onClose={onClose}>
      {item.note && (
        <div>
          <span className="label">Xong thì trông thế nào</span>
          <p>{item.note}</p>
        </div>
      )}
      <div className="row-wrap">
        <span className="tag">{STATUS_LABEL[item.status]}</span>
        <DueTag state={state} item={item} />
        {item.deadline && <span className="tag mono">Deadline {fmtShort(item.deadline)}</span>}
        <PriorityTag priority={item.priority} all />
        {item.returnCount > 0 && <span className="tag">Đã bị trả lại {item.returnCount} lần</span>}
      </div>
      {item.returned && (
        <p className="small return-note">
          <strong>
            {memberName(state, item.returned.byId)} trả lại ngày {fmtShort(item.returned.date)}:
          </strong>{' '}
          {item.returned.reason}
        </p>
      )}
      {item.submission && (
        <p className="small">
          <span className="muted">
            {memberName(state, item.submission.byId)} nộp ngày {fmtShort(item.submission.date)}:{' '}
          </span>
          {item.submission.note}
        </p>
      )}
      <div className="stack-sm">
        <span className="label">Người làm</span>
        {lead ? (
          <div className="chips">
            {workers(state).map((m) => {
              const on = item.assigneeId === m.id;
              return (
                <button
                  key={m.id}
                  className={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => update((it) => void (it.assigneeId = on ? null : m.id))}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="row-wrap">
            <span>{memberName(state, item.assigneeId)}</span>
            {editable && !item.assigneeId && (
              <button className="btn btn-ghost btn-sm" onClick={() => update((it) => void (it.assigneeId = user.id))}>
                Nhận việc này
              </button>
            )}
          </div>
        )}
      </div>
      {lead && (
        <div className="two-col">
          <div className="field">
            <label htmlFor="d-deadline">Deadline</label>
            <input
              id="d-deadline"
              type="date"
              className="input"
              value={item.deadline ?? ''}
              onChange={(e) => update((it) => void (it.deadline = e.target.value || null))}
            />
          </div>
          <div className="stack-sm">
            <span className="label">Thứ tự ưu tiên</span>
            <div className="chips">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  className={`chip${item.priority === p ? ' on' : ''}`}
                  aria-pressed={item.priority === p}
                  onClick={() => update((it) => void (it.priority = it.priority === p ? null : p))}
                >
                  {PRIORITY_SHORT[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="stack-sm">
        <span className="label">Các bước nhỏ</span>
        {item.steps.map((s) => (
          <label key={s.id} className="check-row" style={{ padding: '2px 0' }}>
            <input
              type="checkbox"
              checked={s.done}
              disabled={!editable || !mine}
              onChange={(e) =>
                update((it) => {
                  const st = it.steps.find((x) => x.id === s.id);
                  if (st) st.done = e.target.checked;
                })
              }
            />
            <span>{s.text}</span>
          </label>
        ))}
        {item.steps.length === 0 && !(editable && mine) && <p className="small muted">Chưa có bước nhỏ nào.</p>}
        {editable && mine && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            addStep();
          }}
        >
          <input
            className="input grow"
            value={stepText}
            onChange={(e) => setStepText(e.target.value)}
            placeholder="Thêm một bước nhỏ"
            aria-label="Thêm một bước nhỏ"
          />
          <button className="btn btn-ghost" type="submit" disabled={!stepText.trim()}>
            Thêm
          </button>
        </form>
        )}
      </div>
      <HelpLine state={state} />
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}

/** Thêm việc giữa tuần: luôn hỏi "Việc này có giúp mục tiêu tuần không?" (chống chen việc). */
function AddMidWeekModal({ sprintId, onClose }: { sprintId: string; onClose: () => void }) {
  const { state, set } = useStore();
  const sprint = state.sprints.find((s) => s.id === sprintId)!;
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const user = me(state);

  function add(mode: 'goal' | 'backlog' | 'urgent') {
    const item = newItem(title);
    if (mode === 'backlog') {
      set((d) => void d.items.unshift(item));
    } else {
      item.sprintId = sprintId;
      item.assigneeId = user.id;
      item.forSprintGoal = mode === 'goal';
      item.urgentAdd = mode === 'urgent';
      set((d) => void d.items.push(item));
    }
    onClose();
  }

  return (
    <Modal title="Thêm việc giữa tuần" onClose={onClose}>
      <div className="field">
        <label htmlFor="mid-title">Việc cần thêm</label>
        <input id="mid-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="stack-sm">
        <span className="label">Việc này có giúp đạt mục tiêu tuần không?</span>
        <p className="small">
          Mục tiêu tuần: <strong>{sprint.goal}</strong>
        </p>
        <Choice on={answer === 'yes'} onClick={() => setAnswer('yes')}>
          <strong>Có</strong>
          <div className="small muted">Thêm vào tuần này.</div>
        </Choice>
        <Choice on={answer === 'no'} onClick={() => setAnswer('no')}>
          <strong>Không</strong>
          <div className="small muted">Nên để vào Kho việc cho tuần sau.</div>
        </Choice>
      </div>
      {answer === 'yes' && (
        <p className="small muted">Nếu tuần đã đầy việc, hãy cân nhắc đẩy một việc khác về Kho việc để không quá sức.</p>
      )}
      <div className="modal-actions">
        {answer === 'no' && (
          <button className="btn btn-danger" disabled={!title.trim()} onClick={() => add('urgent')}>
            Vẫn thêm (khẩn cấp)
          </button>
        )}
        {answer === 'yes' && (
          <button className="btn btn-primary" disabled={!title.trim()} onClick={() => add('goal')}>
            Thêm vào tuần
          </button>
        )}
        {answer === 'no' && (
          <button className="btn btn-primary" disabled={!title.trim()} onClick={() => add('backlog')}>
            Đưa vào Kho việc
          </button>
        )}
      </div>
      {answer === 'no' && (
        <p className="small muted">Việc thêm khẩn cấp sẽ được ghi lại để cả đội bàn ở buổi rút kinh nghiệm.</p>
      )}
    </Modal>
  );
}
