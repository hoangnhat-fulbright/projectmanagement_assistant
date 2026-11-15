import { useEffect, useState, type ReactNode } from 'react';
import { Check, Clock, Lightbulb, X } from 'lucide-react';
import { useStore } from '../store';
import type { Member, State } from '../types';

const AVATAR_COLORS = ['#448AFF', '#FF7043', '#66BB6A', '#8D6E63', '#7E57C2', '#26A69A', '#EC407A'];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ state, memberId, small }: { state: State; memberId: string | null; small?: boolean }) {
  const idx = state.members.findIndex((m) => m.id === memberId);
  const member: Member | undefined = state.members[idx];
  const color = member ? AVATAR_COLORS[idx % AVATAR_COLORS.length] : '#B8A9A2';
  return (
    <span
      className={`avatar${small ? ' sm' : ''}`}
      style={{ background: color }}
      title={member ? member.name : 'Chưa ai nhận'}
      aria-label={member ? member.name : 'Chưa ai nhận'}
    >
      {member ? initials(member.name) : '?'}
    </span>
  );
}

/** Giải thích 1 câu, hiện lần đầu gặp khái niệm (just-in-time). */
export function Tip({ id, children }: { id: string; children: ReactNode }) {
  const { state, set } = useStore();
  if (state.tipsSeen.includes(id)) return null;
  return (
    <div className="tip enter" role="note">
      <Lightbulb size={18} aria-hidden />
      <div className="grow">{children}</div>
      <button
        className="btn-icon"
        aria-label="Đã hiểu, ẩn gợi ý"
        onClick={() => set((d) => void d.tipsSeen.push(id))}
      >
        <X size={18} />
      </button>
    </div>
  );
}

/** Đồng hồ đếm ngược cho một bước của wizard. Không chặn người dùng khi hết giờ. */
export function Timer({ minutes, resetKey }: { minutes: number; resetKey: string | number }) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    setLeft(minutes * 60);
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [minutes, resetKey]);
  const over = left < 0;
  const abs = Math.abs(left);
  const mm = String(Math.floor(abs / 60)).padStart(2, '0');
  const ss = String(abs % 60).padStart(2, '0');
  return (
    <span className={`timer${over ? ' over' : ''}`} title={over ? 'Đã quá giờ dự kiến' : 'Thời gian còn lại của bước này'}>
      <Clock size={14} aria-hidden />
      {over ? '+' : ''}
      {mm}:{ss}
    </span>
  );
}

export function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="stepper" role="img" aria-label={`Bước ${step + 1} trên ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i <= step ? 'on' : ''} />
      ))}
    </div>
  );
}

interface WizardProps {
  name: string;
  step: number;
  total: number;
  minutes?: number;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
}

export function Wizard({ name, step, total, minutes, onClose, wide, children, footer }: WizardProps) {
  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label={name}>
      <div className="wizard-head">
        <span className="name">{name}</span>
        {total > 1 && (
          <>
            <Stepper step={step} total={total} />
            <span className="label mono">
              {step + 1}/{total}
            </span>
          </>
        )}
        <span className="right row">
          {minutes ? <Timer minutes={minutes} resetKey={step} /> : null}
          <button className="btn-icon" onClick={onClose} aria-label="Thoát, làm sau">
            <X size={20} />
          </button>
        </span>
      </div>
      <div className="wizard-body">
        <div key={step} className={`wizard-inner enter${wide ? ' wide' : ''}`}>
          {children}
        </div>
      </div>
      <div className="wizard-foot">{footer}</div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row">
          <h2 className="grow">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`choice${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      <span className="box">
        <Check size={16} strokeWidth={3} />
      </span>
      <span className="grow">{children}</span>
    </button>
  );
}
