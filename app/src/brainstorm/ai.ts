/*
 * Phía trình duyệt của phần AI: chỉ gọi /api/ai trên máy chủ của app (api/ai.ts).
 * Khoá API nằm ở máy chủ. Khi AI tắt hoặc lỗi, nơi gọi tự quay về luật có sẵn trong logic.ts.
 * Bản trên mạng: chỉ nhóm trưởng dùng được AI và mỗi dự án có hạn mức mỗi ngày (máy chủ kiểm tra).
 */
import { useEffect, useState } from 'react';
import { aiAuth, CLOUD } from '../backend';
import { isLead, useStore } from '../store';
import type { ProjectType, SmartKey, SmartState } from './types';

export interface AiStatus {
  /** Người đang dùng có gọi được AI không. */
  enabled: boolean;
  model: string | null;
  /** Bản trên mạng: máy chủ có AI nhưng người này không phải nhóm trưởng nên không gọi được. */
  leadOnly?: boolean;
}

export interface AiCommon {
  common_points: string[];
  unique_points: { person_id: string; text: string }[];
  proposed_goal: string;
}

export interface AiSmart {
  rows: Record<SmartKey, { state: SmartState; hint: string }>;
  questions: { key: 'S' | 'M' | 'A' | 'R'; question: string }[];
  rewritten_goal: string;
  goal_date: string | null;
  feasibility_warning: string | null;
  project_type: ProjectType;
}

export interface AiPlan {
  milestones: { name: string; done_when: string; tasks: { title: string; done_when: string }[] }[];
  coordination_tasks: string[];
  stakeholders: { approve: string[]; lend_or_fund: string[]; participate_or_use: string[]; affected: string[] };
}

let statusPromise: Promise<AiStatus> | null = null;

export function getAiStatus(): Promise<AiStatus> {
  statusPromise ??= fetch('/api/ai?do=status')
    .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : { enabled: false, model: null }))
    .then((s) => ({ enabled: Boolean(s.enabled), model: s.model ?? null }))
    .catch(() => ({ enabled: false, model: null }));
  return statusPromise;
}

/**
 * `null` trong lúc đang hỏi máy chủ.
 * Bản trên mạng: người không phải nhóm trưởng luôn nhận `enabled: false` (đi đường luật + mẫu),
 * kèm `leadOnly: true` nếu máy chủ có AI.
 */
export function useAi(): AiStatus | null {
  const { state } = useStore();
  const lead = isLead(state);
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void getAiStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  if (status && CLOUD && !lead) return { enabled: false, model: status.model, leadOnly: status.enabled };
  return status;
}

const MESSAGES: Record<string, string> = {
  auth: 'Khoá API không hợp lệ.',
  forbidden_model: 'Khoá API không có quyền dùng mô hình này.',
  forbidden: 'Chỉ nhóm trưởng dùng được AI.',
  unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để dùng AI.',
  quota: 'Hôm nay dự án đã dùng hết lượt AI.',
  backend: 'Máy chủ chưa kiểm tra được quyền dùng AI.',
  rate_limited: 'AI đang quá tải hoặc hết hạn mức.',
  network: 'Không kết nối được tới AI.',
  refusal: 'AI từ chối xử lý nội dung này.',
  no_credentials: 'Máy chủ chưa có khoá API.',
  bad_input: 'Nội dung quá dài hoặc không hợp lệ để gửi cho AI.',
  too_large: 'Nội dung quá dài để gửi cho AI.',
  timeout: 'AI trả lời quá lâu.',
};

export class AiError extends Error {
  code: string;
  constructor(code: string) {
    super(MESSAGES[code] ?? 'AI gặp lỗi.');
    this.code = code;
  }
}

async function post<T>(action: 'common' | 'smart' | 'plan', body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    // Bản trên mạng: gửi kèm phiên đăng nhập và dự án đang mở để máy chủ kiểm tra quyền, trừ lượt.
    const auth = await aiAuth().catch(() => null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      headers.Authorization = `Bearer ${auth.token}`;
      headers['x-project-id'] = auth.projectId;
    }
    const res = await fetch(`/api/ai?do=${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new AiError(data?.error ?? 'server_error');
    return data as T;
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(ctrl.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

export const aiCommon = (entries: { id: string; text: string }[]) => post<AiCommon>('common', { entries });

export const aiSmart = (input: {
  baseGoal: string;
  answers: Partial<Record<'S' | 'M' | 'A' | 'R', string>>;
  teamSize: number;
  goalDate: string | null;
  today: string;
}) => post<AiSmart>('smart', input);

export const aiPlan = (input: { goal: string; teamSize: number; goalDate: string; today: string }) =>
  post<AiPlan>('plan', input);

/** Dòng báo cho nhóm biết app vừa quay về luật có sẵn. */
export function fallbackNote(err: unknown): string {
  const why = err instanceof AiError ? err.message : 'AI gặp lỗi.';
  return `${why} App đang dùng gợi ý theo luật và mẫu có sẵn.`;
}
