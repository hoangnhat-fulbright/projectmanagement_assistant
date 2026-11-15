import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, ThumbsUp } from 'lucide-react';
import { currentSprint, memberName, newItem, sprintItems, todayISO, uid, useStore } from '../store';
import type { GoalResult, RetroKind, Sprint } from '../types';
import { Avatar, Choice, Tip, Wizard } from '../components/ui';
import { ProgressIsland } from '../components/Voxel';

const RESULTS: { id: GoalResult; label: string; hint: string }[] = [
  { id: 'yes', label: 'Có, đã đạt', hint: 'Đội đã làm được điều quan trọng nhất của tuần.' },
  { id: 'partial', label: 'Đạt một phần', hint: 'Có tiến triển nhưng chưa trọn vẹn.' },
  { id: 'no', label: 'Chưa đạt', hint: 'Không sao. Buổi rút kinh nghiệm sẽ giúp tìm ra lý do.' },
];

const RESULT_LABEL: Record<GoalResult, string> = { yes: 'Đạt', partial: 'Đạt một phần', no: 'Chưa đạt' };

const KINDS: { id: RetroKind; label: string; placeholder: string }[] = [
  { id: 'good', label: 'Điều gì làm tốt?', placeholder: 'Ví dụ: check-in đều mỗi sáng' },
  { id: 'hard', label: 'Điều gì gây khó?', placeholder: 'Ví dụ: nhận ảnh từ nhà cung cấp trễ' },
  { id: 'try', label: 'Lần sau thử gì?', placeholder: 'Ví dụ: chốt ảnh trước Thứ Ba' },
];

const REVIEW_MIN = [5, 10, 5, 10];
const RETRO_MIN = [15, 10, 5];

/** Xem kết quả (4 bước) rồi Rút kinh nghiệm (3 bước), chạy liền nhau. */
export function ReviewRetro({ onClose, onPlan }: { onClose: () => void; onPlan: () => void }) {
  const { state, set } = useStore();
  const open = currentSprint(state);
  const [sprintId] = useState(open?.id ?? '');
  const sprint = state.sprints.find((s) => s.id === sprintId);

  const [step, setStep] = useState(0);
  const [result, setResult] = useState<GoalResult | null>(null);
  const [drop, setDrop] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<RetroKind, string>>({ good: '', hard: '', try: '' });
  const [pickedEntry, setPickedEntry] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  // Mở buổi xem kết quả → chuyển trạng thái tuần sang "Chờ xem kết quả".
  useEffect(() => {
    if (sprint?.state === 'active') {
      set((d) => {
        const s = d.sprints.find((x) => x.id === sprintId);
        if (s && s.state === 'active') s.state = 'review';
      });
    }
  }, [sprint?.state, sprintId, set]);

  if (!sprint) return null;

  if (sprint.state === 'closed') return <Closed sprint={sprint} onClose={onClose} onPlan={onPlan} />;

  const items = sprintItems(state, sprint.id);
  const doneItems = items.filter((i) => i.status === 'done');
  const unfinished = items.filter((i) => i.status !== 'done');
  const today = todayISO(state);

  /* ---------- Phần 1: Xem kết quả ---------- */
  if (sprint.state !== 'retro') {
    function finishReview() {
      set((d) => {
        const s = d.sprints.find((x) => x.id === sprintId);
        if (!s) return;
        const its = d.items.filter((i) => i.sprintId === s.id);
        const done = its.filter((i) => i.status === 'done');
        s.goalResult = result;
        s.doneCount = done.length;
        s.doneTitles = done.map((i) => i.title);
        const back = its.filter((i) => i.status !== 'done' && !drop.includes(i.id));
        for (const it of back) {
          it.sprintId = null;
          it.status = 'todo';
          it.carried = true;
          it.stuck = false;
          it.forSprintGoal = false;
        }
        const backIds = back.map((i) => i.id);
        // Việc bỏ thì xóa; việc quay về Kho được đặt lên đầu để tuần sau xem lại trước.
        const rest = d.items.filter((i) => !drop.includes(i.id) && !backIds.includes(i.id));
        d.items = [...back, ...rest];
        for (const imp of d.impediments) if (imp.sprintId === s.id && !imp.resolvedAt) imp.resolvedAt = today;
        s.state = 'retro';
      });
      setStep(0);
    }

    function addToBacklog() {
      const t = newTitle.trim();
      if (!t) return;
      const item = newItem(t);
      set((d) => void d.items.push(item));
      setAdded([...added, t]);
      setNewTitle('');
    }

    const canNext = step !== 0 || result !== null;

    return (
      <Wizard
        name="Xem kết quả tuần"
        step={step}
        total={4}
        minutes={REVIEW_MIN[step]}
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
              <ArrowLeft size={18} aria-hidden />
              {step === 0 ? 'Để sau' : 'Quay lại'}
            </button>
            <button className="btn btn-primary" disabled={!canNext} onClick={() => (step === 3 ? finishReview() : setStep(step + 1))}>
              {step === 3 ? 'Sang phần rút kinh nghiệm' : 'Tiếp tục'}
              <ArrowRight size={18} aria-hidden />
            </button>
          </>
        }
      >
        {step === 0 && (
          <>
            <span className="eyebrow">Tuần {sprint.number}</span>
            <h1>Mục tiêu tuần có đạt không?</h1>
            <div className="card card-tight">
              <span className="label">Mục tiêu tuần</span>
              <p>
                <strong>{sprint.goal}</strong>
              </p>
            </div>
            <div className="stack-sm">
              {RESULTS.map((r) => (
                <Choice key={r.id} on={result === r.id} onClick={() => setResult(r.id)}>
                  <strong>{r.label}</strong>
                  <div className="small muted">{r.hint}</div>
                </Choice>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <span className="eyebrow">Đã xong</span>
            <h1>
              Tuần này đội đã làm xong <span className="mono">{doneItems.length}</span> việc
            </h1>
            <p className="prose">Mời từng người giới thiệu ngắn việc mình đã xong.</p>
            {doneItems.length === 0 ? (
              <p className="muted">Chưa có việc nào ở cột Xong.</p>
            ) : (
              <div className="stack-sm">
                {doneItems.map((i, idx) => (
                  <div key={i.id} className="list-item enter" style={{ ['--i' as string]: Math.min(idx, 6) }}>
                    <Avatar state={state} memberId={i.assigneeId} small />
                    <div className="grow">
                      <div className="title">{i.title}</div>
                      <div className="small muted">{memberName(state, i.assigneeId)}</div>
                    </div>
                    <Check size={18} style={{ color: '#2e6b32' }} aria-hidden />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <span className="eyebrow">Chưa xong</span>
            <h1>
              Còn <span className="mono">{unfinished.length}</span> việc chưa xong
            </h1>
            <p className="prose">
              Tuần làm việc có độ dài cố định nên không kéo dài thêm. Việc chưa xong mặc định quay về Kho việc để tuần sau
              xem lại.
            </p>
            {unfinished.length === 0 ? (
              <p className="muted">Không còn việc nào dang dở.</p>
            ) : (
              <div className="stack-sm">
                {unfinished.map((i) => {
                  const dropped = drop.includes(i.id);
                  return (
                    <div key={i.id} className="card card-tight stack-sm">
                      <strong>{i.title}</strong>
                      <div className="chips">
                        <button
                          className={`chip${!dropped ? ' on' : ''}`}
                          aria-pressed={!dropped}
                          onClick={() => setDrop(drop.filter((d) => d !== i.id))}
                        >
                          Quay về Kho việc
                        </button>
                        <button
                          className={`chip${dropped ? ' on' : ''}`}
                          aria-pressed={dropped}
                          onClick={() => setDrop([...drop.filter((d) => d !== i.id), i.id])}
                        >
                          Bỏ, không làm nữa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <span className="eyebrow">Điều chỉnh</span>
            <h1>Sau tuần này, có việc nào cần thêm vào Kho việc không?</h1>
            <p className="prose">Ví dụ: ý kiến của khách, việc mới phát sinh. Thứ tự ưu tiên sắp lại sau ở Kho việc.</p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                addToBacklog();
              }}
            >
              <input
                className="input grow"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Thêm việc mới, nhấn Enter"
                aria-label="Thêm việc mới vào Kho việc"
              />
              <button className="btn btn-ghost" type="submit" disabled={!newTitle.trim()}>
                <Plus size={18} aria-hidden />
                Thêm
              </button>
            </form>
            {added.map((t, i) => (
              <div key={i} className="list-item">
                <span className="title grow">{t}</span>
                <span className="tag tag-ok">Đã thêm vào Kho</span>
              </div>
            ))}
          </>
        )}
      </Wizard>
    );
  }

  /* ---------- Phần 2: Rút kinh nghiệm ---------- */
  const entries = state.retro.filter((r) => r.sprintId === sprint.id);
  // Việc thêm khẩn cấp của tuần này: đã xong (còn gắn với tuần) hoặc vừa quay về Kho.
  const urgentAdds = state.items.filter((i) => i.urgentAdd && (i.sprintId === sprint.id || (i.sprintId === null && i.carried)));
  const tries = entries.filter((e) => e.kind === 'try').sort((a, b) => b.votes - a.votes);

  function addEntry(kind: RetroKind) {
    const text = drafts[kind].trim();
    if (!text) return;
    const id = uid();
    set((d) => void d.retro.push({ id, sprintId, kind, text, votes: 0 }));
    setDrafts({ ...drafts, [kind]: '' });
  }

  function close(skip: boolean) {
    const text = custom.trim() || entries.find((e) => e.id === pickedEntry)?.text || '';
    const impId = uid();
    set((d) => {
      const s = d.sprints.find((x) => x.id === sprintId);
      if (!s) return;
      if (!skip && text) {
        d.improvements.push({ id: impId, sprintId, text });
        s.improvementId = impId;
      } else {
        s.retroSkipped = true;
      }
      s.state = 'closed';
    });
  }

  const hasChoice = custom.trim() !== '' || pickedEntry !== null;

  return (
    <Wizard
      name="Rút kinh nghiệm"
      step={step}
      total={3}
      minutes={RETRO_MIN[step]}
      wide={step === 0}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ArrowLeft size={18} aria-hidden />
            {step === 0 ? 'Để sau' : 'Quay lại'}
          </button>
          <div className="row">
            {step === 2 && (
              <button className="link small" onClick={() => close(true)}>
                Bỏ qua lần này
              </button>
            )}
            {step < 2 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
                Tiếp tục
                <ArrowRight size={18} aria-hidden />
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!hasChoice} onClick={() => close(false)}>
                <Check size={18} aria-hidden />
                Chốt và đóng tuần
              </button>
            )}
          </div>
        </>
      }
    >
      {step === 0 && (
        <>
          <span className="eyebrow">Tuần {sprint.number}</span>
          <h1>Nhìn lại cách đội làm việc</h1>
          <Tip id="retro">
            Buổi này bàn về cách làm việc, không tìm người có lỗi. Các ý kiến ở đây không ghi tên ai.
          </Tip>
          {urgentAdds.length > 0 && (
            <div className="notice">
              <ArrowRight size={18} aria-hidden />
              <span>
                Tuần này có {urgentAdds.length} việc được thêm khẩn cấp giữa tuần: {urgentAdds.map((i) => i.title).join(', ')}.
                Đáng để bàn vì sao.
              </span>
            </div>
          )}
          <div className="three-col">
            {KINDS.map((k) => (
              <section key={k.id} className="card stack-sm" aria-label={k.label}>
                <h3>{k.label}</h3>
                {entries
                  .filter((e) => e.kind === k.id)
                  .map((e) => (
                    <p key={e.id} className="small" style={{ padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                      {e.text}
                    </p>
                  ))}
                <form
                  className="stack-sm"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    addEntry(k.id);
                  }}
                >
                  <input
                    className="input"
                    value={drafts[k.id]}
                    onChange={(ev) => setDrafts({ ...drafts, [k.id]: ev.target.value })}
                    placeholder={k.placeholder}
                    aria-label={k.label}
                  />
                  <button className="btn btn-ghost btn-sm" type="submit" disabled={!drafts[k.id].trim()}>
                    <Plus size={16} aria-hidden />
                    Thêm ý kiến
                  </button>
                </form>
              </section>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <span className="eyebrow">Bình chọn</span>
          <h1>Ý nào đáng để tâm nhất?</h1>
          <p className="prose">Mỗi người bấm vào những ý mình thấy quan trọng. Ý nhiều phiếu nhất sẽ nổi lên.</p>
          {entries.length === 0 ? (
            <p className="muted">Chưa có ý kiến nào. Quay lại bước trước để thêm, hoặc đi tiếp.</p>
          ) : (
            <div className="stack-sm">
              {[...entries]
                .sort((a, b) => b.votes - a.votes)
                .map((e) => (
                  <div key={e.id} className="list-item">
                    <span className="tag">{KINDS.find((k) => k.id === e.kind)!.label.replace('?', '')}</span>
                    <span className="grow">{e.text}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label={`Bình chọn cho "${e.text}"`}
                      onClick={() =>
                        set((d) => {
                          const r = d.retro.find((x) => x.id === e.id);
                          if (r) r.votes += 1;
                        })
                      }
                    >
                      <ThumbsUp size={16} aria-hidden />
                      <span className="mono">{e.votes}</span>
                    </button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <span className="eyebrow">Chọn một cải tiến</span>
          <h1>Tuần sau đội sẽ thử điều gì?</h1>
          <p className="prose">
            Chỉ chọn một điều thôi, để chắc chắn làm được. Điều này sẽ hiện lại khi lên kế hoạch tuần sau.
          </p>
          {tries.length > 0 && (
            <div className="stack-sm">
              {tries.map((e) => (
                <Choice
                  key={e.id}
                  on={pickedEntry === e.id && custom.trim() === ''}
                  onClick={() => {
                    setPickedEntry(e.id);
                    setCustom('');
                  }}
                >
                  <strong>{e.text}</strong>
                  <div className="small muted mono">{e.votes} phiếu</div>
                </Choice>
              ))}
            </div>
          )}
          <div className="field">
            <label htmlFor="imp">{tries.length > 0 ? 'Hoặc ghi một cải tiến khác' : 'Cải tiến cho tuần sau'}</label>
            <input
              id="imp"
              className="input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Ví dụ: chọn ít việc hơn 2 việc so với tuần này"
            />
          </div>
        </>
      )}
    </Wizard>
  );
}

function Closed({ sprint, onClose, onPlan }: { sprint: Sprint; onClose: () => void; onPlan: () => void }) {
  const { state } = useStore();
  const improvement = state.improvements.find((i) => i.id === sprint.improvementId);
  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="Báo cáo tuần">
      <div className="wizard-body">
        <div className="wizard-inner enter" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 'min(260px, 60vw)' }}>
            <ProgressIsland done={sprint.doneCount} total={Math.max(sprint.plannedCount, sprint.doneCount, 1)} />
          </div>
          <span className="eyebrow">Tuần {sprint.number} đã đóng</span>
          <h1>
            Đội đã xong <span className="mono">{sprint.doneCount}</span> việc
          </h1>
          <div className="card stack" style={{ width: '100%', textAlign: 'left' }}>
            <div>
              <span className="label">Mục tiêu tuần</span>
              <p>
                <strong>{sprint.goal}</strong>{' '}
                {sprint.goalResult && (
                  <span className={`tag ${sprint.goalResult === 'yes' ? 'tag-ok' : sprint.goalResult === 'no' ? 'tag-warn' : 'tag-blue'}`}>
                    {RESULT_LABEL[sprint.goalResult]}
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="label">Việc đã xong</span>
              {sprint.doneTitles.length === 0 ? (
                <p className="muted">Chưa có việc nào xong trong tuần này.</p>
              ) : (
                sprint.doneTitles.map((t, i) => <p key={i}>{t}</p>)
              )}
            </div>
            <div>
              <span className="label">Cải tiến cho tuần sau</span>
              <p>{improvement ? improvement.text : 'Đội đã bỏ qua bước chọn cải tiến lần này.'}</p>
            </div>
          </div>
          <div className="row-wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={onPlan}>
              Lên kế hoạch tuần mới
              <ArrowRight size={20} aria-hidden />
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
