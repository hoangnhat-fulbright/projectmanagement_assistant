import type { Item, State } from '../types';
import {
  backlog,
  checkedInToday,
  currentSprint,
  isDue,
  me,
  memberName,
  openImpediments,
  owner,
  sprintItems,
  todayISO,
} from '../store';
import { dow, fmtDay, isWorkday } from './dates';
import { pollStatus, pollToConfirm, unansweredPoll } from './meeting';

export type ActionKind =
  | 'plan'
  | 'wait-plan'
  | 'review'
  | 'retro'
  | 'join'
  | 'not-started'
  | 'day-off'
  | 'unblock'
  | 'checkin'
  | 'refine'
  | 'summary'
  | 'work'
  | 'pick-slots'
  | 'confirm-slot'
  | 'brainstorm'
  | 'observe'
  | 'check-work'
  | 'redo';

export interface NextAction {
  kind: ActionKind;
  title: string;
  desc: string;
  cta: string;
  /** Thời lượng ước tính hiển thị trên thẻ. */
  time?: string;
  urgent?: boolean;
}

/** Quyết định thẻ "Việc tiếp theo" trên màn hình Hôm nay. Xem wiki: features/core-loop. */
export function nextAction(state: State): NextAction {
  const user = me(state);
  const isOwner = user.role === 'owner';
  const boss = owner(state).name;
  const sprint = currentSprint(state);
  const today = todayISO(state);

  if (user.role === 'observer') return observeAction(state);

  if (!sprint) {
    if (isOwner && backlog(state).length === 0 && !state.brainstorm?.exported) {
      return {
        kind: 'brainstorm',
        title: 'Brainstorm dự án',
        desc: 'Biến ý tưởng thành Goal, các Milestone và danh sách task có Deadline. App dẫn nhóm đi từng bước.',
        cta: state.brainstorm ? 'Tiếp tục Brainstorm' : 'Mở Brainstorm',
        time: 'Khoảng 40 phút',
      };
    }
    if (isOwner) {
      return {
        kind: 'plan',
        title: 'Lên kế hoạch tuần',
        desc: 'Chọn một mục tiêu và các việc cho tuần này. App dẫn bạn đi từng bước.',
        cta: 'Bắt đầu lên kế hoạch',
        time: 'Khoảng 45 phút',
      };
    }
    if (isWorkday(today)) {
      const poll = pollAction(state);
      if (poll) return poll;
    }
    return {
      kind: 'wait-plan',
      title: 'Tuần mới chưa bắt đầu',
      desc: `${boss} sẽ chọn việc cho tuần. Trong lúc chờ, bạn có thể xem và thêm việc ở Task tuần này.`,
      cta: 'Mở Task tuần này',
    };
  }

  const due = sprint.state === 'active' && isDue(state, sprint);

  if (sprint.state === 'review' || due) {
    const late = today > sprint.end;
    if (isOwner) {
      return {
        kind: 'review',
        title: late ? 'Làm bù: Xem kết quả tuần' : 'Xem kết quả tuần',
        desc: 'Cùng đội xem tuần qua đã làm ra gì, rồi rút kinh nghiệm cho tuần sau.',
        cta: 'Bắt đầu xem kết quả',
        time: 'Khoảng 30 phút',
      };
    }
    return {
      kind: 'join',
      title: 'Đến giờ xem kết quả',
      desc: `${boss} sẽ mở buổi xem kết quả. Hãy xem lại các việc bạn đã xong để giới thiệu ngắn.`,
      cta: 'Xem việc của tuần',
    };
  }

  if (sprint.state === 'retro') {
    if (isOwner) {
      return {
        kind: 'retro',
        title: 'Rút kinh nghiệm',
        desc: 'Ba câu hỏi ngắn và chọn một điều để làm tốt hơn ở tuần sau.',
        cta: 'Bắt đầu rút kinh nghiệm',
        time: 'Khoảng 30 phút',
      };
    }
    return {
      kind: 'join',
      title: 'Đến giờ rút kinh nghiệm',
      desc: `${boss} sẽ mở buổi rút kinh nghiệm. Nghĩ trước: điều gì làm tốt, điều gì gây khó.`,
      cta: 'Xem việc của tuần',
    };
  }

  // Tuần đang chạy
  if (today < sprint.start) {
    // Tuần chưa tới ngày đầu nhưng đã có việc được nộp hoặc bị trả lại: đó mới là việc tiếp theo.
    const early = sprintItems(state, sprint.id);
    const pending = isOwner
      ? checkWorkAction(state, early)
      : redoAction(state, early.filter((i) => i.assigneeId === user.id));
    if (pending) return pending;
    return {
      kind: 'not-started',
      title: `Tuần bắt đầu ${fmtDay(sprint.start)}`,
      desc: 'Kế hoạch đã sẵn sàng. Hôm đó app sẽ nhắc bạn check-in.',
      cta: 'Xem việc của tuần',
    };
  }

  if (!isWorkday(today)) {
    return {
      kind: 'day-off',
      title: 'Hôm nay là ngày nghỉ',
      desc: 'Không có việc gì cần làm trong app. Hẹn gặp lại vào ngày làm việc.',
      cta: 'Xem việc của tuần',
    };
  }

  const items = sprintItems(state, sprint.id);
  const mine = items.filter((i) => i.assigneeId === user.id && i.status !== 'done');
  const checked = checkedInToday(state, user.id);

  if (isOwner) {
    const stuck = openImpediments(state, sprint.id);
    if (stuck.length > 0) {
      const first = stuck[0];
      const more = stuck.length > 1 ? ` (và ${stuck.length - 1} người khác)` : '';
      return {
        kind: 'unblock',
        title: `Gỡ vướng cho ${memberName(state, first.memberId)}${more}`,
        desc: first.note || 'Có người đang bị kẹt. Gỡ vướng là việc quan trọng nhất lúc này.',
        cta: 'Xem và gỡ vướng',
        urgent: true,
      };
    }
    if (!checked && mine.length > 0) {
      return checkinAction();
    }
    const toCheck = checkWorkAction(state, items);
    if (toCheck) return toCheck;
    const ownerPoll = pollAction(state);
    if (ownerPoll) return ownerPoll;
    const d = dow(today);
    const unclear = backlog(state).filter((i) => !i.clear).length;
    if ((d === 3 || d === 4) && !sprint.refinedAt && unclear > 0) {
      return {
        kind: 'refine',
        title: 'Làm rõ việc cho tuần sau',
        desc: `Có ${unclear} việc trong Kho chưa rõ. Làm rõ trước để buổi lên kế hoạch tuần sau nhanh hơn.`,
        cta: 'Bắt đầu làm rõ việc',
        time: 'Khoảng 15 phút',
      };
    }
    const team = state.members.filter((m) => items.some((i) => i.assigneeId === m.id));
    const done = team.filter((m) => checkedInToday(state, m.id)).length;
    return {
      kind: 'summary',
      title: 'Hôm nay không ai bị kẹt',
      desc:
        team.length > 0
          ? `${done}/${team.length} người đã check-in. Bạn không cần làm gì thêm, chỉ cần xem qua bảng việc.`
          : 'Chưa có việc nào được nhận. Mở bảng việc để phân việc cho đội.',
      cta: 'Mở bảng việc',
    };
  }

  if (!checked) return checkinAction();

  const redo = redoAction(state, mine);
  if (redo) return redo;

  const memberPoll = pollAction(state);
  if (memberPoll) return memberPoll;

  const doing = mine.find((i) => i.status === 'doing') ?? mine[0];
  return {
    kind: 'work',
    title: doing ? `Tiếp tục: ${doing.title}` : 'Bạn đã xong hết việc của mình',
    desc: doing
      ? 'Bạn đã check-in hôm nay. Khi xong việc, bấm "Nộp việc" trên thẻ ở bảng việc.'
      : 'Xem bảng việc để nhận thêm việc giúp đạt mục tiêu tuần.',
    cta: 'Mở bảng việc',
  };
}

/** Nhóm trưởng: có việc đã nộp đang chờ duyệt. */
function checkWorkAction(state: State, items: Item[]): NextAction | null {
  const waiting = items.filter((i) => i.status === 'checking');
  if (waiting.length === 0) return null;
  return {
    kind: 'check-work',
    title: waiting.length === 1 ? `Kiểm tra việc đã nộp: ${waiting[0].title}` : `Kiểm tra ${waiting.length} việc đã nộp`,
    desc: `${memberName(state, waiting[0].assigneeId)}${waiting.length > 1 ? ' và người khác' : ''} đang chờ bạn duyệt xong hoặc trả lại kèm lý do.`,
    cta: 'Mở bảng việc',
  };
}

/** Thành viên: có việc bị trả lại để làm lại. */
function redoAction(state: State, mine: Item[]): NextAction | null {
  const back = mine.find((i) => i.status === 'returned');
  if (!back) return null;
  return {
    kind: 'redo',
    title: `Làm lại: ${back.title}`,
    desc: back.returned ? `${memberName(state, back.returned.byId)} trả lại: ${back.returned.reason}` : 'Việc này bị trả lại để làm lại.',
    cta: 'Mở bảng việc',
    urgent: true,
  };
}

/** Observer: không có việc gì phải làm, chỉ có thứ để xem. */
function observeAction(state: State): NextAction {
  const sprint = currentSprint(state);
  if (!sprint) {
    return {
      kind: 'observe',
      title: 'Đội chưa bắt đầu tuần làm việc',
      desc: `${owner(state).name} đang chuẩn bị kế hoạch. Bạn xem được danh sách việc và phiên Brainstorm.`,
      cta: 'Xem Task tuần này',
    };
  }
  const items = sprintItems(state, sprint.id);
  const done = items.filter((i) => i.status === 'done').length;
  const late = items.filter((i) => i.status !== 'done' && i.deadline !== null && i.deadline < todayISO(state)).length;
  return {
    kind: 'observe',
    title: `Đội đã xong ${done}/${items.length} việc của tuần`,
    desc: late > 0 ? `${late} việc đã quá Deadline. Xem chi tiết trên bảng việc.` : 'Không có việc nào quá Deadline. Xem chi tiết trên bảng việc.',
    cta: 'Mở bảng việc',
  };
}

/** Thẻ cho tính năng tìm giờ họp: nhóm trưởng chốt giờ khi đã có đề xuất; người được mời chọn giờ rảnh. */
function pollAction(state: State): NextAction | null {
  const user = me(state);
  const today = todayISO(state);
  if (user.role === 'owner') {
    const p = pollToConfirm(state.polls, state.responses, today);
    if (p) {
      const expired = pollStatus(p, state.responses, today) === 'expired';
      return {
        kind: 'confirm-slot',
        title: expired ? `Dùng giờ mặc định cho "${p.title}"?` : 'Chốt giờ họp',
        desc: expired
          ? 'Đã hết hạn mà chưa ai trả lời. Bạn có thể dùng giờ mặc định hoặc chờ thêm.'
          : `Đội đã trả lời cho "${p.title}". App đã tìm ra giờ đẹp nhất, bạn chỉ cần chốt.`,
        cta: expired ? 'Xem lựa chọn' : 'Xem giờ đẹp nhất',
      };
    }
  }
  const q = unansweredPoll(state.polls, state.responses, user.id, today);
  if (q) {
    return {
      kind: 'pick-slots',
      title: 'Chọn giờ rảnh',
      desc: `${memberName(state, q.creatorId)} muốn tìm giờ họp "${q.title}". Bạn rảnh lúc nào?`,
      cta: 'Chọn giờ rảnh',
      time: 'Dưới 1 phút',
    };
  }
  return null;
}

function checkinAction(): NextAction {
  return {
    kind: 'checkin',
    title: 'Check-in hôm nay',
    desc: 'Ba câu hỏi ngắn: hôm nay làm gì, có gì giúp mục tiêu tuần, có bị kẹt không.',
    cta: 'Check-in ngay',
    time: 'Dưới 1 phút',
  };
}

/** Nhắc việc trong app — tối đa 2 nhắc cho mỗi người. Xem wiki: features/nudges-and-reminders. */
export function reminders(state: State): string[] {
  return [...rhythmReminders(state), ...pollReminders(state)].slice(0, 2);
}

/** Nhắc về tìm giờ họp: người chưa trả lời, và Chủ khi đã có đề xuất. Không nhắc ngày nghỉ. */
function pollReminders(state: State): string[] {
  const today = todayISO(state);
  if (!isWorkday(today)) return [];
  const user = me(state);
  const out: string[] = [];
  if (user.role === 'owner') {
    const p = pollToConfirm(state.polls, state.responses, today);
    if (p) {
      out.push(
        pollStatus(p, state.responses, today) === 'expired'
          ? `Chưa ai trả lời cho "${p.title}". Dùng giờ mặc định?`
          : `Đã có giờ đẹp nhất cho "${p.title}" — chốt giờ họp.`,
      );
    }
  }
  const q = unansweredPoll(state.polls, state.responses, user.id, today);
  if (q) out.push(`Bạn chưa chọn giờ rảnh cho "${q.title}".`);
  return out;
}

function rhythmReminders(state: State): string[] {
  const out: string[] = [];
  const user = me(state);
  const sprint = currentSprint(state);
  const today = todayISO(state);
  if (user.role === 'observer') return out;
  if (!sprint) {
    if (user.role === 'owner') out.push('Chưa có kế hoạch cho tuần này.');
    return out;
  }
  if (sprint.state !== 'active' || !isWorkday(today) || today < sprint.start) return out;
  const stuck = openImpediments(state, sprint.id);
  if (user.role === 'owner' && stuck.length > 0) out.push(`${stuck.length} người đang bị kẹt, cần bạn gỡ vướng.`);
  const its = sprintItems(state, sprint.id);
  const waiting = its.filter((i) => i.status === 'checking').length;
  if (user.role === 'owner' && waiting > 0) out.push(`${waiting} việc đã nộp đang chờ bạn kiểm tra.`);
  const returned = its.filter((i) => i.assigneeId === user.id && i.status === 'returned').length;
  if (returned > 0) out.push(`${returned} việc của bạn bị trả lại, cần làm lại.`);
  const late = its.filter((i) => i.assigneeId === user.id && i.status !== 'done' && i.deadline !== null && i.deadline < today).length;
  if (late > 0) out.push(`${late} việc của bạn đã quá Deadline.`);
  const hasWork = sprintItems(state, sprint.id).some((i) => i.assigneeId === user.id && i.status !== 'done');
  if (hasWork && !checkedInToday(state, user.id)) out.push('Bạn chưa check-in hôm nay (30 giây).');
  if (today === sprint.end) out.push(`Xem kết quả và rút kinh nghiệm lúc ${state.settings.reviewHour}:00 hôm nay.`);
  return out.slice(0, 2);
}
