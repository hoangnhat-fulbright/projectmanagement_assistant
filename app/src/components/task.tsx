import { CalendarClock, LifeBuoy } from 'lucide-react';
import { dueLabel, isLead, owner, ROLE_LABEL } from '../store';
import type { Item, ItemStatus, Priority, State } from '../types';

/* Các mảnh dùng chung cho thẻ việc. Wiki: features/sprint-board (D-011). */

export const STATUS_LABEL: Record<ItemStatus, string> = {
  todo: 'Chưa làm',
  doing: 'Đang làm',
  checking: 'Chờ kiểm tra',
  returned: 'Bị trả lại',
  done: 'Xong',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Ưu tiên cao',
  mid: 'Ưu tiên vừa',
  low: 'Ưu tiên thấp',
};

export const PRIORITY_SHORT: Record<Priority, string> = { high: 'Cao', mid: 'Vừa', low: 'Thấp' };

export const PRIORITIES: Priority[] = ['high', 'mid', 'low'];

const TONE_CLASS = { calm: '', soon: ' tag-warn', today: ' tag-warn', late: ' tag-late' } as const;

/** "Còn N ngày" / "Hết hạn hôm nay" / "Quá hạn N ngày". Không hiện gì nếu việc đã xong hoặc không có Deadline. */
export function DueTag({ state, item }: { state: State; item: Pick<Item, 'deadline' | 'status'> }) {
  const due = dueLabel(state, item);
  if (!due) return null;
  return (
    <span className={`tag mono${TONE_CLASS[due.tone]}`}>
      <CalendarClock size={13} aria-hidden />
      {due.text}
    </span>
  );
}

export function PriorityTag({ priority, all }: { priority: Priority | null; all?: boolean }) {
  if (!priority || (!all && priority !== 'high')) return null;
  return <span className={`tag${priority === 'high' ? ' tag-blue' : ''}`}>{PRIORITY_LABEL[priority]}</span>;
}

/** "Cần hỗ trợ: hỏi …" — mặc định là nhóm trưởng (wiki Q38). Nhóm trưởng thì không cần dòng này. */
export function HelpLine({ state }: { state: State }) {
  if (isLead(state)) return null;
  return (
    <p className="small muted row" style={{ gap: 6 }}>
      <LifeBuoy size={15} aria-hidden />
      <span>
        Cần hỗ trợ: hỏi <strong>{owner(state).name}</strong> ({ROLE_LABEL.owner})
      </span>
    </p>
  );
}
