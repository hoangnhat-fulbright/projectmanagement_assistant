import { useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, Flag, GripVertical, Pencil, Plus, TriangleAlert } from 'lucide-react';
import type { Flow, Tab } from '../App';
import {
  backlog,
  canEdit,
  capacity,
  currentSprint,
  daysLeft,
  isLead,
  memberName,
  newItem,
  ROLE_LABEL,
  sprintItems,
  todayISO,
  uid,
  useStore,
  workers,
} from '../store';
import type { Item, Sprint } from '../types';
import { fmtDay, sprintRange } from '../lib/dates';
import { Avatar, Tip } from '../components/ui';
import { EmptyBlocks } from '../components/Voxel';
import { DueTag, HelpLine, PriorityTag, STATUS_LABEL } from '../components/task';
import { EditModal } from './Backlog';

/*
 * Task tuần này. Wiki: features/weekly-tasks (D-012).
 * Trái: "Đội cần làm gì" (Kho việc theo thứ tự ưu tiên). Phải: "Cần làm tuần này".
 * Kéo một việc từ trái sang phải để đưa vào tuần; kéo lên xuống ở cột trái để đổi ưu tiên.
 */

const POOL = 'zone-pool';
const WEEK = 'zone-week';

const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

export function WeeklyTasks({ go, start }: { go: (t: Tab) => void; start: (f: Flow) => void }) {
  const { state, set } = useStore();
  const lead = isLead(state);
  const editable = canEdit(state);
  const sprint = currentSprint(state);
  const today = todayISO(state);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [byDeadline, setByDeadline] = useState(false);
  const [goal, setGoal] = useState('');

  const all = backlog(state);
  const draftIds = sprint ? [] : state.weekDraft.filter((id) => all.some((i) => i.id === id));
  const pool = all.filter((i) => !draftIds.includes(i.id));
  const week: Item[] = sprint ? sprintItems(state, sprint.id) : draftIds.map((id) => all.find((i) => i.id === id)!);
  const active = sprint?.state === 'active';
  /** Nhóm trưởng được kéo việc khi tuần đang chạy hoặc chưa có tuần (đang chuẩn bị). */
  const canMove = lead && (!sprint || active);

  const shown = byDeadline
    ? [...pool].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    : pool;
  const rankOf = (id: string) => pool.findIndex((i) => i.id === id) + 1;

  const range = sprint ?? sprintRange(today);
  const dueSoon = pool.filter((i) => i.deadline !== null && i.deadline <= range.end);
  const cap = capacity(state);
  const openCount = week.filter((i) => i.status !== 'done').length;
  const unclear = pool.filter((i) => !i.clear).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function add() {
    const t = title.trim();
    if (!t) return;
    const item = newItem(t);
    set((d) => void d.items.push(item));
    setTitle('');
  }

  function toWeek(ids: string[]) {
    if (!canMove || ids.length === 0) return;
    set((d) => {
      const s = currentSprint(d);
      if (!s) {
        for (const id of ids) if (!d.weekDraft.includes(id)) d.weekDraft.push(id);
        return;
      }
      const moved: Item[] = [];
      for (const id of ids) {
        const it = d.items.find((i) => i.id === id);
        if (!it || it.sprintId !== null) continue;
        it.sprintId = s.id;
        it.status = 'todo';
        it.carried = false;
        it.stuck = false;
        moved.push(it);
      }
      const movedIds = moved.map((m) => m.id);
      d.items = [...d.items.filter((i) => !movedIds.includes(i.id)), ...moved];
    });
  }

  function toPool(id: string, beforeId?: string) {
    if (!canMove) return;
    set((d) => {
      const s = currentSprint(d);
      if (!s) {
        d.weekDraft = d.weekDraft.filter((x) => x !== id);
        return;
      }
      const it = d.items.find((i) => i.id === id);
      // Việc đã bắt đầu làm thì không kéo ra khỏi tuần được.
      if (!it || it.sprintId !== s.id || it.status !== 'todo') return;
      it.sprintId = null;
      it.forSprintGoal = false;
      const rest = d.items.filter((i) => i.id !== id);
      const at = beforeId ? rest.findIndex((i) => i.id === beforeId) : rest.findIndex((i) => i.sprintId === null);
      rest.splice(at < 0 ? 0 : at, 0, it);
      d.items = rest;
    });
  }

  function reorder(fromId: string, toId: string) {
    set((d) => {
      const hidden = currentSprint(d) ? [] : d.weekDraft;
      const list = d.items.filter((i) => i.sprintId === null && !hidden.includes(i.id));
      const from = list.findIndex((i) => i.id === fromId);
      const to = list.findIndex((i) => i.id === toId);
      if (from < 0 || to < 0) return;
      const next = arrayMove(list, from, to);
      const drafted = d.items.filter((i) => i.sprintId === null && hidden.includes(i.id));
      d.items = [...next, ...drafted, ...d.items.filter((i) => i.sprintId !== null)];
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const id = String(a.id);
    const overId = String(over.id);
    const fromWeek = week.some((i) => i.id === id);
    const overWeek = overId === WEEK || week.some((i) => i.id === overId);
    if (!fromWeek && overWeek) return toWeek([id]);
    if (fromWeek && !overWeek) return toPool(id, overId === POOL ? undefined : overId);
    if (!fromWeek && !overWeek && overId !== POOL && !byDeadline) reorder(id, overId);
  }

  function startWeek() {
    if (!lead || sprint || week.length === 0 || !goal.trim()) return;
    const r = sprintRange(today);
    const ids = week.map((i) => i.id);
    const next: Sprint = {
      id: uid(),
      number: state.sprints.length + 1,
      start: r.start,
      end: r.end,
      goal: goal.trim(),
      state: 'active',
      goalResult: null,
      plannedCount: ids.length,
      doneCount: 0,
      doneTitles: [],
      improvementId: null,
      retroSkipped: false,
      refinedAt: null,
    };
    set((d) => {
      d.sprints.push(next);
      const picked = ids.map((id) => d.items.find((i) => i.id === id)!).filter(Boolean);
      for (const it of picked) {
        it.sprintId = next.id;
        it.status = 'todo';
        it.carried = false;
        it.stuck = false;
        it.urgentAdd = false;
      }
      d.items = [...d.items.filter((i) => !ids.includes(i.id)), ...picked];
      d.weekDraft = [];
    });
    setGoal('');
  }

  const meta = (item: Item) => (
    <div className="row-wrap" style={{ marginTop: 4 }}>
      <DueTag state={state} item={item} />
      <PriorityTag priority={item.priority} all />
      {item.assigneeId && <span className="tag">{memberName(state, item.assigneeId)}</span>}
      {item.carried && <span className="tag tag-warn">Dở dang từ tuần trước</span>}
      {!item.clear && <span className="tag">Chưa rõ</span>}
    </div>
  );

  const poolRow = (item: Item, handle: ReactNode) => (
    <>
      {handle}
      <span className="rank">{rankOf(item.id)}</span>
      <div className="grow">
        <div className="title">{item.title}</div>
        {meta(item)}
      </div>
      {editable && (
        <button className="btn-icon" aria-label={`Sửa "${item.title}"`} onClick={() => setEditing(item.id)}>
          <Pencil size={18} />
        </button>
      )}
      {canMove && (
        <button
          className="btn-icon"
          aria-label={`Đưa "${item.title}" vào tuần này`}
          title="Đưa vào tuần này"
          onClick={() => toWeek([item.id])}
        >
          <ArrowRight size={18} />
        </button>
      )}
    </>
  );

  const weekRow = (item: Item, handle: ReactNode) => {
    const movable = canMove && (!sprint || item.status === 'todo');
    return (
      <>
        {movable ? handle : null}
        <div className="grow">
          <div className="title">{item.title}</div>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <DueTag state={state} item={item} />
            {sprint && <span className={`tag${item.status === 'done' ? ' tag-ok' : ''}`}>{STATUS_LABEL[item.status]}</span>}
            <PriorityTag priority={item.priority} />
          </div>
        </div>
        <Avatar state={state} memberId={item.assigneeId} small />
        {movable && (
          <button
            className="btn-icon"
            aria-label={`Đưa "${item.title}" ra khỏi tuần này`}
            title="Đưa ra khỏi tuần này"
            onClick={() => toPool(item.id)}
          >
            <ArrowLeft size={18} />
          </button>
        )}
      </>
    );
  };

  const editingItem = all.find((i) => i.id === editing);
  const overdue = pool.filter((i) => (daysLeft(state, i.deadline) ?? 0) < 0).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Task tuần này</h1>
          <p className="muted prose">Đội cần làm gì, việc nào trước, việc nào sắp hết hạn.</p>
        </div>
        {lead && unclear > 0 && (
          <button className="btn btn-ghost" onClick={() => start('refine')}>
            Làm rõ {Math.min(unclear, 5)} việc đầu
            <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </div>

      <Tip id="weekly-tasks">
        {lead
          ? 'Kéo một việc vào khung "Cần làm tuần này" (hoặc bấm mũi tên) để đưa vào tuần. Kéo lên xuống trong danh sách "Đội cần làm gì" để đổi thứ tự ưu tiên.'
          : `Ai cũng thêm việc được. ${ROLE_LABEL.owner} là người xếp ưu tiên và chọn việc cho tuần.`}
      </Tip>
      <HelpLine state={state} />

      {canMove && dueSoon.length > 0 && (
        <div className="notice">
          <TriangleAlert size={18} aria-hidden />
          <span className="grow">
            {dueSoon.length} việc hết hạn trước {fmtDay(range.end)} mà chưa vào tuần.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => toWeek(dueSoon.map((i) => i.id))}>
            Đưa cả {dueSoon.length} vào tuần
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={collide} onDragEnd={onDragEnd}>
        <div className="week-grid">
          <Zone id={POOL} label="Đội cần làm gì">
            <div className="column-head">
              <h2>Đội cần làm gì</h2>
              <span className="tag mono">{pool.length}</span>
            </div>
            <p className="small muted">Kho việc của đội. Việc quan trọng nhất ở trên cùng.</p>
            <div className="row-wrap">
              <div className="chips" role="group" aria-label="Sắp xếp">
                <button className={`chip${!byDeadline ? ' on' : ''}`} aria-pressed={!byDeadline} onClick={() => setByDeadline(false)}>
                  Theo ưu tiên
                </button>
                <button className={`chip${byDeadline ? ' on' : ''}`} aria-pressed={byDeadline} onClick={() => setByDeadline(true)}>
                  Theo Deadline
                </button>
              </div>
              {overdue > 0 && <span className="tag tag-late">{overdue} việc quá hạn</span>}
            </div>
            {editable && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <input
                  className="input grow"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Thêm việc mới, nhấn Enter"
                  aria-label="Thêm việc mới"
                />
                <button className="btn btn-ghost" type="submit" disabled={!title.trim()}>
                  <Plus size={18} aria-hidden />
                  Thêm
                </button>
              </form>
            )}
            {pool.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>
                <EmptyBlocks />
                <p className="muted small prose">
                  {week.length > 0
                    ? 'Mọi việc đã nằm trong tuần này.'
                    : 'Chưa có việc nào. Brainstorm để ra danh sách task, hoặc gõ một việc vào ô phía trên.'}
                </p>
                {week.length === 0 && lead && (
                  <button className="btn btn-primary" onClick={() => go('brainstorm')}>
                    Mở Brainstorm
                    <ArrowRight size={18} aria-hidden />
                  </button>
                )}
              </div>
            ) : (
              <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="stack-sm">
                  {shown.map((item) => (
                    <SortRow key={item.id} id={item.id} disabled={!canMove} label="Kéo để đổi ưu tiên hoặc đưa vào tuần">
                      {(handle) => poolRow(item, handle)}
                    </SortRow>
                  ))}
                </div>
              </SortableContext>
            )}
            {pool.length > 50 && (
              <div className="notice">
                <TriangleAlert size={18} aria-hidden />
                <span>Đã hơn 50 việc. Thử dọn bớt những việc đã lâu không ai động tới.</span>
              </div>
            )}
          </Zone>

          <Zone id={WEEK} label="Cần làm tuần này" highlight>
            <div className="column-head">
              <h2>Cần làm tuần này</h2>
              <span className="tag mono">{week.length}</span>
            </div>
            {sprint ? (
              <p className="small row" style={{ gap: 6 }}>
                <Flag size={15} aria-hidden />
                <span>
                  <span className="muted">Mục tiêu tuần: </span>
                  <strong>{sprint.goal}</strong>
                </span>
              </p>
            ) : (
              <p className="small muted">
                Tuần mới: {fmtDay(range.start)} tới {fmtDay(range.end)}. Chưa bắt đầu.
              </p>
            )}
            {week.length > 0 && (
              <p className={`small${openCount > cap.value ? '' : ' muted'}`} style={openCount > cap.value ? { color: 'var(--lava-ink)', fontWeight: 600 } : undefined}>
                {openCount > cap.value
                  ? cap.fromHistory
                    ? `Các tuần trước đội xong khoảng ${cap.value} việc, tuần này đang có ${openCount}.`
                    : `Đội ${workers(state).length} người nên bắt đầu với khoảng ${cap.value} việc, tuần này đang có ${openCount}.`
                  : `${openCount} việc chưa xong · sức làm của đội khoảng ${cap.value} việc mỗi tuần.`}
              </p>
            )}
            {week.length === 0 ? (
              <p className="drop-hint small muted">
                {canMove
                  ? 'Kéo việc vào đây, hoặc bấm mũi tên trên từng việc.'
                  : sprint
                    ? 'Tuần này chưa có việc nào.'
                    : `${ROLE_LABEL.owner} chưa chọn việc cho tuần mới.`}
              </p>
            ) : (
              <div className="stack-sm">
                {week.map((item) => (
                  <DragRow key={item.id} id={item.id} disabled={!canMove || (!!sprint && item.status !== 'todo')}>
                    {(handle) => weekRow(item, handle)}
                  </DragRow>
                ))}
              </div>
            )}

            {!sprint && lead && (
              <div className="stack-sm start-week">
                <div className="field">
                  <label htmlFor="week-goal">Mục tiêu tuần</label>
                  <input
                    id="week-goal"
                    className="input"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Nếu cuối tuần chỉ đạt được 1 điều, đó là gì?"
                  />
                </div>
                <button className="btn btn-primary" disabled={week.length === 0 || !goal.trim()} onClick={startWeek}>
                  Bắt đầu tuần với {week.length} việc
                  <ArrowRight size={18} aria-hidden />
                </button>
                <p className="small muted">
                  Muốn app dẫn từng bước (khoảng 45 phút)?{' '}
                  <button className="link" onClick={() => start('planning')}>
                    Mở buổi lên kế hoạch tuần
                  </button>
                </p>
              </div>
            )}
            {sprint && (
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('board')}>
                Mở bảng việc
                <ArrowRight size={18} aria-hidden />
              </button>
            )}
            {sprint && !active && <p className="small muted">Tuần đang ở bước xem kết quả nên danh sách đã khoá.</p>}
          </Zone>
        </div>
      </DndContext>

      {editingItem && <EditModal item={editingItem} canDelete={lead} canPlan={lead} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Zone({ id, label, highlight, children }: { id: string; label: string; highlight?: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`zone${highlight ? ' zone-week' : ''}${isOver && highlight ? ' over' : ''}`} aria-label={label}>
      {children}
    </section>
  );
}

function Handle({ label, bind }: { label: string; bind: object }) {
  return (
    <button className="btn-icon handle" aria-label={label} {...bind}>
      <GripVertical size={18} />
    </button>
  );
}

function SortRow({
  id,
  disabled,
  label,
  children,
}: {
  id: string;
  disabled: boolean;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : <Handle label={label} bind={{ ...attributes, ...listeners }} />;
  return (
    <div
      ref={setNodeRef}
      className={`list-item${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative' }}
    >
      {children(handle)}
    </div>
  );
}

function DragRow({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const handle = disabled ? null : <Handle label="Kéo ra khỏi tuần này" bind={{ ...attributes, ...listeners }} />;
  return (
    <div
      ref={setNodeRef}
      className={`list-item${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), position: 'relative' }}
    >
      {children(handle)}
    </div>
  );
}
