/*
 * Nối với Supabase: đăng nhập bằng mã gửi qua email, dữ liệu dự án trong Postgres (xem supabase/schema.sql).
 * Trình duyệt chỉ giữ khoá "publishable"; quyền đọc / ghi do Row Level Security và các hàm RPC quyết định.
 */
import { createClient, type Session as SbSession } from '@supabase/supabase-js';
import type { Role } from '../types';
import { BackendError, type Backend, type BackendErrorCode, type ProjectRef, type Session, type SharedState } from './types';

interface ErrLike {
  message?: string;
  status?: number;
  code?: string;
}

function toError(e: unknown): BackendError {
  if (e instanceof BackendError) return e;
  const err = (e ?? {}) as ErrLike;
  const msg = (err.message ?? '').toLowerCase();
  let code: BackendErrorCode = 'unknown';
  if (err.status === 429 || msg.includes('rate limit') || (err.code ?? '').includes('rate_limit')) code = 'rate_limited';
  else if (msg.includes('bad_invite')) code = 'bad_invite';
  else if (msg.includes('not_found')) code = 'not_found';
  else if (msg.includes('unauthenticated')) code = 'forbidden';
  else if (msg.includes('forbidden') || err.code === '42501') code = 'forbidden';
  else if (err.code === 'otp_expired' || msg.includes('token has expired') || msg.includes('invalid')) code = 'bad_code';
  else if (e instanceof TypeError || msg.includes('failed to fetch') || msg.includes('network')) code = 'network';
  return new BackendError(code, err.message);
}

const toSession = (s: SbSession | null): Session | null =>
  s?.user ? { userId: s.user.id, email: s.user.email ?? '' } : null;

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw toError(error);
    return data as T;
  }

  return {
    async getSession() {
      const { data, error } = await sb.auth.getSession();
      if (error) throw toError(error);
      return toSession(data.session);
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      });
      if (error) throw toError(error);
    },

    async verifyCode(email, code) {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw new BackendError('bad_code', error.message);
      const session = toSession(data.session);
      if (!session) throw new BackendError('bad_code');
      return session;
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async accessToken() {
      const { data } = await sb.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async listProjects() {
      const rows = await rpc<{ project_id: string; name: string; role: Role; member_id: string }[]>('my_projects', {});
      return (rows ?? []).map((r): ProjectRef => ({ id: r.project_id, name: r.name, role: r.role, memberId: r.member_id }));
    },

    async createProject(name, data, memberId) {
      const res = await rpc<{ project_id: string; version: number }>('create_project', {
        p_name: name,
        p_state: data,
        p_member_id: memberId,
      });
      return { id: res.project_id, version: Number(res.version) };
    },

    async joinProject(code, displayName) {
      const res = await rpc<{ project_id: string }>('join_project', { p_code: code, p_name: displayName });
      return { id: res.project_id };
    },

    async loadState(projectId) {
      const { data, error } = await sb
        .from('project_state')
        .select('data, version')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw toError(error);
      // Không thấy dòng nào = không còn là thành viên (RLS ẩn dữ liệu) hoặc dự án đã bị xoá.
      if (!data) throw new BackendError('not_found');
      return { data: data.data as SharedState, version: Number(data.version) };
    },

    async saveState(projectId, version, data) {
      return Number(await rpc<number>('save_state', { p_project: projectId, p_version: version, p_data: data }));
    },

    subscribe(projectId, onChange) {
      const channel = sb
        .channel(`project-state:${projectId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'project_state', filter: `project_id=eq.${projectId}` },
          () => onChange(),
        )
        .subscribe();
      return () => void sb.removeChannel(channel);
    },

    invites(projectId) {
      return rpc<{ member: string; observer: string }>('project_invites', { p_project: projectId });
    },

    async setMemberRole(projectId, memberId, role) {
      await rpc('set_member_role', { p_project: projectId, p_member_id: memberId, p_role: role });
    },

    async removeMember(projectId, memberId) {
      await rpc('remove_member', { p_project: projectId, p_member_id: memberId });
    },
  };
}
