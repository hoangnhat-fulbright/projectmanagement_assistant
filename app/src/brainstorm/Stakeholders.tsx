import { useState } from 'react';
import { ArrowRight, Copy, Hand, Mail, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { memberName, uid } from '../store';
import { addDays, fmtShort } from '../lib/dates';
import { Avatar, Modal, Tip } from '../components/ui';
import { Term, useBrainstorm } from './common';
import {
  CONTACT_LABEL,
  QUADRANT,
  STAKEHOLDER_PROMPTS,
  messageTemplate,
  quadrant,
  stakeholderNudge,
  type Quadrant,
} from './logic';
import type { ContactStatus, Stakeholder } from './types';

const QUAD_ORDER: Quadrant[] = ['satisfy', 'key', 'monitor', 'inform'];

/** Bước 4 — Stakeholder bên ngoài: gợi ý → xếp 4 ô → gắn milestone → người phụ trách → theo dõi. */
export function StakeholderStep() {
  const { s, user, isLeader, readOnly, update, today } = useBrainstorm();
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const milestones = s.milestones.filter((m) => m.status !== 'removed');

  function add(n: string) {
    const text = n.trim();
    if (!text || s.stakeholders.some((x) => x.name === text)) return;
    const id = uid();
    update((b) =>
      void b.stakeholders.push({
        id,
        name: text,
        canBlock: null,
        cares: null,
        milestoneId: null,
        ownerId: null,
        contact: 'none',
        log: [],
      }),
    );
    setName('');
    setOpen(id);
  }

  const current = s.stakeholders.find((x) => x.id === open);
  const nudges = s.stakeholders
    .map((sh) => ({ sh, text: stakeholderNudge(s, sh, today) }))
    .filter((x): x is { sh: Stakeholder; text: string } => x.text !== null);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <span className="eyebrow">Bước tuỳ chọn · làm sau cũng được</span>
        <h1>Ai ngoài nhóm có thể giúp hoặc chặn dự án?</h1>
        <p className="prose">
          <Term k="Stakeholder" /> là người không ở trong nhóm nhưng ảnh hưởng tới dự án. Nhóm hay quên họ rồi bị chặn
          giữa chừng.
        </p>
      </div>

      {nudges.map(({ sh, text }) => (
        <div key={sh.id} className="notice">
          <TriangleAlert size={18} aria-hidden />
          <span className="grow">{text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(sh.id)}>
            Mở
          </button>
        </div>
      ))}

      <section className="card stack">
        <h2>App luôn nhắc 4 câu hỏi</h2>
        <div className="two-col">
          {STAKEHOLDER_PROMPTS.map((p, pi) => {
            // Gợi ý của AI cho đúng dự án này nếu có; không thì mẫu theo loại dự án.
            const hints = s.stakeholderHints?.[pi];
            const examples = hints && hints.length > 0 ? hints : p.examples[s.projectType];
            return (
            <div key={p.question} className="stack-sm">
              <strong>{p.question}</strong>
              <div className="chips">
                {examples.map((ex) => {
                  const used = s.stakeholders.some((x) => x.name === ex);
                  return (
                    <button key={ex} className={`chip${used ? ' on' : ''}`} disabled={used || readOnly} onClick={() => add(ex)}>
                      <Plus size={14} aria-hidden />
                      {ex}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
        {!readOnly && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            add(name);
          }}
        >
          <input
            className="input grow"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hoặc gõ tên / vai trò của người khác, nhấn Enter"
            aria-label="Thêm stakeholder"
          />
          <button className="btn btn-ghost" type="submit" disabled={!name.trim()}>
            <Plus size={18} aria-hidden />
            Thêm
          </button>
        </form>
        )}
      </section>

      {s.stakeholders.length > 0 && (
        <section className="stack-sm" aria-label="Lưới 4 ô">
          <Tip id="bs-quadrant">
            Trả lời 2 câu cho mỗi người: họ có thể chặn dự án không, họ có quan tâm kết quả không. App tự xếp vào 1 trong 4 ô.
          </Tip>
          <div className="quad-grid">
            {QUAD_ORDER.map((q) => (
              <div key={q} className={`quad quad-${q}`}>
                <strong>{QUADRANT[q].label}</strong>
                <span className="small muted">{QUADRANT[q].advice}</span>
                {s.stakeholders
                  .filter((sh) => quadrant(sh) === q)
                  .map((sh) => (
                    <button key={sh.id} className="quad-item" onClick={() => setOpen(sh.id)}>
                      <span className="grow">{sh.name}</span>
                      <span className="tag">{CONTACT_LABEL[sh.contact]}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
          {s.stakeholders.some((sh) => quadrant(sh) === null) && (
            <div className="stack-sm">
              <span className="label">Chưa xếp ô (bấm để trả lời 2 câu)</span>
              {s.stakeholders
                .filter((sh) => quadrant(sh) === null)
                .map((sh) => (
                  <button key={sh.id} className="list-item" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpen(sh.id)}>
                    <span className="title grow">{sh.name}</span>
                    <span className="tag tag-warn">Chưa xếp ô</span>
                  </button>
                ))}
            </div>
          )}
        </section>
      )}

      {!readOnly && (
        <div className="row-wrap">
          <button className="btn btn-primary btn-lg" onClick={() => update((b) => void (b.step = 5))}>
            {s.stakeholders.length === 0 ? 'Bỏ qua, sang Tổng kết' : 'Tiếp: Tổng kết'}
            <ArrowRight size={20} aria-hidden />
          </button>
          <span className="small muted">Bước này không bắt buộc: quay lại bất cứ lúc nào.</span>
        </div>
      )}

      {current && (
        <StakeholderModal
          sh={current}
          onClose={() => setOpen(null)}
          milestones={milestones.map((m) => ({ id: m.id, label: `${m.name} (${fmtShort(m.deadline)})` }))}
        />
      )}
      {!isLeader && !readOnly && (
        <p className="small muted">Đang dùng với tư cách {user.name}. Ai cũng nhận phụ trách được bằng nút "Tôi lo".</p>
      )}
    </div>
  );
}

function StakeholderModal({
  sh,
  milestones,
  onClose,
}: {
  sh: Stakeholder;
  milestones: { id: string; label: string }[];
  onClose: () => void;
}) {
  const { state, s, user, isLeader, readOnly, people, update, today } = useBrainstorm();
  const [line, setLine] = useState('');
  const [copied, setCopied] = useState(false);
  const q = quadrant(sh);
  const template = messageTemplate(s, sh, memberName(state, sh.ownerId ?? user.id));

  function mut(fn: (x: Stakeholder) => void) {
    update((b) => {
      const x = b.stakeholders.find((y) => y.id === sh.id);
      if (x) fn(x);
    });
  }

  /** Gắn milestone → app tự thêm task liên hệ vào WBS, deadline tính trước milestone đó. */
  function linkMilestone(milestoneId: string) {
    const taskId = uid();
    update((b) => {
      const x = b.stakeholders.find((y) => y.id === sh.id);
      if (!x) return;
      x.milestoneId = milestoneId || null;
      b.tasks = b.tasks.filter((t) => t.stakeholderId !== sh.id);
      const m = b.milestones.find((y) => y.id === milestoneId);
      if (!m) return;
      let deadline = addDays(m.deadline, -3);
      if (deadline <= today) deadline = addDays(today, 1);
      if (deadline > m.deadline) deadline = m.deadline;
      b.tasks.push({
        id: taskId,
        milestoneId: m.id,
        title: `Liên hệ ${x.name}`,
        doneWhen: `${x.name} đã trả lời rõ ràng (đồng ý hoặc từ chối)`,
        assigneeId: x.ownerId,
        deadline,
        status: 'kept',
        byApp: true,
        comments: [],
        credit: [],
        stakeholderId: x.id,
        priority: 'mid',
      });
    });
  }

  function setOwner(ownerId: string | null) {
    update((b) => {
      const x = b.stakeholders.find((y) => y.id === sh.id);
      if (!x) return;
      x.ownerId = ownerId;
      for (const t of b.tasks) if (t.stakeholderId === sh.id) t.assigneeId = ownerId;
    });
  }

  function addLog() {
    const text = line.trim();
    if (!text) return;
    mut((x) => {
      x.log.push({ date: today, text });
      if (x.contact === 'none') x.contact = 'contacted';
    });
    setLine('');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const yesNo = (value: boolean | null, set: (v: boolean) => void, label: string) => (
    <div className="stack-sm">
      <span className="label">{label}</span>
      <div className="chips">
        <button className={`chip${value === true ? ' on' : ''}`} aria-pressed={value === true} disabled={readOnly} onClick={() => set(true)}>
          Có
        </button>
        <button className={`chip${value === false ? ' on' : ''}`} aria-pressed={value === false} disabled={readOnly} onClick={() => set(false)}>
          Không
        </button>
      </div>
    </div>
  );

  return (
    <Modal title={sh.name} onClose={onClose}>
      {yesNo(sh.canBlock, (v) => mut((x) => void (x.canBlock = v)), 'Họ có thể chặn dự án không?')}
      {yesNo(sh.cares, (v) => mut((x) => void (x.cares = v)), 'Họ có quan tâm kết quả không?')}
      {q && (
        <p>
          <span className="tag tag-blue">{QUADRANT[q].label}</span> {QUADRANT[q].advice}.
        </p>
      )}

      <div className="field">
        <label htmlFor="sh-ms">Milestone nào cần họ?</label>
        <select id="sh-ms" className="select" disabled={readOnly} value={sh.milestoneId ?? ''} onChange={(e) => linkMilestone(e.target.value)}>
          <option value="">Chưa gắn</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {sh.milestoneId && <span className="small muted">App đã thêm task "Liên hệ {sh.name}" vào WBS, deadline trước milestone này.</span>}
      </div>

      <div className="stack-sm">
        <span className="label">Người phụ trách liên hệ</span>
        <div className="row">
          <Avatar state={state} memberId={sh.ownerId} small />
          <span className="grow">{memberName(state, sh.ownerId)}</span>
          {!readOnly && sh.ownerId !== user.id && (
            <button className="btn btn-primary btn-sm" onClick={() => setOwner(user.id)}>
              <Hand size={14} aria-hidden />
              Tôi lo
            </button>
          )}
        </div>
        {isLeader && (
          <div className="chips">
            {people.map((m) => (
              <button
                key={m.id}
                className={`chip${sh.ownerId === m.id ? ' on' : ''}`}
                aria-pressed={sh.ownerId === m.id}
                onClick={() => setOwner(sh.ownerId === m.id ? null : m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="sh-status">Trạng thái</label>
        <select
          id="sh-status"
          className="select"
          disabled={readOnly}
          value={sh.contact}
          onChange={(e) => mut((x) => void (x.contact = e.target.value as ContactStatus))}
        >
          {(Object.keys(CONTACT_LABEL) as ContactStatus[]).map((k) => (
            <option key={k} value={k}>
              {CONTACT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="stack-sm">
        <span className="label">Ghi chú liên lạc (mỗi lần 1 dòng: nói gì, hẹn gì)</span>
        {sh.log.map((l, i) => (
          <p key={i} className="small">
            <span className="mono muted">{fmtShort(l.date)} </span>
            {l.text}
          </p>
        ))}
        {!readOnly && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            addLog();
          }}
        >
          <input
            className="input grow"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Ví dụ: đã gửi kế hoạch, hẹn trả lời Thứ Sáu"
            aria-label="Ghi chú liên lạc"
          />
          <button className="btn btn-ghost" type="submit" disabled={!line.trim()}>
            Ghi
          </button>
        </form>
        )}
      </div>

      <div className="stack-sm">
        <span className="label">
          <Mail size={14} aria-hidden /> Mẫu tin nhắn (bạn sửa rồi tự gửi, app không gửi thay)
        </span>
        <pre className="template">{template}</pre>
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={copy}>
          <Copy size={14} aria-hidden />
          {copied ? 'Đã copy' : 'Copy mẫu tin nhắn'}
        </button>
      </div>

      <p className="small muted">Chỉ ghi vai trò và thông tin liên hệ cần cho dự án, không ghi nhận xét cá nhân.</p>

      <div className="modal-actions">
        {isLeader && (
          <button
            className="btn btn-danger"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              update((b) => {
                b.stakeholders = b.stakeholders.filter((x) => x.id !== sh.id);
                b.tasks = b.tasks.filter((t) => t.stakeholderId !== sh.id);
              });
              onClose();
            }}
          >
            <Trash2 size={16} aria-hidden />
            Bỏ
          </button>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}
