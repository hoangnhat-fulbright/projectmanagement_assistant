/*
 * Lớp nối với máy chủ khi app chạy trên mạng (đăng nhập + dữ liệu dùng chung).
 * Wiki: tech/architecture ("Bản trên mạng"). Hai bản cài đặt: supabase.ts (thật) và fake.ts (để thử trên một máy).
 */
import type { Role, State } from '../types';

/** Phần trạng thái mọi người trong dự án dùng chung. Các trường còn lại của State là của riêng từng máy. */
export type SharedState = Omit<State, 'currentMemberId' | 'tipsSeen' | 'dayOffset'>;

export interface Session {
  userId: string;
  email: string;
}

export interface ProjectRef {
  id: string;
  name: string;
  role: Role;
  /** id của người này trong `state.members`. */
  memberId: string;
}

export type BackendErrorCode =
  | 'rate_limited'
  | 'bad_code'
  | 'bad_invite'
  | 'forbidden'
  | 'not_found'
  | 'network'
  | 'unknown';

export class BackendError extends Error {
  code: BackendErrorCode;
  constructor(code: BackendErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

export interface Backend {
  getSession(): Promise<Session | null>;
  /** Gọi lại mỗi khi đăng nhập / đăng xuất. Trả về hàm huỷ. */
  onAuthChange(cb: (s: Session | null) => void): () => void;
  /** Gửi mã (và link) đăng nhập tới email. Người mới được tạo tài khoản tự động. */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<Session>;
  signOut(): Promise<void>;
  accessToken(): Promise<string | null>;

  listProjects(): Promise<ProjectRef[]>;
  /** Người gọi thành nhóm trưởng. `memberId` là id của họ trong `data.members`. */
  createProject(name: string, data: SharedState, memberId: string): Promise<{ id: string; version: number }>;
  /** Vào dự án bằng mã mời; vai trò do loại mã quyết định. */
  joinProject(code: string, displayName: string): Promise<{ id: string }>;

  loadState(projectId: string): Promise<{ data: SharedState; version: number }>;
  /** Lưu nếu `version` còn khớp. Trả về phiên bản mới, hoặc -1 nếu người khác đã lưu trước. */
  saveState(projectId: string, version: number, data: SharedState): Promise<number>;
  /** Báo khi dữ liệu dự án đổi trên máy chủ. Trả về hàm huỷ. */
  subscribe(projectId: string, onChange: () => void): () => void;

  /** Chỉ nhóm trưởng. */
  invites(projectId: string): Promise<{ member: string; observer: string }>;
  setMemberRole(projectId: string, memberId: string, role: Exclude<Role, 'owner'>): Promise<void>;
  removeMember(projectId: string, memberId: string): Promise<void>;
}
