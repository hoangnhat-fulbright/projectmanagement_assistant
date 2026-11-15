import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CalendarClock,
  ChevronDown,
  CloudOff,
  Eye,
  FolderOpen,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  LogOut,
  Sun,
  Users,
} from 'lucide-react';
import { canEdit, me, ROLE_EN, ROLE_LABEL, useStore, type CloudInfo } from './store';
import type { Member } from './types';
import { reminders } from './lib/today';
import { CubeIcon } from './components/Voxel';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Planning } from './screens/Planning';
import { CheckInFlow } from './screens/CheckIn';
import { Board } from './screens/Board';
import { RefineFlow } from './screens/Backlog';
import { WeeklyTasks } from './screens/WeeklyTasks';
import { ReviewRetro } from './screens/ReviewRetro';
import { Team } from './screens/Team';
import { UnblockModal } from './screens/Unblock';
import { Brainstorm } from './screens/Brainstorm';
import { MeetingScreen } from './screens/Meeting';

export type Tab = 'today' | 'board' | 'backlog' | 'brainstorm' | 'meeting' | 'team';
export type Flow = null | 'planning' | 'checkin' | 'review' | 'refine' | 'unblock';

const TABS: { id: Tab; label: string; short: string; icon: typeof Sun }[] = [
  { id: 'today', label: 'Hôm nay', short: 'Hôm nay', icon: Sun },
  { id: 'brainstorm', label: 'Brainstorm', short: 'Ý tưởng', icon: Lightbulb },
  // Mã tab giữ là 'backlog' (Kho việc cũ); từ D-012 màn hình này là "Task tuần này".
  { id: 'backlog', label: 'Task tuần này', short: 'Task tuần', icon: ListChecks },
  { id: 'board', label: 'Bảng việc', short: 'Bảng', icon: LayoutGrid },
  { id: 'meeting', label: 'Tìm giờ họp', short: 'Giờ họp', icon: CalendarClock },
  { id: 'team', label: 'Đội', short: 'Đội', icon: Users },
];

export const APP_NAME = 'Trợ lý tuần';
const TAB_KEY = 'tro-ly-tuan:tab';
const TAB_IDS: Tab[] = ['today', 'brainstorm', 'backlog', 'board', 'meeting', 'team'];

export function App() {
  const { state, switchUser, blocked, cloud } = useStore();
  // Nhớ màn đang mở trong tab trình duyệt này, để tải lại trang không bị đưa về "Hôm nay".
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      if (saved && TAB_IDS.includes(saved as Tab)) return saved as Tab;
    } catch {
      // Không đọc được bộ nhớ phiên → mở "Hôm nay".
    }
    return 'today';
  });
  const [flow, setFlowRaw] = useState<Flow>(null);
  const [toast, setToast] = useState(false);

  // Đổi màn hoặc mở/đóng một luồng → bắt đầu từ đầu trang, không giữ vị trí cuộn của màn trước.
  useEffect(() => {
    window.scrollTo(0, 0);
    try {
      sessionStorage.setItem(TAB_KEY, tab);
    } catch {
      // Bỏ qua: chỉ là tiện ích.
    }
  }, [tab, flow]);

  // Observer thử sửa → báo một dòng rồi tự ẩn.
  useEffect(() => {
    if (blocked === 0) return;
    setToast(true);
    const t = setTimeout(() => setToast(false), 2600);
    return () => clearTimeout(t);
  }, [blocked]);

  if (!state.onboarded) {
    return <Onboarding onDone={() => setTab('brainstorm')} />;
  }

  const user = me(state);
  const notes = reminders(state);
  const editable = canEdit(state);
  /** Các buổi có dẫn dắt đều ghi dữ liệu, nên Observer không mở được. */
  const setFlow = (f: Flow) => (editable || f === null ? setFlowRaw(f) : setToast(true));

  return (
    <div className="app">
      <aside className="side-nav">
        <div className="brand">
          <CubeIcon color="mint" size={26} />
          {APP_NAME}
        </div>
        <nav className="nav-list" aria-label="Điều hướng chính">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item${tab === t.id ? ' active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={20} aria-hidden />
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="brand">
            <CubeIcon color="mint" size={22} />
            {APP_NAME}
          </div>
          {cloud ? (
            <AccountMenu cloud={cloud} user={user} projectName={state.settings.company.trim() || cloud.project.name} />
          ) : (
          <label className="row small">
            <span className="muted sr-only">Đang dùng với tư cách</span>
            <select
              className="select"
              style={{ minHeight: 36, padding: '4px 8px', width: 'auto', maxWidth: 180 }}
              value={user.id}
              onChange={(e) => switchUser(e.target.value)}
              aria-label="Đang dùng với tư cách"
            >
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {ROLE_LABEL[m.role]}
                </option>
              ))}
            </select>
          </label>
          )}
          <Reminders notes={notes} />
        </header>

        {!editable && (
          <div className="readonly-bar" role="status">
            <Eye size={18} aria-hidden />
            <span>
              Bạn đang ở chế độ chỉ xem ({ROLE_LABEL.observer}, {ROLE_EN.observer}): thấy được mọi thứ nhưng không sửa được.
            </span>
          </div>
        )}

        <main className="container" key={tab}>
          {tab === 'today' && <Today go={setTab} start={setFlow} />}
          {tab === 'board' && <Board start={setFlow} />}
          {tab === 'backlog' && <WeeklyTasks go={setTab} start={setFlow} />}
          {tab === 'brainstorm' && <Brainstorm go={setTab} />}
          {tab === 'meeting' && <MeetingScreen go={setTab} />}
          {tab === 'team' && <Team />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={22} aria-hidden />
            {t.short}
          </button>
        ))}
      </nav>

      {flow === 'planning' && (
        <Planning
          onClose={() => setFlow(null)}
          onDone={() => {
            setFlow(null);
            setTab('today');
          }}
        />
      )}
      {flow === 'checkin' && <CheckInFlow onClose={() => setFlow(null)} />}
      {flow === 'review' && (
        <ReviewRetro
          onClose={() => setFlow(null)}
          onPlan={() => setFlow('planning')}
        />
      )}
      {flow === 'refine' && <RefineFlow onClose={() => setFlow(null)} />}
      {flow === 'unblock' && <UnblockModal onClose={() => setFlow(null)} />}

      {toast && (
        <div className="toast" role="status">
          <Eye size={18} aria-hidden />
          {ROLE_LABEL.observer} chỉ xem, không sửa được.
        </div>
      )}
    </div>
  );
}

/** Bản trên mạng: tên người đang đăng nhập, trạng thái lưu, đổi dự án, đăng xuất. */
function AccountMenu({ cloud, user, projectName }: { cloud: CloudInfo; user: Member; projectName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="row" style={{ gap: 8, minWidth: 0 }}>
      {cloud.sync === 'saving' && <span className="small muted sync-note">Đang lưu…</span>}
      {cloud.sync === 'error' && (
        <span className="tag tag-warn" role="status">
          <CloudOff size={13} aria-hidden />
          Chưa lưu được, đang thử lại
        </span>
      )}
      <div className="popover-wrap" ref={ref}>
        <button className="btn btn-ghost btn-sm account-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="account-name">{user.name}</span>
          <span className="muted account-role">· {ROLE_LABEL[user.role]}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {open && (
          <div className="popover stack-sm">
            <div>
              <span className="label">Dự án</span>
              <div>
                <strong>{projectName}</strong>
              </div>
            </div>
            <p className="small muted" style={{ overflowWrap: 'anywhere' }}>
              {cloud.email} · ID <span className="mono">{user.code}</span>
            </p>
            <button className="btn btn-ghost btn-sm" onClick={cloud.leave}>
              <FolderOpen size={16} aria-hidden />
              Đổi dự án
            </button>
            <button className="btn btn-ghost btn-sm" onClick={cloud.signOut}>
              <LogOut size={16} aria-hidden />
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Reminders({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="popover-wrap" ref={ref}>
      <button
        className="btn-icon"
        style={{ position: 'relative' }}
        aria-label={`Nhắc việc: ${notes.length}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={20} />
        {notes.length > 0 && <span className="badge">{notes.length}</span>}
      </button>
      {open && (
        <div className="popover stack-sm" role="status">
          <h3>Nhắc việc</h3>
          {notes.length === 0 ? (
            <p className="small muted">Không có gì cần nhắc. Bạn đang theo đúng nhịp.</p>
          ) : (
            notes.map((n, i) => (
              <p key={i} className="small">
                {n}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}
