import { useState } from 'react';
import { ArrowRight, FolderPlus, LogOut, Ticket } from 'lucide-react';
import { BackendError, type ProjectRef } from '../backend';
import { ROLE_LABEL } from '../store';
import { APP_NAME } from '../App';
import { CubeIcon } from '../components/Voxel';

/* Sau khi đăng nhập: mở dự án đã có, lập dự án mới (thành nhóm trưởng), hoặc vào dự án bằng mã mời. */

export function ProjectsScreen({
  email,
  projects,
  busy,
  notice,
  onOpen,
  onCreate,
  onJoin,
  onSignOut,
}: {
  email: string;
  projects: ProjectRef[] | null;
  busy: boolean;
  notice: string | null;
  onOpen: (p: ProjectRef) => void;
  onCreate: () => void;
  onJoin: (code: string, name: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await onJoin(code, name.trim());
    } catch (err) {
      const c = err instanceof BackendError ? err.code : 'unknown';
      setError(
        c === 'bad_invite'
          ? 'Mã mời không đúng. Hỏi lại nhóm trưởng.'
          : c === 'network'
            ? 'Không kết nối được. Kiểm tra mạng rồi thử lại.'
            : 'Chưa vào được dự án. Thử lại sau ít phút.',
      );
    } finally {
      setJoining(false);
    }
  }

  const canJoin = code.replace(/\s/g, '').length >= 6 && name.trim() !== '' && !joining && !busy;

  return (
    <div className="gate">
      <div className="gate-card wide stack enter">
        <div className="row-wrap">
          <div className="brand grow">
            <CubeIcon color="mint" size={26} />
            {APP_NAME}
          </div>
          <span className="small muted gate-email">{email}</span>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>
            <LogOut size={16} aria-hidden />
            Đăng xuất
          </button>
        </div>

        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
          </div>
        )}

        <section className="card stack" aria-labelledby="mine-title">
          <h2 id="mine-title">Dự án của bạn</h2>
          {projects === null ? (
            <p className="muted small">Đang tải…</p>
          ) : projects.length === 0 ? (
            <p className="muted">Bạn chưa ở trong dự án nào. Lập một dự án mới, hoặc nhập mã mời bên dưới.</p>
          ) : (
            <div className="stack-sm">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="list-item"
                  style={{ cursor: 'pointer', textAlign: 'left' }}
                  disabled={busy}
                  onClick={() => onOpen(p)}
                >
                  <span className="title grow">{p.name}</span>
                  <span className={`tag${p.role === 'owner' ? ' tag-blue' : ''}`}>{ROLE_LABEL[p.role]}</span>
                  <ArrowRight size={18} aria-hidden />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="two-col">
          <section className="card stack" aria-labelledby="new-title">
            <h2 id="new-title">Lập dự án mới</h2>
            <p className="muted">Bạn sẽ là {ROLE_LABEL.owner.toLowerCase()}: dẫn Brainstorm, chốt kế hoạch và chia việc.</p>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={onCreate}>
              <FolderPlus size={18} aria-hidden />
              Lập dự án
            </button>
          </section>

          <form
            className="card stack"
            aria-labelledby="join-title"
            onSubmit={(e) => {
              e.preventDefault();
              if (canJoin) void join();
            }}
          >
            <h2 id="join-title">Vào dự án bằng mã mời</h2>
            <div className="field">
              <label htmlFor="join-code">Mã mời (nhóm trưởng gửi cho bạn)</label>
              <input
                id="join-code"
                className="input mono"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: K7M2XQ9P"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="join-name">Tên của bạn trong dự án</label>
              <input id="join-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Minh" />
            </div>
            {error && (
              <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            <button className="btn btn-ghost" type="submit" style={{ alignSelf: 'flex-start' }} disabled={!canJoin}>
              <Ticket size={18} aria-hidden />
              {joining ? 'Đang vào…' : 'Vào dự án'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
