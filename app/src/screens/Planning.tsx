import { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Star, TriangleAlert, X } from 'lucide-react';
import { backlog, capacity, lastClosedSprint, todayISO, uid, useStore, workers } from '../store';
import type { Sprint } from '../types';
import { fmtDay, sprintRange } from '../lib/dates';
import { Avatar, Tip, Wizard } from '../components/ui';

const MINUTES = [2, 10, 20, 15, 2];

/** Wizard lên kế hoạch tuần: Xem lại → Vì sao → Làm gì → Làm thế nào → Xác nhận. */
export function Planning({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { state, set } = useStore();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  // Bắt đầu từ những việc nhóm trưởng đã kéo vào "Cần làm tuần này" (màn hình Task tuần này).
  const [selected, setSelected] = useState<string[]>(() =>
    state.weekDraft.filter((id) => backlog(state).some((i) => i.id === id)),
  );
  const [forGoal, setForGoal] = useState<string[]>([]);
  const [assign, setAssign] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      backlog(state)
        .filter((i) => state.weekDraft.includes(i.id) && i.assigneeId)
        .map((i) => [i.id, i.assigneeId]),
    ),
  );

  const pool = backlog(state);
  const available = pool.filter((i) => !selected.includes(i.id));
  const chosen = selected.map((id) => pool.find((i) => i.id === id)).filter((i) => i !== undefined);
  const cap = capacity(state);
  const over = chosen.length > cap.value;
  const last = lastClosedSprint(state);
  const improvement = last ? state.improvements.find((i) => i.id === last.improvementId) : undefined;
  const carried = pool.filter((i) => i.carried);
  const range = sprintRange(todayISO(state));

  function pick(id: string) {
    setSelected([...selected, id]);
    const item = pool.find((i) => i.id === id);
    if (item?.assigneeId) setAssign((a) => ({ ...a, [id]: item.assigneeId }));
  }

  function unpick(id: string) {
    setSelected(selected.filter((s) => s !== id));
    setForGoal(forGoal.filter((s) => s !== id));
  }

  function startWeek() {
    const sprint: Sprint = {
      id: uid(),
      number: state.sprints.length + 1,
      start: range.start,
      end: range.end,
      goal: goal.trim(),
      state: 'active',
      goalResult: null,
      plannedCount: selected.length,
      doneCount: 0,
      doneTitles: [],
      improvementId: null,
      retroSkipped: false,
      refinedAt: null,
    };
    set((d) => {
      d.sprints.push(sprint);
      d.weekDraft = [];
      for (const it of d.items) {
        if (!selected.includes(it.id)) continue;
        it.sprintId = sprint.id;
        it.status = 'todo';
        it.assigneeId = assign[it.id] ?? null;
        it.forSprintGoal = forGoal.includes(it.id);
        it.carried = false;
        it.stuck = false;
        it.urgentAdd = false;
      }
      // Giữ đúng thứ tự đã chọn trong tuần.
      const inSprint = selected.map((id) => d.items.find((i) => i.id === id)!).filter(Boolean);
      d.items = [...d.items.filter((i) => !selected.includes(i.id)), ...inSprint];
    });
    onDone();
  }

  const canNext = step === 0 || (step === 1 && goal.trim() !== '') || (step === 2 && selected.length > 0) || step >= 3;

  return (
    <Wizard
      name="Lên kế hoạch tuần"
      step={step}
      total={5}
      minutes={MINUTES[step]}
      wide={step === 2}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ArrowLeft size={18} aria-hidden />
            {step === 0 ? 'Để sau' : 'Quay lại'}
          </button>
          {step < 4 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Tiếp tục
              <ArrowRight size={18} aria-hidden />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startWeek}>
              Bắt đầu tuần
              <ArrowRight size={18} aria-hidden />
            </button>
          )}
        </>
      }
    >
      {step === 0 && (
        <>
          <span className="eyebrow">Xem lại nhanh</span>
          <h1>Trước khi bắt đầu tuần mới</h1>
          {!last ? (
            <p className="prose">
              Đây là tuần đầu tiên của đội nên chưa có gì để xem lại. Ba bước tiếp theo: chọn một mục tiêu, chọn việc,
              rồi phân việc.
            </p>
          ) : (
            <>
              <div className="card stack-sm">
                <h3>Điều đội đã chọn để làm tốt hơn</h3>
                <p>{improvement ? improvement.text : 'Tuần trước đội chưa chọn cải tiến nào.'}</p>
              </div>
              <div className="card stack-sm">
                <h3>Việc dở dang từ tuần trước</h3>
                {carried.length === 0 ? (
                  <p className="muted">Không có việc nào dở dang.</p>
                ) : (
                  carried.map((i) => <p key={i.id}>{i.title}</p>)
                )}
              </div>
            </>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <span className="eyebrow">Vì sao</span>
          <h1>Nếu cuối tuần chỉ đạt được một điều, đó là gì?</h1>
          <Tip id="sprint-goal">Mục tiêu tuần là một câu cho cả đội biết vì sao tuần này quan trọng.</Tip>
          <div className="field">
            <label htmlFor="sg">Mục tiêu tuần</label>
            <input
              id="sg"
              className="input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ví dụ: Có đủ ảnh và mô tả để mở bán bộ sưu tập mới"
              autoFocus
            />
          </div>
          {state.settings.bigGoal && (
            <p className="small">
              <span className="muted">Mục tiêu lớn của doanh nghiệp: </span>
              <strong>{state.settings.bigGoal}</strong>
            </p>
          )}
          {pool.length > 0 && (
            <div className="stack-sm">
              <span className="label">Gợi ý từ các việc đầu Kho việc</span>
              <div className="chips">
                {pool.slice(0, 3).map((i) => (
                  <button key={i.id} className="chip" onClick={() => setGoal(`Hoàn thành: ${i.title}`)}>
                    {i.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <span className="eyebrow">Làm gì</span>
          <h1>Chọn việc cho tuần này</h1>
          <div className="card card-tight stack-sm">
            <div className="row-wrap">
              <strong>
                Đã chọn <span className="mono">{chosen.length}</span> việc
              </strong>
              <span className="small muted right">
                {cap.fromHistory
                  ? `Các tuần trước đội xong trung bình ${cap.value} việc`
                  : `Gợi ý cho tuần đầu: khoảng ${cap.value} việc`}
              </span>
            </div>
            <div className={`meter${over ? ' over' : ''}`} aria-hidden>
              <span style={{ transform: `scaleX(${Math.min(chosen.length / cap.value, 1)})` }} />
            </div>
            {over && (
              <p className="row small" style={{ color: 'var(--lava-ink)', fontWeight: 600 }}>
                <TriangleAlert size={16} aria-hidden />
                {cap.fromHistory
                  ? `Các tuần trước đội xong ${cap.value} việc, bạn đang chọn ${chosen.length}. Thử bớt đi?`
                  : `Bạn đang chọn ${chosen.length} việc, nhiều hơn mức gợi ý ${cap.value}. Thử bớt đi?`}
              </p>
            )}
          </div>

          <div className="two-col">
            <section className="stack-sm" aria-labelledby="pool-title">
              <h3 id="pool-title">Kho việc (quan trọng nhất ở trên)</h3>
              {available.length === 0 && <p className="muted small">Đã chọn hết việc trong Kho.</p>}
              {available.map((i) => (
                <div key={i.id} className="list-item">
                  <span className="title grow">{i.title}</span>
                  {i.carried && <span className="tag tag-warn">Dở dang</span>}
                  {!i.clear && <span className="tag">Chưa rõ</span>}
                  <button className="btn btn-ghost btn-sm" onClick={() => pick(i.id)}>
                    <Plus size={16} aria-hidden />
                    Chọn
                  </button>
                </div>
              ))}
            </section>

            <section className="stack-sm" aria-labelledby="week-title">
              <h3 id="week-title">Việc của tuần</h3>
              {chosen.length === 0 && (
                <p className="muted small">Bấm "Chọn" ở các việc bên cạnh. Bắt đầu từ việc giúp đạt mục tiêu tuần.</p>
              )}
              {chosen.map((i) => {
                const starred = forGoal.includes(i.id);
                return (
                  <div key={i.id} className="list-item">
                    <button
                      className="btn-icon"
                      aria-pressed={starred}
                      aria-label={starred ? 'Bỏ đánh dấu phục vụ mục tiêu tuần' : 'Đánh dấu phục vụ mục tiêu tuần'}
                      title="Việc này trực tiếp phục vụ mục tiêu tuần"
                      onClick={() => setForGoal(starred ? forGoal.filter((s) => s !== i.id) : [...forGoal, i.id])}
                    >
                      <Star size={18} className={starred ? 'star' : ''} fill={starred ? 'currentColor' : 'none'} />
                    </button>
                    <span className="title grow">{i.title}</span>
                    <button className="btn-icon" aria-label={`Bỏ "${i.title}" khỏi tuần`} onClick={() => unpick(i.id)}>
                      <X size={18} />
                    </button>
                  </div>
                );
              })}
              {chosen.length > 0 && (
                <p className="small muted">Bấm ngôi sao ở việc nào trực tiếp phục vụ mục tiêu tuần.</p>
              )}
            </section>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <span className="eyebrow">Làm thế nào</span>
          <h1>Ai nhận việc nào?</h1>
          <p className="prose">Tốt nhất là mỗi người tự nhận việc của mình. Việc chưa ai nhận vẫn được đưa vào tuần và nhận sau trên bảng.</p>
          {chosen.map((i) => (
            <div key={i.id} className="card card-tight stack-sm">
              <div className="row">
                <Avatar state={state} memberId={assign[i.id] ?? null} small />
                <strong className="grow">{i.title}</strong>
              </div>
              <div className="chips">
                {workers(state).map((m) => {
                  const on = assign[i.id] === m.id;
                  return (
                    <button
                      key={m.id}
                      className={`chip${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => setAssign({ ...assign, [i.id]: on ? null : m.id })}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 4 && (
        <>
          <span className="eyebrow">Xác nhận</span>
          <h1>Sẵn sàng bắt đầu tuần</h1>
          <div className="card stack">
            <div>
              <span className="label">Thời gian</span>
              <p>
                <strong>
                  {fmtDay(range.start)} tới {fmtDay(range.end)}
                </strong>
              </p>
            </div>
            <div>
              <span className="label">Mục tiêu tuần</span>
              <p>
                <strong>{goal}</strong>
              </p>
            </div>
            <div className="stack-sm">
              <span className="label">{chosen.length} việc của tuần</span>
              {chosen.map((i) => (
                <div key={i.id} className="row">
                  <Avatar state={state} memberId={assign[i.id] ?? null} small />
                  <span className="grow">{i.title}</span>
                  {forGoal.includes(i.id) && <Star className="star" size={16} fill="currentColor" aria-label="Phục vụ mục tiêu tuần" />}
                </div>
              ))}
            </div>
          </div>
          {over && (
            <div className="notice">
              <TriangleAlert size={18} aria-hidden />
              <span>Số việc đang nhiều hơn sức làm của đội. Bạn vẫn có thể bắt đầu, nhưng nên quay lại bớt việc.</span>
            </div>
          )}
        </>
      )}
    </Wizard>
  );
}
