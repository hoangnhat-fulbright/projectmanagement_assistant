import { useState } from 'react';
import { Check, Hourglass, Plus, X } from 'lucide-react';
import { memberName, uid } from '../store';
import { Avatar } from '../components/ui';
import { NOTE_KIND, useBrainstorm } from './common';
import type { NoteKind, NoteStatus } from './types';

const STATUS_LABEL: Record<NoteStatus, string> = {
  new: 'Mới',
  approved: 'Đã duyệt',
  later: 'Để sau',
  unused: 'Không dùng',
};

/** Khu ghi chú & ý tưởng: luôn mở suốt buổi họp, ai cũng thêm được; nhóm trưởng / phó duyệt. */
export function NotesDrawer({ onClose }: { onClose: () => void }) {
  const { state, s, user, isLeader, readOnly, update } = useBrainstorm();
  const [kind, setKind] = useState<NoteKind>('idea');
  const [text, setText] = useState('');
  const tasks = s.tasks.filter((t) => t.status !== 'removed');

  function add() {
    const t = text.trim();
    if (!t) return;
    const id = uid();
    update((b) => void b.notes.unshift({ id, authorId: user.id, kind, text: t, status: 'new', taskId: null }));
    setText('');
  }

  function setStatus(id: string, status: NoteStatus) {
    update((b) => {
      const n = b.notes.find((x) => x.id === id);
      if (n) n.status = status;
    });
  }

  return (
    <aside className="drawer" aria-label="Khu ghi chú và ý tưởng">
      <div className="row">
        <h2 className="grow">Ghi chú & ý tưởng</h2>
        <button className="btn-icon" onClick={onClose} aria-label="Đóng khu ghi chú">
          <X size={20} />
        </button>
      </div>
      <p className="small muted">
        Ghi nhanh điều chưa biết để đâu. Ghi chú được duyệt sẽ tự vào Task brief khi chốt kế hoạch.
      </p>

      {readOnly && <p className="small muted">Bạn đang ở chế độ chỉ xem nên không thêm ghi chú được.</p>}
      {!readOnly && (
      <div className="stack-sm">
        <div className="chips">
          {(Object.keys(NOTE_KIND) as NoteKind[]).map((k) => {
            const K = NOTE_KIND[k];
            return (
              <button key={k} className={`chip${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                <K.icon size={16} aria-hidden />
                {K.label}
              </button>
            );
          })}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="input grow"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ví dụ: sân B rẻ hơn 200k, phải đặt trước 2 tuần"
            aria-label="Nội dung ghi chú"
          />
          <button className="btn btn-primary" type="submit" disabled={!text.trim()} aria-label="Thêm ghi chú">
            <Plus size={18} aria-hidden />
          </button>
        </form>
        <span className="small muted">Đang ghi với tư cách {user.name}</span>
      </div>
      )}

      <div className="stack-sm drawer-list">
        {s.notes.length === 0 && <p className="muted small">Chưa có ghi chú nào.</p>}
        {s.notes.map((n) => {
          const K = NOTE_KIND[n.kind];
          return (
            <div key={n.id} className={`card card-tight stack-sm note-${n.status}`}>
              <div className="row">
                <Avatar state={state} memberId={n.authorId} small />
                <span className="small grow">
                  <strong>{memberName(state, n.authorId)}</strong>
                </span>
                <span className="tag">
                  <K.icon size={14} aria-hidden />
                  {K.label}
                </span>
              </div>
              <p>{n.text}</p>
              <div className="row-wrap">
                <span className={`tag${n.status === 'approved' ? ' tag-ok' : n.status === 'unused' ? ' tag-warn' : ''}`}>
                  {STATUS_LABEL[n.status]}
                </span>
                {isLeader && n.status !== 'approved' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setStatus(n.id, 'approved')}>
                    <Check size={14} aria-hidden />
                    Duyệt
                  </button>
                )}
                {isLeader && n.status !== 'later' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(n.id, 'later')}>
                    <Hourglass size={14} aria-hidden />
                    Để sau
                  </button>
                )}
                {isLeader && n.status !== 'unused' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(n.id, 'unused')}>
                    <X size={14} aria-hidden />
                    Không dùng
                  </button>
                )}
              </div>
              {isLeader && tasks.length > 0 && n.status !== 'unused' && (
                <label className="field">
                  <span className="label">Gắn với</span>
                  <select
                    className="select"
                    value={n.taskId ?? ''}
                    onChange={(e) =>
                      update((b) => {
                        const x = b.notes.find((y) => y.id === n.id);
                        if (x) x.taskId = e.target.value || null;
                      })
                    }
                  >
                    <option value="">Chưa gắn / ghi chú chung</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
