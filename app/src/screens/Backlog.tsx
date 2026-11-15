import { useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { backlog, currentSprint, newItem, todayISO, useStore } from '../store';
import type { Item, Priority, Size } from '../types';
import { PRIORITIES, PRIORITY_SHORT } from '../components/task';
import { Choice, Modal, Tip, Wizard } from '../components/ui';

const SIZES: { id: Size; label: string }[] = [
  { id: 'S', label: 'Nhỏ (dưới 1 ngày)' },
  { id: 'M', label: 'Vừa (1–2 ngày)' },
  { id: 'L', label: 'Lớn (gần cả tuần)' },
];

/** Sửa một việc trong danh sách. `canPlan`: nhóm trưởng được đặt Deadline và thứ tự ưu tiên. */
export function EditModal({
  item,
  canDelete,
  canPlan,
  onClose,
}: {
  item: Item;
  canDelete: boolean;
  canPlan: boolean;
  onClose: () => void;
}) {
  const { set } = useStore();
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const [size, setSize] = useState<Size | null>(item.size);
  const [bigGoal, setBigGoal] = useState(item.bigGoal);
  const [deadline, setDeadline] = useState(item.deadline ?? '');
  const [priority, setPriority] = useState<Priority | null>(item.priority);

  function save() {
    set((d) => {
      const it = d.items.find((i) => i.id === item.id);
      if (!it) return;
      it.title = title.trim() || it.title;
      it.note = note.trim();
      it.size = size;
      it.bigGoal = bigGoal;
      if (canPlan) {
        it.deadline = deadline || null;
        it.priority = priority;
      }
      it.clear = it.note !== '';
    });
    onClose();
  }

  return (
    <Modal title="Sửa việc" onClose={onClose}>
      <div className="field">
        <label htmlFor="e-title">Tên việc</label>
        <input id="e-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="e-note">Xong thì trông thế nào?</label>
        <textarea
          id="e-note"
          className="textarea"
          style={{ minHeight: 80 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ghi một hai câu. Có câu trả lời này thì việc được tính là Đã rõ."
        />
      </div>
      <div className="stack-sm">
        <span className="label">Kích cỡ (không bắt buộc)</span>
        <div className="chips">
          {SIZES.map((s) => (
            <button
              key={s.id}
              className={`chip${size === s.id ? ' on' : ''}`}
              aria-pressed={size === s.id}
              onClick={() => setSize(size === s.id ? null : s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {canPlan && (
        <div className="two-col">
          <div className="field">
            <label htmlFor="e-deadline">Deadline</label>
            <input id="e-deadline" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="stack-sm">
            <span className="label">Thứ tự ưu tiên</span>
            <div className="chips">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  className={`chip${priority === p ? ' on' : ''}`}
                  aria-pressed={priority === p}
                  onClick={() => setPriority(priority === p ? null : p)}
                >
                  {PRIORITY_SHORT[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <label className="check-row">
        <input type="checkbox" checked={bigGoal} onChange={(e) => setBigGoal(e.target.checked)} />
        <span>Việc này phục vụ mục tiêu lớn</span>
      </label>
      <div className="modal-actions">
        {canDelete && (
          <button
            className="btn btn-danger"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              set((d) => void (d.items = d.items.filter((i) => i.id !== item.id)));
              onClose();
            }}
          >
            <Trash2 size={16} aria-hidden />
            Xóa việc
          </button>
        )}
        <button className="btn btn-primary" onClick={save}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Làm rõ việc (Refinement) có dẫn dắt: tối đa 5 việc đầu Kho chưa rõ, mỗi việc 3 câu hỏi. */
export function RefineFlow({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const [targets] = useState(() =>
    backlog(state)
      .filter((i) => !i.clear)
      .slice(0, 5)
      .map((i) => i.id),
  );
  const [step, setStep] = useState(0);
  const [note, setNote] = useState('');
  const [fits, setFits] = useState<boolean | null>(null);
  const [parts, setParts] = useState('');
  const [who, setWho] = useState<string | null>(null);

  const item = state.items.find((i) => i.id === targets[step]);

  function finish() {
    const sprint = currentSprint(state);
    const today = todayISO(state);
    if (sprint) {
      set((d) => {
        const s = d.sprints.find((x) => x.id === sprint.id);
        if (s) s.refinedAt = today;
      });
    }
    onClose();
  }

  function next(apply: boolean) {
    if (apply && item) {
      const children = fits === false ? splitLines(parts).map((t) => newItem(t, { assigneeId: who })) : [];
      set((d) => {
        const idx = d.items.findIndex((i) => i.id === item.id);
        if (idx < 0) return;
        if (children.length > 0) {
          d.items.splice(idx, 1, ...children);
        } else {
          const it = d.items[idx];
          it.note = note.trim();
          it.clear = it.note !== '';
          it.assigneeId = who;
        }
      });
    }
    setNote('');
    setFits(null);
    setParts('');
    setWho(null);
    if (step + 1 >= targets.length) finish();
    else setStep(step + 1);
  }

  if (targets.length === 0 || !item) {
    return (
      <Modal title="Làm rõ việc" onClose={finish}>
        <p>Mọi việc ở đầu Kho đều đã rõ. Không cần làm gì thêm.</p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={finish}>
            Xong
          </button>
        </div>
      </Modal>
    );
  }

  const canApply = fits === false ? splitLines(parts).length >= 2 : note.trim() !== '';

  return (
    <Wizard
      name="Làm rõ việc cho tuần sau"
      step={step}
      total={targets.length}
      minutes={3}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => next(false)}>
            Để sau
          </button>
          <button className="btn btn-primary" disabled={!canApply} onClick={() => next(true)}>
            {step + 1 >= targets.length ? 'Lưu và kết thúc' : 'Lưu, sang việc tiếp'}
            <ArrowRight size={18} aria-hidden />
          </button>
        </>
      }
    >
      <span className="eyebrow">Làm rõ việc</span>
      <h1>{item.title}</h1>
      <Tip id="refine">Làm rõ việc là ghi đủ để người làm biết khi nào thì xong, và chia nhỏ việc quá lớn.</Tip>

      <div className="field">
        <label htmlFor="r-note">Xong thì trông thế nào?</label>
        <textarea
          id="r-note"
          className="textarea"
          style={{ minHeight: 80 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: 10 ảnh đã chỉnh màu, đăng lên trang bán hàng"
          autoFocus
        />
      </div>

      <div className="stack-sm">
        <span className="label">Một người có làm xong việc này trong vài ngày không?</span>
        <Choice on={fits === true} onClick={() => setFits(true)}>
          <strong>Có</strong>
        </Choice>
        <Choice on={fits === false} onClick={() => setFits(false)}>
          <strong>Không, việc này lớn quá</strong>
          <div className="small muted">Chia thành các việc nhỏ hơn.</div>
        </Choice>
      </div>

      {fits === false && (
        <div className="field enter">
          <label htmlFor="r-parts">Chia thành các việc nhỏ (mỗi dòng một việc, ít nhất 2)</label>
          <textarea
            id="r-parts"
            className="textarea"
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            placeholder={'Chụp ảnh\nChỉnh màu\nĐăng lên trang'}
          />
          <span className="small muted">Các việc nhỏ sẽ thay cho việc lớn này trong Kho, ở đúng vị trí ưu tiên cũ.</span>
        </div>
      )}

      <div className="stack-sm">
        <span className="label">Ai có thể làm? (không bắt buộc)</span>
        <div className="chips">
          {state.members.map((m) => (
            <button
              key={m.id}
              className={`chip${who === m.id ? ' on' : ''}`}
              aria-pressed={who === m.id}
              onClick={() => setWho(who === m.id ? null : m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>
    </Wizard>
  );
}
