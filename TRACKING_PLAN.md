# Tracking plan

_English version. Bản tiếng Việt: [TRACKING_PLAN.vi.md](TRACKING_PLAN.vi.md)._

This document lists the events **Cam kết sau họp** records, what each one measures, and why that matters for the product.

The "Status" column separates two kinds of event: **Recorded** means the current code already stores it in the database; **Not recorded** means it has to be added before real users arrive. There are no real numbers yet: the product has no users.

## The questions we need answered

The product bets on three hypotheses. Every event below exists to test one of them.

| # | Hypothesis | Main metric | Initial target |
|---|---|---|---|
| 1 | People will take a task if it costs one click | Share of tasks confirmed within 24 hours | ≥ 70% |
| 2 | A reminder sent in a free moment gets a response; a fixed-hour reminder does not | Share of reminders that get a response | ≥ 40% |
| 3 | A task that was committed to and reminded at the right time is finished on time more often | Share of committed tasks done before the deadline | Higher than a team not using the app |

Metric 1 decides whether we continue: if recipients do not click Confirm, the two later features have nothing to work on.

**North star metric:** the number of tasks committed to and finished on time each week. It only grows when all three hypotheses hold.

The targets are assumptions to steer by, taken from [wiki/01-tong-quan-san-pham.md](wiki/01-tong-quan-san-pham.md#thước-đo-thành-công).

## The funnel

```
Meeting created
  → task proposed by AI          (proposed)
  → task sent to its owner       (sent)
  → task confirmed               (confirmed)      ← hypothesis 1
  → owner reminded               (nudged)
  → owner responds to reminder   (started / snoozed / due_changed / completed)  ← hypothesis 2
  → task done before deadline    (completed)      ← hypothesis 3
```

## Where events are stored

The app uses no outside analytics service. Events live in the app's own database, in three tables:

| Table | Role | Main columns |
|---|---|---|
| `task_events` | Append-only log of every change to a task | `task_id`, `type`, `actor_participant_id`, `channel`, `payload`, `created_at` |
| `notifications` | Every email sent | `kind`, `recipient_participant_id`, `sent_at`, `error` |
| `nudges` | Every reminder: when it was scheduled, why, and how it ended | `kind`, `scheduled_for`, `status`, `reason`, `response`, `sent_at` |

Properties common to every row in `task_events`:

| Property | Values | Used for |
|---|---|---|
| `channel` | `email_link` (the owner clicked from an email), `app` (the organizer acted on the web), `system` (the app acted by itself) | Telling human actions apart from system actions |
| `actor_participant_id` | Who acted; empty for the organizer or the system | Knowing who did it without user accounts |
| `created_at` | When it happened | Every duration in the funnel |

## Events

### A. Extraction and sending

| Event | Fires when | Properties | What it measures | Why it matters | Status |
|---|---|---|---|---|---|
| `meeting_created` | The organizer creates a meeting from a transcript | Number of participants, whether a next meeting was given | Usage: meetings per week, organizers who come back | Top of the funnel. An organizer returning the following week is the clearest retention signal | Recorded as a row in `meetings` (`created_at`), not yet a separate event |
| `proposed` | AI extracts a task | `extractor` (claude or demo), `confidence` | Tasks per meeting; the spread of AI confidence | The denominator of the confirmation rate. Confidence is used to set the "organizer must review" threshold | Recorded |
| `extraction_rejected` | Code drops a task the AI produced (quote not in the transcript, duplicate, no title) | Reason | How often the AI invents or misquotes | One invented task reaching a recipient destroys trust at once. We need to know how much the guard catches | **Not recorded.** Currently only printed to the server log |
| `extraction_failed` | The AI call fails and the meeting becomes `failed` | Error message | Reliability of the extraction step | An organizer who hits an error on the first try usually does not retry | Recorded in `meetings.status` and `meetings.error`, with no history kept |
| `sent` | A confirmation request is sent to the owner | `to` (recipient) | Tasks that actually reach an owner; time from meeting end to sending | Starts the confirmation clock | Recorded |
| `reminded` | The single confirmation reminder | `to` | How many tasks need a reminder before they are confirmed | If most confirmations come after the reminder, the first email is not clear enough | Recorded |

### B. Commitment (hypothesis 1)

| Event | Fires when | Properties | What it measures | Why it matters | Status |
|---|---|---|---|---|---|
| `link_opened` | The recipient opens a link from the email (the page shows, nothing clicked yet) | The link's action | The step between "got the email" and "clicked": do people open and leave, or never open | Separates an email nobody reads from a confirmation page that puts people off. The two need different fixes | **Not recorded.** Needs filtering of email scanners that open links, or the numbers will be wrong |
| `confirmed` | The owner clicks Confirm | `channel` | Confirmation rate; time to confirm | The main metric for hypothesis 1 | Recorded |
| `amended` | The owner edits the title or deadline before confirming; or the organizer edits the task | Old and new title and deadline | How often the AI gets the content or the deadline wrong | Measures AI quality from real behaviour, with no manual grading | Recorded |
| `declined` | The owner clicks "Not mine" | `note` (free text) | How often the AI assigns the wrong person | The wrong owner is the AI's worst mistake: it bothers someone who is not involved | Recorded |
| `reassigned` | The task moves to another person (chosen by the person who declined, or by the organizer) | Old owner, new owner | How many tasks need a change of owner before someone takes them | Together with `declined`, tells us whether the organizer should review before sending | Recorded |
| `reopened` | The organizer reopens a declined or expired task | Previous status | Whether organizers deal with dropped tasks or leave them | The summary board only has value if organizers really use it | Recorded |
| `expired` | 72 hours with no response | Previous status | Share of tasks ignored | The other side of the confirmation rate: a task nobody takes is exactly the problem the product exists to solve | Recorded |
| `cancelled` | The organizer drops a task | Previous status | How much the AI extracts that should not have been a task | A high share means the AI over-extracts and dilutes the email | Recorded |

### C. Reminders (hypothesis 2)

| Event | Fires when | Properties | What it measures | Why it matters | Status |
|---|---|---|---|---|---|
| Reminder scheduled | The task or the calendar changes and the app recomputes the reminder time | `kind` (prep, gap, deadline, confirmation); `reason`: the anchor, the ideal time, whether it was moved earlier, which gap, what score | How the algorithm picks times; how many reminders had to move earlier because the person was busy | Answers "why did it remind me now?" and is the data for tuning parameters | Recorded (table `nudges`) |
| `nudged` | A reminder email is sent | `kind`, `nudge_id` | Reminders per person per day | The denominator of the response rate; checks that the anti-spam limits hold | Recorded |
| Reminder cancelled or skipped | The app decides not to send | `reason.closed`: `rate_limited` (hit 3 per day or the 90-minute spacing), `missed` (the person was busy when the time came), `no_slot` (no gap left), `merged`, `task_closed`, `not_eligible` | How many reminders never arrive, and why | Many `rate_limited` means the limits are too tight; many `no_slot` means calendars are too full for gap reminders | Recorded |
| `started` | The owner clicks "In progress" | `channel` | A response to a reminder: work has begun | One of the four responses counted in the response rate | Recorded |
| `snoozed` | The owner clicks "Remind me in the next gap" | `until`, `count` (which snooze this is) | How often a reminder arrives at the wrong moment | Many snoozes mean a gap in the calendar is not really free time | Recorded |
| `due_changed` | The owner clicks "Move the deadline" and picks a new one | Old deadline, new deadline | How many commitments are moved, and by how much | A deliberate move beats a silent slip, but too many moves mean the original deadlines were unrealistic | Recorded |
| `completed` | The task is marked done | `channel`: `email_link` if clicked from a reminder email, `app` if the organizer marked it | Completion, and through which channel | Finishing straight from a reminder email is the most direct evidence that the reminder came at the right time | Recorded |
| Response tied to a reminder | The owner clicks a button in a reminder email | `nudges.response`: `done`, `started`, `snoozed`, `due_changed`, or empty | How each kind of reminder is answered | Compares prep reminders with gap reminders with deadline reminders | Recorded |
| `nudge_context_changed` | The organizer attaches a related meeting or edits the effort estimate | Old and new values | Whether organizers are willing to supply context; how far off the AI's effort estimate is | A prep reminder is only smart when it knows the related meeting | Recorded |

### D. Calendar and infrastructure

| Event | Fires when | Properties | What it measures | Why it matters | Status |
|---|---|---|---|---|---|
| `calendar_connected` | A person has calendar data for the first time | Source (manual, Google) | Share of owners with a calendar | The biggest risk for Nudging is that few people connect a calendar. Without one, only deadline reminders remain | Recorded as a row in `calendar_people` (`source`, `synced_at`), not yet a separate event |
| `calendar_disconnected` | A person deletes their calendar data | | How many people withdraw calendar access | A signal of lost trust about privacy | **Not recorded.** The row is deleted and leaves no trace |
| Email send failure | SMTP rejects the message | `notifications.error` | Share of emails that do not go out | Every metric above is meaningless if email does not arrive | Recorded |
| `email_bounced`, `email_marked_spam` | The email service reports back | | Emails bounced or reported as spam | A spam report is the earliest sign of reminding too much | **Not recorded.** Needs the email service's webhook |

## How the metrics are computed

The statements below run on the current schema (`src/schema.sql`).

**Confirmation rate within 24 hours** (hypothesis 1):

```sql
SELECT round(100.0 * count(*) FILTER (WHERE c.at <= s.at + interval '24 hours') / nullif(count(*), 0), 1) AS pct
  FROM (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'sent' GROUP BY task_id) s
  LEFT JOIN (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'confirmed' GROUP BY task_id) c USING (task_id);
```

**Median time to confirm**, in hours (target: under 2 hours):

```sql
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.at - s.at) / 3600) AS median_hours
  FROM (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'sent' GROUP BY task_id) s
  JOIN (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'confirmed' GROUP BY task_id) c USING (task_id);
```

**Reminder response rate, by kind of reminder** (hypothesis 2):

```sql
SELECT kind, count(*) AS sent, count(response) AS responded,
       round(100.0 * count(response) / count(*), 1) AS pct
  FROM nudges
 WHERE status = 'sent' AND kind <> 'confirm_reminder'
 GROUP BY kind ORDER BY kind;
```

**Share of committed tasks done before the deadline** (hypothesis 3), over tasks whose deadline has passed:

```sql
SELECT round(100.0 * count(*) FILTER (WHERE status = 'done' AND completed_at <= due_at) / nullif(count(*), 0), 1) AS pct
  FROM tasks
 WHERE committed_at IS NOT NULL AND status <> 'cancelled' AND due_at < now();
```

**AI quality seen through user behaviour**: the percentage of sent tasks that were edited, and that were declined:

```sql
SELECT round(100.0 * count(DISTINCT task_id) FILTER (WHERE type = 'amended')
             / nullif(count(DISTINCT task_id) FILTER (WHERE type = 'sent'), 0), 1) AS pct_amended,
       round(100.0 * count(DISTINCT task_id) FILTER (WHERE type = 'declined')
             / nullif(count(DISTINCT task_id) FILTER (WHERE type = 'sent'), 0), 1) AS pct_declined
  FROM task_events;
```

**Reminders that were not sent, by reason**:

```sql
SELECT reason->>'closed' AS why, count(*)
  FROM nudges
 WHERE status IN ('cancelled', 'skipped')
 GROUP BY 1 ORDER BY 2 DESC;
```

## Guardrail metrics

These are not targets to push up. They tell us when the product is doing harm.

| Metric | Computed from | Threshold to review | What crossing it means |
|---|---|---|---|
| Share of tasks declined | `declined` / `sent` | Above 10% | The AI assigns the wrong person; consider making the organizer review before sending |
| Share of tasks edited | `amended` / `sent` | Above 30% | The AI gets the content or the deadline wrong |
| Share of requests expired | `expired` / `sent` | Above 20% | The confirmation email is not read, or not trusted |
| Reminders snoozed twice | `snoozed` with `count` = 2 | Above 15% of reminded tasks | Gaps in the calendar are not moments when people can work |
| Reminders dropped at the limit | `reason.closed` = `rate_limited` | Above 25% | Each person has too many open tasks, or the limits are too tight |
| Email send failures | `notifications.error` not empty | Above 2% | Mail is misconfigured; the funnel numbers can no longer be trusted |

The thresholds are first guesses and will be adjusted once there is real data.

## The comparison we need to run

Hypothesis 2 can only be shown by a comparison, not by a single number. The data is already enough to compare two groups that exist in the product:

- **People with a calendar:** they receive prep and gap reminders (`nudges.kind` is `prep` or `gap`).
- **People without a calendar:** they receive deadline reminders at a time derived from the deadline (`nudges.kind` is `deadline`).

Compare the response rate and the on-time rate between the two groups. The groups are self-selected (people willing to connect a calendar may already be more disciplined), so the result is only a hint. To be sure, people with a calendar have to be randomly split between the two reminder styles; this has not been built.

## What we deliberately do not record

| Not recorded | Why |
|---|---|
| Titles, descriptions and guests of events in personal calendars | The app only needs busy or free. The `busy_blocks` table has no title column |
| Transcript text inside events | Events only point to a task; what was said in the meeting is not copied into the log |
| Rankings or scores per person | The numbers are for fixing the product, not for grading employees. The organizer sees the status of each task, not statistics per person |
| One person's reminder times on another person's screen | A reminder time is the start of a free gap, so it reveals a calendar. The organizer only sees how many reminders there are |
| Third-party trackers, tracking pixels in email | The email lands in the work inbox of someone who never signed up. Tracking them with a pixel breaks trust before we have earned any |

The principles for calendar data and personal performance data are in [wiki/10-bao-mat-quyen-rieng-tu.md](wiki/10-bao-mat-quyen-rieng-tu.md).

## To do before real users arrive

1. Record `extraction_rejected` in the database instead of only printing it to the log.
2. Record `link_opened`, with email scanners filtered out.
3. Record `calendar_connected` and `calendar_disconnected` as timestamped events.
4. Receive bounce and spam-report webhooks from the email service.
5. A summary page that runs the statements above, so nobody has to query by hand.
