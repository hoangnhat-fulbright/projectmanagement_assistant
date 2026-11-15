/*
 * Máy chủ độc lập cho /api/ai (dùng khi không chạy qua Vite dev / preview và không dùng Vercel).
 * Chạy: npm run server   — đọc khoá từ biến môi trường hoặc file .env cạnh package.json.
 * Chỉ nghe trên 127.0.0.1; khi triển khai thật cần đặt sau một reverse proxy có xác thực.
 */
import { createServer } from 'node:http';
import { aiEnabled, createAiMiddleware } from '../api/ai.ts';

const PORT = Number(process.env.AI_PORT ?? 8787);
const handle = createAiMiddleware();

createServer((req, res) => {
  handle(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[ai] http://127.0.0.1:${PORT}/api/ai?do=status — ${aiEnabled() ? 'đã có khoá' : 'CHƯA có khoá (app sẽ dùng luật có sẵn)'}`);
});
