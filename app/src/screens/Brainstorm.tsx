import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  FastForward,
  Pencil,
  RotateCcw,
  Sparkles,
  StickyNote,
  TriangleAlert,
} from 'lucide-react';
import '../brainstorm.css';
import type { Tab } from '../App';
import { canEdit, todayISO, uid, useStore, workers } from '../store';
import { addDays } from '../lib/dates';
import { Avatar, Choice, Modal, Tip } from '../components/ui';
import { EmptyBlocks } from '../components/Voxel';
import { Term, roleLabel, useBrainstorm } from '../brainstorm/common';
import { aiCommon, aiSmart, fallbackNote, useAi } from '../brainstorm/ai';
import {
  SMART_LABEL,
  SMART_QUESTION,
  commonAndUnique,
  computeDeadlines,
  detectType,
  nextQuestions,
  parseGoalDate,
  rewriteGoal,
  scoreSmart,
  smartPoints,
  type SmartRow,
} from '../brainstorm/logic';
import type { BrainstormSession, SmartKey, SmartState } from '../brainstorm/types';
import { PlanStep } from '../brainstorm/PlanStep';
import { NotesDrawer } from '../brainstorm/Notes';
import { StakeholderStep } from '../brainstorm/Stakeholders';
import { Summary } from '../brainstorm/Summary';

/** Các bước theo lối vào (D-010). `step` là số bước lưu trong phiên; số hiển thị đánh lại từ 1. */
const STEPS_GOAL = [
  { step: 1, label: 'Goal' },
  { step: 2, label: 'SMART (tuỳ chọn)' },
  { step: 3, label: 'Milestone & WBS' },
  { step: 4, label: 'Stakeholder (tuỳ chọn)' },
  { step: 5, label: 'Tổng kết' },
];
const STEPS_PROMPT = [
  { step: 3, label: 'WBS & Task brief' },
  { step: 4, label: 'Stakeholder (tuỳ chọn)' },
  { step: 5, label: 'Tổng kết' },
];

const PROMPT_MAX = 2000;

/**
 * Brainstorm dự án trong buổi họp. Nguồn: brainstorming.md + flow 2026-11-15 (D-010):
 * Option 1 Goal + SMART (tuỳ chọn) hoặc Option 2 Prompt → Task brief → Milestone & WBS → Stakeholder (tuỳ chọn).
 */
export function Brainstorm({ go }: { go: (t: Tab) => void }) {
  const { state } = useStore();
  if (!state.brainstorm) return <Start />;
  return <Session go={go} />;
}

function ReadOnlyBanner() {
  return (
    <div className="bs-readonly" role="status">
      <Eye size={18} aria-hidden />
      Bạn đang ở chế độ chỉ xem: thấy được mọi thứ nhưng không sửa được.
    </div>
  );
}

/* ---------- Bắt đầu ---------- */

function Start() {
  const { state, set } = useStore();
  const readOnly = !canEdit(state);
  const people = workers(state);
  const today = todayISO(state);
  const [name, setName] = useState('');
  const [entry, setEntry] = useState<'goal' | 'prompt' | null>(null);
  const [mode, setMode] = useState<'A' | 'B' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [date, setDate] = useState('');
  const [size, setSize] = useState(people.length);
  const [deputy, setDeputy] = useState<string | null>(null);
  const others = people.filter((m) => m.role !== 'owner');

  const ready =
    entry === 'goal' ? mode !== null : entry === 'prompt' ? prompt.trim() !== '' && date > today && size > 0 : false;

  function begin() {
    if (!ready || !entry) return;
    const text = prompt.trim();
    const viaPrompt = entry === 'prompt';
    const session: BrainstormSession = {
      id: uid(),
      name: name.trim() || 'Dự án mới',
      // Option 2 bỏ bước Goal và SMART, đi thẳng tới Milestone & WBS.
      step: viaPrompt ? 3 : 1,
      mode: viaPrompt ? null : mode,
      entry,
      prompt: viaPrompt ? text : '',
      smartSkipped: false,
      deputyId: deputy,
      entries: [],
      revealed: false,
      uniquePoints: [],
      baseGoal: viaPrompt ? text : '',
      goal: viaPrompt ? text : '',
      teamSize: viaPrompt ? size : people.length,
      answers: {},
      feasibleOk: false,
      goalDate: viaPrompt ? date : null,
      projectType: viaPrompt ? detectType(text) : 'generic',
      milestones: [],
      tasks: [],
      notes: [],
      stakeholders: [],
      common: [],
      proposed: '',
      smart: null,
      stakeholderHints: null,
      aiUsed: { common: false, smart: false, plan: false },
      locked: false,
      exported: false,
    };
    set((d) => void (d.brainstorm = session));
  }

  if (readOnly) {
    return (
      <div className="bs bs-narrow">
        <ReadOnlyBanner />
        <div className="card stack-sm">
          <h2>Nhóm chưa mở buổi brainstorm nào</h2>
          <p className="muted">Khi nhóm trưởng bắt đầu, Goal, Milestone và WBS sẽ hiện ở đây để bạn theo dõi.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bs bs-narrow">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow stack-sm">
          <span className="eyebrow">Brainstorm · dùng trong buổi họp</span>
          <h1>Biến một ý tưởng thành kế hoạch ngay trong buổi họp</h1>
          <p className="prose">
            Một người mở app và chia sẻ màn hình, cả nhóm cùng trả lời. App gợi ý <Term k="Milestone" />,{' '}
            <Term k="WBS" /> và <Term k="Task brief" /> cho từng task, tự tính <Term k="Deadline" />; nhóm trưởng là
            người chốt.
          </p>
        </div>
        <div style={{ width: 96, flex: 'none' }}>
          <EmptyBlocks />
        </div>
      </div>

      <div className="field">
        <label htmlFor="bs-name">Tên dự án</label>
        <input
          id="bs-name"
          className="input big-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Giải bóng rổ khoa"
        />
      </div>

      <div className="stack-sm">
        <span className="label">Nhóm muốn bắt đầu từ đâu?</span>
        <Choice on={entry === 'goal'} onClick={() => setEntry('goal')}>
          <strong>Option 1: Goal + SMART</strong>
          <div className="small muted">
            Nhóm tự viết <strong>Goal</strong>, app hỏi lại cho rõ rồi mới gợi ý kế hoạch. Phần chấm SMART bỏ qua được.
          </div>
        </Choice>
        {entry === 'goal' && (
          <div className="bs-sub enter">
            <span className="label">Chốt goal theo cách nào?</span>
            <Choice on={mode === 'A'} onClick={() => setMode('A')}>
              <strong>Cách A: mỗi người viết goal riêng</strong>
              <div className="small muted">
                Hợp khi nhóm chưa thống nhất. App tìm điểm chung và điểm riêng. Khoảng 10–15 phút.
              </div>
            </Choice>
            <Choice on={mode === 'B'} onClick={() => setMode('B')}>
              <strong>Cách B: một người nhập goal cho cả nhóm</strong>
              <div className="small muted">Hợp khi nhóm đã biết rõ muốn làm gì. Khoảng 3–5 phút.</div>
            </Choice>
          </div>
        )}

        <Choice on={entry === 'prompt'} onClick={() => setEntry('prompt')}>
          <strong>Option 2: Prompt → Task brief</strong>
          <div className="small muted">
            Nhóm trưởng gõ một đoạn mô tả việc cần làm. App soạn ngay Milestone, WBS và Task brief nháp cho từng task.
          </div>
        </Choice>
        {entry === 'prompt' && (
          <div className="bs-sub enter">
            <div className="field">
              <label htmlFor="bs-prompt">Mô tả việc cần làm</label>
              <textarea
                id="bs-prompt"
                className="textarea"
                style={{ minHeight: 132 }}
                maxLength={PROMPT_MAX}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ví dụ: Tổ chức hội chợ sách cũ một ngày ở sân trường, có khu đổi sách miễn phí, gây quỹ cho thư viện. Cần xin phép trường, gom sách, truyền thông và chia ca trực."
              />
              <span className="small muted">
                Viết càng cụ thể (làm gì, cho ai, cần những gì) thì Task brief càng sát. Sau đó vẫn sửa được từng thẻ.
              </span>
            </div>
            <div className="row-wrap" style={{ alignItems: 'flex-start' }}>
              <div className="field">
                <label htmlFor="bs-date">Ngày giao kết quả</label>
                <input
                  id="bs-date"
                  type="date"
                  className="input"
                  min={addDays(today, 1)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="bs-size">Nhóm có mấy người?</label>
                <input
                  id="bs-size"
                  type="number"
                  min={1}
                  max={99}
                  className="input"
                  style={{ maxWidth: 120 }}
                  value={size || ''}
                  onChange={(e) => setSize(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                />
              </div>
            </div>
            <span className="small muted">App cần ngày giao kết quả để tính ngược Deadline cho từng task.</span>
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div className="stack-sm">
          <span className="label">Nhóm phó (không bắt buộc): được sửa và chốt như nhóm trưởng</span>
          <div className="chips">
            {others.map((m) => (
              <button
                key={m.id}
                className={`chip${deputy === m.id ? ' on' : ''}`}
                aria-pressed={deputy === m.id}
                onClick={() => setDeputy(deputy === m.id ? null : m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-lg" style={{ alignSelf: 'flex-start' }} disabled={!ready} onClick={begin}>
        {entry === 'prompt' ? 'Soạn WBS và Task brief' : 'Bắt đầu buổi brainstorm'}
        <ArrowRight size={20} aria-hidden />
      </button>
    </div>
  );
}

/* ---------- Khung phiên ---------- */

function Session({ go }: { go: (t: Tab) => void }) {
  const { state, s, user, readOnly, update } = useBrainstorm();
  const [notesOpen, setNotesOpen] = useState(false);
  // Observer không đổi được bước của cả nhóm, nên xem bước nào thì chỉ đổi trên máy mình.
  const [view, setView] = useState<number | null>(null);
  const ai = useAi();
  const steps = s.entry === 'prompt' ? STEPS_PROMPT : STEPS_GOAL;
  const reached = s.locked
    ? 5
    : s.milestones.length > 0 || s.entry === 'prompt' || (s.smartSkipped && s.goalDate)
      ? 3
      : s.baseGoal
        ? 2
        : 1;
  const step = readOnly && view !== null && view <= reached ? view : s.step;
  const fresh = s.notes.filter((n) => n.status === 'new').length;

  // Sang bước khác (kể cả khi nhóm trưởng chuyển bước cho cả nhóm) → bắt đầu từ đầu trang.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  return (
    <div className="bs">
      {readOnly && <ReadOnlyBanner />}
      <div className="bs-head">
        <div className="grow" style={{ minWidth: 180 }}>
          <span className="label">Brainstorm · {roleLabel(state, s, user.id)}</span>
          <h2>{s.name}</h2>
        </div>
        <ol className="bs-steps" aria-label="Các bước">
          {steps.map((st, i) => (
            <li key={st.step}>
              <button
                className={step === st.step ? 'on' : ''}
                aria-current={step === st.step ? 'step' : undefined}
                disabled={st.step > reached}
                onClick={() => (readOnly ? setView(st.step) : update((b) => void (b.step = st.step)))}
              >
                <span className="no">{i + 1}</span>
                {st.label}
              </button>
            </li>
          ))}
        </ol>
        {ai &&
          (ai.enabled ? (
            <span className="tag tag-ok" title={`Gợi ý do ${ai.model} tạo ra, nhóm vẫn là người quyết định.`}>
              <Sparkles size={14} aria-hidden />
              AI đang bật
            </span>
          ) : ai.leadOnly ? (
            <span className="tag" title="Trên bản dùng chung, chỉ nhóm trưởng gọi được AI. Gợi ý AI nhóm trưởng đã lấy vẫn hiện cho cả nhóm.">
              AI: chỉ nhóm trưởng dùng
            </span>
          ) : (
            <span className="tag" title="Máy chủ chưa có khoá API. Xem app/.env.example.">
              Chưa nối AI: gợi ý theo mẫu
            </span>
          ))}
        <button className="btn btn-ghost" onClick={() => setNotesOpen(true)}>
          <StickyNote size={18} aria-hidden />
          Ghi chú
          {fresh > 0 && <span className="tag tag-warn mono">{fresh}</span>}
        </button>
      </div>

      <div key={step} className="enter">
        {step === 1 && <GoalStep />}
        {step === 2 && <SmartStep />}
        {step === 3 && <PlanStep />}
        {step === 4 && <StakeholderStep />}
        {step === 5 && <Summary go={go} />}
      </div>

      {notesOpen && <NotesDrawer onClose={() => setNotesOpen(false)} />}
    </div>
  );
}

/* ---------- Bước 1 — Chốt goal chung ---------- */

function GoalStep() {
  const { state, s, people, readOnly, update, today } = useBrainstorm();
  const [text, setText] = useState(s.baseGoal);
  const [writer, setWriter] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const ai = useAi();
  const [busy, setBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  /** Tìm điểm chung / điểm riêng: AI nếu có, không thì so từ khoá. */
  async function reveal() {
    setBusy(true);
    setAiNote(null);
    const rules = commonAndUnique(s.entries);
    let common = rules.common;
    let proposed = rules.proposed;
    let unique = rules.unique;
    let used = false;
    if (ai?.enabled) {
      try {
        // Gửi mã p1, p2… thay cho tên thành viên.
        const ids = s.entries.map((_, i) => `p${i + 1}`);
        const r = await aiCommon(s.entries.map((e, i) => ({ id: ids[i], text: e.text })));
        common = r.common_points.map((c) => c.trim()).filter(Boolean).slice(0, 6);
        unique = r.unique_points.flatMap((u) => {
          const idx = ids.indexOf(u.person_id);
          return idx < 0 || !u.text.trim() ? [] : [{ memberId: s.entries[idx].memberId, text: u.text.trim() }];
        });
        proposed = r.proposed_goal.trim() || rules.proposed;
        used = true;
      } catch (err) {
        setAiNote(fallbackNote(err));
      }
    }
    const points = unique.map((u) => ({ ...u, id: uid(), decision: null }));
    update((b) => {
      b.revealed = true;
      b.uniquePoints = points;
      b.common = common;
      b.proposed = proposed;
      b.aiUsed.common = used;
    });
    setBusy(false);
  }

  /** `skipSmart`: nhóm chọn bỏ qua phần hỏi và chấm SMART (D-010). */
  function commit(goalText: string, later: { memberId: string; text: string }[] = [], skipSmart = false) {
    const base = goalText.trim();
    if (!base) return;
    const noteIds = later.map(() => uid());
    update((b) => {
      b.baseGoal = base;
      b.goalDate = parseGoalDate(base, today) ?? b.goalDate;
      b.projectType = detectType(base);
      b.answers = {};
      b.feasibleOk = false;
      b.smart = null;
      b.aiUsed.smart = false;
      if (b.teamSize <= 0) b.teamSize = people.length;
      b.smartSkipped = skipSmart;
      b.goal = rewriteGoal(b, today);
      // Điểm riêng "Để sau" không bị mất: vào khu ghi chú.
      later.forEach((p, i) => {
        // Quay lại bước 1 rồi chốt lại thì không ghi trùng.
        if (b.notes.some((n) => n.authorId === p.memberId && n.text === p.text)) return;
        b.notes.push({ id: noteIds[i], authorId: p.memberId, kind: 'idea', text: p.text, status: 'later', taskId: null });
      });
      // Bỏ qua SMART mà đã đủ ngày giao kết quả và số người thì đi thẳng tới Milestone & WBS;
      // còn thiếu thì bước 2 chỉ hỏi đúng hai thứ đó.
      b.step = skipSmart && b.goalDate && b.teamSize > 0 ? 3 : 2;
    });
  }

  if (readOnly && (s.mode === 'B' || !s.revealed)) {
    return (
      <div className="stack bs-narrow">
        <h1>Goal của nhóm</h1>
        {s.baseGoal ? (
          <section className="card goal-box">
            <p className="goal-text">{s.baseGoal}</p>
          </section>
        ) : s.mode === 'A' ? (
          <p className="prose">
            Nhóm đang viết goal riêng: đã nộp <span className="mono">{s.entries.length}/{people.length}</span>. Goal của
            từng người hiện ra khi cả nhóm nộp xong.
          </p>
        ) : (
          <p className="prose">Nhóm đang viết goal.</p>
        )}
      </div>
    );
  }

  if (s.mode === 'B') {
    return (
      <div className="stack bs-narrow">
        <h1>Nhóm muốn làm gì?</h1>
        <p className="prose">
          Người cầm máy gõ goal mà cả nhóm đồng ý. Còn sơ sài cũng không sao, bước sau app sẽ hỏi cho rõ.
        </p>
        <div className="field">
          <label htmlFor="goal-b">Goal của nhóm</label>
          <textarea
            id="goal-b"
            className="textarea big-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ví dụ: Ngày 28/12 tổ chức giải bóng rổ"
            autoFocus
          />
        </div>
        <div className="row-wrap">
          <button className="btn btn-primary btn-lg" disabled={!text.trim()} onClick={() => commit(text)}>
            Tiếp: app hỏi lại theo SMART
            <ArrowRight size={20} aria-hidden />
          </button>
          <button className="btn btn-ghost" disabled={!text.trim()} onClick={() => commit(text, [], true)}>
            <FastForward size={18} aria-hidden />
            Bỏ qua SMART
          </button>
        </div>
      </div>
    );
  }

  // Cách A
  const submitted = s.entries.length;
  const total = people.length;

  if (!s.revealed) {
    const writerMember = people.find((m) => m.id === writer);
    return (
      <div className="stack bs-narrow">
        <h1>
          Mỗi người viết goal của mình <span className="mono muted">· Đã nộp {submitted}/{total}</span>
        </h1>
        <p className="prose">
          Viết riêng trước để không ai bị cuốn theo người nói to nhất, và nhóm thấy ngay mình có đang hiểu giống nhau
          không.
        </p>
        <Tip id="bs-one-device">
          Bản này chạy trên một máy nên chưa có mã QR: chuyền máy cho từng người. Goal đã nộp được ẩn cho tới khi cả
          nhóm nộp xong.
        </Tip>
        <div className="stack-sm">
          {people.map((m) => {
            const done = s.entries.some((e) => e.memberId === m.id);
            return (
              <div key={m.id} className="list-item">
                <Avatar state={state} memberId={m.id} />
                <div className="grow">
                  <div className="title">{m.name}</div>
                  <div className="small muted">{roleLabel(state, s, m.id)}</div>
                </div>
                {done ? (
                  <span className="tag tag-ok">
                    <EyeOff size={14} aria-hidden />
                    Đã nộp
                  </span>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setWriter(m.id);
                      setDraft('');
                    }}
                  >
                    <Pencil size={14} aria-hidden />
                    Nhập goal
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="row-wrap">
          <button
            className="btn btn-primary btn-lg"
            disabled={submitted < 2 || busy || ai === null}
            onClick={() => void reveal()}
          >
            {busy ? 'App đang đọc các goal…' : 'Xem điểm chung và điểm riêng'}
            <ArrowRight size={20} aria-hidden />
          </button>
          {submitted < total && submitted >= 2 && <span className="small muted">Còn {total - submitted} người chưa nộp. Vẫn xem được.</span>}
          {submitted < 2 && <span className="small muted">Cần ít nhất 2 người nộp.</span>}
        </div>

        {writerMember && (
          <Modal title={`Goal của ${writerMember.name}`} onClose={() => setWriter(null)}>
            <p className="small muted">Viết 1–2 câu. Chưa ai thấy goal này cho tới khi cả nhóm nộp xong.</p>
            <textarea
              className="textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Theo bạn, nhóm mình nên đạt được điều gì?"
              aria-label="Goal riêng"
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                disabled={!draft.trim()}
                onClick={() => {
                  const entry = { memberId: writerMember.id, text: draft.trim() };
                  update((b) => {
                    b.entries = [...b.entries.filter((e) => e.memberId !== entry.memberId), entry];
                  });
                  setWriter(null);
                }}
              >
                <Check size={18} aria-hidden />
                Nộp và ẩn đi
              </button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return <Reveal onUse={commit} note={aiNote} />;
}

function Reveal({
  onUse,
  note,
}: {
  onUse: (goal: string, later: { memberId: string; text: string }[], skipSmart?: boolean) => void;
  note: string | null;
}) {
  const { state, s, readOnly, update } = useBrainstorm();
  const [proposed, setProposed] = useState(s.proposed);

  function decide(id: string, decision: 'add' | 'later' | 'drop') {
    update((b) => {
      const p = b.uniquePoints.find((x) => x.id === id);
      if (p) p.decision = decision;
    });
  }

  function use(skipSmart = false) {
    const adds = s.uniquePoints.filter((p) => p.decision === 'add').map((p) => p.text);
    let goal = proposed.trim().replace(/[.]+$/, '');
    for (const a of adds) if (!goal.toLowerCase().includes(a.toLowerCase())) goal += `, ${a}`;
    onUse(
      goal,
      s.uniquePoints.filter((p) => p.decision === 'later').map((p) => ({ memberId: p.memberId, text: p.text })),
      skipSmart,
    );
  }

  return (
    <div className="stack">
      <h1>Nhóm đang hiểu giống và khác nhau ở đâu?</h1>
      {note && (
        <div className="notice" role="status">
          <TriangleAlert size={18} aria-hidden />
          <span>{note}</span>
        </div>
      )}
      <div className="two-col">
        <section className="stack-sm">
          <h3>Goal của từng người</h3>
          {s.entries.map((e) => (
            <div key={e.memberId} className="list-item" style={{ alignItems: 'flex-start' }}>
              <Avatar state={state} memberId={e.memberId} small />
              <span className="grow">{e.text}</span>
            </div>
          ))}
        </section>
        <section className="stack">
          <div className="card card-tight stack-sm">
            <h3 className="row" style={{ gap: 6 }}>
              <CircleCheck size={18} aria-hidden style={{ color: '#2e6b32' }} />
              Điểm chung
            </h3>
            {s.common.length === 0 ? (
              <p className="small muted">App chưa thấy điều gì nhiều người cùng nhắc. Đáng để nhóm nói chuyện thêm.</p>
            ) : (
              <div className="row-wrap">
                {s.common.map((c) => (
                  <span key={c} className="tag tag-ok">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="card card-tight stack-sm">
            <h3 className="row" style={{ gap: 6 }}>
              <TriangleAlert size={18} aria-hidden style={{ color: 'var(--lava-ink)' }} />
              Điểm riêng
            </h3>
            {s.uniquePoints.length === 0 && <p className="small muted">Không có ý nào chỉ một người nhắc.</p>}
            {s.uniquePoints.map((p) => (
              <div key={p.id} className="stack-sm" style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span>
                  "{p.text}" <em className="muted small">— {state.members.find((m) => m.id === p.memberId)?.name}</em>
                </span>
                <div className="chips">
                  {(
                    [
                      ['add', 'Thêm vào goal'],
                      ['later', 'Để sau'],
                      ['drop', 'Bỏ'],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} className={`chip${p.decision === k ? ' on' : ''}`} aria-pressed={p.decision === k} disabled={readOnly} onClick={() => decide(p.id, k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="field">
        <label htmlFor="goal-proposed">Goal chung app đề xuất (nhóm sửa lại cho đúng ý)</label>
        <textarea
          id="goal-proposed"
          className="textarea big-input"
          style={{ minHeight: 88 }}
          readOnly={readOnly}
          value={proposed}
          onChange={(e) => setProposed(e.target.value)}
        />
        <span className="small muted">
          {s.aiUsed.common
            ? 'AI đã đọc các goal và đề xuất câu này. Hãy đọc to và chỉnh lại cho đúng ý nhóm.'
            : 'App so từ khoá giữa các goal, chưa hiểu nghĩa như người. Hãy đọc to và chỉnh lại.'}
        </span>
      </div>
      {!readOnly && (
        <div className="row-wrap">
          <button className="btn btn-primary btn-lg" disabled={!proposed.trim()} onClick={() => use()}>
            Dùng goal này
            <ArrowRight size={20} aria-hidden />
          </button>
          <button className="btn btn-ghost" disabled={!proposed.trim()} onClick={() => use(true)}>
            <FastForward size={18} aria-hidden />
            Dùng goal này và bỏ qua SMART
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Bước 2 — App hỏi lại & tự chấm SMART ---------- */

const STATE_ICON: Record<SmartState, typeof Check> = { ok: CircleCheck, unclear: TriangleAlert, missing: CircleX };
const STATE_LABEL: Record<SmartState, string> = { ok: 'Đạt', unclear: 'Chưa rõ', missing: 'Thiếu' };
const KEYS: SmartKey[] = ['S', 'M', 'A', 'R', 'T'];

/** Bước 2 là tuỳ chọn (D-010): nhóm bỏ qua thì app chỉ hỏi ngày giao kết quả và số người. */
function SmartStep() {
  const { s } = useBrainstorm();
  return s.smartSkipped ? <SmartSkipped /> : <SmartFull />;
}

function SmartSkipped() {
  const { s, readOnly, people, update, today } = useBrainstorm();
  const [date, setDate] = useState(s.goalDate ?? '');
  const [size, setSize] = useState(s.teamSize > 0 ? s.teamSize : people.length);
  const valid = date > today && size > 0;

  function next() {
    if (!valid) return;
    update((b) => {
      // Goal chưa bị sửa tay và chưa do AI viết thì ghép lại theo ngày và số người mới.
      const untouched = !b.aiUsed.smart && b.goal === rewriteGoal(b, today);
      const dateChanged = b.goalDate !== date;
      b.goalDate = date;
      b.teamSize = size;
      if (untouched) b.goal = rewriteGoal(b, today);
      if (dateChanged && b.milestones.length > 0) computeDeadlines(b.milestones, b.tasks, today, date);
      b.step = 3;
    });
  }

  return (
    <div className="stack bs-narrow">
      <section className="card card-float goal-box stack-sm">
        <span className="label">
          <Term k="Goal" /> · nhóm chốt ở bước 1
        </span>
        <p className="goal-text">{s.goal || s.baseGoal}</p>
      </section>

      <section className="card stack">
        <div className="stack-sm">
          <h2>Nhóm đã bỏ qua phần chấm SMART</h2>
          <p className="muted">
            App không hỏi lại và không chấm goal. Để tính ngược <strong>Deadline</strong>, app chỉ cần ngày giao kết quả
            và số người.
          </p>
        </div>
        <div className="row-wrap" style={{ alignItems: 'flex-start' }}>
          <div className="field">
            <label htmlFor="skip-date">Ngày giao kết quả</label>
            <input
              id="skip-date"
              type="date"
              className="input"
              disabled={readOnly}
              min={addDays(today, 1)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="skip-size">Nhóm có mấy người?</label>
            <input
              id="skip-size"
              type="number"
              min={1}
              max={99}
              className="input"
              style={{ maxWidth: 120 }}
              disabled={readOnly}
              value={size || ''}
              onChange={(e) => setSize(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            />
          </div>
        </div>
      </section>

      {!readOnly && (
        <div className="row-wrap">
          <button className="btn btn-primary btn-lg" disabled={!valid} onClick={next}>
            Tiếp: Milestone & WBS
            <ArrowRight size={20} aria-hidden />
          </button>
          <button className="btn btn-ghost" onClick={() => update((b) => void (b.smartSkipped = false))}>
            <RotateCcw size={18} aria-hidden />
            Chấm SMART
          </button>
        </div>
      )}
    </div>
  );
}

function SmartFull() {
  const { s, user, readOnly, update, today } = useBrainstorm();
  const ai = useAi();
  const aiMode = Boolean(ai?.enabled);
  const [drafts, setDrafts] = useState<Partial<Record<SmartKey, string>>>({});
  const [editing, setEditing] = useState(false);
  const [grading, setGrading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const started = useRef(false);

  /** Nhờ AI chấm lại với đúng dữ liệu vừa có (truyền vào để không phụ thuộc lần render). */
  async function grade(snap: { answers: BrainstormSession['answers']; teamSize: number; goalDate: string | null }) {
    setGrading(true);
    setNote(null);
    try {
      const r = await aiSmart({
        baseGoal: s.baseGoal,
        answers: { S: snap.answers.S, M: snap.answers.M, A: snap.answers.A, R: snap.answers.R },
        teamSize: snap.teamSize,
        goalDate: snap.goalDate,
        today,
      });
      const seen = new Set<string>();
      const questions = r.questions
        .filter((q) => q.question.trim() && !seen.has(q.key) && seen.add(q.key))
        .slice(0, 3)
        .map((q) => ({ key: q.key as SmartKey, text: q.question.trim() }));
      update((b) => {
        b.smart = { rows: r.rows, questions, warn: r.feasibility_warning?.trim() || null };
        if (r.rewritten_goal.trim()) b.goal = r.rewritten_goal.trim();
        if (!b.goalDate && r.goal_date && /^\d{4}-\d{2}-\d{2}$/.test(r.goal_date) && r.goal_date > today) {
          b.goalDate = r.goal_date;
        }
        b.projectType = r.project_type;
        b.aiUsed.smart = true;
      });
    } catch (err) {
      // AI lỗi → quay về luật có sẵn, nhóm vẫn đi tiếp được.
      setNote(fallbackNote(err));
      update((b) => {
        // Goal AI đã viết ở lần chấm trước thì giữ nguyên; chưa có thì ghép bằng luật.
        if (!b.aiUsed.smart) b.goal = rewriteGoal(b, today);
        b.smart = null;
        b.aiUsed.smart = false;
      });
    } finally {
      setGrading(false);
    }
  }

  // Vào bước 2 lần đầu với AI bật: chấm ngay.
  useEffect(() => {
    // Observer chỉ xem: không gọi AI chấm (kết quả cũng không lưu được).
    if (readOnly || !aiMode || s.smart || started.current) return;
    started.current = true;
    void grade({ answers: s.answers, teamSize: s.teamSize, goalDate: s.goalDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode]);

  const ruleScore = scoreSmart(s, today);
  // Người không phải nhóm trưởng (bản trên mạng) vẫn thấy kết quả AI nhóm trưởng đã chấm.
  const viewOnlyAi = Boolean(ai?.leadOnly) && s.smart !== null;
  const usingAi = (aiMode || viewOnlyAi) && s.smart !== null;
  let score: Record<SmartKey, SmartRow> = ruleScore;
  if (usingAi && s.smart) {
    const rows = s.smart.rows;
    const A: SmartRow =
      s.teamSize <= 0
        ? { state: 'missing', hint: 'Nhóm có mấy người?' }
        : rows.A.state !== 'ok' && s.feasibleOk && s.smart.warn
          ? { state: 'ok', hint: 'Nhóm xác nhận vẫn làm được' }
          : rows.A;
    // Chữ T do app tự kiểm tra: chỉ đạt khi đã có ngày cụ thể.
    score = { S: rows.S, M: rows.M, A, R: rows.R, T: ruleScore.T };
  }
  const points = smartPoints(score);

  let questions: { key: SmartKey; text: string }[];
  if (usingAi && s.smart) {
    questions = s.smart.questions.filter((q) => score[q.key].state !== 'ok').slice(0, s.goalDate ? 3 : 2);
    if (!s.goalDate) questions.push({ key: 'T', text: SMART_QUESTION.T });
  } else {
    questions = nextQuestions(ruleScore, s).map((k) => ({ key: k, text: SMART_QUESTION[k] }));
  }
  const answered = questions.some((q) => (drafts[q.key] ?? '').trim() !== '');
  const feasWarn = usingAi
    ? s.smart?.warn && !s.feasibleOk
      ? s.smart.warn
      : null
    : ruleScore.A.state === 'unclear' && s.answers.A && s.teamSize > 0
      ? ruleScore.A.hint
      : null;

  function regrade() {
    const answers = { ...s.answers };
    let goalDate = s.goalDate;
    for (const q of questions) {
      const v = (drafts[q.key] ?? '').trim();
      if (!v) continue;
      if (q.key === 'T') goalDate = v;
      // AI có thể hỏi tiếp cùng một chữ: giữ câu trả lời cũ, nối thêm câu mới.
      else answers[q.key] = (aiMode || viewOnlyAi) && answers[q.key] ? `${answers[q.key]}. ${v}` : v;
    }
    update((b) => {
      b.answers = answers;
      b.goalDate = goalDate;
      // Goal do AI viết thì giữ nguyên tới khi nhóm trưởng chấm lại; không ghi đè bằng luật.
      if (!aiMode && !viewOnlyAi) b.goal = rewriteGoal(b, today);
    });
    if (viewOnlyAi) setNote('Đã lưu câu trả lời. Nhóm trưởng bấm "Chấm lại" để AI chấm với câu trả lời mới.');
    setDrafts({});
    if (aiMode) void grade({ answers, teamSize: s.teamSize, goalDate });
  }

  return (
    <div className="stack">
      <section className="card card-float goal-box stack-sm">
        <div className="row">
          <span className="label grow">
            <Term k="Goal" /> · {s.aiUsed.smart ? 'AI viết lại sau mỗi lần chấm' : 'app viết lại sau mỗi lần chấm'}
          </span>
          {!readOnly && (
            <button className="btn btn-ghost btn-sm" disabled={grading} onClick={() => setEditing((e) => !e)}>
              <Pencil size={14} aria-hidden />
              {editing ? 'Xong' : 'Sửa'}
            </button>
          )}
        </div>
        {editing ? (
          <textarea
            className="textarea big-input"
            style={{ minHeight: 96 }}
            value={s.goal}
            onChange={(e) => update((b) => void (b.goal = e.target.value))}
            aria-label="Sửa goal"
          />
        ) : (
          <p className="goal-text">{s.goal}</p>
        )}
      </section>

      {note && (
        <div className="notice" role="status">
          <TriangleAlert size={18} aria-hidden />
          <span>{note}</span>
        </div>
      )}

      <div className="two-col">
        <section className="card stack-sm" aria-label="Bảng chấm SMART" aria-busy={grading}>
          <div className="row">
            <h2 className="grow">Chấm SMART</h2>
            {!grading && <span className="smart-score mono">{points}/5</span>}
          </div>
          <span className="small muted">{usingAi ? 'AI chấm theo nội dung goal và câu trả lời.' : 'Chấm theo luật có sẵn (tìm con số, ngày, từ khoá).'}</span>
          {grading ? (
            <div className="stack-sm" role="status" aria-label="App đang chấm goal">
              {KEYS.map((k) => (
                <span key={k} className="skeleton tall" />
              ))}
            </div>
          ) : (
            <div className="smart">
              {KEYS.map((k) => {
                const row = score[k];
                const Icon = STATE_ICON[row.state];
                return (
                  <div key={k} className={`smart-row ${row.state}`}>
                    <span className="smart-letter">{k}</span>
                    <Icon className="state" size={22} aria-label={STATE_LABEL[row.state]} />
                    <span>
                      <strong>{SMART_LABEL[k].vi}</strong>
                      <span className="small muted"> · {SMART_LABEL[k].name}</span>
                      <span className="small hint">{row.hint}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card stack" aria-label="Câu hỏi của app">
          <div className="field">
            <label htmlFor="team-size">Nhóm có mấy người?</label>
            <input
              id="team-size"
              type="number"
              min={1}
              max={99}
              className="input"
              style={{ maxWidth: 120 }}
              disabled={grading || readOnly}
              value={s.teamSize || ''}
              onChange={(e) =>
                update((b) => {
                  b.teamSize = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                  if (!aiMode) b.goal = rewriteGoal(b, today);
                })
              }
            />
          </div>

          {grading ? (
            <div className="stack-sm" role="status">
              <span className="label">App đang đọc goal và nghĩ câu hỏi…</span>
              <span className="skeleton w80" />
              <span className="skeleton tall" />
              <span className="skeleton w60" />
              <span className="skeleton tall" />
            </div>
          ) : questions.length === 0 ? (
            points === 5 ? (
              <p>
                <strong>Goal đã đủ 5 điều.</strong> Sang bước tiếp theo để app gợi ý milestone.
              </p>
            ) : (
              <p>App không còn câu hỏi nào. Nhóm có thể sửa goal ở trên rồi chấm lại, hoặc đi tiếp.</p>
            )
          ) : readOnly ? (
            <>
              <span className="label">App đang hỏi nhóm</span>
              {questions.map((q) => (
                <p key={q.key}>
                  <span className="mono">{q.key}</span> · {q.text}
                </p>
              ))}
            </>
          ) : (
            <>
              <span className="label">App hỏi lại (mỗi lần tối đa 3 câu)</span>
              {questions.map((q, i) => (
                <div key={q.key} className="field">
                  <label htmlFor={`q-${q.key}`}>
                    <span className="mono">{q.key}</span> · {q.text}
                  </label>
                  {q.key === 'T' ? (
                    <input
                      id={`q-${q.key}`}
                      type="date"
                      className="input"
                      min={addDays(today, 1)}
                      value={drafts.T ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, T: e.target.value })}
                    />
                  ) : (
                    <input
                      id={`q-${q.key}`}
                      className="input"
                      value={drafts[q.key] ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [q.key]: e.target.value })}
                      autoFocus={i === 0}
                    />
                  )}
                </div>
              ))}
            </>
          )}

          {!grading && feasWarn && (
            <div className="notice">
              <TriangleAlert size={18} aria-hidden />
              <span className="grow">{feasWarn}</span>
              {!readOnly && (
                <button className="btn btn-ghost btn-sm" onClick={() => update((b) => void (b.feasibleOk = true))}>
                  Nhóm vẫn làm được
                </button>
              )}
            </div>
          )}

          {s.teamSize > 8 && (
            <p className="small muted">
              Nhóm hơn 8 người thường nên chia team con. Chế độ dự án lớn chưa có trong bản này: việc vẫn giao cho từng
              người.
            </p>
          )}
        </section>
      </div>

      {!readOnly && (
      <div className="row-wrap">
        {questions.length > 0 ? (
          <button className="btn btn-primary btn-lg" disabled={!answered || grading} onClick={regrade}>
            {grading ? 'App đang chấm…' : viewOnlyAi ? 'Lưu câu trả lời' : 'Trả lời và chấm lại'}
            <ArrowRight size={20} aria-hidden />
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" disabled={grading} onClick={() => update((b) => void (b.step = 3))}>
            Tiếp: Milestone & WBS
            <ArrowRight size={20} aria-hidden />
          </button>
        )}
        {questions.length > 0 && (
          <button className="btn btn-ghost" disabled={grading} onClick={() => update((b) => void (b.step = 3))}>
            Đủ rồi, sang bước 3
          </button>
        )}
        {aiMode && (
          <button
            className="btn btn-ghost"
            disabled={grading}
            onClick={() => void grade({ answers: s.answers, teamSize: s.teamSize, goalDate: s.goalDate })}
          >
            <RotateCcw size={18} aria-hidden />
            Chấm lại
          </button>
        )}
        <button
          className="btn btn-ghost"
          disabled={grading}
          onClick={() =>
            update((b) => {
              b.smartSkipped = true;
              // Đã có ngày và số người thì đi luôn; thiếu thì màn "bỏ qua" hỏi đúng hai thứ đó.
              if (b.goalDate && b.teamSize > 0) b.step = 3;
            })
          }
        >
          <FastForward size={18} aria-hidden />
          Bỏ qua SMART
        </button>
        <span className="small muted">Đang cầm máy: {user.name}. App gợi ý, nhóm quyết định.</span>
      </div>
      )}
    </div>
  );
}
