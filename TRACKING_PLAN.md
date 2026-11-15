# Weekly Assistant — Tracking Plan

## Purpose

This tracking plan defines the events, what each event measures, why it matters to the product, and the rules for recording it.

## North-star metric: Weekly Active Teams

**Weekly Active Teams (WAT)** is the number of distinct teams that make human-led progress on at least one task in a reporting week. A team is active when a user moves a task into **Waiting for Review** or **Done**.

- Calculate WAT from `task_status_changed` events where `actor_type=user`.
- Count each `team_id` once per week, even if several tasks are submitted or completed.
- Use the Vietnam time zone (`Asia/Ho_Chi_Minh`) and a Monday-to-Sunday reporting week.
- Exclude system-generated status changes.
- WAT is a derived metric, not an event.

## Team and project identifiers

A **team** is the stable group of people collaborating in Weekly Assistant. A **project** is a specific body of work owned by one team. Each project has one `team_id`; a team may own multiple projects. Use both IDs on project and task events so activity can be analyzed by project or rolled up across the team.

## Event collection rules

- Record an event only after the corresponding action succeeds.
- Give every event a unique `event_id` and an `occurred_at` timestamp in UTC. Use `event_id` to prevent duplicate ingestion.
- Use stable, pseudonymous identifiers for users, teams, projects, tasks, plans, and generated items.
- For user actions, use the product's role values: `team_lead`, `member`, or `observer`. Use `actor_type=user` for a human action and `actor_type=system` for an automated action. For system actions, set `actor_role` and `actor_id` to null.
- Do not send user-entered or AI-generated text to analytics.

## Events

| Event | What it measures | Why it matters for the product | Trigger and counting rule |
|---|---|---|---|
| `signup_completed` | Users who activate an account and enter the product for the first time. | Measures whether new users can get past the access step and begin using the product. | Record once per user after their first successful account activation/sign-in. Do not record subsequent logins. |
| `onboarding_completed` | Users who finish initial setup. | Shows whether first-time setup is understandable and manageable. | Record once per user when initial onboarding is completed. |
| `project_created` | Projects created. | Indicates whether users have brought a real piece of work into the product. | Record once after a project is successfully created. |
| `brainstorm_completed` | Guided brainstorm sessions completed. | Measures whether teams complete the goal-clarification step before planning. | Record once per completed brainstorm session. Do not include brainstorm answers. |
| `plan_generated` | AI-generated plans and the number of suggested milestones, WBS items, and tasks. | Measures use of the product's core idea-to-plan capability and supplies the denominator for AI outcome metrics. | Record once per generation attempt that successfully returns a plan. Assign a unique `generation_id` to each attempt. |
| `plan_item_edited` | AI-generated items that users revise, and how often they revise them. | Reveals where AI suggestions need adjustment and whether users are actively shaping the plan. | Record after each successful save that changes an AI-generated milestone, WBS item, or task. Repeated saves are separate events; use `item_id` to count unique items edited. |
| `plan_item_deleted` | AI-generated items users remove. | Identifies suggestions that do not fit the team's project and helps assess AI plan quality. | Record once when an AI-generated item is successfully deleted. Do not record deletion of manually created items as AI feedback. |
| `plan_confirmed` | Generated plans users confirm, with final outcomes for their generated items. | Shows whether teams accept a generated plan and provides the outcome counts for suggestion quality. | Record once per `generation_id` when the user confirms the plan. Classify every generated item as retained unchanged, retained after editing, or deleted. These counts must sum to the number of generated items. |
| `member_invited` | Invitations successfully sent to teammates. | Measures whether users are trying to bring their team into the product. | Record once per invitation sent. |
| `member_joined` | Invited teammates who join a project. | Measures whether invitations convert into team participation. | Record once when a member first joins a project. Do not record later visits or re-joins as a new join. |
| `task_assigned` | Tasks assigned or reassigned to a different member. | Shows whether plans turn into clear ownership and helps identify assignment friction. | Record after a successful assignment change. Do not record when the assignee remains the same. |
| `task_status_changed` | Task workflow transitions, including movement into review, approval, and return for revision. | Measures task-board use and shows where work gets stuck. | Record exactly once after each successful status transition. Include the old and new status. Derive submission, approval, and return counts from this event; do not emit duplicate events for the same transition. |
| `meeting_poll_created` | Meeting polls created. | Measures whether teams use the product to coordinate meetings. | Record once when a poll is successfully created. |
| `availability_submitted` | Availability responses saved by members for a meeting poll. | Measures participation in meeting coordination and whether polls collect enough responses to be useful. | Record once for each successfully saved response, including each later revision. Do not record unsaved edits or keystrokes. |

## Required properties

All events include `event_id` and `occurred_at`. User actions include pseudonymous `actor_id` and the canonical `actor_role` (`team_lead`, `member`, or `observer`). System actions use `actor_type=system`, with `actor_id` and `actor_role` set to null. Project and task events include both `team_id` and `project_id).

| Event | Additional properties |
|---|---|
| `signup_completed` | `user_id` (pseudonymous; same value as `actor_id`) |
| `onboarding_completed` | `user_id` (pseudonymous; same value as `actor_id`) |
| `project_created` | `team_id`, `project_id` |
| `brainstorm_completed` | `team_id`, `project_id`, `session_id` |
| `plan_generated` | `team_id`, `project_id`, `plan_id`, `generation_id`, `generated_item_count`, `milestone_count`, `wbs_item_count`, `task_count` |
| `plan_item_edited` | `team_id`, `project_id`, `plan_id`, `generation_id`, `item_id`, `item_type` (milestone, WBS item, or task) |
| `plan_item_deleted` | `team_id`, `project_id`, `plan_id`, `generation_id`, `item_id`, `item_type` (milestone, WBS item, or task) |
| `plan_confirmed` | `team_id`, `project_id`, `plan_id`, `generation_id`, `generated_item_count`, `retained_unchanged_count`, `retained_edited_count`, `deleted_count` |
| `member_invited` | `team_id`, `project_id`, `invite_id`, `invitee_role` |
| `member_joined` | `team_id`, `project_id`, `invite_id`, `member_role` |
| `task_assigned` | `team_id`, `project_id`, `task_id`, `previous_assignee_id` (null for a first assignment), `new_assignee_id` |
| `task_status_changed` | `team_id`, `project_id`, `task_id`, `from_status`, `to_status`, `actor_type` (`user` or `system`) |
| `meeting_poll_created` | `team_id`, `project_id`, `poll_id` |
| `availability_submitted` | `team_id`, `project_id`, `poll_id`, `response_version` (increment once for each successfully saved response or revision) |

For `availability_submitted`, `actor_id` identifies the member, so a separate `member_id` property is unnecessary. Each saved response or revision has a unique `response_version`.

## Task workflow metrics

The task board uses five states: **Not Started**, **In Progress**, **Waiting for Review**, **Returned**, and **Done**. Derive the following metrics from `task_status_changed`; do not create separate events:

- **Submitted for review:** every transition into `Waiting for Review`, including a resubmission from `Returned`.
- **Approved:** a user-initiated transition from `Waiting for Review` to `Done`.
- **Returned for revision:** a user-initiated transition from `Waiting for Review` to `Returned`.

Count each successful transition once. If a task is returned and resubmitted, count each submission and return as separate transitions. For WAT, exclude events where `actor_type=system`. When reporting unique tasks, deduplicate by `task_id`.

## AI-generated plan quality

Report plan confirmation coverage alongside item outcome rates so the outcome rates are not interpreted without abandoned or unconfirmed generations:

- **Plan confirmation rate:** distinct `generation_id` values with `plan_confirmed` ÷ distinct `generation_id` values with `plan_generated`. Match on `generation_id` and report by generation cohort.
- **Retained rate among confirmed plans:** sum of `retained_unchanged_count` plus `retained_edited_count` ÷ sum of `generated_item_count` for confirmed generations.
- **Edited rate among confirmed plans:** sum of `retained_edited_count` ÷ sum of `generated_item_count` for confirmed generations.
- **Deleted rate among confirmed plans:** sum of `deleted_count` ÷ sum of `generated_item_count` for confirmed generations.

The item outcome rates describe confirmed plans only; present them together with the plan confirmation rate. Use `plan_item_edited` to analyze edit frequency and `plan_item_deleted` to identify deletion patterns. These events record actions and counts, not the text of suggestions or edits.

## Data minimization

Collect only the events and properties listed in this plan. Do not send brainstorm answers, task descriptions, AI-generated suggestions, names, email addresses, or other free-text content to analytics. Restrict access to event-level data and use aggregated results for routine product reviews.
