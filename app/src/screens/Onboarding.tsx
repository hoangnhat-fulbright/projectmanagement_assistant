import { useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { memberCode, ROLE_EN, ROLE_LABEL, uid, useStore } from '../store';
import type { Member, Role, Settings } from '../types';
import { industryById } from '../lib/templates';
import { Choice, Wizard } from '../components/ui';
import { ProgressIsland } from '../components/Voxel';
import { APP_NAME } from '../App';

/* Thiết lập ban đầu, 6 bước. Wiki: features/onboarding-wizard (D-009). */

const TOTAL = 6;
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const GUIDELINE_HINTS = [
  'Nhận việc thì báo ngay nếu thấy không kịp Deadline.',
  'Nộp việc kèm link hoặc ghi chú để người khác kiểm tra được.',
  'Bị kẹt quá nửa ngày thì báo trong check-in.',
  'Trả lời tin nhắn của nhóm trong ngày.',
];

interface Row {
  id: string;
  name: string;
  role: Exclude<Role, 'owner'>;
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export interface OnboardResult {
  members: Member[];
  settings: Settings;
}

/** Bản một máy: ghi thẳng vào kho trạng thái trong trình duyệt. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { set } = useStore();
  return (
    <OnboardingForm
      onSubmit={(r) => {
        set((d) => {
          d.members = r.members;
          d.currentMemberId = r.members[0].id;
          d.settings = r.settings;
          d.items = [];
          d.onboarded = true;
        });
        onDone();
      }}
    />
  );
}

/**
 * 6 bước thiết lập. `cloud`: bản trên mạng — người khác tự vào bằng mã mời nên bước 2 không gõ tên,
 * và có nút quay về màn chọn dự án (`onCancel`).
 */
export function OnboardingForm({
  cloud,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  cloud?: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (result: OnboardResult) => void;
  onCancel?: () => void;
}) {
  const [started, setStarted] = useState(Boolean(cloud));
  const [step, setStep] = useState(0);

  const [leadName, setLeadName] = useState('');
  const [background, setBackground] = useState('');
  const [cvName, setCvName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([{ id: uid(), name: '', role: 'member' }]);
  const [project, setProject] = useState('');
  const [field, setField] = useState('');
  const [checkinHour, setCheckinHour] = useState(9);
  const [reviewHour, setReviewHour] = useState(16);
  const [customRhythm, setCustomRhythm] = useState(false);
  const [refs, setRefs] = useState('');
  const [refFiles, setRefFiles] = useState<string[]>([]);
  const [guideline, setGuideline] = useState('');

  function finish() {
    const lead: Member = {
      id: uid(),
      code: memberCode(0),
      name: leadName.trim(),
      role: 'owner',
      background: background.trim(),
      cvName,
    };
    const others = (cloud ? [] : rows)
      .filter((r) => r.name.trim())
      .map(
        (r, i): Member => ({
          id: uid(),
          code: memberCode(i + 1),
          name: r.name.trim(),
          role: r.role,
          background: '',
          cvName: null,
        }),
      );
    const dod = industryById('other').dod.map((text) => ({ id: uid(), text }));
    const references = [...lines(refs), ...refFiles];
    onSubmit({
      members: [lead, ...others],
      settings: {
        company: project.trim(),
        industry: 'other',
        field: field.trim(),
        guideline: guideline.trim(),
        references,
        bigGoal: '',
        checkinHour,
        reviewHour,
        dod,
      },
    });
  }

  const exit = () => (onCancel ? onCancel() : setStarted(false));

  if (!started) {
    return (
      <div className="wizard" style={{ position: 'relative', minHeight: '100dvh' }}>
        <div className="wizard-body" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="wizard-inner enter" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 'min(300px, 70vw)' }}>
              <ProgressIsland done={4} total={9} />
            </div>
            <span className="eyebrow">{APP_NAME}</span>
            <h1 style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>Mỗi ngày, app chỉ cho bạn đúng một việc cần làm</h1>
            <p className="prose">
              Bạn không cần học phương pháp quản lý nào. Trả lời 6 câu hỏi ngắn về bạn, đội và dự án, rồi app dẫn
              nhóm đi từ ý tưởng tới việc của từng tuần.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setStarted(true)}>
              Bắt đầu thiết lập
              <ArrowRight size={20} aria-hidden />
            </button>
            <p className="small muted">Chỉ 2 câu bắt buộc. Phần còn lại bổ sung sau được.</p>
          </div>
        </div>
      </div>
    );
  }

  const canNext = (step === 0 && leadName.trim() !== '') || (step === 2 && project.trim() !== '') || [1, 3, 4, 5].includes(step);
  const skippable = step === 1 || step === 4 || step === 5;

  return (
    <Wizard
      name="Thiết lập ban đầu"
      step={step}
      total={TOTAL}
      onClose={exit}
      footer={
        <>
          <button className="btn btn-ghost" disabled={busy} onClick={() => (step === 0 ? exit() : setStep(step - 1))}>
            <ArrowLeft size={18} aria-hidden />
            Quay lại
          </button>
          <div className="row">
            {error && step === 5 && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
            {skippable && !busy && (
              <button className="link small" onClick={() => (step === 5 ? finish() : setStep(step + 1))}>
                Bỏ qua, làm sau
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={!canNext || busy}
              onClick={() => (step === 5 ? finish() : setStep(step + 1))}
            >
              {step === 5 ? (busy ? 'Đang lập dự án…' : cloud ? 'Xong, lập dự án' : 'Xong, bắt đầu Brainstorm') : 'Tiếp tục'}
              <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </>
      }
    >
      {step === 0 && (
        <>
          <h1>Bạn là ai?</h1>
          <p className="prose">
            Bạn đang lập dự án nên bạn là <strong>{ROLE_LABEL.owner}</strong> ({ROLE_EN.owner}): người dẫn Brainstorm,
            chốt kế hoạch và chia việc.
          </p>
          <div className="field">
            <label htmlFor="lead">Tên của bạn</label>
            <input
              id="lead"
              className="input"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Ví dụ: Lan"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="bg">Background (không bắt buộc)</label>
            <textarea
              id="bg"
              className="textarea"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="Vài dòng: bạn giỏi việc gì, đã làm dự án nào."
            />
          </div>
          <FilePick
            id="cv"
            label="CV (không bắt buộc)"
            names={cvName ? [cvName] : []}
            onPick={(names) => setCvName(names[0] ?? null)}
            onClear={() => setCvName(null)}
            accept=".pdf,.doc,.docx"
          />
        </>
      )}

      {step === 1 && (
        <>
          <h1>Đội của bạn gồm những ai?</h1>
          <p className="prose">
            <strong>{ROLE_LABEL.member}</strong> nhận việc và nộp việc. <strong>{ROLE_LABEL.observer}</strong> (
            {ROLE_EN.observer}) xem được mọi thứ nhưng không sửa được gì. Thêm người sau ở mục Đội cũng được.
          </p>
          {cloud && (
            <div className="card card-tight stack-sm">
              <p>
                Mỗi người tự đăng nhập bằng email của mình rồi nhập <strong>mã mời</strong> để vào dự án. Bạn không cần
                gõ tên ai ở đây.
              </p>
              <p className="small muted">
                Lập dự án xong, mở mục Đội để lấy hai mã: một mã cho {ROLE_LABEL.member.toLowerCase()}, một mã cho{' '}
                {ROLE_LABEL.observer.toLowerCase()}.
              </p>
            </div>
          )}
          <div className="stack-sm" hidden={cloud}>
            {rows.map((r, i) => (
              <div key={r.id} className="row">
                <input
                  className="input grow"
                  value={r.name}
                  onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                  placeholder={`Tên người thứ ${i + 1}`}
                  aria-label={`Tên người thứ ${i + 1}`}
                  autoFocus={i === 0}
                />
                <select
                  className="select"
                  style={{ width: 'auto' }}
                  value={r.role}
                  onChange={(e) =>
                    setRows(rows.map((x) => (x.id === r.id ? { ...x, role: e.target.value as Row['role'] } : x)))
                  }
                  aria-label={`Vai trò của người thứ ${i + 1}`}
                >
                  <option value="member">{ROLE_LABEL.member}</option>
                  <option value="observer">{ROLE_LABEL.observer}</option>
                </select>
                {rows.length > 1 && (
                  <button
                    className="btn-icon"
                    aria-label={`Bỏ dòng ${i + 1}`}
                    onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost"
            style={{ alignSelf: 'flex-start' }}
            hidden={cloud}
            onClick={() => setRows([...rows, { id: uid(), name: '', role: 'member' }])}
          >
            <Plus size={18} aria-hidden />
            Thêm một người
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Dự án của bạn tên gì?</h1>
          <p className="prose">Tên dự án tổng và vài câu về lĩnh vực. App dùng phần này để gợi ý sát hơn khi Brainstorm.</p>
          <div className="field">
            <label htmlFor="project">Tên dự án tổng</label>
            <input
              id="project"
              className="input"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Ví dụ: Hội chợ sách cũ 2026"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="field">Mô tả lĩnh vực (không bắt buộc)</label>
            <textarea
              id="field"
              className="textarea"
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="Ví dụ: Sự kiện trong trường, gây quỹ cho thư viện, khách chính là học sinh."
            />
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Nhịp làm việc của đội</h1>
          <p className="prose">
            Mặc định: tuần làm việc từ Thứ Hai tới Thứ Sáu, check-in lúc 9:00 mỗi ngày, xem kết quả và rút kinh nghiệm
            lúc 16:00 Thứ Sáu.
          </p>
          <div className="stack-sm">
            <Choice
              on={!customRhythm}
              onClick={() => {
                setCustomRhythm(false);
                setCheckinHour(9);
                setReviewHour(16);
              }}
            >
              <strong>Dùng mặc định</strong>
              <div className="small muted">Phù hợp với hầu hết các đội.</div>
            </Choice>
            <Choice on={customRhythm} onClick={() => setCustomRhythm(true)}>
              <strong>Chỉnh giờ</strong>
              <div className="small muted">Đổi giờ check-in và giờ tổng kết.</div>
            </Choice>
          </div>
          {customRhythm && (
            <div className="two-col">
              <div className="field">
                <label htmlFor="ci">Giờ check-in mỗi ngày</label>
                <select id="ci" className="select" value={checkinHour} onChange={(e) => setCheckinHour(Number(e.target.value))}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="rv">Giờ tổng kết Thứ Sáu</label>
                <select id="rv" className="select" value={reviewHour} onChange={(e) => setReviewHour(Number(e.target.value))}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </>
      )}

      {step === 4 && (
        <>
          <h1>Có tài liệu nào để đội tham khảo không?</h1>
          <p className="prose">
            Link, tệp hoặc tên nguồn mà cả đội nên đọc trước khi làm: đề bài, số liệu cũ, kế hoạch năm trước.
          </p>
          <div className="field">
            <label htmlFor="refs">Link hoặc tên nguồn (mỗi dòng một mục)</label>
            <textarea
              id="refs"
              className="textarea"
              value={refs}
              onChange={(e) => setRefs(e.target.value)}
              placeholder={'https://…\nBáo cáo hội chợ năm ngoái'}
              autoFocus
            />
          </div>
          <FilePick
            id="ref-files"
            label="Tệp tham khảo"
            names={refFiles}
            multiple
            onPick={(names) => setRefFiles([...refFiles, ...names.filter((n) => !refFiles.includes(n))])}
            onClear={() => setRefFiles([])}
          />
        </>
      )}

      {step === 5 && (
        <>
          <h1>Đội làm việc theo quy ước nào?</h1>
          <p className="prose">Guideline ban đầu: vài quy ước ngắn mà mọi người sẽ thấy khi vào dự án. Sửa lại sau được.</p>
          <div className="field">
            <label htmlFor="guide">Guideline của đội (mỗi dòng một quy ước)</label>
            <textarea
              id="guide"
              className="textarea"
              style={{ minHeight: 140 }}
              value={guideline}
              onChange={(e) => setGuideline(e.target.value)}
              autoFocus
            />
          </div>
          <div className="stack-sm">
            <span className="label">Bấm để thêm một gợi ý</span>
            <div className="chips">
              {GUIDELINE_HINTS.filter((h) => !guideline.includes(h)).map((h) => (
                <button key={h} className="chip" onClick={() => setGuideline((g) => (g.trim() ? `${g.trim()}\n${h}` : h))}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Wizard>
  );
}

/** Chọn tệp. Bản dựng thử chỉ giữ tên tệp, không tải nội dung đi đâu. */
export function FilePick({
  id,
  label,
  names,
  onPick,
  onClear,
  multiple,
  accept,
}: {
  id: string;
  label: string;
  names: string[];
  onPick: (names: string[]) => void;
  onClear: () => void;
  multiple?: boolean;
  accept?: string;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row-wrap">
        <label className="btn btn-ghost file-pick" htmlFor={id}>
          <Upload size={18} aria-hidden />
          {names.length > 0 && !multiple ? 'Đổi tệp' : 'Chọn tệp'}
          <input
            id={id}
            type="file"
            className="sr-only"
            multiple={multiple}
            accept={accept}
            onChange={(e) => {
              onPick(Array.from(e.target.files ?? []).map((f) => f.name));
              e.target.value = '';
            }}
          />
        </label>
        {names.map((n) => (
          <span key={n} className="tag tag-blue">
            <FileText size={14} aria-hidden />
            {n}
          </span>
        ))}
        {names.length > 0 && (
          <button className="link small" onClick={onClear}>
            Bỏ tệp
          </button>
        )}
      </div>
      <p className="small muted">Bản dựng thử chỉ ghi lại tên tệp, chưa lưu nội dung.</p>
    </div>
  );
}
