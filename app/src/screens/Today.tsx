import { ArrowRight, Clock, Flag, LifeBuoy, Star } from 'lucide-react';
import type { Flow, Tab } from '../App';
import { currentSprint, daysLeft, isLead, isObserver, me, ROLE_LABEL, sprintItems, todayISO, useStore, workers } from '../store';
import { nextAction, type ActionKind } from '../lib/today';
import { fmtDay, workdays } from '../lib/dates';
import { ProgressIsland } from '../components/Voxel';
import { Avatar, Tip } from '../components/ui';
import { DueTag, HelpLine, STATUS_LABEL } from '../components/task';
import type { Item, State } from '../types';

export function Today({ go, start }: { go: (t: Tab) => void; start: (f: Flow) => void }) {
  const { state, set } = useStore();
  const user = me(state);
  const sprint = currentSprint(state);
  const today = todayISO(state);
  const action = nextAction(state);

  const items = sprint ? sprintItems(state, sprint.id) : [];
  const done = items.filter((i) => i.status === 'done').length;
  const mine = items.filter((i) => i.assigneeId === user.id && i.status !== 'done');

  const totalDays = sprint ? workdays(sprint.start, sprint.end) : 0;
  const dayNo = sprint && today >= sprint.start ? Math.min(workdays(sprint.start, today), totalDays) : 0;

  function run(kind: ActionKind) {
    switch (kind) {
      case 'plan':
        return start('planning');
      case 'review':
      case 'retro':
        return start('review');
      case 'checkin':
        return start('checkin');
      case 'refine':
        return start('refine');
      case 'unblock':
        return start('unblock');
      case 'wait-plan':
        return go('backlog');
      case 'brainstorm':
        return go('brainstorm');
      case 'observe':
        return go(sprint ? 'board' : 'backlog');
      case 'pick-slots':
      case 'confirm-slot':
        return go('meeting');
      default:
        return go('board');
    }
  }

  const lead = isLead(state);
  const observer = isObserver(state);
  const canReviewEarly =
    lead && sprint?.state === 'active' && today === sprint.end && action.kind !== 'review';

  return (
    <div className="stack" style={{ gap: 24 }}>
      {sprint && (
        <section className="week-strip enter" aria-label="Tiến độ tuần">
          <div className="row-wrap">
            <span className="tag tag-blue mono">
              {dayNo > 0 ? `Ngày ${dayNo}/${totalDays}` : `Bắt đầu ${fmtDay(sprint.start)}`}
            </span>
            <span className="row small" style={{ gap: 6 }}>
              <Flag size={16} aria-hidden />
              <span>
                <span className="muted">Mục tiêu tuần: </span>
                <strong>{sprint.goal}</strong>
              </span>
            </span>
            <span className="right small mono muted">
              {done}/{items.length} việc xong
            </span>
          </div>
          <div className="blocks-bar" aria-hidden>
            {items.map((i, idx) => (
              <span key={i.id} className={idx < done ? 'on' : ''} />
            ))}
          </div>
        </section>
      )}

      <div className="today-grid">
        <section
          className={`card card-float next-card enter${action.urgent ? ' urgent' : ''}`}
          aria-labelledby="next-title"
        >
          <span className="eyebrow">
            {action.urgent ? <LifeBuoy size={16} aria-hidden /> : null}
            {observer ? 'Đang theo dõi' : 'Việc tiếp theo'} · {fmtDay(today)}
          </span>
          <h1 id="next-title">{action.title}</h1>
          <p className="prose">{action.desc}</p>
          <div className="row-wrap" style={{ marginTop: 8, gap: 16 }}>
            <button className="btn btn-primary btn-lg" onClick={() => run(action.kind)}>
              {action.cta}
              <ArrowRight size={20} aria-hidden />
            </button>
            {action.time && (
              <span className="row small muted" style={{ gap: 6 }}>
                <Clock size={16} aria-hidden />
                {action.time}
              </span>
            )}
          </div>
          {canReviewEarly && (
            <p className="small muted">
              Hôm nay là ngày cuối tuần làm việc. App sẽ nhắc xem kết quả lúc {state.settings.reviewHour}:00.{' '}
              <button className="link" onClick={() => start('review')}>
                Xem kết quả ngay
              </button>
            </p>
          )}
        </section>

        <aside className="card island-card enter" style={{ ['--i' as string]: 1 }}>
          <ProgressIsland done={done} total={Math.max(items.length, 1)} />
          <p className="small muted" style={{ textAlign: 'center' }}>
            {sprint
              ? items.length > 0
                ? `Mỗi việc xong là một khối trên đảo. Đã xây ${done}/${items.length}.`
                : 'Chưa có việc nào trong tuần.'
              : 'Đảo đang chờ kế hoạch tuần mới.'}
          </p>
        </aside>
      </div>

      {action.kind === 'checkin' && (
        <Tip id="checkin">
          Check-in không phải báo cáo cho sếp. Nó giúp cả đội biết hôm nay ai làm gì và ai cần giúp.
        </Tip>
      )}

      {sprint && (lead || observer) && <Overview state={state} items={items} />}

      {!observer && state.settings.guideline && (
        <Tip id="guideline">
          <strong>Guideline của đội:</strong> {state.settings.guideline.split('\n').filter(Boolean).join(' · ')}
        </Tip>
      )}

      {sprint && sprint.state === 'active' && !observer && (
        <section className="stack-sm" aria-labelledby="mine-title">
          <h2 id="mine-title" style={{ fontSize: '1.125rem' }}>
            Việc của tôi hôm nay
          </h2>
          {mine.length === 0 ? (
            <p className="muted small">Bạn chưa nhận việc nào trong tuần này.</p>
          ) : (
            mine.map((i, idx) => (
              <button
                key={i.id}
                className={`list-item enter${i.stuck ? ' stuck' : ''}`}
                style={{ ['--i' as string]: Math.min(idx, 5), cursor: 'pointer', textAlign: 'left' }}
                onClick={() => go('board')}
              >
                {i.forSprintGoal && <Star className="star" size={16} fill="currentColor" aria-label="Phục vụ mục tiêu tuần" />}
                <span className="title grow">{i.title}</span>
                <DueTag state={state} item={i} />
                {i.stuck && <span className="tag tag-warn">Bị kẹt</span>}
                <span className={`tag${i.status === 'returned' ? ' tag-warn' : ''}`}>{STATUS_LABEL[i.status]}</span>
              </button>
            ))
          )}
          {mine.length > 0 && <HelpLine state={state} />}
        </section>
      )}

      {!sprint && state.sprints.length === 0 && lead && (
        <Tip id="first-week">
          Tuần làm việc là khoảng thời gian cố định để đội hoàn thành một nhóm việc. Bắt đầu bằng việc lên kế hoạch.
        </Tip>
      )}

      {state.dayOffset !== 0 && (
        <p className="small muted">
          Đang thử nghiệm với ngày giả lập ({fmtDay(today)}).{' '}
          <button className="link" onClick={() => set((d) => void (d.dayOffset = 0))}>
            Về ngày thật
          </button>
        </p>
      )}
    </div>
  );
}

/** Theo dõi công việc tổng quan cho nhóm trưởng và người quan sát. Wiki: features/roles-and-permissions. */
function Overview({ state, items }: { state: State; items: Item[] }) {
  const open = items.filter((i) => i.status !== 'done');
  const left = (i: Item) => daysLeft(state, i.deadline);
  const late = open.filter((i) => (left(i) ?? 0) < 0).length;
  const soon = open.filter((i) => {
    const n = left(i);
    return n !== null && n >= 0 && n <= 3;
  }).length;
  const waiting = items.filter((i) => i.status === 'checking').length;
  const returned = items.filter((i) => i.status === 'returned').length;
  const people = workers(state);
  const unassigned = open.filter((i) => !i.assigneeId).length;

  return (
    <section className="card stack" aria-labelledby="overview-title">
      <h2 id="overview-title" style={{ fontSize: '1.125rem' }}>
        Tổng quan công việc của đội
      </h2>
      <div className="stat-row">
        <div className={`stat${late > 0 ? ' alert' : ''}`}>
          <span className="num">{late}</span>
          <span className="small muted">Quá Deadline</span>
        </div>
        <div className="stat">
          <span className="num">{soon}</span>
          <span className="small muted">Còn 3 ngày trở xuống</span>
        </div>
        <div className="stat">
          <span className="num">{waiting}</span>
          <span className="small muted">Chờ kiểm tra</span>
        </div>
        <div className="stat">
          <span className="num">{returned}</span>
          <span className="small muted">Bị trả lại</span>
        </div>
      </div>
      <div>
        <div className="member-line head">
          <span>Người làm</span>
          <span className="mono">Chưa nộp</span>
          <span className="mono">Chờ kiểm tra</span>
          <span className="mono">Xong</span>
          <span className="mono">Quá hạn</span>
        </div>
        {people.map((m) => {
          const own = items.filter((i) => i.assigneeId === m.id);
          const count = (f: (i: Item) => boolean) => own.filter(f).length;
          const overdue = count((i) => i.status !== 'done' && (left(i) ?? 0) < 0);
          return (
            <div key={m.id} className="member-line">
              <span className="row" style={{ gap: 8, minWidth: 0 }}>
                <Avatar state={state} memberId={m.id} small />
                <span style={{ overflowWrap: 'anywhere' }}>
                  <strong>{m.name}</strong>
                  <span className="muted small"> · {ROLE_LABEL[m.role]}</span>
                </span>
              </span>
              <span className="mono">{count((i) => i.status === 'doing' || i.status === 'returned' || i.status === 'todo')}</span>
              <span className="mono">{count((i) => i.status === 'checking')}</span>
              <span className="mono">{count((i) => i.status === 'done')}</span>
              <span className="mono" style={overdue > 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                {overdue}
              </span>
            </div>
          );
        })}
      </div>
      {unassigned > 0 && <p className="small muted">{unassigned} việc chưa có người nhận.</p>}
    </section>
  );
}
