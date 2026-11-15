import type {
  AvailabilityResponse,
  Meeting,
  MeetingKind,
  MeetingPoll,
  Member,
  PollStatus,
  Settings,
  WeeklyAvailability,
} from '../types';
import { addDays, dow, DOW_NAMES, fmtDay, fmtShort, isWorkday } from './dates';

/* Tìm giờ họp chung — logic thuần. Wiki: features/meeting-scheduler */

export interface KindDef {
  id: MeetingKind;
  label: string;
  /** Thời lượng mặc định (phút) */
  duration: number;
  /** Các thời lượng cho chọn; số lớn nhất là mức trần của loại này */
  durations: number[];
  recurring: boolean;
  /** Họp cùng giờ mọi ngày (Họp nhanh) */
  daily: boolean;
  cadence: string;
  /** Người cần có mặt mặc định */
  required: 'all' | 'members' | 'owner';
  /** Mời mặc định: cả đội hay chỉ người cần có mặt */
  invite: 'all' | 'required';
}

export const KINDS: KindDef[] = [
  { id: 'planning', label: 'Lên kế hoạch tuần', duration: 60, durations: [30, 45, 60], recurring: true, daily: false, cadence: 'Hằng tuần', required: 'all', invite: 'all' },
  { id: 'daily', label: 'Họp nhanh', duration: 15, durations: [15], recurring: true, daily: true, cadence: 'Hằng ngày', required: 'members', invite: 'all' },
  { id: 'review_retro', label: 'Xem kết quả & Rút kinh nghiệm', duration: 60, durations: [45, 60], recurring: true, daily: false, cadence: 'Hằng tuần', required: 'all', invite: 'all' },
  { id: 'refinement', label: 'Làm rõ việc', duration: 15, durations: [15, 30], recurring: true, daily: false, cadence: 'Hằng tuần', required: 'owner', invite: 'required' },
  { id: 'unblock', label: 'Gỡ vướng', duration: 30, durations: [15, 30], recurring: false, daily: false, cadence: 'Một lần', required: 'owner', invite: 'required' },
  { id: 'other', label: 'Buổi họp khác', duration: 30, durations: [15, 30, 45, 60], recurring: false, daily: false, cadence: 'Một lần', required: 'owner', invite: 'required' },
];

export function kindDef(kind: MeetingKind): KindDef {
  return KINDS.find((k) => k.id === kind) ?? KINDS[KINDS.length - 1];
}

export function slotMinutesFor(kind: MeetingKind): 15 | 30 {
  return kind === 'daily' ? 15 : 30;
}

/** Người cần có mặt / người được mời mặc định theo loại buổi họp. */
export function defaultPeople(kind: MeetingKind, members: Member[]): { required: string[]; optional: string[] } {
  const def = kindDef(kind);
  const ownerIds = members.filter((m) => m.role === 'owner').map((m) => m.id);
  const memberIds = members.filter((m) => m.role !== 'owner').map((m) => m.id);
  let required: string[];
  if (def.required === 'all') required = members.map((m) => m.id);
  else if (def.required === 'members') required = memberIds.length > 0 ? memberIds : ownerIds;
  else required = ownerIds;
  const optional = def.invite === 'all' ? members.map((m) => m.id).filter((id) => !required.includes(id)) : [];
  return { required, optional };
}

/* ---------- Thời gian ---------- */

export function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function slotKey(day: string, time: string): string {
  return `${day}|${time}`;
}

export function parseSlot(slot: string): { day: string; time: string } {
  const [day, time] = slot.split('|');
  return { day, time };
}

/** n ngày làm việc tiếp theo sau `from` (không tính `from`). */
export function nextWorkdays(from: string, n: number): string[] {
  const out: string[] = [];
  let d = from;
  while (out.length < n) {
    d = addDays(d, 1);
    if (isWorkday(d)) out.push(d);
  }
  return out;
}

export const WEEKDAYS = ['dow:1', 'dow:2', 'dow:3', 'dow:4', 'dow:5'];

/** Ngày mặc định để hỏi: nhịp lặp lại → Thứ Hai–Thứ Sáu; họp lẻ → 5 ngày làm việc tới. */
export function defaultDays(kind: MeetingKind, today: string): string[] {
  return kindDef(kind).recurring ? [...WEEKDAYS] : nextWorkdays(today, 5);
}

/** Hạn trả lời mặc định: hết ngày làm việc kế tiếp. */
export function defaultDeadline(today: string): string {
  return nextWorkdays(today, 1)[0];
}

/** Thứ trong tuần (0–6) của một "ngày" trong poll; 'daily' → -1. */
export function dayNumber(day: string): number {
  if (day === 'daily') return -1;
  if (day.startsWith('dow:')) return Number(day.slice(4));
  return dow(day);
}

export function dayLabel(day: string): string {
  if (day === 'daily') return 'Mỗi ngày làm việc';
  if (day.startsWith('dow:')) return DOW_NAMES[Number(day.slice(4))];
  return fmtDay(day);
}

const SHORT_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function shortDayLabel(day: string): string {
  if (day.startsWith('dow:')) return SHORT_DOW[Number(day.slice(4))];
  return `${SHORT_DOW[dow(day)]} ${fmtShort(day)}`;
}

export function sortDays(days: string[]): string[] {
  return [...days].sort((a, b) => (a.startsWith('dow:') ? dayNumber(a) - dayNumber(b) : a.localeCompare(b)));
}

/** Các mốc giờ bắt đầu khung giờ trong ngày, theo khung giờ làm của poll. */
export function slotTimes(poll: Pick<MeetingPoll, 'fromHour' | 'toHour' | 'slotMinutes'>): string[] {
  const out: string[] = [];
  for (let m = poll.fromHour * 60; m + poll.slotMinutes <= poll.toHour * 60; m += poll.slotMinutes) out.push(fromMin(m));
  return out;
}

/** Các khung giờ liên tiếp cần rảnh để họp đủ `duration` bắt đầu từ `time`; null nếu vượt giờ làm. */
export function blockTimes(poll: Pick<MeetingPoll, 'toHour' | 'slotMinutes' | 'duration'>, time: string): string[] | null {
  const n = Math.max(1, Math.ceil(poll.duration / poll.slotMinutes));
  const start = toMin(time);
  if (start + n * poll.slotMinutes > poll.toHour * 60) return null;
  return Array.from({ length: n }, (_, i) => fromMin(start + i * poll.slotMinutes));
}

export function slotLabel(poll: Pick<MeetingPoll, 'duration'>, slot: string): string {
  const { day, time } = parseSlot(slot);
  return `${dayLabel(day)} · ${time}–${fromMin(toMin(time) + poll.duration)}`;
}

/* ---------- Trả lời & trạng thái ---------- */

/** Câu trả lời còn hiệu lực: của người được mời, đúng vòng hỏi hiện tại. */
export function currentResponses(poll: MeetingPoll, responses: AvailabilityResponse[]): AvailabilityResponse[] {
  const round = poll.round ?? 0;
  return responses.filter((r) => r.pollId === poll.id && (r.round ?? 0) === round && poll.inviteeIds.includes(r.memberId));
}

export function answeredIds(poll: MeetingPoll, responses: AvailabilityResponse[]): string[] {
  return currentResponses(poll, responses).map((r) => r.memberId);
}

/**
 * Trạng thái suy ra từ dữ liệu + ngày hiện tại (không dùng hẹn giờ):
 * Đang hỏi → Có đề xuất (đủ người trả lời, hoặc hết hạn và có ≥ 1 câu trả lời) → Đã chốt;
 * Hết hạn (hết hạn mà chưa ai trả lời); Đã hủy.
 */
export function pollStatus(poll: MeetingPoll, responses: AvailabilityResponse[], today: string): PollStatus {
  if (poll.status === 'confirmed' || poll.status === 'cancelled') return poll.status;
  const answered = answeredIds(poll, responses);
  if (poll.inviteeIds.length > 0 && poll.inviteeIds.every((id) => answered.includes(id))) return 'proposed';
  if (today > poll.deadline) return answered.length > 0 ? 'proposed' : 'expired';
  return 'collecting';
}

export const STATUS_LABEL: Record<PollStatus, string> = {
  collecting: 'Đang hỏi',
  proposed: 'Có đề xuất',
  confirmed: 'Đã chốt',
  expired: 'Hết hạn',
  cancelled: 'Đã hủy',
};

/** Lần tìm giờ đang mở mà người này được mời nhưng chưa trả lời. */
export function unansweredPoll(
  polls: MeetingPoll[],
  responses: AvailabilityResponse[],
  memberId: string,
  today: string,
): MeetingPoll | null {
  return (
    polls.find(
      (p) =>
        pollStatus(p, responses, today) === 'collecting' &&
        p.inviteeIds.includes(memberId) &&
        !answeredIds(p, responses).includes(memberId),
    ) ?? null
  );
}

/** Lần tìm giờ đang chờ Chủ quyết: đã có đề xuất, hoặc hết hạn mà chưa ai trả lời. */
export function pollToConfirm(polls: MeetingPoll[], responses: AvailabilityResponse[], today: string): MeetingPoll | null {
  return (
    polls.find((p) => {
      const st = pollStatus(p, responses, today);
      return st === 'proposed' || st === 'expired';
    }) ?? null
  );
}

/* ---------- Xếp hạng "giờ đẹp nhất" ---------- */

export interface Candidate {
  /** `${day}|${HH:MM}`; với Họp nhanh là `daily|HH:MM` */
  slot: string;
  day: string;
  time: string;
  freeIds: string[];
  /** Người được mời không rảnh hoặc chưa trả lời */
  missingIds: string[];
  missingRequiredIds: string[];
  allRequired: boolean;
  everyone: boolean;
  /** Độ hợp nhịp tuần (càng lớn càng hợp) */
  fit: number;
}

function meetingDayMatches(pollDay: string, meetingDay: string): boolean {
  if (meetingDay === 'daily') return true;
  if (pollDay === 'daily') return meetingDay.startsWith('dow:');
  if (pollDay === meetingDay) return true;
  // Họp lẻ vào đúng thứ của một buổi họp lặp lại.
  if (!pollDay.startsWith('dow:') && meetingDay.startsWith('dow:')) return dow(pollDay) === dayNumber(meetingDay);
  return false;
}

/** Khung giờ này có đè lên một buổi họp đã chốt cùng ngày không. */
export function overlapsMeeting(
  poll: Pick<MeetingPoll, 'kind' | 'recurring' | 'duration'>,
  day: string,
  time: string,
  meetings: Meeting[],
): boolean {
  const start = toMin(time);
  const end = start + poll.duration;
  return meetings.some((m) => {
    // Buổi nhịp cố định cùng loại sẽ được thay bằng kết quả lần tìm giờ này.
    if (poll.recurring && m.recurring && m.kind === poll.kind) return false;
    if (!meetingDayMatches(day, m.day)) return false;
    const ms = toMin(m.start);
    return start < ms + m.duration && ms < end;
  });
}

function rhythmFit(kind: MeetingKind, day: string): number {
  const d = dayNumber(day);
  if (d < 1) return 0;
  if (kind === 'planning') return -(d - 1); // càng đầu tuần càng hợp
  if (kind === 'review_retro') return -(5 - d); // càng cuối tuần càng hợp
  return 0;
}

/**
 * Mọi khung giờ họp được, xếp theo thứ tự ưu tiên:
 * 1. đủ "người cần có mặt" · 2. nhiều người rảnh nhất · 3. hợp nhịp tuần · 4. sớm hơn trong ngày.
 * Chỉ tính khung giờ mà cả khối `duration` đều rảnh, nằm trong giờ đã chọn và không trùng buổi họp đã chốt.
 */
export function rankSlots(
  poll: MeetingPoll,
  responses: AvailabilityResponse[],
  meetings: Meeting[],
  today: string,
): Candidate[] {
  const current = currentResponses(poll, responses);
  const sets = new Map(current.map((r) => [r.memberId, new Set(r.slots)]));
  const daily = kindDef(poll.kind).daily;
  const days = sortDays(poll.days).filter((d) => d.startsWith('dow:') || d >= today);
  const times = slotTimes(poll);
  const out: Candidate[] = [];

  const freeOn = (memberId: string, day: string, block: string[]) => {
    const s = sets.get(memberId);
    return !!s && block.every((t) => s.has(slotKey(day, t)));
  };

  const push = (day: string, time: string, freeIds: string[]) => {
    if (freeIds.length === 0) return;
    const missingIds = poll.inviteeIds.filter((id) => !freeIds.includes(id));
    const missingRequiredIds = poll.requiredIds.filter((id) => !freeIds.includes(id));
    out.push({
      slot: slotKey(day, time),
      day,
      time,
      freeIds,
      missingIds,
      missingRequiredIds,
      allRequired: missingRequiredIds.length === 0,
      everyone: missingIds.length === 0,
      fit: rhythmFit(poll.kind, day),
    });
  };

  for (const time of times) {
    const block = blockTimes(poll, time);
    if (!block) continue;
    if (daily) {
      if (days.length === 0 || days.some((d) => overlapsMeeting(poll, d, time, meetings))) continue;
      push('daily', time, poll.inviteeIds.filter((id) => days.every((d) => freeOn(id, d, block))));
    } else {
      for (const day of days) {
        if (overlapsMeeting(poll, day, time, meetings)) continue;
        push(day, time, poll.inviteeIds.filter((id) => freeOn(id, day, block)));
      }
    }
  }

  const dayIndex = new Map(days.map((d, i) => [d, i]));
  return out.sort(
    (a, b) =>
      Number(b.allRequired) - Number(a.allRequired) ||
      b.freeIds.length - a.freeIds.length ||
      b.fit - a.fit ||
      toMin(a.time) - toMin(b.time) ||
      (dayIndex.get(a.day) ?? 0) - (dayIndex.get(b.day) ?? 0),
  );
}

/** Lấy n giờ đẹp nhất, bỏ các khung giờ đè lên nhau trong cùng một ngày. */
export function bestSlots(cands: Candidate[], poll: Pick<MeetingPoll, 'duration'>, n = 3): Candidate[] {
  const picked: Candidate[] = [];
  for (const c of cands) {
    const clash = picked.some((p) => p.day === c.day && Math.abs(toMin(p.time) - toMin(c.time)) < poll.duration);
    if (!clash) picked.push(c);
    if (picked.length >= n) break;
  }
  return picked;
}

/** Ai rảnh ở từng khung giờ (cho lưới tổng hợp). */
export function slotFreeMap(poll: MeetingPoll, responses: AvailabilityResponse[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of currentResponses(poll, responses)) {
    for (const s of r.slots) {
      const list = map.get(s);
      if (list) list.push(r.memberId);
      else map.set(s, [r.memberId]);
    }
  }
  return map;
}

/* ---------- Giờ rảnh thường lệ ---------- */

/** Điền sẵn câu trả lời từ giờ rảnh thường lệ của một người. */
export function weeklyToSlots(poll: MeetingPoll, weekly: WeeklyAvailability[], memberId: string): string[] {
  const mine = weekly.filter((w) => w.memberId === memberId);
  const out: string[] = [];
  for (const day of poll.days) {
    const d = dayNumber(day);
    const ranges = mine.filter((w) => w.dow === d);
    for (const t of slotTimes(poll)) {
      const s = toMin(t);
      if (ranges.some((r) => toMin(r.from) <= s && s + poll.slotMinutes <= toMin(r.to))) out.push(slotKey(day, t));
    }
  }
  return out;
}

/** Gộp các khung giờ đã tô thành các khoảng rảnh theo thứ trong tuần. */
export function slotsToWeekly(poll: MeetingPoll, memberId: string, slots: string[]): WeeklyAvailability[] {
  const byDow = new Map<number, Set<number>>();
  for (const s of slots) {
    const { day, time } = parseSlot(s);
    const d = dayNumber(day);
    if (d < 0) continue;
    if (!byDow.has(d)) byDow.set(d, new Set());
    byDow.get(d)!.add(toMin(time));
  }
  const out: WeeklyAvailability[] = [];
  for (const [d, set] of [...byDow.entries()].sort((a, b) => a[0] - b[0])) {
    const starts = [...set].sort((a, b) => a - b);
    let from = starts[0];
    let prev = starts[0];
    for (let i = 1; i <= starts.length; i++) {
      const cur = starts[i];
      if (cur === undefined || cur !== prev + poll.slotMinutes) {
        out.push({ memberId, dow: d, from: fromMin(from), to: fromMin(prev + poll.slotMinutes) });
        from = cur;
      }
      prev = cur;
    }
  }
  return out;
}

/* ---------- Giờ mặc định khi không ai trả lời ---------- */

/** Giờ mặc định của các nhịp cố định (wiki: nudges-and-reminders); họp lẻ không có mặc định. */
export function defaultMeetingTime(kind: MeetingKind, settings: Pick<Settings, 'checkinHour' | 'reviewHour'>): { day: string; start: string } | null {
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  if (kind === 'planning') return { day: 'dow:1', start: '09:00' };
  if (kind === 'daily') return { day: 'daily', start: hh(settings.checkinHour) };
  if (kind === 'review_retro') return { day: 'dow:5', start: hh(settings.reviewHour) };
  if (kind === 'refinement') return { day: 'dow:3', start: '15:00' };
  return null;
}
