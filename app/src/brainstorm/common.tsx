import { useState, type ReactNode } from 'react';
import { Bot, Check, ChevronsDown, ChevronsUp, CircleHelp, Lightbulb, Minus, Pin, TriangleAlert, X } from 'lucide-react';
import { canEdit, me, memberName, todayISO, uid, useStore, workers } from '../store';
import type { Priority, State } from '../types';
import { Avatar, Modal } from '../components/ui';
import type { BrainstormSession, Comment, CommentKind, NoteKind } from './types';

/** Phiên brainstorm hiện tại + quyền của người đang dùng. */
export function useBrainstorm() {
  const { state, set } = useStore();
  const s = state.brainstorm as BrainstormSession;
  const user = me(state);
  // Observer (người quan sát) thấy hết nhưng không sửa được gì; store cũng tự bỏ qua mọi thay đổi của họ.
  const readOnly = !canEdit(state);
  // Nhóm trưởng = Team Lead; nhóm phó do nhóm trưởng chọn. Cả hai được sửa trực tiếp và chốt.
  const isLeader = !readOnly && (user.role === 'owner' || user.id === s.deputyId);
  const update = (fn: (b: BrainstormSession, d: State) => void) =>
    set((d) => {
      if (d.brainstorm) fn(d.brainstorm, d);
    });
  /** Những người nhận việc / viết goal được (không gồm Observer). */
  const people = workers(state);
  return { state, s, user, isLeader, readOnly, people, update, today: todayISO(state) };
}

export function roleLabel(state: State, s: BrainstormSession, memberId: string): string {
  const m = state.members.find((x) => x.id === memberId);
  if (!m) return '';
  if (m.role === 'owner') return 'Nhóm trưởng';
  if (m.role === 'observer') return 'Người quan sát';
  if (m.id === s.deputyId) return 'Nhóm phó';
  return 'Thành viên';
}

/* ---------- Thuật ngữ tiếng Anh, kèm giải thích bằng lời thường ---------- */

const TERMS: Record<string, string> = {
  Goal: 'Mục tiêu chung, viết theo SMART: làm gì, đo bằng gì, khi nào.',
  Milestone: '"Trạm kiểm tra" trên đường đến goal.',
  Task: 'Một việc cụ thể, giao được cho 1 người.',
  WBS: 'Danh sách task, chia từ to đến nhỏ theo từng milestone.',
  Deadline: 'Hạn chót. App tính ngược từ ngày giao kết quả trong goal.',
  'Task brief': 'Mô tả từng task: làm gì, vì sao, xong khi nào, kèm ghi chú đã duyệt.',
  Stakeholder: 'Người ngoài nhóm có thể giúp hoặc chặn dự án.',
};

export function Term({ k, children }: { k: keyof typeof TERMS; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term-wrap">
      <button type="button" className="term" title={TERMS[k]} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {children ?? k}
      </button>
      {open && (
        <span className="term-pop" role="note">
          <strong>{k}:</strong> {TERMS[k]}
        </span>
      )}
    </span>
  );
}

/* ---------- Thứ tự ưu tiên của task (D-010) ---------- */

export const PRIORITIES: Priority[] = ['high', 'mid', 'low'];

export const PRIORITY: Record<Priority, { label: string; icon: typeof Bot }> = {
  high: { label: 'Cao', icon: ChevronsUp },
  mid: { label: 'Vừa', icon: Minus },
  low: { label: 'Thấp', icon: ChevronsDown },
};

/** Nhãn ưu tiên. Có `onChange` (nhóm trưởng / phó) thì bấm để đổi vòng Cao → Vừa → Thấp. */
export function PriorityTag({ value, onChange }: { value: Priority; onChange?: (p: Priority) => void }) {
  const P = PRIORITY[value];
  const body = (
    <>
      <P.icon size={14} aria-hidden />
      Ưu tiên {P.label.toLowerCase()}
    </>
  );
  if (!onChange) return <span className={`tag prio prio-${value}`}>{body}</span>;
  const next = PRIORITIES[(PRIORITIES.indexOf(value) + 1) % PRIORITIES.length];
  return (
    <button
      type="button"
      className={`tag prio prio-${value} prio-btn`}
      title="Bấm để đổi thứ tự ưu tiên"
      aria-label={`Ưu tiên ${P.label.toLowerCase()}. Bấm để đổi sang ${PRIORITY[next].label.toLowerCase()}`}
      onClick={() => onChange(next)}
    >
      {body}
    </button>
  );
}

export function BotTag() {
  return (
    <span className="tag tag-blue">
      <Bot size={14} aria-hidden />
      Gợi ý của app
    </span>
  );
}

/* ---------- Loại comment & loại ghi chú (icon thay cho emoji) ---------- */

export const COMMENT_KIND: Record<CommentKind, { label: string; icon: typeof Bot }> = {
  idea: { label: 'Đề xuất', icon: Lightbulb },
  question: { label: 'Câu hỏi', icon: CircleHelp },
  concern: { label: 'Lo ngại', icon: TriangleAlert },
};

export const NOTE_KIND: Record<NoteKind, { label: string; icon: typeof Bot }> = {
  idea: { label: 'Ý tưởng', icon: Lightbulb },
  info: { label: 'Thông tin', icon: Pin },
  risk: { label: 'Lưu ý / rủi ro', icon: TriangleAlert },
  question: { label: 'Câu hỏi', icon: CircleHelp },
};

const COMMENT_STATUS: Record<Comment['status'], string> = {
  open: 'Chưa xử lý',
  applied: 'Đã áp dụng',
  answered: 'Đã trả lời',
  closed: 'Đã đóng',
};

export function openComments(comments: Comment[]): number {
  return comments.filter((c) => c.status === 'open').length;
}

interface ThreadProps {
  title: string;
  comments: Comment[];
  /** Cho phép nút nhanh "Tôi muốn làm task này". */
  canVolunteer?: boolean;
  onClose: () => void;
  onAdd: (c: Comment) => void;
  onResolve: (id: string, status: Comment['status'], reply: string) => void;
  /** Nhóm trưởng bấm "Áp dụng": mở form sửa thẻ. */
  onApply: (c: Comment) => void;
}

/** Comment trên một thẻ: thành viên góp ý; nhóm trưởng / phó Áp dụng, Trả lời hoặc Đóng. */
export function CommentThread({ title, comments, canVolunteer, onClose, onAdd, onResolve, onApply }: ThreadProps) {
  const { state, user, isLeader, readOnly } = useBrainstorm();
  const [kind, setKind] = useState<CommentKind>('idea');
  const [text, setText] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  function add(k: CommentKind, t: string) {
    if (!t.trim()) return;
    onAdd({ id: uid(), authorId: user.id, kind: k, text: t.trim(), status: 'open', reply: '' });
    setText('');
  }

  return (
    <Modal title={title} onClose={onClose}>
      {comments.length === 0 && <p className="muted small">Chưa có comment nào cho thẻ này.</p>}
      {comments.map((c) => {
        const K = COMMENT_KIND[c.kind];
        return (
          <div key={c.id} className="card card-tight stack-sm">
            <div className="row">
              <Avatar state={state} memberId={c.authorId} small />
              <strong className="grow small">{memberName(state, c.authorId)}</strong>
              <span className={`tag${c.kind === 'concern' ? ' tag-warn' : ''}`}>
                <K.icon size={14} aria-hidden />
                {K.label}
              </span>
            </div>
            <p>{c.text}</p>
            {c.reply && (
              <p className="small" style={{ paddingLeft: 12, borderLeft: '3px solid var(--border-strong)' }}>
                <span className="muted">Trả lời: </span>
                {c.reply}
              </p>
            )}
            {c.status !== 'open' ? (
              <span className="tag tag-ok" style={{ alignSelf: 'flex-start' }}>
                <Check size={14} aria-hidden />
                {COMMENT_STATUS[c.status]}
              </span>
            ) : isLeader ? (
              replyFor === c.id ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reply.trim()) return;
                    onResolve(c.id, 'answered', reply.trim());
                    setReplyFor(null);
                    setReply('');
                  }}
                >
                  <input
                    className="input grow"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Trả lời ngắn gọn"
                    aria-label="Nội dung trả lời"
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm" type="submit" disabled={!reply.trim()}>
                    Gửi
                  </button>
                </form>
              ) : (
                <div className="row-wrap">
                  <button className="btn btn-primary btn-sm" onClick={() => onApply(c)}>
                    Áp dụng
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setReplyFor(c.id)}>
                    Trả lời
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onResolve(c.id, 'closed', '')}>
                    <X size={14} aria-hidden />
                    Đóng
                  </button>
                </div>
              )
            ) : (
              <span className="tag" style={{ alignSelf: 'flex-start' }}>
                Chờ nhóm trưởng xử lý
              </span>
            )}
          </div>
        );
      })}

      {readOnly && <p className="small muted">Bạn đang ở chế độ chỉ xem nên không thêm comment được.</p>}
      {!readOnly && <hr className="divider" />}
      {!readOnly && (
      <div className="stack-sm">
        <span className="label">Thêm comment với tư cách {user.name}</span>
        <div className="chips">
          {(Object.keys(COMMENT_KIND) as CommentKind[]).map((k) => {
            const K = COMMENT_KIND[k];
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
            add(kind, text);
          }}
        >
          <input
            className="input grow"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'concern' ? 'Ví dụ: tuần đó em thi' : kind === 'question' ? 'Ví dụ: mốc này có kịp không?' : 'Ví dụ: nên tách task này làm 2'}
            aria-label="Nội dung comment"
          />
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
            Gửi
          </button>
        </form>
        {canVolunteer && (
          <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => add('idea', 'Tôi muốn làm task này')}>
            Tôi muốn làm task này
          </button>
        )}
      </div>
      )}
    </Modal>
  );
}
