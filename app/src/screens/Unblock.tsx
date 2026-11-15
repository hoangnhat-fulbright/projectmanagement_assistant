import { Check } from 'lucide-react';
import { currentSprint, memberName, openImpediments, todayISO, useStore } from '../store';
import { Avatar, Modal } from '../components/ui';
import { fmtDay } from '../lib/dates';

/** Gỡ vướng: danh sách người đang bị kẹt, Chủ đánh dấu khi đã gỡ xong. */
export function UnblockModal({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const sprint = currentSprint(state);
  const list = sprint ? openImpediments(state, sprint.id) : [];
  const today = todayISO(state);

  function resolve(id: string) {
    set((d) => {
      const imp = d.impediments.find((i) => i.id === id);
      if (!imp) return;
      imp.resolvedAt = today;
      const stillStuck = d.impediments.some((i) => i.itemId === imp.itemId && !i.resolvedAt);
      const item = d.items.find((i) => i.id === imp.itemId);
      if (item && !stillStuck) item.stuck = false;
    });
  }

  return (
    <Modal title="Gỡ vướng" onClose={onClose}>
      {list.length === 0 ? (
        <>
          <p>Không còn ai bị kẹt. Đội có thể tiếp tục.</p>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>
              Xong
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">
            Nói chuyện trực tiếp với người bị kẹt, rồi đánh dấu khi đã gỡ xong. Đây là việc quan trọng nhất của bạn lúc này.
          </p>
          {list.map((imp) => {
            const item = state.items.find((i) => i.id === imp.itemId);
            return (
              <div key={imp.id} className="card card-tight stack-sm">
                <div className="row">
                  <Avatar state={state} memberId={imp.memberId} />
                  <div className="grow">
                    <strong>{memberName(state, imp.memberId)}</strong>
                    <div className="small muted">Bị kẹt từ {fmtDay(imp.openedAt)}</div>
                  </div>
                </div>
                {item && (
                  <p className="small">
                    <span className="muted">Việc: </span>
                    {item.title}
                  </p>
                )}
                {imp.note && <p>{imp.note}</p>}
                {imp.helperId && (
                  <p className="small">
                    <span className="muted">Người có thể giúp: </span>
                    {memberName(state, imp.helperId)}
                  </p>
                )}
                <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => resolve(imp.id)}>
                  <Check size={16} aria-hidden />
                  Đã gỡ xong
                </button>
              </div>
            );
          })}
        </>
      )}
    </Modal>
  );
}
