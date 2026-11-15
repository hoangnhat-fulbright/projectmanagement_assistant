import type { BrainstormSession } from './brainstorm/types';

/**
 * Vai trò trong app (wiki: features/roles-and-permissions).
 * 'owner' = Team Lead (nhóm trưởng) · 'member' = Member (thành viên) · 'observer' = Observer (chỉ xem).
 */
export type Role = 'owner' | 'member' | 'observer';

export interface Member {
  id: string;
  /** ID hiển thị để track việc, ví dụ "TV-02". */
  code: string;
  name: string;
  role: Role;
  /** Vài dòng giới thiệu: thế mạnh, kinh nghiệm. */
  background: string;
  /** Tên tệp CV. Bản dựng thử chỉ lưu tên tệp, không lưu nội dung. */
  cvName: string | null;
}

/** 'returned' = Bị trả lại: nhóm trưởng bấm Trả lại (Return) trên việc đã nộp. */
export type ItemStatus = 'todo' | 'doing' | 'checking' | 'returned' | 'done';
export type Priority = 'high' | 'mid' | 'low';

/** Lần nộp việc gần nhất. */
export interface Submission {
  byId: string;
  date: string;
  note: string;
}

/** Lần bị trả lại gần nhất. */
export interface ReturnInfo {
  byId: string;
  date: string;
  reason: string;
}
export type Size = 'S' | 'M' | 'L';

export interface Step {
  id: string;
  text: string;
  done: boolean;
}

/** Việc (Product Backlog Item). Thứ tự trong mảng `items` = thứ tự ưu tiên trong Kho việc. */
export interface Item {
  id: string;
  title: string;
  /** "Xong thì trông thế nào?" */
  note: string;
  size: Size | null;
  /** Đã rõ — đủ thông tin để đưa vào tuần. */
  clear: boolean;
  /** Phục vụ Mục tiêu lớn. */
  bigGoal: boolean;
  sprintId: string | null;
  status: ItemStatus;
  assigneeId: string | null;
  /** Trực tiếp phục vụ Mục tiêu tuần. */
  forSprintGoal: boolean;
  steps: Step[];
  stuck: boolean;
  /** Được thêm giữa tuần dù không phục vụ mục tiêu tuần. */
  urgentAdd: boolean;
  /** Quay về từ tuần trước vì chưa xong. */
  carried: boolean;
  /** Hạn chót (ngày ISO). Việc từ Brainstorm mang Deadline sang; việc thêm tay có thể để trống. */
  deadline: string | null;
  /** Mức ưu tiên từ Brainstorm. Thứ tự trong Kho việc vẫn là thứ tự ưu tiên tuyệt đối. */
  priority: Priority | null;
  submission: Submission | null;
  returned: ReturnInfo | null;
  /** Số lần bị trả lại. */
  returnCount: number;
}

export type SprintState = 'active' | 'review' | 'retro' | 'closed';
export type GoalResult = 'yes' | 'partial' | 'no';

/** Tuần làm việc (Sprint). */
export interface Sprint {
  id: string;
  number: number;
  start: string;
  end: string;
  goal: string;
  state: SprintState;
  goalResult: GoalResult | null;
  plannedCount: number;
  doneCount: number;
  doneTitles: string[];
  improvementId: string | null;
  retroSkipped: boolean;
  refinedAt: string | null;
}

export interface CheckIn {
  id: string;
  sprintId: string;
  memberId: string;
  date: string;
  itemId: string | null;
  note: string;
  stuck: boolean;
}

/** Bị kẹt (Impediment). */
export interface Impediment {
  id: string;
  sprintId: string;
  memberId: string;
  itemId: string | null;
  note: string;
  helperId: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export type RetroKind = 'good' | 'hard' | 'try';

export interface RetroEntry {
  id: string;
  sprintId: string;
  kind: RetroKind;
  text: string;
  votes: number;
}

export interface Improvement {
  id: string;
  sprintId: string;
  text: string;
}

export interface DoDItem {
  id: string;
  text: string;
}

export interface Settings {
  /** Tên dự án tổng. */
  company: string;
  industry: string;
  /** Mô tả lĩnh vực của dự án. */
  field: string;
  /** Guideline ban đầu: quy ước làm việc của nhóm. */
  guideline: string;
  /** Tham khảo data: link, tên tệp hoặc ghi chú nguồn tham khảo. */
  references: string[];
  bigGoal: string;
  checkinHour: number;
  reviewHour: number;
  dod: DoDItem[];
}

export interface State {
  version: 1;
  onboarded: boolean;
  settings: Settings;
  members: Member[];
  currentMemberId: string;
  items: Item[];
  sprints: Sprint[];
  checkins: CheckIn[];
  impediments: Impediment[];
  retro: RetroEntry[];
  improvements: Improvement[];
  tipsSeen: string[];
  /** Việc nhóm trưởng đã kéo vào "Cần làm tuần này" khi tuần chưa bắt đầu. */
  weekDraft: string[];
  /** Công cụ thử nghiệm: số ngày cộng thêm vào ngày thật. */
  dayOffset: number;
  /** Tìm giờ họp chung — wiki: features/meeting-scheduler */
  polls: MeetingPoll[];
  responses: AvailabilityResponse[];
  weekly: WeeklyAvailability[];
  meetings: Meeting[];
  /** Brainstorm dự án (Goal → Milestone → WBS) — wiki: features/brainstorming */
  brainstorm: BrainstormSession | null;
}

/* ---------- Tìm giờ họp chung ---------- */

export type MeetingKind = 'planning' | 'daily' | 'review_retro' | 'refinement' | 'unblock' | 'other';
export type PollStatus = 'collecting' | 'proposed' | 'confirmed' | 'expired' | 'cancelled';

/**
 * Lần tìm giờ họp. `days`: ngày ISO (họp lẻ) hoặc 'dow:1'…'dow:5' (nhịp lặp lại theo thứ).
 * Khung giờ (slot) có dạng `${day}|${HH:MM}`.
 */
export interface MeetingPoll {
  id: string;
  title: string;
  kind: MeetingKind;
  /** phút */
  duration: number;
  recurring: boolean;
  days: string[];
  fromHour: number;
  toHour: number;
  slotMinutes: 15 | 30;
  /** Hạn trả lời (ngày ISO) */
  deadline: string;
  creatorId: string;
  inviteeIds: string[];
  requiredIds: string[];
  status: PollStatus;
  chosenSlot: string | null;
  createdAt: string;
  /** Vòng hỏi: tăng lên mỗi lần "Hỏi thêm ngày khác"; câu trả lời vòng cũ phải xác nhận lại. */
  round?: number;
}

export interface AvailabilityResponse {
  id: string;
  pollId: string;
  memberId: string;
  slots: string[];
  updatedAt: string;
  /** Vòng hỏi của poll lúc trả lời. */
  round?: number;
}

/** Giờ rảnh thường lệ: một khoảng rảnh trong một thứ của tuần. */
export interface WeeklyAvailability {
  memberId: string;
  dow: number;
  from: string;
  to: string;
}

/** Buổi họp đã chốt. `day`: ngày ISO, 'dow:n' nếu lặp lại hằng tuần, hoặc 'daily' nếu họp mỗi ngày làm việc. */
export interface Meeting {
  id: string;
  pollId: string | null;
  kind: MeetingKind;
  title: string;
  day: string;
  start: string;
  duration: number;
  attendeeIds: string[];
  recurring: boolean;
}
