import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createAiMiddleware } from './api/ai';

/** Gắn /api/ai vào chính máy chủ Vite (dev và preview): khoá API nằm ở phía máy chủ, không vào bundle. */
function aiApi(): Plugin {
  return {
    name: 'ai-api',
    configureServer(server) {
      server.middlewares.use(createAiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAiMiddleware());
    },
  };
}

export default defineConfig(({ mode }) => {
  // Đọc khoá từ app/.env (không có tiền tố VITE_ nên không bao giờ lộ ra trình duyệt).
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  // Các biến Supabase (nếu có) bật kiểm tra đăng nhập và hạn mức cho phần AI, giống bản chạy trên Vercel.
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), aiApi()],
    server: { port: 5173, strictPort: true },
  };
});
