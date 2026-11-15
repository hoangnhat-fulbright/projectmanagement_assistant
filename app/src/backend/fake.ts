/*
 * Máy chủ giả để thử luồng đăng nhập và đồng bộ trên MỘT máy, không cần Supabase.
 * Bật bằng VITE_BACKEND=fake. "Máy chủ" là một mục trong localStorage (mọi tab cùng thấy);
 * phiên đăng nhập nằm trong sessionStorage (mỗi tab là một người khác nhau được).
 * Mã đăng nhập luôn là 123456. KHÔNG dùng cho bản đưa lên mạng.
 */
import type { Member, Role } from '../types';
import { BackendError, type Backend, type ProjectRef, type Session, type SharedState } from './types';

const DB_KEY = 'fake-backend:v1';
const SESSION_KEY = 'fake-backend:session';
export const FAKE_CODE = '123456';

interface FakeProject {
  id: string;
  name: string;
  inviteMember: string;
  inviteObserver: string;
  members: { userId: string; memberId: string; role: Role }[];
  data: SharedState;
  version: number;
}

interface Db {
  users: Record<string, string>;
  projects: FakeProject[];
}

const rid = (n = 12) =>
  Array.from({ length: n }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
const invite = () => rid(8).toUpperCase();

function read(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // hỏng dữ liệu thử → bắt đầu lại
  }
  return { users: {}, projects: [] };
}

function write(db: Db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

/** Giả lập độ trễ mạng để thấy được trạng thái "đang lưu". */
const lag = () => new Promise((r) => setTimeout(r, 120));

export function createFakeBackend(): Backend {
  const listeners = new Set<(s: Session | null) => void>();

  const session = (): Session | null => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  };
  const need = (): Session => {
    const s = session();
    if (!s) throw new BackendError('forbidden');
    return s;
  };
  const project = (db: Db, id: string, userId: string) => {
    const p = db.projects.find((x) => x.id === id);
    const m = p?.members.find((x) => x.userId === userId);
    if (!p || !m) throw new BackendError('not_found');
    return { p, m };
  };

  return {
    async getSession() {
      return session();
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    async sendCode() {
      await lag();
    },
    async verifyCode(email, code) {
      await lag();
      if (code !== FAKE_CODE) throw new BackendError('bad_code');
      const db = read();
      const key = email.trim().toLowerCase();
      db.users[key] ??= rid();
      write(db);
      const s: Session = { userId: db.users[key], email: key };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      listeners.forEach((l) => l(s));
      return s;
    },
    async signOut() {
      sessionStorage.removeItem(SESSION_KEY);
      listeners.forEach((l) => l(null));
    },
    async accessToken() {
      return session() ? 'fake-token' : null;
    },

    async listProjects() {
      await lag();
      const me = need();
      return read()
        .projects.filter((p) => p.members.some((m) => m.userId === me.userId))
        .map((p): ProjectRef => {
          const m = p.members.find((x) => x.userId === me.userId)!;
          return { id: p.id, name: p.name, role: m.role, memberId: m.memberId };
        });
    },
    async createProject(name, data, memberId) {
      await lag();
      const me = need();
      const db = read();
      const p: FakeProject = {
        id: rid(),
        name,
        inviteMember: invite(),
        inviteObserver: invite(),
        members: [{ userId: me.userId, memberId, role: 'owner' }],
        data,
        version: 1,
      };
      db.projects.push(p);
      write(db);
      return { id: p.id, version: 1 };
    },
    async joinProject(code, displayName) {
      await lag();
      const me = need();
      const db = read();
      const c = code.replace(/\s/g, '').toUpperCase();
      const p = db.projects.find((x) => x.inviteMember === c || x.inviteObserver === c);
      if (!p) throw new BackendError('bad_invite');
      if (!p.members.some((m) => m.userId === me.userId)) {
        const role: Role = p.inviteObserver === c ? 'observer' : 'member';
        const next = Math.max(0, ...p.data.members.map((m) => Number(m.code.replace(/\D/g, '')) || 0)) + 1;
        const member: Member = {
          id: rid(),
          code: `TV-${String(next).padStart(2, '0')}`,
          name: displayName.trim(),
          role,
          background: '',
          cvName: null,
        };
        p.data.members.push(member);
        p.members.push({ userId: me.userId, memberId: member.id, role });
        p.version += 1;
        write(db);
      }
      return { id: p.id };
    },

    async loadState(projectId) {
      await lag();
      const { p } = project(read(), projectId, need().userId);
      return { data: p.data, version: p.version };
    },
    async saveState(projectId, version, data) {
      await lag();
      const db = read();
      const { p, m } = project(db, projectId, need().userId);
      if (m.role === 'observer') throw new BackendError('forbidden');
      if (p.version !== version) return -1;
      p.data = data;
      p.version += 1;
      // Như máy chủ thật: nhóm trưởng đổi tên dự án trong app thì tên ở danh sách dự án đổi theo.
      const renamed = (data.settings?.company ?? '').trim().slice(0, 120);
      if (m.role === 'owner' && renamed) p.name = renamed;
      write(db);
      return p.version;
    },
    subscribe(projectId, onChange) {
      // Sự kiện "storage" chỉ bắn ở các tab KHÁC tab vừa ghi — đúng như thay đổi từ người khác.
      const on = (e: StorageEvent) => e.key === DB_KEY && onChange();
      window.addEventListener('storage', on);
      void projectId;
      return () => window.removeEventListener('storage', on);
    },

    async invites(projectId) {
      const { p, m } = project(read(), projectId, need().userId);
      if (m.role !== 'owner') throw new BackendError('forbidden');
      return { member: p.inviteMember, observer: p.inviteObserver };
    },
    async setMemberRole(projectId, memberId, role) {
      await lag();
      const db = read();
      const { p, m } = project(db, projectId, need().userId);
      const target = p.members.find((x) => x.memberId === memberId);
      if (m.role !== 'owner' || !target || target.role === 'owner') throw new BackendError('forbidden');
      target.role = role;
      const doc = p.data.members.find((x) => x.id === memberId);
      if (doc) doc.role = role;
      if (role === 'observer') {
        for (const it of p.data.items) if (it.assigneeId === memberId && it.status !== 'done') it.assigneeId = null;
      }
      p.version += 1;
      write(db);
    },
    async removeMember(projectId, memberId) {
      await lag();
      const db = read();
      const { p, m } = project(db, projectId, need().userId);
      const target = p.members.find((x) => x.memberId === memberId);
      if (m.role !== 'owner' || !target || target.role === 'owner') throw new BackendError('forbidden');
      p.members = p.members.filter((x) => x.memberId !== memberId);
      p.data.members = p.data.members.filter((x) => x.id !== memberId);
      for (const it of p.data.items) if (it.assigneeId === memberId) it.assigneeId = null;
      p.version += 1;
      write(db);
    },
  };
}
