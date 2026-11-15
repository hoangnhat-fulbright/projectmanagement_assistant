/*
 * Logic cho Brainstorm. Bản dựng thử KHÔNG gọi AI: chấm SMART, gợi ý Milestone / WBS / Stakeholder
 * và tìm điểm chung đều là luật đơn giản + mẫu theo loại dự án. Thay bằng AI thì thay ở file này.
 */
import { addDays, fmtShort, fromISO } from '../lib/dates';
import type { Priority } from '../types';
import {
  COORD,
  type BTask,
  type BrainstormSession,
  type GoalEntry,
  type Milestone,
  type Note,
  type ProjectType,
  type SmartKey,
  type SmartState,
  type Stakeholder,
} from './types';

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

function lowerFirst(s: string): string {
  const t = s.trim();
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}

function stripLead(s: string, leads: string[]): string {
  let t = lowerFirst(s).replace(/[.。]+$/, '');
  for (const l of leads) {
    if (t.startsWith(l + ' ')) t = t.slice(l.length + 1);
  }
  return t;
}

/* ---------- Chữ T: tìm ngày trong goal ---------- */

const DATE_RE = /(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?/;
const DATE_WORDS_RE = /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/i;
const VAGUE_TIME_RE = /(tháng\s+\d{1,2}|tuần\s+(sau|tới)|cuối\s+(tháng|năm|kỳ|kì)|học\s+k[ỳì]|sắp\s+tới)/i;

export function parseGoalDate(text: string, today: string): string | null {
  const m = text.match(DATE_WORDS_RE) ?? text.match(DATE_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const now = fromISO(today);
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  const iso = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  let out = iso(year);
  if (!m[3] && out < today) out = iso(year + 1);
  return out;
}

/* ---------- Chấm SMART ---------- */

export const SMART_LABEL: Record<SmartKey, { name: string; vi: string }> = {
  S: { name: 'Specific', vi: 'Cụ thể' },
  M: { name: 'Measurable', vi: 'Đo được' },
  A: { name: 'Achievable', vi: 'Làm được' },
  R: { name: 'Relevant', vi: 'Có ý nghĩa' },
  T: { name: 'Time-bound', vi: 'Có hạn' },
};

/** Ngân hàng câu hỏi dùng cho mọi dự án. */
export const SMART_QUESTION: Record<SmartKey, string> = {
  S: 'Kết quả cuối cùng là gì, cho ai, quy mô bao lớn?',
  M: 'Con số nào làm nhóm thấy thành công?',
  A: 'Nhóm đã có gì trong tay: tiền, dụng cụ, số giờ mỗi tuần?',
  R: 'Vì sao nhóm làm việc này? Ai được lợi?',
  T: 'Hạn chót là ngày nào?',
};

export const SMART_ORDER: SmartKey[] = ['S', 'M', 'R', 'A', 'T'];

export interface SmartRow {
  state: SmartState;
  hint: string;
}

export function feasibility(s: BrainstormSession, today: string): string | null {
  if (!s.goalDate || s.teamSize <= 0) return null;
  const days = daysBetween(today, s.goalDate);
  if (days < 0) return 'Ngày của goal đã qua. Chọn lại ngày giao kết quả.';
  if (days < 7 || days * s.teamSize < 40) {
    return `${s.teamSize} người, còn ${days} ngày: có vẻ gấp. Giảm quy mô, hoặc lùi ngày?`;
  }
  return null;
}

export function scoreSmart(s: BrainstormSession, today: string): Record<SmartKey, SmartRow> {
  const base = s.baseGoal;
  const words = base.trim().split(/\s+/).filter(Boolean).length;
  const noDate = base.replace(DATE_WORDS_RE, ' ').replace(DATE_RE, ' ');

  const S: SmartRow = s.answers.S
    ? { state: 'ok', hint: 'Đã rõ làm gì, cho ai' }
    : words >= 8 && /(^|\s)(cho|dành cho)\s/i.test(base)
      ? { state: 'ok', hint: 'Đã rõ làm gì, cho ai' }
      : words >= 4
        ? { state: 'unclear', hint: 'Cho ai? Quy mô bao lớn?' }
        : { state: 'missing', hint: 'Làm chính xác cái gì?' };

  const M: SmartRow =
    s.answers.M || /\d+\s*\S+/.test(noDate)
      ? { state: 'ok', hint: 'Có con số để đo' }
      : { state: 'missing', hint: 'Thế nào là thành công?' };

  const R: SmartRow =
    s.answers.R || /(^|\s)(để|nhằm|vì|giúp)\s/i.test(base)
      ? { state: 'ok', hint: 'Đã rõ vì sao làm' }
      : { state: 'missing', hint: 'Vì sao nhóm làm việc này?' };

  let A: SmartRow;
  const warn = feasibility(s, today);
  if (s.teamSize <= 0) A = { state: 'missing', hint: 'Nhóm có mấy người?' };
  else if (!s.answers.A) A = { state: 'unclear', hint: 'Đã có tiền, dụng cụ, thời gian chưa?' };
  else if (warn && !s.feasibleOk) A = { state: 'unclear', hint: warn };
  else A = { state: 'ok', hint: `Nhóm ${s.teamSize} người, đã rõ nguồn lực` };

  const T: SmartRow = s.goalDate
    ? { state: 'ok', hint: `Có ngày cụ thể (${fmtShort(s.goalDate)})` }
    : VAGUE_TIME_RE.test(base)
      ? { state: 'unclear', hint: 'Chính xác là ngày nào?' }
      : { state: 'missing', hint: 'Ngày nào xong?' };

  return { S, M, A, R, T };
}

export function smartPoints(score: Record<SmartKey, SmartRow>): number {
  return SMART_ORDER.filter((k) => score[k].state === 'ok').length;
}

/** Mỗi lần hỏi tối đa 3 câu, cho những chữ chưa đạt. */
export function nextQuestions(score: Record<SmartKey, SmartRow>, s: BrainstormSession): SmartKey[] {
  return SMART_ORDER.filter((k) => {
    if (score[k].state === 'ok') return false;
    // Chữ A chưa đạt chỉ vì "có vẻ gấp" → không hỏi lại, nhóm xác nhận bằng nút riêng.
    if (k === 'A' && s.answers.A && s.teamSize > 0) return false;
    return true;
  }).slice(0, 3);
}

/** App viết lại goal từ goal gốc + các câu trả lời. Nhóm vẫn sửa tay được. */
export function rewriteGoal(s: BrainstormSession, today: string): string {
  let g = s.baseGoal.trim().replace(/[.。]+$/, '');
  if (!g) return '';
  if (s.goalDate && !parseGoalDate(s.baseGoal, today)) g = `Ngày ${fmtShort(s.goalDate)}, ${lowerFirst(g)}`;
  if (s.answers.S) g += ` cho ${stripLead(s.answers.S, ['cho', 'dành cho'])}`;
  if (s.answers.M) g += ` với ${stripLead(s.answers.M, ['với', 'có'])}`;
  if (s.answers.R) g += `, để ${stripLead(s.answers.R, ['để', 'nhằm', 'vì'])}`;
  g += '.';
  if (s.teamSize > 0) {
    g += ` Nhóm ${s.teamSize} người${s.answers.A ? `, ${stripLead(s.answers.A, ['có', 'đã có'])}` : ''}.`;
  }
  return g;
}

/* ---------- Cách A: điểm chung / điểm riêng ---------- */

const STOP = new Set(
  'và là của cho một các những có được trong với để ngày tổ chức làm sẽ muốn nhóm mình chúng ta tôi em này đó thì mà ở tại khi vào ra'.split(
    ' ',
  ),
);

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?"'()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function commonAndUnique(entries: GoalEntry[]): {
  common: string[];
  unique: { memberId: string; text: string }[];
  proposed: string;
} {
  const texts = entries.map((e) => norm(e.text));
  const need = Math.max(2, Math.ceil(entries.length / 2));
  const common: string[] = [];

  // Cụm từ dài nhất mà nhiều người cùng nói.
  for (let n = 12; n >= 1; n--) {
    for (const t of texts) {
      const tok = t.split(' ');
      for (let i = 0; i + n <= tok.length; i++) {
        const gram = tok.slice(i, i + n);
        if (STOP.has(gram[0]) || STOP.has(gram[n - 1])) continue;
        if (n === 1 && gram[0].length < 2) continue;
        const phrase = gram.join(' ');
        if (common.some((c) => ` ${c} `.includes(` ${phrase} `))) continue;
        const count = texts.filter((x) => ` ${x} `.includes(` ${phrase} `)).length;
        if (count >= need) common.push(phrase);
      }
    }
  }

  // Điểm riêng: phần mà chỉ một người nhắc tới, sau khi bỏ những từ người khác cũng dùng.
  const unique: { memberId: string; text: string }[] = [];
  entries.forEach((e, idx) => {
    const others = ` ${texts.filter((_, i) => i !== idx).join(' ')} `;
    const clauses = e.text
      .split(/[,;.]|\s+và\s+/)
      .map((c) => norm(c))
      .filter(Boolean);
    let taken = 0;
    for (const c of clauses) {
      const tok = c.split(' ');
      let run: string[] = [];
      const flush = () => {
        if (run.some((w) => !STOP.has(w)) && taken < 3) {
          unique.push({ memberId: e.memberId, text: run.join(' ') });
          taken++;
        }
        run = [];
      };
      tok.forEach((w, i) => {
        const fresh = !STOP.has(w) && w.length > 1 && !others.includes(` ${w} `);
        if (fresh) {
          // Giữ lại một từ nối đứng trước ("cho vui", "có tài trợ") để đọc cho tự nhiên.
          if (run.length === 0 && i > 0 && STOP.has(tok[i - 1])) run.push(tok[i - 1]);
          run.push(w);
        } else if (run.length > 0 && STOP.has(w) && i + 1 < tok.length) {
          run.push(w);
        } else {
          flush();
        }
      });
      flush();
    }
  });
  for (const u of unique) {
    const tok = u.text.split(' ');
    while (tok.length > 1 && STOP.has(tok[tok.length - 1])) tok.pop();
    u.text = tok.join(' ');
  }

  // Goal đề xuất: goal chứa nhiều điểm chung nhất (ngắn hơn thì ưu tiên).
  let best = entries[0]?.text ?? '';
  let bestScore = -1;
  entries.forEach((e, i) => {
    const score = common.filter((c) => ` ${texts[i]} `.includes(` ${c} `)).length * 100 - e.text.length / 100;
    if (score > bestScore) {
      bestScore = score;
      best = e.text;
    }
  });
  return { common: common.slice(0, 6), unique, proposed: best.trim() };
}

/* ---------- Gợi ý Milestone & WBS theo loại dự án ---------- */

export function detectType(goal: string): ProjectType {
  const g = goal.toLowerCase();
  if (/(tổ chức|giải |sự kiện|workshop|hội thảo|buổi |lễ |tiệc|cuộc thi|chuyến)/.test(g)) return 'event';
  if (/(app|ứng dụng|đồ án|website|web |phần mềm|báo cáo|luận|video|thiết kế|sản phẩm|bài tập)/.test(g)) return 'product';
  if (/(chiến dịch|quảng bá|gây quỹ|tuyển|bán |truyền thông|kêu gọi)/.test(g)) return 'campaign';
  return 'generic';
}

export const TYPE_LABEL: Record<ProjectType, string> = {
  event: 'Sự kiện',
  product: 'Sản phẩm / đồ án',
  campaign: 'Chiến dịch',
  generic: 'Dự án khác',
};

interface MsTemplate {
  name: string;
  doneWhen: string;
  tasks: string[];
}

const TEMPLATES: Record<ProjectType, MsTemplate[]> = {
  event: [
    {
      name: 'Được duyệt, đã có địa điểm',
      doneWhen: 'Người có quyền đã đồng ý và đã đặt được địa điểm',
      tasks: ['Viết kế hoạch 1 trang để xin duyệt', 'Đặt địa điểm'],
    },
    {
      name: 'Đủ người tham gia',
      doneWhen: 'Đủ số người / số đội đăng ký như goal',
      tasks: ['Làm poster hoặc bài đăng', 'Làm form đăng ký', 'Đăng thông báo và nhắc đăng ký'],
    },
    {
      name: 'Sẵn sàng',
      doneWhen: 'Có lịch chương trình, đủ người hỗ trợ và vật dụng',
      tasks: ['Lên lịch chương trình chi tiết', 'Mời người hỗ trợ chuyên môn', 'Mua và chuẩn bị vật dụng'],
    },
    {
      name: 'Tổ chức xong',
      doneWhen: 'Sự kiện diễn ra và đã tổng kết',
      tasks: ['Chuẩn bị hậu cần trong ngày', 'Chụp ảnh, đăng kết quả', 'Trực và xử lý sự cố'],
    },
  ],
  product: [
    {
      name: 'Rõ yêu cầu',
      doneWhen: 'Cả nhóm thống nhất danh sách yêu cầu / đề cương',
      tasks: ['Liệt kê yêu cầu và phạm vi', 'Phác thảo bố cục hoặc đề cương'],
    },
    {
      name: 'Có bản nháp đầu',
      doneWhen: 'Bản nháp chạy được / đọc được từ đầu tới cuối',
      tasks: ['Làm phần lõi', 'Làm phần giao diện / trình bày', 'Ghép các phần lại'],
    },
    {
      name: 'Đã thử và sửa',
      doneWhen: 'Người ngoài nhóm đã thử / đọc và các lỗi chính đã sửa',
      tasks: ['Nhờ người ngoài nhóm thử và góp ý', 'Sửa theo góp ý'],
    },
    {
      name: 'Nộp / ra mắt',
      doneWhen: 'Đã nộp hoặc công bố đúng hạn',
      tasks: ['Chuẩn bị bài thuyết trình hoặc hướng dẫn dùng', 'Kiểm tra lần cuối và nộp'],
    },
  ],
  campaign: [
    {
      name: 'Rõ thông điệp và kênh',
      doneWhen: 'Chốt 1 thông điệp chính, danh sách kênh và người phụ trách',
      tasks: ['Viết thông điệp chính', 'Chọn kênh và lên lịch đăng'],
    },
    {
      name: 'Đủ nội dung',
      doneWhen: 'Mọi bài đăng / tài liệu đã làm xong và được duyệt',
      tasks: ['Thiết kế hình ảnh', 'Viết nội dung các bài đăng', 'Duyệt nội dung'],
    },
    {
      name: 'Đang chạy',
      doneWhen: 'Đã đăng theo lịch và có số liệu đầu tiên',
      tasks: ['Đăng theo lịch', 'Trả lời bình luận, tin nhắn', 'Ghi lại số liệu mỗi tuần'],
    },
    {
      name: 'Đạt con số, đã tổng kết',
      doneWhen: 'Đạt con số trong goal hoặc biết rõ thiếu bao nhiêu',
      tasks: ['Tổng hợp kết quả', 'Cảm ơn và báo cáo cho người liên quan'],
    },
  ],
  generic: [
    {
      name: 'Rõ kế hoạch',
      doneWhen: 'Cả nhóm thống nhất việc cần làm và ai làm gì',
      tasks: ['Liệt kê những việc cần làm', 'Tìm hiểu thông tin còn thiếu'],
    },
    {
      name: 'Xong phần chính',
      doneWhen: 'Phần quan trọng nhất đã làm xong',
      tasks: ['Làm phần quan trọng nhất', 'Làm các phần hỗ trợ'],
    },
    {
      name: 'Đã kiểm tra',
      doneWhen: 'Đã rà lại toàn bộ và sửa các chỗ chưa ổn',
      tasks: ['Rà lại toàn bộ', 'Sửa các chỗ chưa ổn'],
    },
    {
      name: 'Hoàn thành',
      doneWhen: 'Goal đạt được và đã báo cho người liên quan',
      tasks: ['Hoàn thiện và bàn giao', 'Tổng kết, rút kinh nghiệm'],
    },
  ],
};

export function suggestPlan(
  type: ProjectType,
  id: () => string,
): { milestones: Milestone[]; tasks: BTask[] } {
  const milestones: Milestone[] = [];
  const tasks: BTask[] = [];
  const mk = (milestoneId: string, title: string): BTask => ({
    id: id(),
    milestoneId,
    title,
    doneWhen: '',
    assigneeId: null,
    deadline: '',
    status: 'suggested',
    byApp: true,
    comments: [],
    credit: [],
    stakeholderId: null,
    priority: 'mid',
  });
  for (const t of TEMPLATES[type]) {
    const m: Milestone = {
      id: id(),
      name: t.name,
      doneWhen: t.doneWhen,
      deadline: '',
      status: 'suggested',
      byApp: true,
      comments: [],
      credit: [],
    };
    milestones.push(m);
    for (const title of t.tasks) tasks.push(mk(m.id, title));
  }
  // Luôn có nhóm việc "Phối hợp nhóm".
  tasks.push(mk(COORD, 'Họp 15 phút mỗi tuần'));
  return { milestones, tasks };
}

/* ---------- Thứ tự ưu tiên (D-010) ---------- */

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Cao', mid: 'Vừa', low: 'Thấp' };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

/** Thứ tự đưa sang Kho việc: ưu tiên Cao trước, cùng mức thì Deadline sớm trước. */
export function byPriorityThenDeadline(a: BTask, b: BTask): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
}

/** Dựng thẻ Milestone / Task từ gợi ý của AI. Deadline vẫn do app tính (computeDeadlines). */
export function planFromAi(
  ai: {
    milestones: { name: string; done_when: string; tasks: { title: string; done_when: string }[] }[];
    coordination_tasks: string[];
  },
  id: () => string,
): { milestones: Milestone[]; tasks: BTask[] } {
  const milestones: Milestone[] = [];
  const tasks: BTask[] = [];
  const mk = (milestoneId: string, title: string, doneWhen: string): BTask => ({
    id: id(),
    milestoneId,
    title: title.trim().slice(0, 160),
    doneWhen: doneWhen.trim().slice(0, 240),
    assigneeId: null,
    deadline: '',
    status: 'suggested',
    byApp: true,
    comments: [],
    credit: [],
    stakeholderId: null,
    priority: 'mid',
  });
  for (const m of ai.milestones.slice(0, 5)) {
    if (!m.name.trim()) continue;
    const ms: Milestone = {
      id: id(),
      name: m.name.trim().slice(0, 120),
      doneWhen: m.done_when.trim().slice(0, 240),
      deadline: '',
      status: 'suggested',
      byApp: true,
      comments: [],
      credit: [],
    };
    milestones.push(ms);
    for (const t of m.tasks.slice(0, 5)) if (t.title.trim()) tasks.push(mk(ms.id, t.title, t.done_when));
  }
  const coord = ai.coordination_tasks.map((t) => t.trim()).filter(Boolean).slice(0, 2);
  for (const title of coord.length ? coord : ['Họp 15 phút mỗi tuần']) tasks.push(mk(COORD, title, ''));
  return { milestones, tasks };
}

/* ---------- Deadline: tính ngược từ ngày của goal ---------- */

export const BUFFER_RATIO = 0.12;

export function bufferDays(today: string, goalDate: string, milestoneCount: number): number {
  const d = daysBetween(today, goalDate);
  if (milestoneCount < 2 || d < 4) return 0;
  return Math.max(1, Math.round(d * BUFFER_RATIO));
}

function clampDate(date: string, min: string, max: string): string {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

/** Tính lại toàn bộ deadline. Sửa trực tiếp trên mảng truyền vào. */
export function computeDeadlines(milestones: Milestone[], tasks: BTask[], today: string, goalDate: string): void {
  const active = milestones.filter((m) => m.status !== 'removed');
  const n = active.length;
  const total = Math.max(daysBetween(today, goalDate), 0);
  const usable = total - bufferDays(today, goalDate, n);
  const weights = active.map((m) =>
    Math.max(1, tasks.filter((t) => t.milestoneId === m.id && t.status !== 'removed').length),
  );
  const sum = weights.reduce((a, b) => a + b, 0) || 1;

  let cum = 0;
  let prev = today;
  active.forEach((m, i) => {
    cum += weights[i];
    let date = i === n - 1 ? goalDate : addDays(today, Math.max(1, Math.round((usable * cum) / sum)));
    if (date <= prev && i < n - 1) date = addDays(prev, 1);
    if (date > goalDate) date = goalDate;
    m.deadline = date;

    const own = tasks.filter((t) => t.milestoneId === m.id && t.status !== 'removed');
    const span = Math.max(daysBetween(prev, date), 1);
    own.forEach((t, j) => {
      if (t.stakeholderId) {
        t.deadline = clampDate(addDays(date, -3), addDays(today, 1), date);
        return;
      }
      let d = Math.max(1, Math.round((span * (j + 1)) / own.length));
      if (d >= span && span > 1) d = span - 1;
      t.deadline = clampDate(addDays(prev, d), today, date);
    });
    prev = date;
  });
  for (const t of tasks) if (t.milestoneId === COORD) t.deadline = goalDate;
}

export interface ShiftResult {
  error?: string;
  warn?: string;
  milestones: Milestone[];
  tasks: BTask[];
}

/** Dời một milestone ◀ ▶; tự dời các deadline liên quan. Không sửa dữ liệu gốc. */
export function shiftMilestone(
  s: BrainstormSession,
  id: string,
  delta: number,
  today: string,
): ShiftResult {
  const milestones: Milestone[] = structuredClone(s.milestones);
  const tasks: BTask[] = structuredClone(s.tasks);
  const out: ShiftResult = { milestones, tasks };
  const goalDate = s.goalDate ?? today;
  const active = milestones.filter((m) => m.status !== 'removed');
  const idx = active.findIndex((m) => m.id === id);
  if (idx < 0) return { ...out, error: 'Không tìm thấy milestone.' };
  if (idx === active.length - 1) {
    return { ...out, error: 'Milestone cuối trùng ngày của goal. Muốn đổi thì đổi ngày của goal.' };
  }
  const m = active[idx];
  const next = addDays(m.deadline, delta);
  if (next <= today) return { ...out, error: 'Không thể sớm hơn ngày mai.' };
  if (idx > 0 && next <= active[idx - 1].deadline) return { ...out, error: 'Phải sau milestone đứng trước.' };

  const moveTasks = (milestone: Milestone, by: number) => {
    for (const t of tasks) {
      if (t.milestoneId === milestone.id) t.deadline = clampDate(addDays(t.deadline, by), today, milestone.deadline);
    }
  };
  m.deadline = next;
  moveTasks(m, delta);

  const pushed: string[] = [];
  for (let j = idx + 1; j < active.length; j++) {
    if (active[j].deadline > active[j - 1].deadline) break;
    if (j === active.length - 1) {
      return { ...out, error: `Vượt ngày của goal (${fmtShort(goalDate)}). Muốn lùi nữa thì đổi ngày của goal.` };
    }
    active[j].deadline = addDays(active[j - 1].deadline, 1);
    moveTasks(active[j], 1);
    pushed.push(active[j].name);
  }

  const buffer = bufferDays(today, goalDate, active.length);
  const lastBefore = active[active.length - 2];
  if (delta > 0 && lastBefore && buffer > 0 && lastBefore.deadline > addDays(goalDate, -buffer)) {
    out.warn =
      `Dời "${m.name}"` +
      (pushed.length ? ` làm ${pushed.map((p) => `"${p}"`).join(', ')} trễ theo và` : '') +
      ` ăn vào thời gian dự phòng trước ngày ${fmtShort(goalDate)}. Vẫn đổi?`;
  }
  return out;
}

export function shiftTask(s: BrainstormSession, id: string, delta: number, today: string): ShiftResult {
  const milestones: Milestone[] = structuredClone(s.milestones);
  const tasks: BTask[] = structuredClone(s.tasks);
  const out: ShiftResult = { milestones, tasks };
  const t = tasks.find((x) => x.id === id);
  if (!t) return { ...out, error: 'Không tìm thấy task.' };
  const m = milestones.find((x) => x.id === t.milestoneId);
  const next = addDays(t.deadline, delta);
  if (next < today) return { ...out, error: 'Không thể sớm hơn hôm nay.' };
  if (m && next > m.deadline) {
    return { ...out, error: `Task phải xong trước deadline của milestone (${fmtShort(m.deadline)}). Dời milestone trước.` };
  }
  t.deadline = next;
  return out;
}

/* ---------- Ghi chú → Task brief ---------- */

/** Gợi ý task phù hợp nhất cho một ghi chú (so từ khoá). */
export function suggestTaskForNote(note: Note, tasks: BTask[]): string | null {
  const words = norm(note.text)
    .split(' ')
    .filter((w) => !STOP.has(w) && w.length > 1);
  let best: string | null = null;
  let bestScore = 0;
  for (const t of tasks) {
    if (t.status === 'removed') continue;
    const title = ` ${norm(t.title)} `;
    const score = words.filter((w) => title.includes(` ${w} `)).length;
    if (score > bestScore) {
      bestScore = score;
      best = t.id;
    }
  }
  return best;
}

/* ---------- Stakeholder ---------- */

export const STAKEHOLDER_PROMPTS: { question: string; examples: Record<ProjectType, string[]> }[] = [
  {
    question: 'Ai phải đồng ý?',
    examples: {
      event: ['Thầy cô / Khoa / Đoàn', 'Ban quản lý địa điểm'],
      product: ['Giảng viên hướng dẫn', 'Người giao đề bài'],
      campaign: ['Người duyệt nội dung', 'Ban chủ nhiệm'],
      generic: ['Người duyệt kế hoạch'],
    },
  },
  {
    question: 'Ai cho mượn hoặc cho tiền?',
    examples: {
      event: ['Nhà tài trợ', 'Bên cho mượn thiết bị'],
      product: ['Bên cấp dữ liệu / công cụ'],
      campaign: ['Nhà tài trợ', 'Đối tác truyền thông'],
      generic: ['Người cấp kinh phí'],
    },
  },
  {
    question: 'Ai sẽ tham gia hoặc dùng?',
    examples: {
      event: ['Người tham gia', 'Khách mời'],
      product: ['Người dùng thử', 'Hội đồng chấm'],
      campaign: ['Nhóm đối tượng chính'],
      generic: ['Người nhận kết quả'],
    },
  },
  {
    question: 'Ai có thể bị ảnh hưởng?',
    examples: {
      event: ['Bảo vệ, y tế', 'Các lớp / nhóm dùng chung địa điểm'],
      product: ['Nhóm khác dùng chung tài nguyên'],
      campaign: ['Các câu lạc bộ khác'],
      generic: ['Người xung quanh bị ảnh hưởng'],
    },
  },
];

export type Quadrant = 'key' | 'satisfy' | 'inform' | 'monitor';

export const QUADRANT: Record<Quadrant, { label: string; advice: string }> = {
  key: { label: 'Quan trọng nhất', advice: 'Liên hệ thường xuyên' },
  satisfy: { label: 'Giữ hài lòng', advice: 'Báo ở các milestone lớn' },
  inform: { label: 'Thông báo đều', advice: 'Cập nhật định kỳ' },
  monitor: { label: 'Chỉ cần biết', advice: 'Báo khi có thay đổi lớn' },
};

export function quadrant(sh: Stakeholder): Quadrant | null {
  if (sh.canBlock === null || sh.cares === null) return null;
  if (sh.canBlock) return sh.cares ? 'key' : 'satisfy';
  return sh.cares ? 'inform' : 'monitor';
}

export const CONTACT_LABEL: Record<Stakeholder['contact'], string> = {
  none: 'Chưa liên hệ',
  contacted: 'Đã liên hệ',
  waiting: 'Đang chờ trả lời',
  agreed: 'Đã đồng ý',
  declined: 'Từ chối',
};

/** Mẫu tin nhắn: người phụ trách sửa rồi tự gửi (app không gửi thay). */
export function messageTemplate(s: BrainstormSession, sh: Stakeholder, senderName: string): string {
  const m = s.milestones.find((x) => x.id === sh.milestoneId);
  return [
    `Chào ${sh.name},`,
    '',
    `Em là ${senderName}, thay mặt nhóm ${s.name}.`,
    `Nhóm em đang chuẩn bị: ${s.goal}`,
    m
      ? `Để kịp mốc "${m.name}" (${fmtShort(m.deadline)}), nhóm em rất mong nhận được ý kiến / sự đồng ý của ${sh.name} trước ngày đó.`
      : `Nhóm em rất mong nhận được ý kiến của ${sh.name}.`,
    '',
    'Em cảm ơn ạ.',
  ].join('\n');
}

/** Nhắc tự động khi đang chờ trả lời quá lâu. */
export function stakeholderNudge(s: BrainstormSession, sh: Stakeholder, today: string): string | null {
  if (sh.contact !== 'waiting' && sh.contact !== 'contacted') return null;
  const last = sh.log[sh.log.length - 1];
  if (!last) return null;
  const waited = daysBetween(last.date, today);
  if (waited < 4) return null;
  const m = s.milestones.find((x) => x.id === sh.milestoneId);
  const left = m ? daysBetween(today, m.deadline) : null;
  return (
    `Đã ${waited} ngày ${sh.name} chưa trả lời` +
    (m && left !== null ? `, milestone "${m.name}" còn ${Math.max(left, 0)} ngày` : '') +
    '. Nhắn lại nhé?'
  );
}

/* ---------- Tổng kết dạng chữ (để copy) ---------- */

export function planText(s: BrainstormSession, nameOf: (id: string | null) => string): string {
  const lines: string[] = [];
  lines.push(`KẾ HOẠCH: ${s.name}`, '', `GOAL: ${s.goal}`, '');
  const ms = s.milestones.filter((m) => m.status !== 'removed');
  ms.forEach((m, i) => {
    lines.push(`${i + 1}. ${m.name} — deadline ${fmtShort(m.deadline)}`);
    lines.push(`   Xong khi: ${m.doneWhen}`);
    s.tasks
      .filter((t) => t.milestoneId === m.id && t.status !== 'removed')
      .forEach((t, j) => {
        lines.push(
          `   ${i + 1}.${j + 1} ${t.title} — ${nameOf(t.assigneeId)} — ${fmtShort(t.deadline)} — ưu tiên ${PRIORITY_LABEL[t.priority].toLowerCase()}`,
        );
      });
  });
  const coord = s.tasks.filter((t) => t.milestoneId === COORD && t.status !== 'removed');
  if (coord.length) {
    lines.push(`${ms.length + 1}. Phối hợp nhóm`);
    coord.forEach((t, j) => lines.push(`   ${ms.length + 1}.${j + 1} ${t.title} — ${nameOf(t.assigneeId)}`));
  }
  if (s.stakeholders.length) {
    lines.push('', 'STAKEHOLDER:');
    for (const sh of s.stakeholders) {
      const q = quadrant(sh);
      lines.push(
        `- ${sh.name}${q ? ` (${QUADRANT[q].label})` : ''} — phụ trách: ${nameOf(sh.ownerId)} — ${CONTACT_LABEL[sh.contact]}`,
      );
    }
  }
  const general = s.notes.filter((n) => n.status === 'approved' && !n.taskId);
  if (general.length) {
    lines.push('', 'GHI CHÚ CHUNG:');
    for (const n of general) lines.push(`- ${n.text} — ${nameOf(n.authorId)}`);
  }
  return lines.join('\n');
}
