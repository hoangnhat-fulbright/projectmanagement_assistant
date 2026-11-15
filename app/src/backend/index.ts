import type { Backend } from './types';

export * from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
const fake = import.meta.env.VITE_BACKEND === 'fake';

/**
 * true = bản trên mạng: phải đăng nhập, dữ liệu nằm trên máy chủ và dùng chung trong dự án.
 * false = bản dựng thử trên một máy (dữ liệu trong localStorage, đổi người bằng ô chọn).
 */
export const CLOUD = Boolean(fake || (url && key));

let backend: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (!CLOUD) return Promise.reject(new Error('Chưa cấu hình máy chủ'));
  backend ??= fake
    ? import('./fake').then((m) => m.createFakeBackend())
    : import('./supabase').then((m) => m.createSupabaseBackend(url!, key!));
  return backend;
}

let aiProjectId: string | null = null;

/** Dự án đang mở — phần AI gửi kèm để máy chủ kiểm tra quyền và đếm lượt. */
export function setAiProject(id: string | null): void {
  aiProjectId = id;
}

/** Thông tin phần AI phải gửi kèm khi app chạy trên mạng; null ở bản một máy hoặc khi chưa mở dự án. */
export async function aiAuth(): Promise<{ token: string; projectId: string } | null> {
  if (!CLOUD || fake || !aiProjectId) return null;
  const token = await (await getBackend()).accessToken();
  return token ? { token, projectId: aiProjectId } : null;
}
