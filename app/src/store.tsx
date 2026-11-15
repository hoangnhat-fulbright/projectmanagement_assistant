import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Item, Member, Role, Sprint, State } from './types';
import { BackendError, type Backend, type ProjectRef, type SharedState } from './backend';
import { daysBetween, toISO } from './lib/dates';

const KEY = 'tro-ly-tuan:v1';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyState(): State {
  return {
    version: 1,
    onboarded: false,
    settings: {
      company: '',
      industry: 'other',
      field: '',
      guideline: '',
      references: [],
      bigGoal: '',
      checkinHour: 9,
      reviewHour: 16,
      dod: [],
    },
    members: [],
    currentMemberId: '',
    items: [],
    sprints: [],
    checkins: [],
    impediments: [],
    retro: [],
    improvements: [],
    tipsSeen: [],
    weekDraft: [],
    dayOffset: 0,
    polls: [],
    responses: [],
    weekly: [],
    meetings: [],
    brainstorm: null,
  };
}

/** Bổ sung các trường mà dữ liệu lưu từ bản cũ chưa có. Dùng cho cả bản một máy và bản trên mạng. */
export function normalize(parsed: State): State {
  const state = { ...emptyState(), ...parsed };
  state.settings = { ...emptyState().settings, ...parsed.settings };
  state.members = state.members.map((m, i) => ({
    ...m,
    code: m.code ?? memberCode(i),
    background: m.background ?? '',
    cvName: m.cvName ?? null,
  }));
  state.items = state.items.map((i) => ({
    ...i,
    deadline: i.deadline ?? null,
    priority: i.priority ?? null,
    submission: i.submission ?? null,
    returned: i.returned ?? null,
    returnCount: i.returnCount ?? 0,
  }));
  if (state.brainstorm) {
    state.brainstorm = {
      ...state.brainstorm,
      common: state.brainstorm.common ?? [],
      proposed: state.brainstorm.proposed ?? '',
      smart: state.brainstorm.smart ?? null,
      stakeholderHints: state.brainstorm.stakeholderHints ?? null,
      aiUsed: state.brainstorm.aiUsed ?? { common: false, smart: false, plan: false },
      entry: state.brainstorm.entry ?? 'goal',
      prompt: state.brainstorm.prompt ?? '',
      smartSkipped: state.brainstorm.smartSkipped ?? false,
      tasks: state.brainstorm.tasks.map((t) => ({ ...t, priority: t.priority ?? 'mid' })),
    };
  }
  scrubPolls(state);
  return state;
}

/**
 * Lần tìm giờ họp còn mở chỉ chờ những người đang nhận việc trong đội: người quan sát không trả lời được,
 * người đã rời đội thì không còn ai để chờ. Sửa thẳng vào `state`.
 */
export function scrubPolls(state: State): void {
  const active = new Set(state.members.filter((m) => m.role !== 'observer').map((m) => m.id));
  for (const p of state.polls ?? []) {
    if (p.status === 'confirmed' || p.status === 'cancelled') continue;
    if (p.inviteeIds.every((id) => active.has(id))) continue;
    p.inviteeIds = p.inviteeIds.filter((id) => active.has(id));
    p.requiredIds = p.requiredIds.filter((id) => active.has(id));
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed && parsed.version === 1) return normalize(parsed);
    }
  } catch {
    // Không đọc được bộ nhớ trình duyệt → bắt đầu mới.
  }
  return emptyState();
}

interface Store {
  state: State;
  /** Sửa dữ liệu. Bị bỏ qua khi người đang dùng là Observer (chỉ xem). */
  set: (fn: (draft: State) => void) => void;
  /** Đổi người đang dùng app (mô phỏng đăng nhập). Không bị chặn bởi chế độ chỉ xem. */
  switchUser: (memberId: string) => void;
  /** Tăng lên mỗi lần Observer thử sửa — để giao diện báo "chỉ xem". */
  blocked: number;
  reset: () => void;
  /** Có giá trị khi app chạy trên mạng (đã đăng nhập, dữ liệu dùng chung); null ở bản một máy. */
  cloud: CloudInfo | null;
}

export type SyncState = 'saved' | 'saving' | 'error';

export interface CloudInfo {
  project: ProjectRef;
  email: string;
  sync: SyncState;
  backend: Backend;
  /** Tải lại dữ liệu từ máy chủ (sau khi đổi vai trò, xoá thành viên…). */
  refresh: () => Promise<void>;
  /** Về màn chọn dự án. */
  leave: () => void;
  signOut: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);

  const [blocked, setBlocked] = useState(0);
  const latest = useRef(state);
  latest.current = state;

  const set = useCallback((fn: (draft: State) => void) => {
    // Observer thấy hết nhưng không sửa được gì: chặn ở một chỗ duy nhất.
    if (isObserver(latest.current)) {
      setBlocked((n) => n + 1);
      return;
    }
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const switchUser = useCallback((memberId: string) => {
    setState((prev) => (prev.members.some((m) => m.id === memberId) ? { ...prev, currentMemberId: memberId } : prev));
  }, []);

  const reset = useCallback(() => setState(emptyState()), []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Bộ nhớ đầy hoặc bị chặn: app vẫn chạy, chỉ không lưu được.
    }
  }, [state]);

  const value = useMemo(
    () => ({ state, set, switchUser, blocked, reset, cloud: null }),
    [state, set, switchUser, blocked, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------- Bản trên mạng: dữ liệu dùng chung, đồng bộ với máy chủ ---------- */

export function toShared(state: State): SharedState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { currentMemberId, tipsSeen, dayOffset, ...shared } = state;
  return shared;
}

const tipsKey = (userId: string) => `tro-ly-tuan:tips:${userId}`;

function loadTips(userId: string): string[] {
  try {
    const raw = localStorage.getItem(tipsKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

type Updater = (draft: State) => void;

/**
 * Kho trạng thái khi app chạy trên mạng.
 * - Mỗi thay đổi áp dụng ngay trên máy, rồi gửi lên máy chủ sau một nhịp ngắn.
 * - Nếu người khác đã lưu trước (xung đột), tải bản mới nhất rồi áp dụng lại các thay đổi đang chờ lên trên.
 * - Observer không sửa được (máy chủ cũng từ chối).
 */
export function CloudStoreProvider({
  backend,
  userId,
  email,
  project,
  initial,
  onLeave,
  onSignOut,
  children,
}: {
  backend: Backend;
  userId: string;
  email: string;
  project: ProjectRef;
  initial: { data: SharedState; version: number };
  onLeave: (lostAccess?: boolean) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const compose = useCallback(
    (shared: SharedState, tips: string[]): State =>
      normalize({ ...(shared as State), currentMemberId: project.memberId, tipsSeen: tips, dayOffset: 0 }),
    [project.memberId],
  );
  const [state, setState] = useState<State>(() => compose(initial.data, loadTips(userId)));
  const [sync, setSync] = useState<SyncState>('saved');
  const [blocked, setBlocked] = useState(0);
  const box = useRef({
    state,
    version: initial.version,
    pending: [] as Updater[],
    saving: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    dead: false,
  });

  const apply = useCallback((next: State) => {
    box.current.state = next;
    setState(next);
  }, []);

  const flush = useCallback(async () => {
    const r = box.current;
    if (r.saving || r.dead || r.pending.length === 0) return;
    r.saving = true;
    setSync('saving');
    try {
      while (r.pending.length > 0 && !r.dead) {
        const count = r.pending.length;
        const v = await backend.saveState(project.id, r.version, toShared(r.state));
        if (v >= 0) {
          r.version = v;
          r.pending.splice(0, count);
          continue;
        }
        // Người khác đã lưu trước: lấy bản mới nhất rồi áp dụng lại thay đổi của mình lên trên.
        const latest = await backend.loadState(project.id);
        const draft = structuredClone(compose(latest.data, r.state.tipsSeen));
        for (const fn of r.pending) {
          try {
            fn(draft);
          } catch {
            // Thay đổi không còn áp dụng được (ví dụ việc đã bị xoá) → bỏ qua.
          }
        }
        draft.currentMemberId = project.memberId;
        draft.dayOffset = 0;
        r.version = latest.version;
        apply(draft);
      }
      setSync('saved');
    } catch (err) {
      setSync('error');
      const code = err instanceof BackendError ? err.code : 'unknown';
      if (code === 'forbidden' || code === 'not_found') {
        // Bị đổi thành người quan sát hoặc bị xoá khỏi dự án: bỏ thay đổi đang chờ, tải lại.
        r.pending.length = 0;
        try {
          const latest = await backend.loadState(project.id);
          r.version = latest.version;
          apply(compose(latest.data, r.state.tipsSeen));
          setSync('saved');
        } catch {
          r.dead = true;
          onLeave(true);
        }
      } else {
        r.timer = setTimeout(() => void flush(), 5000);
      }
    } finally {
      r.saving = false;
    }
  }, [apply, backend, compose, onLeave, project.id, project.memberId]);

  const refresh = useCallback(async () => {
    const r = box.current;
    if (r.dead || r.saving || r.pending.length > 0) return;
    try {
      const latest = await backend.loadState(project.id);
      // Trong lúc chờ mà có thay đổi mới thì để lần lưu kế tiếp tự xử lý xung đột.
      if (r.saving || r.pending.length > 0 || latest.version <= r.version) return;
      r.version = latest.version;
      apply(compose(latest.data, r.state.tipsSeen));
    } catch (err) {
      if (err instanceof BackendError && (err.code === 'not_found' || err.code === 'forbidden')) {
        r.dead = true;
        onLeave(true);
      }
    }
  }, [apply, backend, compose, onLeave, project.id]);

  useEffect(() => {
    const r = box.current;
    r.dead = false;
    const off = backend.subscribe(project.id, () => void refresh());
    const onFocus = () => document.visibilityState === 'visible' && void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    // Lưới an toàn khi kênh realtime chưa bật: hỏi lại máy chủ định kỳ.
    const poll = setInterval(() => void refresh(), 15000);
    return () => {
      r.dead = true;
      off();
      clearInterval(poll);
      clearTimeout(r.timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [backend, project.id, refresh]);

  const set = useCallback(
    (fn: Updater) => {
      const r = box.current;
      if (isObserver(r.state)) {
        setBlocked((n) => n + 1);
        return;
      }
      const draft = structuredClone(r.state);
      fn(draft);
      draft.currentMemberId = project.memberId;
      draft.dayOffset = 0;
      if (JSON.stringify(draft.tipsSeen) !== JSON.stringify(r.state.tipsSeen)) {
        try {
          localStorage.setItem(tipsKey(userId), JSON.stringify(draft.tipsSeen));
        } catch {
          // Không lưu được gợi ý đã xem: không ảnh hưởng dữ liệu chung.
        }
      }
      const changed = JSON.stringify(toShared(draft)) !== JSON.stringify(toShared(r.state));
      apply(draft);
      if (!changed) return;
      r.pending.push(fn);
      setSync('saving');
      clearTimeout(r.timer);
      r.timer = setTimeout(() => void flush(), 500);
    },
    [apply, flush, project.memberId, userId],
  );

  const switchUser = useCallback(() => {}, []);
  const reset = useCallback(() => {}, []);
  const leave = useCallback(() => onLeave(false), [onLeave]);

  const value = useMemo<Store>(
    () => ({
      state,
      set,
      switchUser,
      blocked,
      reset,
      cloud: { project, email, sync, backend, refresh, leave, signOut: onSignOut },
    }),
    [state, set, switchUser, blocked, reset, project, email, sync, backend, refresh, leave, onSignOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

/* ---------- Bộ chọn (selectors) ---------- */

export function todayISO(state: State): string {
  const d = new Date();
  d.setDate(d.getDate() + state.dayOffset);
  return toISO(d);
}

export function me(state: State): Member {
  return state.members.find((m) => m.id === state.currentMemberId) ?? state.members[0];
}

/** Team Lead (nhóm trưởng). */
export function owner(state: State): Member {
  return state.members.find((m) => m.role === 'owner') ?? state.members[0];
}

export function isLead(state: State): boolean {
  return state.onboarded && me(state)?.role === 'owner';
}

export function isObserver(state: State): boolean {
  return state.onboarded && me(state)?.role === 'observer';
}

/** Người đang dùng có được sửa dữ liệu không (Observer thì không). */
export function canEdit(state: State): boolean {
  return !isObserver(state);
}

/** Những người nhận việc được: Team Lead và Member, không gồm Observer. */
export function workers(state: State): Member[] {
  return state.members.filter((m) => m.role !== 'observer');
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Nhóm trưởng',
  member: 'Thành viên',
  observer: 'Người quan sát',
};

export const ROLE_EN: Record<Role, string> = {
  owner: 'Team Lead',
  member: 'Member',
  observer: 'Observer',
};

export function memberCode(index: number): string {
  return `TV-${String(index + 1).padStart(2, '0')}`;
}

export function newMember(state: State, name: string, role: Role, extra: Partial<Member> = {}): Member {
  return { id: uid(), code: memberCode(state.members.length), name: name.trim(), role, background: '', cvName: null, ...extra };
}

/** Số ngày từ hôm nay đến Deadline; âm = đã quá hạn; null = việc không có Deadline. */
export function daysLeft(state: State, deadline: string | null): number | null {
  if (!deadline) return null;
  return daysBetween(todayISO(state), deadline);
}

export type DueTone = 'calm' | 'soon' | 'today' | 'late';

/** Nhãn "Còn N ngày" trên thẻ việc. Wiki: features/sprint-board. */
export function dueLabel(state: State, item: Pick<Item, 'deadline' | 'status'>): { text: string; tone: DueTone } | null {
  if (item.status === 'done') return null;
  const n = daysLeft(state, item.deadline);
  if (n === null) return null;
  if (n < 0) return { text: `Quá hạn ${-n} ngày`, tone: 'late' };
  if (n === 0) return { text: 'Hết hạn hôm nay', tone: 'today' };
  return { text: `Còn ${n} ngày`, tone: n <= 3 ? 'soon' : 'calm' };
}

export function memberName(state: State, id: string | null): string {
  if (!id) return 'Chưa ai nhận';
  return state.members.find((m) => m.id === id)?.name ?? 'Đã rời đội';
}

/** Tuần đang mở (chưa đóng), nếu có. */
export function currentSprint(state: State): Sprint | null {
  const last = state.sprints[state.sprints.length - 1];
  return last && last.state !== 'closed' ? last : null;
}

export function lastClosedSprint(state: State): Sprint | null {
  for (let i = state.sprints.length - 1; i >= 0; i--) {
    if (state.sprints[i].state === 'closed') return state.sprints[i];
  }
  return null;
}

export function sprintItems(state: State, sprintId: string): Item[] {
  return state.items.filter((i) => i.sprintId === sprintId);
}

/** Kho việc: việc chưa thuộc tuần nào, theo thứ tự ưu tiên. */
export function backlog(state: State): Item[] {
  return state.items.filter((i) => i.sprintId === null);
}

/** Đã tới lúc xem kết quả chưa (hết ngày cuối, hoặc ngày cuối sau giờ tổng kết). */
export function isDue(state: State, sprint: Sprint): boolean {
  const today = todayISO(state);
  if (today > sprint.end) return true;
  return today === sprint.end && new Date().getHours() >= state.settings.reviewHour;
}

/** Sức chứa gợi ý: trung bình số việc xong 3 tuần gần nhất; tuần đầu gợi ý theo số người. */
export function capacity(state: State): { value: number; fromHistory: boolean } {
  const closed = state.sprints.filter((s) => s.state === 'closed').slice(-3);
  if (closed.length > 0) {
    const avg = closed.reduce((a, s) => a + s.doneCount, 0) / closed.length;
    return { value: Math.max(1, Math.round(avg)), fromHistory: true };
  }
  return { value: Math.max(3, workers(state).length * 3), fromHistory: false };
}

export function newItem(title: string, extra: Partial<Item> = {}): Item {
  return {
    id: uid(),
    title: title.trim(),
    note: '',
    size: null,
    clear: false,
    bigGoal: false,
    sprintId: null,
    status: 'todo',
    assigneeId: null,
    forSprintGoal: false,
    steps: [],
    stuck: false,
    urgentAdd: false,
    carried: false,
    deadline: null,
    priority: null,
    submission: null,
    returned: null,
    returnCount: 0,
    ...extra,
  };
}

export function openImpediments(state: State, sprintId: string) {
  return state.impediments.filter((i) => i.sprintId === sprintId && !i.resolvedAt);
}

export function checkedInToday(state: State, memberId: string): boolean {
  const today = todayISO(state);
  return state.checkins.some((c) => c.memberId === memberId && c.date === today);
}
