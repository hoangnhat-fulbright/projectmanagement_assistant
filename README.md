# Cam kết sau họp

_English version. Bản tiếng Việt: [README.vi.md](README.vi.md)._

**Cam kết sau họp** ("Commitments after the meeting") turns every meeting into commitments that are tracked until they are done. You paste a meeting transcript; AI extracts each task together with the sentence that proves it; each person gets one email and confirms their own tasks with one click, no account needed; after that the app reminds them in a real free gap in their calendar instead of at a fixed hour when everyone is in another meeting. Meeting note tools stop at the minutes; this app starts from them.

| Deliverable | Where |
|---|---|
| Source code | This repository: `src/`, `test/`, `scripts/`, `evals/` |
| README (this page) | Product, how to run it, our workflow with Claude, team |
| Tracking plan | [TRACKING_PLAN.md](TRACKING_PLAN.md) |
| Design documents | [wiki/](wiki/README.md), 12 pages, in Vietnamese |

The app's interface, emails and design documents are in Vietnamese, because the first users are Vietnamese teams. Interface labels below are quoted as they appear on screen, with a translation.

## The problem

Three things usually go wrong after a meeting:

- **Nobody formally takes the task.** Action items sit in the minutes. A week later the team finds out that "I thought you were doing it".
- **Reminders arrive at the wrong time.** A 9 a.m. reminder lands exactly when people are in meetings, so it gets ignored.
- **Nobody sees the dependency chain.** One task waits on another; the first slips, the whole chain slips, and the team only learns it right before the next meeting.

More in [wiki/01-tong-quan-san-pham.md](wiki/01-tong-quan-san-pham.md).

## Target users

Teams of 5–30 people with recurring meetings (standup, weekly, sprint review).

| Role | What they need | What they use in the app |
|---|---|---|
| Meeting organizer, team lead | To know who took which task without asking each person | The summary board: tasks nobody took, declined tasks, expired requests |
| Team member | Not to forget what they promised; to be reminded when they are free | The one-click confirmation email, the calendar-aware reminder email |

## Core features

| Feature | Status |
|---|---|
| **Task extraction from a transcript** with Claude. Every task must carry a verbatim quote; code drops any task whose quote is not found in the transcript | Working |
| **One-Click Commitment.** Each person gets one email with all of their tasks and three buttons: Confirm, Edit, Not mine. No account needed | Working |
| **Summary board for the organizer.** Reassign, resend, drop a task, mark it done | Working |
| **Context-Aware Nudging.** A prep reminder 2 hours before the related meeting, moved earlier to the nearest free gap if the person is busy then; a gap reminder when less than 48 hours remain before the deadline; at most 3 reminders per person per day, at least 90 minutes apart | Working with manually entered calendars. Google Calendar is not connected yet |
| **Blocker Detection.** Early warning when a late task is about to delay another one | Design only ([wiki/05](wiki/05-blocker-detection.md)) |
| **Recording and transcription** inside the app | Design only. The app currently takes a pasted transcript |

Three product principles: few notifications, well aimed; AI proposes, people decide; one person's calendar is never shown to anyone else.

## Launch channel, getting users and revenue

This section is a plan. The product has no real users and no revenue yet.

- **Launch channel: the confirmation email itself.** The organizer is the only person who has to know about the app. Everyone else meets the product for the first time through an email titled "Confirm 2 tasks from the meeting…" and can use it right away, with nothing to install and no sign-up. Each meeting therefore puts the product in front of 5–10 new people, and today's recipient is the organizer of a different meeting tomorrow.
- **Launch order:** our own team uses it for our own meetings for 2 weeks to get real data; then a few teams we know at software companies; only then public sign-up.
- **Revenue:** charge per organizer (the person who creates meetings and sees the summary board). People who only receive and confirm tasks pay nothing, so the loop above is never blocked. The price is not set; this decision is still open (item S7 in [wiki/12-quyet-dinh-mo.md](wiki/12-quyet-dinh-mo.md)).
- **The metric that decides whether we continue:** the share of tasks confirmed within 24 hours, with an initial target of at least 70%. How we measure it is in [TRACKING_PLAN.md](TRACKING_PLAN.md).

## How to run it

You need Node.js 24 or later. There is no build step and no database to install.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000, then choose **Cuộc họp mới** (New meeting) → **Điền ví dụ mẫu** (Fill in the sample) → **Trích xuất task** (Extract tasks). The first start takes about 10 seconds to create the database.

Nothing needs to be configured to try it, but by default the app runs in two trial modes:

| Trial mode | Why | How to switch to the real thing |
|---|---|---|
| **Demo** extraction (keyword rules) | No Claude key yet | Set `ANTHROPIC_API_KEY` in `.env` |
| Email stays at **/outbox** and is not sent | No SMTP yet | Set `SMTP_URL` and `MAIL_FROM` in `.env` |

Copy `.env.example` to `.env` to configure. When you put the app online, `APP_PASSWORD` and `BASE_URL` are required. The app is not deployed at any public address yet.

### The flow

1. The organizer pastes the transcript and the list of participants.
2. AI extracts the tasks, each with a verbatim quote. A task whose quote is not found in the transcript is dropped.
3. Each person receives **one** email with all of their tasks; each task has three buttons: Xác nhận (Confirm), Sửa (Edit), Không phải của tôi (Not mine).
4. A button opens a page; the action only happens when the person clicks again on that page, so email scanners that open links cannot confirm on someone's behalf.
5. The organizer follows the summary board: tasks with no owner, declined tasks and expired requests all come back here.
6. No response after 4 hours triggers one reminder; after 72 hours the request expires. A person who has calendar data is reminded in the first free gap after the 4-hour mark.
7. A committed task is reminded according to its owner's calendar (see below).

### Calendar-aware reminders (phase 2)

The design is in [wiki/04-context-aware-nudging.md](wiki/04-context-aware-nudging.md). What runs today:

| Reminder | When |
|---|---|
| Prep reminder | 2 hours before the related meeting or the deadline (twice the estimated effort if that is longer). If the person is busy then, it moves **earlier** to the start of the nearest free gap, never later |
| Gap reminder | The task is not started and less than 48 hours remain: sent at the start of the highest-scoring gap (long enough to finish, close to the deadline) |
| Deadline reminder | For a person with no calendar data: 2 hours before the deadline, inside default working hours |

- At most 3 reminders per person per day, at least 90 minutes apart; tasks due for a reminder at the same moment go into one email.
- The reminder email has the buttons **Xong rồi** (Done), **Đang làm** (In progress), **Nhắc ở khoảng trống sau** (Remind me in the next gap), **Dời hạn** (Move the deadline). After two snoozes the app asks about moving the deadline instead of reminding again.
- The reminder schedule is recomputed when the task or the calendar changes, and checked again right before sending (is the task still open, is the person busy right now).
- The organizer sees only how many reminders a task has, not when they fire: the time of a reminder reveals its owner's calendar.

To try it:

1. Create a meeting from the sample, open **Hộp thư thử** (Test outbox) and confirm a task on the recipient's behalf.
2. Go to **Lịch thử** (Test calendar), pick that person, save their working hours (tick T7 and CN, Saturday and Sunday, if you are trying this on a weekend) and add a few busy blocks. From now on that person is reminded by calendar; the **Lời nhắc** (Reminders) section at the bottom of the page shows when each reminder will fire and why.
3. On the meeting page, open **Nhắc việc** (Reminders) on the task card to attach a related meeting and an effort estimate.
4. When the time comes, the reminder email appears in **Hộp thư thử** (the app checks every minute; the **Chạy lượt nhắc ngay** (Run reminders now) button on the Test calendar page saves the wait).

The app does not remind anyone during the first 30 minutes after they confirm a task. When trying it out, set `NUDGE_QUIET_AFTER_COMMIT_MINUTES=0` in `.env` to remove this quiet period.

**Lịch thử** is a manually entered calendar source. It sits behind the same interface (`CalendarSource` in `src/calendar/source.ts`) that Google Calendar will use. A real Google Calendar connection needs an OAuth client and has not been built.

### Commands

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm run dev` | Run and restart on code changes |
| `npm test` | Run the 48 tests (in-memory database, fake clock, no network) |
| `npm run try:claude` | Run the Claude extractor on the sample and print the result. Add `-- transcript.txt participants.txt` to try your own transcript. Each run is a paid API call |
| `npm run typecheck` | Type-check the TypeScript |

### Code layout

| Path | Contents |
|---|---|
| `src/main.ts` | Starts the server and the periodic job (every minute) |
| `src/app.ts` | Routes: organizer pages, the Test calendar pages, and the action page `/a/:token` |
| `src/pipeline.ts` | Extract → validate → store tasks → send confirmation requests |
| `src/ai/` | The Claude extractor, the demo extractor, and the validation step |
| `src/domain/tasks.ts` | The task state machine and the event log |
| `src/domain/tokens.ts` | Single-use tokens for links in emails |
| `src/domain/notify.ts` | Groups tasks per person and sends email |
| `src/sweeper.ts` | Expiry, and the 4-hour confirmation reminder for people without a calendar |
| `src/nudge/gaps.ts` | Finds free gaps in a calendar (pure, no I/O; phase 3 will reuse it) |
| `src/nudge/timing.ts` | Picks reminder times: prep, gap and confirmation reminders (pure) |
| `src/domain/nudges.ts` | Rescheduling, the pre-send check, anti-spam limits, sending reminder emails |
| `src/domain/calendar.ts` | The busy/free copy and working hours in the database |
| `src/calendar/source.ts` | The calendar source interface, syncing into the copy, a fake source |
| `src/schema.sql` | Database schema |
| `src/views.ts`, `src/email.ts` | Web pages and email content |
| `evals/` | A scripted transcript with an answer key written beforehand, for grading the extractor |

The code is TypeScript run directly by Node; the web layer is Hono with server-rendered HTML. The database is PGlite (Postgres running inside the Node process), with data in `data/pg`. The SQL is standard Postgres; moving to a real Postgres server only means rewriting `src/db.ts`.

## Our AI-native workflow

Claude appears in two places: as the tool we used to build the product (Claude Code), and as part of the product (task extraction through the Claude API).

### How we used Claude

1. **Design first, code second.** Before the first line of code, we wrote a 12-page wiki with Claude: the problem, each feature, the data model, security, the roadmap, and a list of open decisions. Each feature was then handed to Claude with its own wiki page as the specification.
2. **One Claude Code session per phase.** One session built phase 1, then started another for phase 2 with a short brief: what to read first, what to build, and when it counts as done. Sessions leave hand-over notes for each other.
3. **"Done" is something Claude can check itself.** Each brief ends with: `npm test` and `npm run typecheck` pass, the worked example in the wiki becomes a test, and the feature is run in a browser. Claude opens the browser itself, clicks through the whole flow and takes screenshots as proof.
4. **Claude writes down every decision it makes on its own.** Where the specification is silent, Claude picks an option and records it in the decision log ([wiki/12](wiki/12-quyet-dinh-mo.md)) and in the section listing where the running code differs from the design ([wiki/04](wiki/04-context-aware-nudging.md#bản-đang-chạy-khác-gì-thiết-kế)), so a person can review it later.
5. **Inside the product, Claude proposes and code verifies.** The extractor uses `claude-opus-5-5`. Every task must carry a verbatim quote; code checks that quote against the transcript and drops any task that does not match. Choosing reminder times deliberately does **not** use an LLM: it is a pure algorithm, so results are repeatable and explainable.

### What worked

- **Worked examples with numbers in the specification.** The Nudging design page has a sample calendar ("Lan's Friday") with the expected answers 10:35 and 14:05. Claude turned it into tests first, then wrote the algorithm to pass them. The pure module passed all 14 tests on the first run.
- **Separating pure logic from database code.** The timing algorithm reads neither the database nor the clock, so the 48 tests run in about 40 seconds with no network, and a fake clock can simulate a whole working week.
- **Writing the answer key before running the model.** `evals/sprint-sync` is a scripted meeting full of traps (a deadline changed mid-meeting, a task declined and handed to someone else, sentences mixing English and Vietnamese). Claude extracted 8 of 8 tasks with the right owner and deadline. The first run exposed a subtle bug: the deadline was right but the supporting quote was the sentence spoken *before* the deadline changed. After a prompt fix, three runs out of three quoted the right sentence.
- **Making Claude run it for real.** The browser run took one reminder all the way from scheduling, through the real timer, to the "Done" button, on a separate instance with a temporary database so that live data was untouched.

### What didn't work

- **Where the specification was vague, Claude had to guess, and guessed wrong the first time.** The first run of the reminder flow tests failed 4 of 10. One failure came from Claude misjudging what the scoring rule "closer to the deadline is better" implies; the rest came from test setup. The wiki also contained a self-contradicting example (it said "60 minutes at 14:00" while the rule says a gap starts 5 minutes after the previous meeting), which only surfaced when it was written as a test.
- **Claude added rules that were not in the specification.** For example, the 30-minute quiet period after confirming, or dropping a prep reminder at the rate limit instead of sending it late. These choices are reasonable and were logged, but they are product decisions nobody on the team has validated with users.
- **Extraction is not stable on vague phrasing.** For "I'll send it after this meeting", Claude gave a same-day deadline in 2 of 3 runs and no deadline in 1. We accept this: when the deadline is empty, the recipient picks one while confirming.
- **Things Claude could not do by itself.** Connecting Google Calendar needs an OAuth client created by a person; sending real email needs an SMTP account; judging quality needs transcripts of real meetings. All three are still open, so the product has only been checked on a 9-line sample and one scripted meeting.
- **Every parameter is still a guess.** 2 hours of notice, a 15-minute minimum gap, 3 reminders a day, 90 minutes apart: Claude implemented them exactly as specified, but there is no usage data yet to say whether these numbers are right.
- **Several sessions sharing one folder get in each other's way.** One session's server held the database, so the other had to run on a different port with a temporary database, and the running server had to be restarted to pick up the new schema.

## Team members

<!-- Fill in each person's name, role and contributions before submitting. -->

| Member | Role | Contributions |
|---|---|---|
| _(name)_ | _(role)_ | _(contributions)_ |
| _(name)_ | _(role)_ | _(contributions)_ |
| _(name)_ | _(role)_ | _(contributions)_ |
