import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { memberName, uid } from '../store';
import type { Priority } from '../types';
import { addDays, fmtDay, fmtShort } from '../lib/dates';
import { Avatar, Modal, Tip } from '../components/ui';
import {
  BotTag,
  CommentThread,
  NOTE_KIND,
  PRIORITIES,
  PRIORITY,
  PriorityTag,
  Term,
  openComments,
  useBrainstorm,
} from './common';
import { aiPlan, fallbackNote, useAi } from './ai';
import { CLOUD } from '../backend';
import {
  bufferDays,
  computeDeadlines,
  planFromAi,
  shiftMilestone,
  shiftTask,
  suggestPlan,
  suggestTaskForNote,
  type ShiftResult,
} from './logic';
import { COORD, type BTask, type Comment, type Milestone } from './types';

type CardRef = { type: 'm' | 't'; id: string };
type EditState =
  | { mode: 'edit'; ref: CardRef; apply?: Comment }
  | { mode: 'new-m' }
  | { mode: 'new-t'; milestoneId: string };

/** Bước 3 — Milestone, WBS, Deadline, thứ tự ưu tiên, Task brief. App gợi ý; nhóm trưởng / phó sửa và chốt; thành viên comment. */
export function PlanStep() {
  const { state, s, isLeader, readOnly, people, update, today } = useBrainstorm();
  const [thread, setThread] = useState<CardRef | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [pending, setPending] = useState<ShiftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [dateDraft, setDateDraft] = useState(s.goalDate ?? '');

  const ai = useAi();
  const [planning, setPlanning] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const started = useRef(false);
  // Bản trên mạng: nhiều máy cùng mở bước này. Chỉ máy của nhóm trưởng tự sinh kế hoạch,
  // nếu không thì gợi ý theo mẫu từ máy khác sẽ tới trước và chặn mất gợi ý của AI.
  const waitLead = CLOUD && state.members.find((m) => m.id === state.currentMemberId)?.role !== 'owner';

  /** Gợi ý theo mẫu của loại dự án (không dùng AI). */
  function planFromRules(goalDate: string) {
    const plan = suggestPlan(s.projectType, uid);
    computeDeadlines(plan.milestones, plan.tasks, today, goalDate);
    update((b) => {
      if (b.milestones.length > 0) return;
      b.milestones = plan.milestones;
      b.tasks = plan.tasks;
      b.aiUsed.plan = false;
    });
  }

  // Lần đầu vào bước 3: app gợi ý 3–5 milestone và WBS (AI nếu có, không thì mẫu theo loại dự án),
  // rồi tự tính deadline ngược từ ngày của goal. AI không bao giờ đặt ngày.
  useEffect(() => {
    // Observer chỉ xem: không sinh kế hoạch (store cũng không lưu thay đổi của họ).
    if (readOnly || waitLead || !s.goalDate || s.milestones.length > 0 || ai === null || started.current) return;
    started.current = true;
    const goalDate = s.goalDate;
    const fromRules = () => planFromRules(goalDate);

    if (!ai.enabled) {
      fromRules();
      return;
    }
    setPlanning(true);
    aiPlan({ goal: s.goal, teamSize: s.teamSize, goalDate, today })
      .then((r) => {
        const plan = planFromAi(r, uid);
        if (plan.milestones.length < 2) throw new Error('too_few_milestones');
        computeDeadlines(plan.milestones, plan.tasks, today, goalDate);
        const sh = r.stakeholders;
        const clean = (list: string[]) => list.map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 3);
        update((b) => {
          if (b.milestones.length > 0) return;
          b.milestones = plan.milestones;
          b.tasks = plan.tasks;
          b.stakeholderHints = [clean(sh.approve), clean(sh.lend_or_fund), clean(sh.participate_or_use), clean(sh.affected)];
          b.aiUsed.plan = true;
        });
      })
      .catch((err: unknown) => {
        setAiNote(fallbackNote(err));
        fromRules();
      })
      .finally(() => setPlanning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, s.goalDate, s.milestones.length, waitLead]);

  if ((readOnly || waitLead) && (!s.goalDate || s.milestones.length === 0)) {
    const goalDate = s.goalDate;
    return (
      <div className="card stack-sm bs-narrow">
        <h2>Nhóm chưa có Milestone và WBS</h2>
        <p className="muted">Khi nhóm trưởng mở bước này, kế hoạch sẽ hiện ở đây.</p>
        {isLeader && goalDate && (
          <>
            <p className="small muted">
              Bạn là nhóm phó. Nếu nhóm trưởng không có mặt, bạn có thể lấy gợi ý theo mẫu (không dùng AI) để nhóm làm tiếp.
            </p>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => planFromRules(goalDate)}>
              Dùng gợi ý theo mẫu
            </button>
          </>
        )}
      </div>
    );
  }

  if (!s.goalDate) {
    return (
      <div className="card stack bs-narrow">
        <h2>App cần ngày giao kết quả để tính Deadline</h2>
        <p>Goal chưa có ngày cụ thể. Chọn ngày nhóm phải xong, app sẽ tính ngược về hôm nay.</p>
        <div className="field">
          <label htmlFor="goal-date">Ngày giao kết quả</label>
          <input
            id="goal-date"
            type="date"
            className="input"
            min={addDays(today, 1)}
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={!dateDraft || dateDraft <= today}
          onClick={() => update((b) => void (b.goalDate = dateDraft))}
        >
          Tính Deadline
          <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    );
  }

  if (planning || (s.milestones.length === 0 && ai === null)) {
    return (
      <div className="card stack bs-narrow" role="status" aria-busy="true">
        <h2>App đang gợi ý Milestone và WBS…</h2>
        <p className="muted">Mất chừng nửa phút. Trong lúc chờ, cả nhóm có thể ghi ý tưởng vào khu Ghi chú.</p>
        <span className="skeleton tall" />
        <span className="skeleton w80" />
        <span className="skeleton w60" />
        <span className="skeleton tall" />
        <span className="skeleton w80" />
      </div>
    );
  }

  const goalDate = s.goalDate;
  const milestones = s.milestones.filter((m) => m.status !== 'removed');
  const tasks = s.tasks.filter((t) => t.status !== 'removed');
  const coord = tasks.filter((t) => t.milestoneId === COORD);
  const buffer = bufferDays(today, goalDate, milestones.length);

  const suggestedLeft =
    milestones.filter((m) => m.status === 'suggested').length + tasks.filter((t) => t.status === 'suggested').length;
  const concerns = [...milestones, ...tasks].reduce(
    (n, c) => n + c.comments.filter((x) => x.kind === 'concern' && x.status === 'open').length,
    0,
  );
  const canLock = suggestedLeft === 0 && concerns === 0;

  // Cảnh báo nếu ai đó bị giao quá nhiều.
  const fair = Math.ceil(tasks.length / Math.max(s.teamSize, 1));
  const overloaded = people
    .map((m) => ({ m, n: tasks.filter((t) => t.assigneeId === m.id).length }))
    .filter((x) => x.n > fair + 1);

  const card = (ref: CardRef): Milestone | BTask | undefined =>
    ref.type === 'm' ? s.milestones.find((m) => m.id === ref.id) : s.tasks.find((t) => t.id === ref.id);

  function mutate(ref: CardRef, fn: (c: Milestone | BTask) => void) {
    update((b) => {
      const c = ref.type === 'm' ? b.milestones.find((m) => m.id === ref.id) : b.tasks.find((t) => t.id === ref.id);
      if (c) fn(c);
    });
  }

  function remove(ref: CardRef) {
    update((b) => {
      if (ref.type === 't') {
        const t = b.tasks.find((x) => x.id === ref.id);
        if (t) t.status = 'removed';
        return;
      }
      const m = b.milestones.find((x) => x.id === ref.id);
      if (!m) return;
      m.status = 'removed';
      for (const t of b.tasks) if (t.milestoneId === m.id) t.status = 'removed';
      if (b.goalDate) computeDeadlines(b.milestones, b.tasks, today, b.goalDate);
    });
  }

  function applyShift(r: ShiftResult) {
    update((b) => {
      b.milestones = r.milestones;
      b.tasks = r.tasks;
    });
  }

  function shift(ref: CardRef, delta: number) {
    const r = ref.type === 'm' ? shiftMilestone(s, ref.id, delta, today) : shiftTask(s, ref.id, delta, today);
    if (r.error) return setError(r.error);
    setError(null);
    if (r.warn) return setPending(r);
    applyShift(r);
  }

  function keepAll() {
    update((b) => {
      for (const m of b.milestones) if (m.status === 'suggested') m.status = 'kept';
      for (const t of b.tasks) if (t.status === 'suggested') t.status = 'kept';
    });
  }

  function recompute() {
    update((b) => {
      if (b.goalDate) computeDeadlines(b.milestones, b.tasks, today, b.goalDate);
    });
    setError(null);
  }

  function changeGoalDate(date: string) {
    if (!date || date <= today) return;
    update((b) => {
      b.goalDate = date;
      computeDeadlines(b.milestones, b.tasks, today, date);
    });
  }

  const actions = (ref: CardRef, c: Milestone | BTask) => {
    const open = openComments(c.comments);
    const hasConcern = c.comments.some((x) => x.kind === 'concern' && x.status === 'open');
    return (
      <div className="row-wrap card-actions">
        {c.status === 'suggested' && <BotTag />}
        {c.credit.length > 0 && <span className="tag tag-ok">Theo đề xuất của {c.credit.join(', ')}</span>}
        {isLeader && c.status === 'suggested' && (
          <button className="btn btn-primary btn-sm" onClick={() => mutate(ref, (x) => void (x.status = 'kept'))}>
            <Check size={14} aria-hidden />
            Giữ
          </button>
        )}
        {isLeader && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ mode: 'edit', ref })}>
              <Pencil size={14} aria-hidden />
              Sửa
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(ref)}>
              <Trash2 size={14} aria-hidden />
              Bỏ
            </button>
          </>
        )}
        {ref.type === 't' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setBrief(ref.id)}>
            <FileText size={14} aria-hidden />
            Brief
          </button>
        )}
        <button
          className={`btn btn-ghost btn-sm${hasConcern ? ' has-concern' : ''}`}
          aria-label={`Comment: ${open} chưa xử lý`}
          onClick={() => setThread(ref)}
        >
          <MessageSquare size={14} aria-hidden />
          <span className="mono">{open > 0 ? open : c.comments.length}</span>
          {open > 0 ? ' chưa xử lý' : ' comment'}
        </button>
      </div>
    );
  };

  const stepper = (ref: CardRef, date: string) =>
    isLeader ? (
      <span className="date-stepper">
        <button className="btn-icon" aria-label="Sớm hơn 1 ngày" onClick={() => shift(ref, -1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="mono">{fmtShort(date)}</span>
        <button className="btn-icon" aria-label="Muộn hơn 1 ngày" onClick={() => shift(ref, 1)}>
          <ChevronRight size={18} />
        </button>
      </span>
    ) : (
      <span className="tag mono">{fmtShort(date)}</span>
    );

  const taskRow = (t: BTask, label: string, withDate: boolean) => (
    <div key={t.id} className={`wbs-row${t.status === 'suggested' ? ' suggested' : ''}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="mono muted wbs-no">{label}</span>
        <div className="grow">
          <div className="title">{t.title}</div>
          <div className="row-wrap small muted" style={{ gap: 6 }}>
            <span>{memberName(state, t.assigneeId)}</span>
            <PriorityTag
              value={t.priority}
              onChange={isLeader ? (p) => mutate({ type: 't', id: t.id }, (x) => void ('title' in x && (x.priority = p))) : undefined}
            />
          </div>
        </div>
        <Avatar state={state} memberId={t.assigneeId} small />
        {withDate ? stepper({ type: 't', id: t.id }, t.deadline) : <span className="tag">Mỗi tuần</span>}
      </div>
      {actions({ type: 't', id: t.id }, t)}
    </div>
  );

  const threadCard = thread ? card(thread) : undefined;
  const editing = edit?.mode === 'edit' ? card(edit.ref) : undefined;
  const briefTask = s.tasks.find((t) => t.id === brief);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card card-tight row-wrap">
        <div className="grow" style={{ minWidth: 220 }}>
          <span className="label">
            {s.entry === 'prompt' ? 'Prompt của nhóm trưởng' : <Term k="Goal" />}
          </span>
          <p>
            <strong>{s.goal}</strong>
          </p>
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label htmlFor="goal-date-2">Ngày giao kết quả</label>
          <input
            id="goal-date-2"
            type="date"
            className="input"
            disabled={!isLeader}
            min={addDays(today, 1)}
            value={goalDate}
            onChange={(e) => changeGoalDate(e.target.value)}
          />
        </div>
      </div>

      <Tip id="bs-deadline">
        Nhóm không tự gõ <strong>Deadline</strong>. App tính ngược từ {fmtDay(goalDate)} về hôm nay
        {buffer > 0 ? `, chừa ${buffer} ngày dự phòng` : ''}. Nhóm trưởng / phó chỉnh bằng nút sớm hơn, muộn hơn.
      </Tip>

      <p className="small muted">
        {s.aiUsed.plan ? 'Các thẻ dưới đây do AI gợi ý từ goal của nhóm. ' : 'Các thẻ dưới đây là mẫu theo loại dự án. '}
        {isLeader
          ? 'Bạn đang là nhóm trưởng / phó: Giữ, Sửa hoặc Bỏ từng thẻ app gợi ý, đặt thứ tự ưu tiên cho task, rồi bấm Chốt.'
          : readOnly
            ? 'Bạn đang ở chế độ chỉ xem: mở Brief hoặc comment trên từng thẻ để đọc.'
            : 'Bạn là thành viên: bấm vào nút comment trên từng thẻ để đề xuất, hỏi hoặc nêu lo ngại.'}
      </p>

      {aiNote && (
        <div className="notice" role="status">
          <TriangleAlert size={18} aria-hidden />
          <span className="grow">{aiNote}</span>
        </div>
      )}

      {error && (
        <div className="notice" role="alert">
          <TriangleAlert size={18} aria-hidden />
          <span className="grow">{error}</span>
        </div>
      )}

      {overloaded.map(({ m, n }) => (
        <div key={m.id} className="notice">
          <TriangleAlert size={18} aria-hidden />
          <span>
            {m.name} đang nhận {n} task, nhiều hơn hẳn mọi người (trung bình khoảng {fair}). Chia bớt cho người khác?
          </span>
        </div>
      ))}

      {s.entry === 'prompt' && (
        <Tip id="bs-prompt-brief">
          Mỗi task dưới đây đã có một <strong>Task brief</strong> nháp soạn từ prompt: bấm nút Brief trên thẻ để xem,
          bấm Sửa để chỉnh.
        </Tip>
      )}

      {milestones.map((m, i) => {
        const own = tasks.filter((t) => t.milestoneId === m.id);
        return (
          <section key={m.id} className={`card ms-card enter${m.status === 'suggested' ? ' suggested' : ''}`} style={{ ['--i' as string]: Math.min(i, 5) }}>
            <div className="row ms-head" style={{ alignItems: 'flex-start' }}>
              <span className="ms-index mono">{i + 1}</span>
              <div className="grow">
                <span className="label">
                  <Term k="Milestone" />
                  {i === milestones.length - 1 ? ' cuối = goal đạt được' : ''}
                </span>
                <h2>{m.name}</h2>
                <p>
                  <span className="muted">Xong khi: </span>
                  {m.doneWhen}
                </p>
              </div>
              {stepper({ type: 'm', id: m.id }, m.deadline)}
            </div>
            {actions({ type: 'm', id: m.id }, m)}

            <div className="wbs">
              {own.length === 0 && <p className="small muted">Milestone này chưa có task nào.</p>}
              {own.map((t, j) => taskRow(t, `${i + 1}.${j + 1}`, true))}
              {isLeader && (
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ mode: 'new-t', milestoneId: m.id })}>
                  <Plus size={14} aria-hidden />
                  Thêm task
                </button>
              )}
            </div>
          </section>
        );
      })}

      <section className="card ms-card">
        <div className="row ms-head">
          <span className="ms-index mono">{milestones.length + 1}</span>
          <div className="grow">
            <h2>Phối hợp nhóm</h2>
            <p className="muted">Họp, nhắc việc: những task lặp lại suốt dự án.</p>
          </div>
        </div>
        <div className="wbs">
          {coord.map((t, j) => taskRow(t, `${milestones.length + 1}.${j + 1}`, false))}
          {isLeader && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ mode: 'new-t', milestoneId: COORD })}>
              <Plus size={14} aria-hidden />
              Thêm task
            </button>
          )}
        </div>
      </section>

      {isLeader && (
        <div className="row-wrap">
          <button className="btn btn-ghost" onClick={() => setEdit({ mode: 'new-m' })}>
            <Plus size={18} aria-hidden />
            Thêm milestone
          </button>
          <button className="btn btn-ghost" onClick={recompute}>
            <RotateCcw size={18} aria-hidden />
            Tính lại Deadline
          </button>
        </div>
      )}

      <div className="card card-float stack-sm lock-bar">
        {s.locked ? (
          <p>
            <strong>Kế hoạch đã chốt.</strong> Vẫn sửa được thẻ và thêm ghi chú sau buổi họp.
          </p>
        ) : canLock ? (
          <p>
            <strong>Sẵn sàng chốt.</strong> Mọi thẻ gợi ý đã được xử lý và không còn lo ngại nào chưa trả lời.
          </p>
        ) : (
          <p>
            <strong>Chưa chốt được: </strong>
            {suggestedLeft > 0 && `còn ${suggestedLeft} thẻ gợi ý chưa Giữ / Sửa / Bỏ`}
            {suggestedLeft > 0 && concerns > 0 && ' · '}
            {concerns > 0 && `${concerns} lo ngại chưa trả lời`}
            .
          </p>
        )}
        <div className="row-wrap">
          {isLeader ? (
            <button
              className="btn btn-primary btn-lg"
              disabled={!s.locked && !canLock}
              onClick={() => (s.locked ? update((b) => void (b.step = 5)) : setLocking(true))}
            >
              {s.locked ? 'Tiếp: Tổng kết' : 'Chốt kế hoạch'}
              <ArrowRight size={20} aria-hidden />
            </button>
          ) : (
            <span className="muted small">Chỉ nhóm trưởng / phó bấm Chốt. App không bao giờ tự chốt.</span>
          )}
          {isLeader && s.locked && (
            <button className="btn btn-ghost" onClick={() => update((b) => void (b.step = 4))}>
              <Plus size={18} aria-hidden />
              Thêm Stakeholder (tuỳ chọn)
            </button>
          )}
          {isLeader && suggestedLeft > 0 && (
            <button className="link small" onClick={keepAll}>
              Giữ tất cả {suggestedLeft} gợi ý còn lại
            </button>
          )}
        </div>
      </div>

      {thread && threadCard && (
        <CommentThread
          title={'name' in threadCard ? threadCard.name : threadCard.title}
          comments={threadCard.comments}
          canVolunteer={thread.type === 't'}
          onClose={() => setThread(null)}
          onAdd={(c) => mutate(thread, (x) => void x.comments.push(c))}
          onResolve={(id, status, reply) =>
            mutate(thread, (x) => {
              const c = x.comments.find((y) => y.id === id);
              if (c) {
                c.status = status;
                c.reply = reply;
              }
            })
          }
          onApply={(c) => {
            setEdit({ mode: 'edit', ref: thread, apply: c });
            setThread(null);
          }}
        />
      )}

      {edit && (edit.mode !== 'edit' || editing) && (
        <EditCard edit={edit} current={editing} onClose={() => setEdit(null)} />
      )}

      {briefTask && <BriefModal task={briefTask} onClose={() => setBrief(null)} />}

      {pending && (
        <Modal title="Dời Deadline này?" onClose={() => setPending(null)}>
          <p>{pending.warn}</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setPending(null)}>
              Giữ nguyên
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                applyShift(pending);
                setPending(null);
              }}
            >
              Vẫn đổi
            </button>
          </div>
        </Modal>
      )}

      {locking && <LockModal onClose={() => setLocking(false)} />}
    </div>
  );
}

/* ---------- Sửa / thêm thẻ ---------- */

function EditCard({ edit, current, onClose }: { edit: EditState; current?: Milestone | BTask; onClose: () => void }) {
  const { state, s, people, update, today } = useBrainstorm();
  const isTask = edit.mode === 'new-t' || (edit.mode === 'edit' && edit.ref.type === 't');
  const task = current && 'title' in current ? current : undefined;
  const ms = current && 'name' in current ? current : undefined;
  const [title, setTitle] = useState(task?.title ?? ms?.name ?? '');
  const [doneWhen, setDoneWhen] = useState(current?.doneWhen ?? '');
  const [assignee, setAssignee] = useState<string | null>(task?.assigneeId ?? null);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'mid');
  const apply = edit.mode === 'edit' ? edit.apply : undefined;

  function save() {
    const text = title.trim();
    if (!text) return;
    const newId = uid();
    update((b) => {
      if (edit.mode === 'edit') {
        const c =
          edit.ref.type === 'm' ? b.milestones.find((m) => m.id === edit.ref.id) : b.tasks.find((t) => t.id === edit.ref.id);
        if (!c) return;
        if ('name' in c) c.name = text;
        else {
          c.title = text;
          c.assigneeId = assignee;
          c.priority = priority;
        }
        c.doneWhen = doneWhen.trim();
        if (c.status === 'suggested') c.status = 'kept';
        if (apply) {
          const cm = c.comments.find((x) => x.id === apply.id);
          if (cm) cm.status = 'applied';
          const who = state.members.find((m) => m.id === apply.authorId)?.name;
          if (who && !c.credit.includes(who)) c.credit.push(who);
        }
        return;
      }
      if (edit.mode === 'new-t') {
        const m = b.milestones.find((x) => x.id === edit.milestoneId);
        const end = m ? m.deadline : (b.goalDate ?? today);
        let deadline = addDays(end, -1);
        if (deadline < today) deadline = today;
        if (!m) deadline = end;
        b.tasks.push({
          id: newId,
          milestoneId: edit.milestoneId,
          title: text,
          doneWhen: doneWhen.trim(),
          assigneeId: assignee,
          deadline,
          status: 'kept',
          byApp: false,
          comments: [],
          credit: [],
          stakeholderId: null,
          priority,
        });
        return;
      }
      // Milestone mới: chèn trước milestone cuối (milestone cuối = goal), rồi app tính lại deadline.
      const m: Milestone = {
        id: newId,
        name: text,
        doneWhen: doneWhen.trim() || 'Chưa ghi điều kiện',
        deadline: b.goalDate ?? today,
        status: 'kept',
        byApp: false,
        comments: [],
        credit: [],
      };
      const lastIdx = b.milestones.map((x) => x.status !== 'removed').lastIndexOf(true);
      if (lastIdx < 0) b.milestones.push(m);
      else b.milestones.splice(lastIdx, 0, m);
      if (b.goalDate) computeDeadlines(b.milestones, b.tasks, today, b.goalDate);
    });
    onClose();
  }

  const heading =
    edit.mode === 'new-m' ? 'Thêm milestone' : edit.mode === 'new-t' ? 'Thêm task' : isTask ? 'Sửa task' : 'Sửa milestone';

  return (
    <Modal title={heading} onClose={onClose}>
      {apply && (
        <div className="tip">
          <Check size={18} aria-hidden />
          <span>
            Đang áp dụng đề xuất của {memberName(state, apply.authorId)}: "{apply.text}"
          </span>
        </div>
      )}
      <div className="field">
        <label htmlFor="ec-title">{isTask ? 'Tên task (đủ nhỏ cho 1 người)' : 'Tên milestone (một trạng thái đạt được)'}</label>
        <input
          id="ec-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isTask ? 'Ví dụ: Đặt sân' : 'Ví dụ: Đã có sân'}
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="ec-done">Xong khi (kiểm tra được có / không)</label>
        <input
          id="ec-done"
          className="input"
          value={doneWhen}
          onChange={(e) => setDoneWhen(e.target.value)}
          placeholder={isTask ? 'Để trống thì dùng "xong khi" của milestone' : 'Ví dụ: Có xác nhận đặt sân'}
        />
      </div>
      {isTask && (
        <div className="stack-sm">
          <span className="label">Người làm</span>
          <div className="chips">
            {people.map((m) => (
              <button
                key={m.id}
                className={`chip${assignee === m.id ? ' on' : ''}`}
                aria-pressed={assignee === m.id}
                onClick={() => setAssignee(assignee === m.id ? null : m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {isTask && (
        <div className="stack-sm">
          <span className="label">Thứ tự ưu tiên</span>
          <div className="chips">
            {PRIORITIES.map((p) => {
              const K = PRIORITY[p];
              return (
                <button key={p} className={`chip${priority === p ? ' on' : ''}`} aria-pressed={priority === p} onClick={() => setPriority(p)}>
                  <K.icon size={16} aria-hidden />
                  {K.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {edit.mode === 'new-m' && (
        <p className="small muted">Milestone mới được chèn trước milestone cuối. App sẽ tính lại toàn bộ Deadline.</p>
      )}
      {s.locked && <p className="small muted">Kế hoạch đã chốt; thay đổi này vẫn được lưu.</p>}
      <div className="modal-actions">
        <button className="btn btn-primary" disabled={!title.trim()} onClick={save}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Task brief ---------- */

export function BriefModal({ task, onClose }: { task: BTask; onClose: () => void }) {
  const { state, s } = useBrainstorm();
  const m = s.milestones.find((x) => x.id === task.milestoneId);
  const notes = s.notes.filter((n) => n.status === 'approved' && n.taskId === task.id);
  const contacts = s.stakeholders.filter((sh) => m && sh.milestoneId === m.id);
  return (
    <Modal title="Task brief" onClose={onClose}>
      <dl className="brief">
        <dt>Làm gì</dt>
        <dd>
          <strong>{task.title}</strong>
        </dd>
        <dt>Vì sao</dt>
        <dd>{m ? `Milestone "${m.name}" (${fmtShort(m.deadline)})` : 'Giữ cho cả nhóm phối hợp nhịp nhàng'}</dd>
        <dt>Xong khi</dt>
        <dd>{task.doneWhen || m?.doneWhen || 'Nhóm trưởng chưa ghi'}</dd>
        <dt>Người làm</dt>
        <dd>{memberName(state, task.assigneeId)}</dd>
        <dt>Deadline</dt>
        <dd className="mono">{m ? fmtDay(task.deadline) : 'Mỗi tuần'}</dd>
        <dt>Ưu tiên</dt>
        <dd>
          <PriorityTag value={task.priority} />
        </dd>
        {contacts.length > 0 && (
          <>
            <dt>Liên hệ</dt>
            <dd>{contacts.map((c) => c.name).join(', ')}</dd>
          </>
        )}
        <dt>Ghi chú từ buổi họp</dt>
        <dd>
          {notes.length === 0 ? (
            <span className="muted">Chưa có ghi chú đã duyệt nào gắn với task này.</span>
          ) : (
            <ul className="brief-notes">
              {notes.map((n) => {
                const K = NOTE_KIND[n.kind];
                return (
                  <li key={n.id}>
                    <K.icon size={16} aria-hidden />
                    <span>
                      {n.text} <em className="muted">— {memberName(state, n.authorId)}</em>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </dd>
      </dl>
      <p className="small muted">App soạn nháp brief từ WBS. Nhóm trưởng / phó sửa bằng nút Sửa trên thẻ task.</p>
    </Modal>
  );
}

/* ---------- Chốt kế hoạch: gắn ghi chú đã duyệt vào brief ---------- */

function LockModal({ onClose }: { onClose: () => void }) {
  const { s, update } = useBrainstorm();
  const tasks = s.tasks.filter((t) => t.status !== 'removed');
  // Ghi chú đã duyệt chưa gắn task + câu hỏi chưa trả lời.
  const loose = s.notes.filter(
    (n) => !n.taskId && (n.status === 'approved' || (n.kind === 'question' && n.status === 'new')),
  );
  const [target, setTarget] = useState<Record<string, string>>(() =>
    Object.fromEntries(loose.map((n) => [n.id, suggestTaskForNote(n, tasks) ?? ''])),
  );

  function lock() {
    update((b) => {
      for (const n of b.notes) {
        if (!(n.id in target)) continue;
        n.taskId = target[n.id] || null;
        if (n.kind === 'question' && n.status === 'new' && n.taskId) n.status = 'approved';
      }
      b.locked = true;
      // Stakeholder là bước tuỳ chọn (D-010): chốt xong đi thẳng tới Tổng kết.
      b.step = 5;
    });
    onClose();
  }

  return (
    <Modal title="Chốt kế hoạch" onClose={onClose}>
      {loose.length === 0 ? (
        <p>Các ghi chú đã duyệt đều đã gắn vào task. Chốt xong, mỗi task có một Task brief riêng.</p>
      ) : (
        <>
          <p>
            Có {loose.length} ghi chú cần chỗ. App đã gợi ý task phù hợp nhất, bạn xác nhận hoặc đổi lại.
          </p>
          {loose.map((n) => {
            const K = NOTE_KIND[n.kind];
            return (
              <div key={n.id} className="field">
                <label htmlFor={`lk-${n.id}`} className="row" style={{ gap: 6 }}>
                  <K.icon size={16} aria-hidden />
                  {n.text}
                </label>
                <select
                  id={`lk-${n.id}`}
                  className="select"
                  value={target[n.id] ?? ''}
                  onChange={(e) => setTarget({ ...target, [n.id]: e.target.value })}
                >
                  <option value="">Ghi chú chung của dự án</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Chưa chốt
        </button>
        <button className="btn btn-primary" onClick={lock}>
          <Check size={18} aria-hidden />
          Chốt kế hoạch
        </button>
      </div>
    </Modal>
  );
}
