import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Repeat,
  Send,
  Star,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { Tab } from '../App';
import { canEdit, currentSprint, me, memberName, openImpediments, todayISO, uid, useStore, workers } from '../store';
import type { Meeting, MeetingKind, MeetingPoll, PollStatus } from '../types';
import { fmtDay } from '../lib/dates';
import {
  KINDS,
  STATUS_LABEL,
  WEEKDAYS,
  answeredIds,
  bestSlots,
  dayLabel,
  defaultDays,
  defaultDeadline,
  defaultMeetingTime,
  defaultPeople,
  fromMin,
  kindDef,
  nextWorkdays,
  parseSlot,
  pollStatus,
  rankSlots,
  shortDayLabel,
  slotFreeMap,
  slotKey,
  slotLabel,
  slotMinutesFor,
  slotTimes,
  slotsToWeekly,
  sortDays,
  toMin,
  weeklyToSlots,
  type Candidate,
} from '../lib/meeting';
import { Avatar, Choice, Modal, Tip, Wizard } from '../components/ui';
import { EmptyBlocks } from '../components/Voxel';
import '../meeting.css';

type View = { name: 'list' } | { name: 'create' } | { name: 'answer'; pollId: string } | { name: 'detail'; pollId: string };

const STATUS_TAG: Record<PollStatus, string> = {
  collecting: 'tag-blue',
  proposed: 'tag-ok',
  confirmed: 'tag-ok',
  expired: 'tag-warn',
  cancelled: '',
};

function meetingWhen(m: Pick<Meeting, 'day' | 'start' | 'duration'>): string {
  return slotLabel({ duration: m.duration }, slotKey(m.day, m.start));
}

/** Tìm giờ họp chung cho đội (kiểu when2meet). Wiki: features/meeting-scheduler */
export function MeetingScreen({ go }: { go: (t: Tab) => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const isOwner = user.role === 'owner';
  const editable = canEdit(state);
  const today = todayISO(state);
  const [view, setView] = useState<View>({ name: 'list' });
  const [removing, setRemoving] = useState<string | null>(null);

  const openPolls = state.polls.filter((p) => p.status !== 'confirmed' && p.status !== 'cancelled');
  const rhythm = state.meetings.filter((m) => m.recurring);
  const upcoming = state.meetings
    .filter((m) => !m.recurring && m.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start));

  const detailPoll = view.name === 'detail' ? state.polls.find((p) => p.id === view.pollId) : undefined;
  const answerPoll = view.name === 'answer' ? state.polls.find((p) => p.id === view.pollId) : undefined;

  if (detailPoll) {
    return (
      <PollDetail
        poll={detailPoll}
        onBack={() => setView({ name: 'list' })}
        onAnswer={() => setView({ name: 'answer', pollId: detailPoll.id })}
      />
    );
  }

  function actionFor(p: MeetingPoll): { label: string; to: 'answer' | 'detail'; primary: boolean } {
    const st = pollStatus(p, state.responses, today);
    const answered = answeredIds(p, state.responses).includes(user.id);
    if (editable && p.inviteeIds.includes(user.id) && !answered && st !== 'expired') return { label: 'Chọn giờ rảnh', to: 'answer', primary: true };
    if (isOwner && st === 'proposed') return { label: 'Chốt giờ họp', to: 'detail', primary: true };
    if (isOwner && st === 'expired') return { label: 'Xem lựa chọn', to: 'detail', primary: true };
    return { label: 'Xem kết quả', to: 'detail', primary: false };
  }

  const actions = openPolls.map(actionFor);
  const firstPrimary = actions.findIndex((a) => a.primary);
  const removingMeeting = state.meetings.find((m) => m.id === removing);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Tìm giờ họp</h1>
          <p className="muted prose">Hỏi cả đội rảnh lúc nào. App chỉ ra giờ đẹp nhất, bạn chỉ cần chốt.</p>
        </div>
        {isOwner && (
          <button
            className={`btn ${firstPrimary < 0 ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView({ name: 'create' })}
          >
            <CalendarPlus size={18} aria-hidden />
            Tìm giờ họp
          </button>
        )}
      </div>

      <Tip id="meeting">
        Thay vì nhắn hỏi từng người, bạn gửi một lần tìm giờ họp. Mỗi người tô giờ rảnh của mình, app chỉ ra giờ có
        nhiều người rảnh nhất.
      </Tip>

      {openPolls.length === 0 && state.meetings.length === 0 && (
        <div className="card empty enter">
          <EmptyBlocks />
          <h2>Chưa có lần tìm giờ họp nào</h2>
          <p className="muted prose">
            {isOwner
              ? 'Bấm "Tìm giờ họp" để hỏi đội giờ nào tiện cho buổi lên kế hoạch, họp nhanh, hay một buổi họp lẻ.'
              : 'Khi nhóm trưởng gửi một lần tìm giờ họp, nó sẽ hiện ở đây để bạn chọn giờ rảnh.'}
          </p>
        </div>
      )}

      {openPolls.length > 0 && (
        <section className="stack-sm" aria-labelledby="mt-open">
          <h2 id="mt-open" className="mt-section-title">
            Đang tìm giờ
          </h2>
          {openPolls.map((p, i) => {
            const st = pollStatus(p, state.responses, today);
            const answered = answeredIds(p, state.responses);
            const a = actions[i];
            return (
              <div key={p.id} className="list-item mt-poll enter" style={{ ['--i' as string]: Math.min(i, 5) }}>
                <div className="grow">
                  <div className="title">{p.title}</div>
                  <div className="row-wrap" style={{ marginTop: 4 }}>
                    <span className={`tag ${STATUS_TAG[st]}`}>{STATUS_LABEL[st]}</span>
                    <span className="tag mono">
                      {answered.length}/{p.inviteeIds.length} đã trả lời
                    </span>
                    <span className="small muted">Hạn trả lời: {fmtDay(p.deadline)}</span>
                  </div>
                </div>
                <button
                  className={`btn btn-sm ${i === firstPrimary ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setView(a.to === 'answer' ? { name: 'answer', pollId: p.id } : { name: 'detail', pollId: p.id })}
                >
                  {a.label}
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            );
          })}
        </section>
      )}

      {rhythm.length > 0 && (
        <section className="stack-sm" aria-labelledby="mt-rhythm">
          <h2 id="mt-rhythm" className="mt-section-title">
            Nhịp cố định của đội
          </h2>
          {rhythm.map((m) => (
            <div key={m.id} className="list-item">
              <Repeat size={18} aria-hidden style={{ color: 'var(--blue-ink)', flex: 'none' }} />
              <div className="grow">
                <div className="title">{m.title}</div>
                <div className="small muted">{meetingWhen(m)}</div>
              </div>
              {isOwner && (
                <button className="btn-icon" aria-label={`Bỏ giờ cố định "${m.title}"`} onClick={() => setRemoving(m.id)}>
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
          <p className="small muted">
            Giờ họp nhanh và giờ xem kết quả cũng được ghi vào nhịp làm việc.{' '}
            <button className="link" onClick={() => go('team')}>
              Xem nhịp làm việc
            </button>
          </p>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="stack-sm" aria-labelledby="mt-upcoming">
          <h2 id="mt-upcoming" className="mt-section-title">
            Buổi họp sắp tới
          </h2>
          {upcoming.map((m) => (
            <div key={m.id} className="list-item">
              <CalendarCheck size={18} aria-hidden style={{ color: '#2e6b32', flex: 'none' }} />
              <div className="grow">
                <div className="title">{m.title}</div>
                <div className="small muted">
                  {meetingWhen(m)} · {m.attendeeIds.length} người
                </div>
              </div>
              {m.day === today && <span className="tag tag-warn">Hôm nay</span>}
              {isOwner && (
                <button className="btn-icon" aria-label={`Hủy buổi họp "${m.title}"`} onClick={() => setRemoving(m.id)}>
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {view.name === 'create' && (
        <CreateWizard
          onClose={() => setView({ name: 'list' })}
          onCreated={(pollId, alsoAnswer) => setView(alsoAnswer ? { name: 'answer', pollId } : { name: 'list' })}
        />
      )}
      {answerPoll && <AnswerFlow poll={answerPoll} onClose={() => setView({ name: 'list' })} />}

      {removingMeeting && (
        <Modal title="Bỏ buổi họp này?" onClose={() => setRemoving(null)}>
          <p>
            <strong>{removingMeeting.title}</strong> — {meetingWhen(removingMeeting)}
          </p>
          <p className="small muted">Buổi họp sẽ biến mất khỏi danh sách của cả đội.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setRemoving(null)}>
              Giữ lại
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                set((d) => void (d.meetings = d.meetings.filter((m) => m.id !== removingMeeting.id)));
                setRemoving(null);
              }}
            >
              Bỏ buổi họp
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= Tạo lần tìm giờ — wizard 3 bước ================= */

const FROM_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const TO_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function CreateWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (pollId: string, alsoAnswer: boolean) => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const today = todayISO(state);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<MeetingKind | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [fromHour, setFromHour] = useState(8);
  const [toHour, setToHour] = useState(18);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [required, setRequired] = useState<string[]>([]);
  const [optional, setOptional] = useState<string[]>([]);

  const def = kind ? kindDef(kind) : null;
  // Mỗi loại nhịp cố định chỉ có 1 lần tìm giờ đang mở.
  const busyKinds = state.polls
    .filter((p) => p.recurring && p.status !== 'confirmed' && p.status !== 'cancelled')
    .map((p) => p.kind);

  function choose(k: MeetingKind) {
    const d = kindDef(k);
    const people = defaultPeople(k, workers(state));
    let t = d.label;
    if (k === 'unblock') {
      const sprint = currentSprint(state);
      const imp = sprint ? openImpediments(state, sprint.id)[0] : undefined;
      if (imp) {
        t = `Gỡ vướng cho ${memberName(state, imp.memberId)}`;
        for (const id of [imp.memberId, imp.helperId]) {
          if (id && !people.required.includes(id)) people.required.push(id);
        }
      }
    }
    setKind(k);
    setTitle(k === 'other' ? '' : t);
    setDuration(d.duration);
    setDays(defaultDays(k, today));
    setRequired(people.required);
    setOptional(people.optional);
  }

  const dayOptions = def?.recurring ? WEEKDAYS : nextWorkdays(today, 10);
  const hoursFit = (toHour - fromHour) * 60 >= duration;
  const canNext = (step === 0 && kind !== null) || (step === 1 && days.length > 0 && hoursFit);
  const canSend = title.trim() !== '' && required.length > 0 && days.length > 0 && hoursFit;

  function toggleRequired(id: string) {
    if (required.includes(id)) setRequired(required.filter((r) => r !== id));
    else {
      setRequired([...required, id]);
      setOptional(optional.filter((o) => o !== id));
    }
  }

  function send() {
    if (!kind || !def) return;
    const poll: MeetingPoll = {
      id: uid(),
      title: title.trim(),
      kind,
      duration,
      recurring: def.recurring,
      days: sortDays(days),
      fromHour,
      toHour,
      slotMinutes: slotMinutesFor(kind),
      deadline: defaultDeadline(today),
      creatorId: user.id,
      inviteeIds: [...required, ...optional],
      requiredIds: required,
      status: 'collecting',
      chosenSlot: null,
      createdAt: today,
      round: 0,
    };
    set((d) => void d.polls.push(poll));
    onCreated(poll.id, poll.inviteeIds.includes(user.id));
  }

  return (
    <Wizard
      name="Tìm giờ họp"
      step={step}
      total={3}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ArrowLeft size={18} aria-hidden />
            {step === 0 ? 'Để sau' : 'Quay lại'}
          </button>
          {step < 2 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Tiếp tục
              <ArrowRight size={18} aria-hidden />
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!canSend} onClick={send}>
              <Send size={18} aria-hidden />
              Gửi cho đội
            </button>
          )}
        </>
      }
    >
      {step === 0 && (
        <>
          <h1>Họp về việc gì?</h1>
          <p className="prose">Chọn một loại. App tự điền thời lượng và người cần có mặt, bạn chỉnh lại được ở bước cuối.</p>
          <div className="stack-sm">
            {KINDS.map((k) =>
              busyKinds.includes(k.id) ? (
                <div key={k.id} className="choice mt-kind-disabled" aria-disabled="true">
                  <span className="box" />
                  <span className="grow">
                    <strong>{k.label}</strong>
                    <div className="small muted">Đang có một lần tìm giờ cho loại này. Chốt hoặc hủy nó trước.</div>
                  </span>
                </div>
              ) : (
                <Choice key={k.id} on={kind === k.id} onClick={() => choose(k.id)}>
                  <strong>{k.label}</strong>
                  <div className="small muted">
                    {k.duration} phút · {k.cadence}
                    {k.recurring ? ' · chọn một giờ cố định, không hỏi lại mỗi tuần' : ''}
                  </div>
                </Choice>
              ),
            )}
          </div>
        </>
      )}

      {step === 1 && def && (
        <>
          <h1>Trong những ngày nào?</h1>
          <p className="prose">
            {def.daily
              ? 'Họp nhanh diễn ra cùng giờ mỗi ngày. Chọn các ngày đội làm việc để app tìm một giờ hợp cho tất cả.'
              : def.recurring
                ? 'Buổi này lặp lại hằng tuần. Chọn các thứ có thể họp.'
                : 'Mặc định là 5 ngày làm việc tới. Bỏ chọn ngày không họp được.'}
          </p>
          <div className="chips" role="group" aria-label="Các ngày có thể họp">
            {dayOptions.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  className={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                >
                  {dayLabel(d)}
                </button>
              );
            })}
          </div>
          <div className="mt-hours">
            <div className="field">
              <label htmlFor="mt-from">Sớm nhất từ</label>
              <select id="mt-from" className="select" value={fromHour} onChange={(e) => setFromHour(Number(e.target.value))}>
                {FROM_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mt-to">Muộn nhất tới</label>
              <select id="mt-to" className="select" value={toHour} onChange={(e) => setToHour(Number(e.target.value))}>
                {TO_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!hoursFit && <p className="error">Khoảng giờ phải đủ dài cho một buổi họp {duration} phút.</p>}
          <p className="small muted">App không bao giờ đề xuất giờ nằm ngoài khoảng này.</p>
        </>
      )}

      {step === 2 && def && (
        <>
          <h1>Gửi cho đội</h1>
          <div className="field">
            <label htmlFor="mt-title">Tên buổi họp</label>
            <input
              id="mt-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Bàn về bảng giá mới"
              autoFocus={title === ''}
            />
          </div>
          {def.durations.length > 1 && (
            <div className="stack-sm">
              <span className="label">Thời lượng (tối đa {Math.max(...def.durations)} phút cho loại này)</span>
              <div className="chips">
                {def.durations.map((m) => (
                  <button key={m} className={`chip${duration === m ? ' on' : ''}`} aria-pressed={duration === m} onClick={() => setDuration(m)}>
                    {m} phút
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="stack-sm">
            <span className="label">Người cần có mặt (thiếu thì buổi họp không diễn ra được)</span>
            <div className="chips">
              {workers(state).map((m) => {
                const on = required.includes(m.id);
                return (
                  <button key={m.id} className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleRequired(m.id)}>
                    {m.name}
                  </button>
                );
              })}
            </div>
            {required.length === 0 && <p className="error">Chọn ít nhất một người cần có mặt.</p>}
          </div>
          {workers(state).some((m) => !required.includes(m.id)) && (
            <div className="stack-sm">
              <span className="label">Mời thêm (không bắt buộc)</span>
              <div className="chips">
                {workers(state)
                  .filter((m) => !required.includes(m.id))
                  .map((m) => {
                    const on = optional.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        className={`chip${on ? ' on' : ''}`}
                        aria-pressed={on}
                        onClick={() => setOptional(on ? optional.filter((o) => o !== m.id) : [...optional, m.id])}
                      >
                        {m.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          <div className="card card-tight stack-sm">
            <p className="small">
              <span className="muted">Hỏi về: </span>
              {sortDays(days).map(dayLabel).join(', ')} · {fromHour}:00–{toHour}:00
            </p>
            <p className="small">
              <span className="muted">Hạn trả lời: </span>
              hết {fmtDay(defaultDeadline(today))}, hoặc sớm hơn nếu mọi người đã trả lời.
            </p>
            <p className="small muted">App nhắc người chưa trả lời tối đa một lần.</p>
          </div>
        </>
      )}
    </Wizard>
  );
}

/* ================= Tô giờ rảnh ================= */

function AnswerFlow({ poll, onClose }: { poll: MeetingPoll; onClose: () => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const today = todayISO(state);
  const days = sortDays(poll.days);
  const times = slotTimes(poll);
  const dense = poll.slotMinutes === 15;
  const hasWeekly = state.weekly.some((w) => w.memberId === user.id);

  const [init] = useState(() => {
    // Câu trả lời cũ (kể cả của vòng hỏi trước) → sửa tiếp; chưa có thì điền sẵn theo giờ rảnh thường lệ.
    const mine = state.responses.filter((r) => r.pollId === poll.id && r.memberId === user.id);
    const last = mine[mine.length - 1];
    if (last) return { slots: last.slots, prefilled: false };
    if (hasWeekly) return { slots: weeklyToSlots(poll, state.weekly, user.id), prefilled: true };
    return { slots: [] as string[], prefilled: false };
  });
  const [draft, setDraft] = useState<Set<string>>(() => new Set(init.slots));
  const [dayIdx, setDayIdx] = useState(0);
  const [askWeekly, setAskWeekly] = useState(false);
  const painting = useRef<boolean | null>(null);
  const lastIdx = useRef<number | null>(null);

  const day = days[Math.min(dayIdx, days.length - 1)];
  const isLast = dayIdx >= days.length - 1;
  const dayCount = times.filter((t) => draft.has(slotKey(day, t))).length;

  function paintAt(x: number, y: number) {
    const mode = painting.current;
    if (mode === null) return;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
    const key = el?.dataset.slot;
    if (!key) return;
    const idx = times.findIndex((t) => slotKey(day, t) === key);
    if (idx < 0) return;
    // Kéo nhanh thì trình duyệt bỏ qua vài ô: tô liền mạch từ ô trước đó tới ô hiện tại.
    const from = lastIdx.current ?? idx;
    lastIdx.current = idx;
    const keys: string[] = [];
    for (let i = Math.min(from, idx); i <= Math.max(from, idx); i++) keys.push(slotKey(day, times[i]));
    setDraft((prev) => {
      if (keys.every((k) => prev.has(k) === mode)) return prev;
      const next = new Set(prev);
      for (const k of keys) {
        if (mode) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setWholeDay(free: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const t of times) {
        if (free) next.add(slotKey(day, t));
        else next.delete(slotKey(day, t));
      }
      return next;
    });
  }

  function copyPrevDay() {
    const prevDay = days[dayIdx - 1];
    setDraft((prev) => {
      const next = new Set(prev);
      for (const t of times) {
        if (prev.has(slotKey(prevDay, t))) next.add(slotKey(day, t));
        else next.delete(slotKey(day, t));
      }
      return next;
    });
  }

  const askedKey = `weekly-asked:${user.id}`;

  function submit() {
    const id = uid();
    const slots = [...draft];
    set((d) => {
      d.responses = d.responses.filter((r) => !(r.pollId === poll.id && r.memberId === user.id));
      d.responses.push({ id, pollId: poll.id, memberId: user.id, slots, updatedAt: today, round: poll.round ?? 0 });
    });
    // Hỏi đúng một lần: lưu làm giờ rảnh thường lệ?
    if (!hasWeekly && slots.length > 0 && !state.tipsSeen.includes(askedKey)) setAskWeekly(true);
    else onClose();
  }

  function answerWeekly(save: boolean) {
    const ranges = save ? slotsToWeekly(poll, user.id, [...draft]) : [];
    set((d) => {
      if (!d.tipsSeen.includes(askedKey)) d.tipsSeen.push(askedKey);
      if (save) d.weekly = [...d.weekly.filter((w) => w.memberId !== user.id), ...ranges];
    });
    onClose();
  }

  if (askWeekly) {
    return (
      <Modal title="Lưu làm giờ rảnh thường lệ của bạn?" onClose={() => answerWeekly(false)}>
        <p>Lần sau app sẽ điền sẵn các giờ này, bạn chỉ cần sửa chỗ khác.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => answerWeekly(false)}>
            Không cần
          </button>
          <button className="btn btn-primary" onClick={() => answerWeekly(true)}>
            <Check size={18} aria-hidden />
            Lưu lại
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Wizard
      name="Chọn giờ rảnh"
      step={0}
      total={1}
      minutes={1}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => (dayIdx === 0 ? onClose() : setDayIdx(dayIdx - 1))}>
            <ArrowLeft size={18} aria-hidden />
            {dayIdx === 0 ? 'Để sau' : 'Ngày trước'}
          </button>
          <div className="row">
            {!isLast && (
              <button className="link small" onClick={submit}>
                Xong, gửi luôn
              </button>
            )}
            {isLast ? (
              <button className="btn btn-primary" onClick={submit}>
                <Check size={18} aria-hidden />
                Xong
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setDayIdx(dayIdx + 1)}>
                {shortDayLabel(days[dayIdx + 1])}
                <ArrowRight size={18} aria-hidden />
              </button>
            )}
          </div>
        </>
      }
    >
      <div>
        <span className="eyebrow">{poll.title}</span>
        <h1>Bạn rảnh lúc nào?</h1>
        <p className="small muted">
          Chạm hoặc kéo dọc để tô giờ rảnh. Ô không tô nghĩa là bận, không cần ghi lý do. Buổi họp dài {poll.duration} phút.
        </p>
      </div>

      {init.prefilled && (
        <Tip id="weekly-prefill">Đã điền sẵn theo giờ rảnh thường lệ của bạn. Sửa chỗ nào khác rồi bấm Xong.</Tip>
      )}

      <div className="mt-daynav">
        <button className="btn-icon" aria-label="Ngày trước" disabled={dayIdx === 0} onClick={() => setDayIdx(dayIdx - 1)}>
          <ChevronLeft size={22} />
        </button>
        <div className="mt-day">
          <strong>{dayLabel(day)}</strong>
          <span className="small muted mono">
            Ngày {dayIdx + 1}/{days.length} · {dayCount} khung giờ rảnh
          </span>
        </div>
        <button className="btn-icon" aria-label="Ngày sau" disabled={isLast} onClick={() => setDayIdx(dayIdx + 1)}>
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="mt-dots" aria-hidden>
        {days.map((d, i) => (
          <span
            key={d}
            className={`${i === dayIdx ? 'on' : ''} ${times.some((t) => draft.has(slotKey(d, t))) ? 'has' : ''}`}
          />
        ))}
      </div>

      <div className="chips">
        <button
          className="chip"
          disabled={!hasWeekly}
          title={hasWeekly ? 'Điền mọi ngày theo giờ rảnh thường lệ đã lưu' : 'Bạn chưa lưu giờ rảnh thường lệ'}
          onClick={() => setDraft(new Set(weeklyToSlots(poll, state.weekly, user.id)))}
        >
          Như thường lệ
        </button>
        <button className="chip" onClick={() => setWholeDay(true)}>
          Rảnh cả ngày
        </button>
        <button className="chip" onClick={() => setWholeDay(false)}>
          Bận cả ngày
        </button>
        {dayIdx > 0 && (
          <button className="chip" onClick={copyPrevDay}>
            Giống {shortDayLabel(days[dayIdx - 1])}
          </button>
        )}
      </div>

      <div
        className={`mt-grid${dense ? ' dense' : ''}`}
        role="group"
        aria-label={`Giờ rảnh ${dayLabel(day)}`}
        onPointerDown={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
          const key = el?.dataset.slot;
          if (!key) return;
          e.preventDefault();
          painting.current = !draft.has(key);
          lastIdx.current = null;
          paintAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => paintAt(e.clientX, e.clientY)}
        onPointerUp={() => (painting.current = null)}
        onPointerCancel={() => (painting.current = null)}
        onPointerLeave={() => (painting.current = null)}
      >
        {times.map((t) => {
          const key = slotKey(day, t);
          const on = draft.has(key);
          return (
            <div key={key} className={`mt-row${t.endsWith(':00') || t.endsWith(':30') ? '' : ' minor'}`}>
              <span className="mt-time">{t}</span>
              <div
                className={`mt-cell${on ? ' on' : ''}`}
                data-slot={key}
                role="checkbox"
                aria-checked={on}
                aria-label={`${t} tới ${fromMin(toMin(t) + poll.slotMinutes)}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle(key);
                  }
                }}
              >
                Rảnh
              </div>
            </div>
          );
        })}
      </div>

      {draft.size === 0 && (
        <p className="small muted">Bạn chưa tô giờ nào. Nếu gửi như vậy, app hiểu là bạn bận suốt các ngày này.</p>
      )}
    </Wizard>
  );
}

/* ================= Kết quả & chốt giờ ================= */

function PollDetail({ poll, onBack, onAnswer }: { poll: MeetingPoll; onBack: () => void; onAnswer: () => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const today = todayISO(state);
  const [selected, setSelected] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const st = pollStatus(poll, state.responses, today);
  const answered = answeredIds(poll, state.responses);
  const canDecide = user.role === 'owner' || user.id === poll.creatorId;
  const isInvitee = poll.inviteeIds.includes(user.id);
  const total = poll.inviteeIds.length;

  const cands = rankSlots(poll, state.responses, state.meetings, today);
  const best = bestSlots(cands, poll);
  const hasEveryone = cands.some((c) => c.everyone);
  const freeMap = slotFreeMap(poll, state.responses);
  const days = sortDays(poll.days);
  const times = slotTimes(poll);
  const dense = poll.slotMinutes === 15;
  const fallback = defaultMeetingTime(poll.kind, state.settings);

  const lastIso = days.filter((d) => !d.startsWith('dow:')).pop();
  const extraDays = poll.recurring
    ? WEEKDAYS.filter((d) => !poll.days.includes(d))
    : nextWorkdays(lastIso && lastIso > today ? lastIso : today, 5);

  function confirmAt(day: string, start: string) {
    const meeting: Meeting = {
      id: uid(),
      pollId: poll.id,
      kind: poll.kind,
      title: poll.title,
      day,
      start,
      duration: poll.duration,
      attendeeIds: poll.inviteeIds,
      recurring: poll.recurring,
    };
    const hour = Math.floor(toMin(start) / 60);
    set((d) => {
      const p = d.polls.find((x) => x.id === poll.id);
      if (!p) return;
      p.status = 'confirmed';
      p.chosenSlot = slotKey(day, start);
      // Nhịp cố định: giờ mới thay cho giờ cũ cùng loại.
      if (p.recurring) d.meetings = d.meetings.filter((m) => !(m.recurring && m.kind === p.kind));
      d.meetings.push(meeting);
      if (p.kind === 'daily') d.settings.checkinHour = hour;
      if (p.kind === 'review_retro') d.settings.reviewHour = hour;
    });
  }

  function update(fn: (p: MeetingPoll) => void) {
    set((d) => {
      const p = d.polls.find((x) => x.id === poll.id);
      if (p) fn(p);
    });
  }

  function reopen() {
    update((p) => {
      p.days = sortDays([...p.days, ...extraDays]);
      p.round = (p.round ?? 0) + 1;
      p.deadline = defaultDeadline(today);
      p.status = 'collecting';
    });
  }

  const names = (ids: string[]) => ids.map((id) => memberName(state, id)).join(', ');

  function candidateLine(c: Candidate): string {
    if (c.everyone) return total === 1 ? 'Bạn rảnh giờ này' : `Cả ${total} người đều rảnh`;
    return `${c.freeIds.length}/${total} người rảnh — thiếu: ${names(c.missingIds)}`;
  }

  const sel = selected ? parseSlot(selected) : null;
  const selFree = selected ? (freeMap.get(selected) ?? []) : [];
  const selBusy = poll.inviteeIds.filter((id) => answered.includes(id) && !selFree.includes(id));
  const selPending = poll.inviteeIds.filter((id) => !answered.includes(id));

  return (
    <div className="stack">
      <button className="btn btn-ghost btn-sm mt-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden />
        Tất cả buổi họp
      </button>

      <div className="page-head">
        <div>
          <h1>{poll.title}</h1>
          <div className="row-wrap" style={{ marginTop: 6 }}>
            <span className={`tag ${STATUS_TAG[st]}`}>{STATUS_LABEL[st]}</span>
            <span className="tag mono">
              <Clock size={12} aria-hidden /> {poll.duration} phút
            </span>
            <span className="tag">{kindDef(poll.kind).cadence}</span>
            {st !== 'confirmed' && st !== 'cancelled' && <span className="small muted">Hạn trả lời: {fmtDay(poll.deadline)}</span>}
          </div>
        </div>
        {isInvitee && st !== 'confirmed' && st !== 'cancelled' && (
          <button className={`btn ${answered.includes(user.id) ? 'btn-ghost' : 'btn-primary'}`} onClick={onAnswer}>
            <Pencil size={18} aria-hidden />
            {answered.includes(user.id) ? 'Sửa giờ rảnh của tôi' : 'Chọn giờ rảnh'}
          </button>
        )}
      </div>

      <section className="card card-tight stack-sm" aria-label="Ai đã trả lời">
        <span className="label">
          {answered.length}/{total} người đã trả lời
        </span>
        <div className="mt-people">
          {poll.inviteeIds.map((id) => (
            <span key={id} className={`mt-person${answered.includes(id) ? '' : ' pending'}`}>
              <Avatar state={state} memberId={id} small />
              {memberName(state, id)}
              {poll.requiredIds.includes(id) && <Star size={14} className="star" fill="currentColor" aria-label="Người cần có mặt" />}
              {!answered.includes(id) && <span className="muted">(chưa trả lời)</span>}
            </span>
          ))}
        </div>
        <span className="small muted">
          <Star size={12} className="star" fill="currentColor" aria-hidden /> Người cần có mặt
        </span>
      </section>

      {st === 'confirmed' && poll.chosenSlot && (
        <section className="card card-float stack-sm enter" style={{ borderTop: '6px solid var(--grass)' }}>
          <span className="eyebrow" style={{ color: '#2e6b32' }}>
            <CalendarCheck size={16} aria-hidden /> Đã chốt giờ họp
          </span>
          <h2>{slotLabel(poll, poll.chosenSlot)}</h2>
          <p className="small muted">
            {poll.recurring
              ? 'Đây là giờ cố định của đội từ nay. Lịch nhắc đổi theo giờ này.'
              : 'Buổi họp hiện trong danh sách "Buổi họp sắp tới" của cả đội.'}
          </p>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
            Xong
          </button>
        </section>
      )}

      {st === 'cancelled' && <p className="muted">Lần tìm giờ này đã bị hủy.</p>}

      {st === 'expired' && (
        <section className="notice">
          <TriangleAlert size={18} aria-hidden />
          <div className="stack-sm grow">
            <strong>Đã hết hạn mà chưa ai trả lời</strong>
            <span>App không tự chốt giờ khi chưa có câu trả lời nào.</span>
            {canDecide && (
              <div className="row-wrap">
                {fallback && (
                  <button className="btn btn-primary btn-sm" onClick={() => confirmAt(fallback.day, fallback.start)}>
                    Dùng giờ mặc định ({slotLabel(poll, slotKey(fallback.day, fallback.start))})
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => update((p) => void (p.deadline = defaultDeadline(today)))}>
                  Chờ thêm 1 ngày
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {(st === 'collecting' || st === 'proposed') && (
        <section className="stack-sm" aria-labelledby="mt-best-title">
          <h2 id="mt-best-title" className="mt-section-title">
            {st === 'collecting' ? 'Giờ đẹp nhất tạm thời' : hasEveryone ? 'Giờ đẹp nhất' : 'Giờ thiếu ít người nhất'}
          </h2>
          {st === 'collecting' && (
            <p className="small muted">
              Còn chờ {total - answered.length} người trả lời. Kết quả có thể đổi; chốt được khi đủ người trả lời hoặc hết hạn.
            </p>
          )}
          {best.length === 0 ? (
            <p className="muted">
              {answered.length === 0 ? 'Chưa ai trả lời.' : 'Không có khung giờ nào đủ dài mà có người rảnh trong các ngày đã hỏi.'}
            </p>
          ) : (
            best.map((c, i) => (
              <div key={c.slot} className={`card card-tight mt-best enter${i === 0 ? ' first' : ''}`} style={{ ['--i' as string]: i }}>
                <span className="mt-rank">{i + 1}</span>
                <div className="grow">
                  <div className="mt-slot">{slotLabel(poll, c.slot)}</div>
                  <div className="small muted">{candidateLine(c)}</div>
                  {!c.allRequired && (
                    <span className="tag tag-warn" style={{ marginTop: 4 }}>
                      Thiếu người cần có mặt: {names(c.missingRequiredIds)}
                    </span>
                  )}
                </div>
                {st === 'proposed' && canDecide && (
                  <button className={`btn ${i === 0 ? 'btn-primary' : 'btn-ghost btn-sm'}`} onClick={() => confirmAt(c.day, c.time)}>
                    <Check size={18} aria-hidden />
                    Chốt giờ này
                  </button>
                )}
              </div>
            ))
          )}
          {st === 'proposed' && canDecide && !hasEveryone && extraDays.length > 0 && (
            <div className="row-wrap">
              <span className="small muted">Không có giờ nào đủ mọi người.</span>
              <button className="btn btn-ghost btn-sm" onClick={reopen}>
                <CalendarPlus size={16} aria-hidden />
                Hỏi thêm ngày khác
              </button>
            </div>
          )}
        </section>
      )}

      {st !== 'cancelled' && answered.length > 0 && (
        <section className="card stack-sm" aria-labelledby="mt-heat-title">
          <div className="row-wrap">
            <h2 id="mt-heat-title" className="mt-section-title grow">
              Lưới giờ rảnh của cả đội
            </h2>
            <span className="mt-legend">
              <i style={{ background: 'var(--surface-2)' }} /> 0
              <i style={{ background: 'rgba(68,138,255,0.9)' }} /> {total} người rảnh
            </span>
          </div>
          <p className="small muted">Màu càng đậm càng nhiều người rảnh. Chạm vào một ô để xem ai rảnh, ai bận.</p>
          <div className="mt-heat-wrap">
            <div
              className={`mt-heat${dense ? ' dense' : ''}`}
              style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(44px, 1fr))` }}
            >
              <span />
              {days.map((d) => (
                <span key={d} className="mt-head">
                  {shortDayLabel(d)}
                </span>
              ))}
              {times.map((t) => (
                <HeatRow key={t} time={t} days={days} total={total} freeMap={freeMap} selected={selected} onSelect={setSelected} />
              ))}
            </div>
          </div>
          {sel && (
            <div className="card card-tight stack-sm" role="status">
              <strong>
                {dayLabel(sel.day)} · {sel.time}
              </strong>
              <p className="small">
                <span className="muted">Rảnh: </span>
                {selFree.length > 0 ? names(selFree) : 'không ai'}
              </p>
              {selBusy.length > 0 && (
                <p className="small">
                  <span className="muted">Bận: </span>
                  {names(selBusy)}
                </p>
              )}
              {selPending.length > 0 && (
                <p className="small">
                  <span className="muted">Chưa trả lời: </span>
                  {names(selPending)}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {canDecide && st !== 'confirmed' && st !== 'cancelled' && (
        <button className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCancelling(true)}>
          <CalendarX size={16} aria-hidden />
          Hủy lần tìm giờ này
        </button>
      )}

      {cancelling && (
        <Modal title="Hủy lần tìm giờ này?" onClose={() => setCancelling(false)}>
          <p>Mọi người sẽ không còn được hỏi giờ rảnh cho "{poll.title}". Các câu trả lời đã gửi sẽ không dùng nữa.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setCancelling(false)}>
              Giữ lại
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                update((p) => void (p.status = 'cancelled'));
                setCancelling(false);
                onBack();
              }}
            >
              Hủy lần tìm giờ
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function HeatRow({
  time,
  days,
  total,
  freeMap,
  selected,
  onSelect,
}: {
  time: string;
  days: string[];
  total: number;
  freeMap: Map<string, string[]>;
  selected: string | null;
  onSelect: (slot: string) => void;
}) {
  return (
    <>
      <span className="mt-htime">{time}</span>
      {days.map((d) => {
        const key = slotKey(d, time);
        const n = freeMap.get(key)?.length ?? 0;
        const ratio = total > 0 ? n / total : 0;
        return (
          <button
            key={key}
            className={`${ratio > 0.6 ? 'dark' : ''}${selected === key ? ' sel' : ''}`}
            style={n > 0 ? { background: `rgba(68,138,255,${(0.15 + 0.75 * ratio).toFixed(2)})` } : undefined}
            aria-label={`${dayLabel(d)} ${time}: ${n}/${total} người rảnh`}
            aria-pressed={selected === key}
            onClick={() => onSelect(key)}
          >
            {n > 0 ? n : ''}
          </button>
        );
      })}
    </>
  );
}
