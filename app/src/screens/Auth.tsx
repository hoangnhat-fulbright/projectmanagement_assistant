import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Mail } from 'lucide-react';
import { BackendError, type Backend } from '../backend';
import { APP_NAME } from '../App';
import { CubeIcon } from '../components/Voxel';

/* Đăng nhập bằng email + mã gửi qua email (không mật khẩu). Wiki: tech/architecture ("Bản trên mạng"). */

const MESSAGES: Record<string, string> = {
  rate_limited: 'Đang gửi quá nhiều thư. Chờ khoảng một phút rồi thử lại.',
  bad_code: 'Mã không đúng hoặc đã hết hạn. Kiểm tra lại hoặc xin mã mới.',
  network: 'Không kết nối được. Kiểm tra mạng rồi thử lại.',
};

const say = (err: unknown) =>
  (err instanceof BackendError && MESSAGES[err.code]) || 'Có lỗi xảy ra. Thử lại sau ít phút.';

export function AuthScreen({ backend }: { backend: Backend }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  // Đếm ngược trước khi được xin mã mới (máy chủ chỉ cho gửi lại sau 60 giây).
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function send() {
    const to = email.trim().toLowerCase();
    setBusy(true);
    setError(null);
    try {
      await backend.sendCode(to);
      setSentTo(to);
      setCode('');
      setWait(60);
    } catch (err) {
      setError(say(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    try {
      await backend.verifyCode(sentTo, code.trim());
      // Đăng nhập xong, màn hình này tự đóng khi phiên đăng nhập được báo về.
    } catch (err) {
      setError(say(err));
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-card card card-float stack enter">
        <div className="brand">
          <CubeIcon color="mint" size={26} />
          {APP_NAME}
        </div>

        {!sentTo ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !busy) void send();
            }}
          >
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Đăng nhập</h1>
              <p className="muted">Nhập email, app gửi cho bạn một thư để vào. Không cần mật khẩu.</p>
            </div>
            <div className="field">
              <label htmlFor="auth-email">Email của bạn</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@vidu.com"
                autoFocus
              />
            </div>
            {error && (
              <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-lg" type="submit" disabled={!valid || busy}>
              <Mail size={20} aria-hidden />
              {busy ? 'Đang gửi…' : 'Gửi thư đăng nhập'}
            </button>
            <p className="small muted">Lần đầu đăng nhập, app tự tạo tài khoản cho email này. Email chỉ dùng để đăng nhập.</p>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length >= 6 && !busy) void verify();
            }}
          >
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Kiểm tra hộp thư</h1>
              <p className="muted">
                Đã gửi thư tới <strong style={{ color: 'var(--text-strong)' }}>{sentTo}</strong>. Bấm vào link trong thư để vào
                thẳng app. Nếu thư có mã 6 số, bạn cũng có thể nhập mã ở dưới.
              </p>
            </div>
            <div className="field">
              <label htmlFor="auth-code">Mã đăng nhập</label>
              <input
                id="auth-code"
                className="input mono code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
              />
            </div>
            {error && (
              <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-lg" type="submit" disabled={code.trim().length < 6 || busy}>
              <KeyRound size={20} aria-hidden />
              {busy ? 'Đang kiểm tra…' : 'Vào app'}
              <ArrowRight size={20} aria-hidden />
            </button>
            <div className="row-wrap small">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
              >
                <ArrowLeft size={14} aria-hidden /> Đổi email
              </button>
              <span className="muted">·</span>
              {wait > 0 ? (
                <span className="muted">Xin mã mới sau {wait} giây</span>
              ) : (
                <button type="button" className="link" disabled={busy} onClick={() => void send()}>
                  Gửi lại mã
                </button>
              )}
            </div>
            <p className="small muted">Không thấy thư? Xem hộp thư rác. Mã có hiệu lực trong 1 giờ.</p>
          </form>
        )}
      </div>
    </div>
  );
}
