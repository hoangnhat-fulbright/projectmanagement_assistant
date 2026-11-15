/* Brainstorm dự án: Goal (SMART) → Milestone → WBS → Stakeholder. Nguồn: brainstorming.md + flow 2026-11-15 (D-010) */
import type { Priority } from '../types';

export type SmartKey = 'S' | 'M' | 'A' | 'R' | 'T';
export type SmartState = 'ok' | 'unclear' | 'missing';

/** Goal riêng của từng người (Cách A). */
export interface GoalEntry {
  memberId: string;
  text: string;
}

/** Điểm riêng: ý chỉ một người có. */
export interface UniquePoint {
  id: string;
  memberId: string;
  text: string;
  decision: 'add' | 'later' | 'drop' | null;
}

/** Thẻ do app gợi ý cần được nhóm trưởng / phó Giữ, Sửa hoặc Bỏ. */
export type CardStatus = 'suggested' | 'kept' | 'removed';

export type CommentKind = 'idea' | 'question' | 'concern';

export interface Comment {
  id: string;
  authorId: string;
  kind: CommentKind;
  text: string;
  status: 'open' | 'applied' | 'answered' | 'closed';
  reply: string;
}

export interface Milestone {
  id: string;
  name: string;
  /** "Xong khi": điều kiện kiểm tra được. */
  doneWhen: string;
  deadline: string;
  status: CardStatus;
  byApp: boolean;
  comments: Comment[];
  /** Tên những người có đề xuất đã được áp dụng. */
  credit: string[];
}

/** Nhóm việc "Phối hợp nhóm" không thuộc milestone nào. */
export const COORD = 'coord';

export interface BTask {
  id: string;
  milestoneId: string;
  title: string;
  doneWhen: string;
  assigneeId: string | null;
  deadline: string;
  status: CardStatus;
  byApp: boolean;
  comments: Comment[];
  credit: string[];
  /** Task do bước Stakeholder tự thêm. */
  stakeholderId: string | null;
  /** Thứ tự ưu tiên (D-010). Mặc định 'mid'. */
  priority: Priority;
}

export type NoteKind = 'idea' | 'info' | 'risk' | 'question';
export type NoteStatus = 'new' | 'approved' | 'later' | 'unused';

export interface Note {
  id: string;
  authorId: string;
  kind: NoteKind;
  text: string;
  status: NoteStatus;
  /** Gắn với task nào; null = ghi chú chung của dự án. */
  taskId: string | null;
}

export type ContactStatus = 'none' | 'contacted' | 'waiting' | 'agreed' | 'declined';

export interface Stakeholder {
  id: string;
  name: string;
  /** "Họ có thể chặn dự án không?" */
  canBlock: boolean | null;
  /** "Họ có quan tâm kết quả không?" */
  cares: boolean | null;
  milestoneId: string | null;
  ownerId: string | null;
  contact: ContactStatus;
  log: { date: string; text: string }[];
}

export type ProjectType = 'event' | 'product' | 'campaign' | 'generic';

/** Kết quả chấm SMART gần nhất do AI trả về. */
export interface SmartResult {
  rows: Record<SmartKey, { state: SmartState; hint: string }>;
  questions: { key: SmartKey; text: string }[];
  warn: string | null;
}

export interface BrainstormSession {
  id: string;
  name: string;
  /** 0 Bắt đầu · 1 Goal · 2 SMART · 3 Milestone & WBS · 4 Stakeholder · 5 Tổng kết */
  step: number;
  mode: 'A' | 'B' | null;
  /** Lối vào (D-010): 'goal' = Option 1 Goal + SMART · 'prompt' = Option 2 Prompt → Task brief. */
  entry: 'goal' | 'prompt';
  /** Option 2: đoạn mô tả nhóm trưởng gõ. */
  prompt: string;
  /** Option 1: nhóm đã bỏ qua phần hỏi và chấm SMART. */
  smartSkipped: boolean;
  deputyId: string | null;
  entries: GoalEntry[];
  /** Cách A: đã hiện goal của mọi người chưa. */
  revealed: boolean;
  uniquePoints: UniquePoint[];
  /** Goal gốc nhóm đã chốt ở bước 1. */
  baseGoal: string;
  /** Goal sau khi app viết lại theo SMART (nhóm sửa được). */
  goal: string;
  teamSize: number;
  answers: Partial<Record<SmartKey, string>>;
  /** Nhóm xác nhận "vẫn làm được" dù app thấy gấp. */
  feasibleOk: boolean;
  /** Ngày giao kết quả (ISO) — chữ T. */
  goalDate: string | null;
  projectType: ProjectType;
  milestones: Milestone[];
  tasks: BTask[];
  notes: Note[];
  stakeholders: Stakeholder[];
  /** Điểm chung và goal đề xuất ở Cách A (do AI hoặc luật tìm ra). */
  common: string[];
  proposed: string;
  /** Kết quả chấm của AI; null = đang chấm bằng luật có sẵn. */
  smart: SmartResult | null;
  /** Gợi ý stakeholder của AI theo thứ tự 4 câu hỏi; null = dùng mẫu. */
  stakeholderHints: string[][] | null;
  /** Phần nào đang là gợi ý của AI (còn lại là luật + mẫu). */
  aiUsed: { common: boolean; smart: boolean; plan: boolean };
  /** Đã bấm "Chốt kế hoạch". */
  locked: boolean;
  /** Đã đưa task sang Kho việc. */
  exported: boolean;
}
