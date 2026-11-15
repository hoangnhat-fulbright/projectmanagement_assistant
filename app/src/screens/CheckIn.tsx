import { useState } from 'react';
import { Check, Flag } from 'lucide-react';
import { currentSprint, me, sprintItems, todayISO, uid, useStore } from '../store';
import { Choice, Wizard } from '../components/ui';

/** Check-in hằng ngày — chế độ A (trên app): 3 câu hỏi, mục tiêu dưới 1 phút. */
export function CheckInFlow({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const sprint = currentSprint(state);
  const today = todayISO(state);

  const mine = sprint ? sprintItems(state, sprint.id).filter((i) => i.assigneeId === user.id && i.status !== 'done') : [];
  const [itemId, setItemId] = useState<string | null>(mine.find((i) => i.status === 'doing')?.id ?? mine[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [stuck, setStuck] = useState(false);
  const [stuckNote, setStuckNote] = useState('');
  const [helperId, setHelperId] = useState<string | null>(null);

  if (!sprint) return null;
  const sprintId = sprint.id;
  const others = state.members.filter((m) => m.id !== user.id && m.role !== 'observer');

  function submit() {
    const checkinId = uid();
    const impId = uid();
    set((d) => {
      d.checkins = d.checkins.filter((c) => !(c.memberId === user.id && c.date === today));
      d.checkins.push({ id: checkinId, sprintId, memberId: user.id, date: today, itemId, note: note.trim(), stuck });
      const item = d.items.find((i) => i.id === itemId);
      if (item && item.status === 'todo') item.status = 'doing';
      if (stuck) {
        d.impediments.push({
          id: impId,
          sprintId,
          memberId: user.id,
          itemId,
          note: stuckNote.trim(),
          helperId,
          openedAt: today,
          resolvedAt: null,
        });
        if (item) item.stuck = true;
      }
    });
    onClose();
  }

  return (
    <Wizard
      name="Check-in hôm nay"
      step={0}
      total={1}
      minutes={1}
      onClose={onClose}
      footer={
        <>
          <span className="small muted">Mục tiêu: xong trong 1 phút.</span>
          <button className="btn btn-primary" disabled={stuck && stuckNote.trim() === ''} onClick={submit}>
            <Check size={18} aria-hidden />
            Gửi check-in
          </button>
        </>
      }
    >
      <p className="row small" style={{ gap: 6 }}>
        <Flag size={16} aria-hidden />
        <span>
          <span className="muted">Mục tiêu tuần: </span>
          <strong>{sprint.goal}</strong>
        </span>
      </p>

      <section className="stack-sm">
        <h2>1. Hôm nay bạn làm việc gì?</h2>
        {mine.length === 0 ? (
          <p className="muted small">Bạn chưa nhận việc nào. Cứ gửi check-in, rồi nhận việc trên bảng.</p>
        ) : (
          mine.map((i) => (
            <Choice key={i.id} on={itemId === i.id} onClick={() => setItemId(i.id)}>
              <strong>{i.title}</strong>
            </Choice>
          ))
        )}
      </section>

      <section className="field">
        <label htmlFor="ci-note">
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>2. Có gì giúp đội tới gần mục tiêu tuần không?</span>
        </label>
        <input
          id="ci-note"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Không bắt buộc, một dòng là đủ"
        />
      </section>

      <section className="stack-sm">
        <h2>3. Bạn có bị kẹt không?</h2>
        <div className="chips">
          <button className={`chip${!stuck ? ' on' : ''}`} aria-pressed={!stuck} onClick={() => setStuck(false)}>
            Không, mọi thứ ổn
          </button>
          <button className={`chip${stuck ? ' on' : ''}`} aria-pressed={stuck} onClick={() => setStuck(true)}>
            Có, tôi cần giúp
          </button>
        </div>
        {stuck && (
          <div className="stack-sm enter">
            <div className="field">
              <label htmlFor="ci-stuck">Bạn kẹt ở đâu?</label>
              <input
                id="ci-stuck"
                className="input"
                value={stuckNote}
                onChange={(e) => setStuckNote(e.target.value)}
                placeholder="Ví dụ: chưa có ảnh sản phẩm từ nhà cung cấp"
                autoFocus
              />
            </div>
            {others.length > 0 && (
              <div className="stack-sm">
                <span className="label">Ai có thể giúp?</span>
                <div className="chips">
                  {others.map((m) => (
                    <button
                      key={m.id}
                      className={`chip${helperId === m.id ? ' on' : ''}`}
                      aria-pressed={helperId === m.id}
                      onClick={() => setHelperId(helperId === m.id ? null : m.id)}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </Wizard>
  );
}
