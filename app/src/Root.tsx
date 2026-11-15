import { useCallback, useEffect, useState } from 'react';
import { App } from './App';
import { CLOUD, getBackend, setAiProject, type Backend, type ProjectRef, type Session, type SharedState } from './backend';
import { CloudStoreProvider, emptyState, StoreProvider, toShared } from './store';
import { AuthScreen } from './screens/Auth';
import { ProjectsScreen } from './screens/Projects';
import { OnboardingForm, type OnboardResult } from './screens/Onboarding';
import { CubeIcon } from './components/Voxel';

/** Bản một máy chạy thẳng vào app; bản trên mạng đi qua đăng nhập và chọn dự án trước. */
export function Root() {
  if (!CLOUD) {
    return (
      <StoreProvider>
        <App />
      </StoreProvider>
    );
  }
  return <CloudRoot />;
}

const lastKey = (userId: string) => `tro-ly-tuan:last-project:${userId}`;

interface Open {
  project: ProjectRef;
  initial: { data: SharedState; version: number };
}

function CloudRoot() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [projects, setProjects] = useState<ProjectRef[] | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  // 1) Nạp lớp nối máy chủ và phiên đăng nhập hiện có.
  useEffect(() => {
    let off = () => {};
    let alive = true;
    getBackend()
      .then(async (b) => {
        if (!alive) return;
        setBackend(b);
        off = b.onAuthChange((s) => alive && setSession(s));
        const s = await b.getSession();
        if (alive) setSession(s);
      })
      .catch(() => alive && setFatal('Không kết nối được tới máy chủ. Kiểm tra mạng rồi tải lại trang.'));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const userId = session?.userId ?? null;

  const openProject = useCallback(
    async (b: Backend, ref: ProjectRef, uid: string) => {
      setBusy(true);
      try {
        const initial = await b.loadState(ref.id);
        try {
          localStorage.setItem(lastKey(uid), ref.id);
        } catch {
          // Không nhớ được dự án lần trước: lần sau người dùng chọn lại.
        }
        setAiProject(ref.id);
        setOpen({ project: ref, initial });
      } catch {
        setNotice('Không mở được dự án này. Có thể bạn không còn là thành viên.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // 2) Đăng nhập xong: lấy danh sách dự án; tự mở lại dự án lần trước.
  useEffect(() => {
    if (!backend || !userId) {
      setProjects(null);
      setOpen(null);
      setAiProject(null);
      return;
    }
    let alive = true;
    backend
      .listProjects()
      .then((list) => {
        if (!alive) return;
        setProjects(list);
        let last: string | null = null;
        try {
          last = localStorage.getItem(lastKey(userId));
        } catch {
          last = null;
        }
        const ref = list.find((p) => p.id === last);
        if (ref) void openProject(backend, ref, userId);
      })
      .catch(() => alive && setNotice('Không tải được danh sách dự án. Thử tải lại trang.'));
    return () => {
      alive = false;
    };
  }, [backend, userId, openProject]);

  const leave = useCallback(
    (lostAccess?: boolean) => {
      setOpen(null);
      setAiProject(null);
      if (userId) {
        try {
          localStorage.removeItem(lastKey(userId));
        } catch {
          // bỏ qua
        }
      }
      setNotice(lostAccess ? 'Bạn không còn là thành viên của dự án đó.' : null);
      if (backend) void backend.listProjects().then(setProjects).catch(() => {});
    },
    [backend, userId],
  );

  const signOut = useCallback(() => {
    void backend?.signOut();
  }, [backend]);

  if (fatal) return <Center title="Có lỗi kết nối">{fatal}</Center>;
  if (!backend || session === undefined) return <Center title="Đang mở app">Chờ một chút.</Center>;
  if (!session) return <AuthScreen backend={backend} />;

  if (open) {
    return (
      <CloudStoreProvider
        key={open.project.id}
        backend={backend}
        userId={session.userId}
        email={session.email}
        project={open.project}
        initial={open.initial}
        onLeave={leave}
        onSignOut={signOut}
      >
        <App />
      </CloudStoreProvider>
    );
  }

  if (creating) {
    const create = async (r: OnboardResult) => {
      setBusy(true);
      setNotice(null);
      try {
        const lead = r.members[0];
        const data = toShared({ ...emptyState(), members: r.members, settings: r.settings, onboarded: true });
        const name = r.settings.company || 'Dự án mới';
        const made = await backend.createProject(name, data, lead.id);
        setCreating(false);
        await openProject(backend, { id: made.id, name, role: 'owner', memberId: lead.id }, session.userId);
      } catch {
        setNotice('Chưa lập được dự án. Kiểm tra mạng rồi thử lại.');
      } finally {
        setBusy(false);
      }
    };
    return <OnboardingForm cloud busy={busy} error={notice} onSubmit={create} onCancel={() => setCreating(false)} />;
  }

  return (
    <ProjectsScreen
      email={session.email}
      projects={projects}
      busy={busy}
      notice={notice}
      onOpen={(ref) => void openProject(backend, ref, session.userId)}
      onCreate={() => {
        setNotice(null);
        setCreating(true);
      }}
      onJoin={async (code, name) => {
        const { id } = await backend.joinProject(code, name);
        const list = await backend.listProjects();
        setProjects(list);
        const ref = list.find((p) => p.id === id);
        if (ref) await openProject(backend, ref, session.userId);
      }}
      onSignOut={signOut}
    />
  );
}

function Center({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-card card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <CubeIcon color="mint" size={40} />
        <h2>{title}</h2>
        <p className="muted">{children}</p>
      </div>
    </div>
  );
}
