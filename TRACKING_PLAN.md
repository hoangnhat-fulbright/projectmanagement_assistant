# Weekly Assistant — Tracking Plan

## Purpose

This tracking plan defines the product events, required properties, and metric calculations used to measure onboarding, collaboration, task progress, and the usefulness of AI-generated plans.

## North-star metric: Weekly Active Teams

**Weekly Active Teams (WAT)** is the number of distinct teams that make progress on at least one task during a reporting week. A team is active when a task moves into **Waiting for Review** or **Done**.

- Calculate WAT from `task_status_changed` events.
- Count each `team_id` only once per week, regardless of how many tasks it submits or completes.
- Use the Vietnam time zone (`Asia/Ho_Chi_Minh`) and a Monday-to-Sunday reporting week.
- WAT is a derived metric. It is not sent as an event.

## Event collection rules

- Record an event only after the corresponding action succeeds.
- Assign every event a unique `event_id` and an `occurred_at` timestamp in UTC. Use `event_id` to prevent duplicate ingestion.
- Use stable, pseudonymous identifiers for users, teams, projects, tasks, plans, and generated items.
- Do not send user-entered or AI-generated text to analytics.

## Events and triggers

| Event | Trigger and counting rule |
|---|---|
| `signup_completed` | Record once when a user successfully completes email sign-in. |
| `onboarding_completed` | Record once when a user completes initial setup. |
| `project_created` | Record once after a project is successfully created. |
| `brainstorm_completed` | Record once when a guided brainstorm is completed. Do not include brainstorm answers. |
| `plan_generated` | Record once for each AI-generated plan. Include the number of generated items by type. |
| `plan_item_edited` | Record after each successful save that changes an AI-generated milestone, WBS item, or task. Repeated saves are separate events. |
| `plan_item_deleted` | Record once when an AI-generated item is successfully deleted. Do not record deletion of manually created items as AI feedback. |
| `plan_confirmed` | Record once when a user confirms a generated plan. Classify every generated item into exactly one final outcome: retained unchanged, retained after editing, or deleted. The three outcome counts must sum to the number of generated items. |
| `member_invited` | Record once for each invitation successfully sent. |
| `member_joined` | Record once when an invited member successfully joins a project. |
| `task_assigned` | Record after a task is assigned or reassigned to a different member. Do not record an unchanged assignment. |
| `task_status_changed` | Record exactly once after each successful task status transition. Include the previous and new status. Do not also emit separate submission, approval, or return events for the same transition. |
| `meeting_poll_created` | Record once when a meeting poll is successfully created. |
| `availability_submitted` | Record once per member submission for each meeting poll. |

## Required properties

All events include `event_id` and `occurred_at`. Include `actor_id` as a pseudonymous identifier and `actor_role` where a user performs the action. Team activity events include `team_id`; project activity events include `project_id`.

| Event | Additional properties |
|---|---|
| `plan_generated` | `plan_id`, `generation_id`, `generated_item_count`, `milestone_count`, `wbs_item_count`, `task_count` |
| `plan_item_edited` | `plan_id`, `generation_id`, `item_id`, `item_type` (milestone, WBS item, or task) |
| `plan_item_deleted` | `plan_id`, `generation_id`, `item_id`, `item_type` (milestone, WBS item, or task) |
| `plan_confirmed` | `plan_id`, `generation_id`, `generated_item_count`, `retained_unchanged_count`, `retained_edited_count`, `deleted_count` |
| `member_invited` | `project_id`, `invite_id`, `invitee_role` |
| `member_joined` | `project_id`, `invite_id`, `member_role` |
| `task_assigned` | `task_id`, `previous_assignee_id` (null for a first assignment), `new_assignee_id` |
| `task_status_changed` | `task_id`, `from_status`, `to_status`, `actor_role` (assignee, reviewer/lead, or system), `change_source` (submission, review, or other) |
| `meeting_poll_created` | `poll_id` |
| `availability_submitted` | `poll_id`, `member_id` |

## Task workflow metrics

The task board uses five states: **Not Started**, **In Progress**, **Waiting for Review**, **Returned**, and **Done**. Derive these counts from `task_status_changed`; do not create duplicate events:

- **Submitted for review:** transition from `In Progress` to `Waiting for Review`.
- **Approved:** transition from `Waiting for Review` to `Done` made by a reviewer or lead.
- **Returned for revision:** transition from `Waiting for Review` to `Returned`.

Count each successful transition once. If a task is returned and resubmitted, count each submission and return as a separate workflow transition. When reporting unique tasks, deduplicate by `task_id`.

## AI-generated plan quality

Use the final item counts in `plan_confirmed` to measure how useful generated suggestions are:

- **Retained rate:** (`retained_unchanged_count` + `retained_edited_count`) ÷ `generated_item_count`.
- **Edited rate:** `retained_edited_count` ÷ `generated_item_count`.
- **Deleted rate:** `deleted_count` ÷ `generated_item_count`.

Use `plan_item_edited` to analyze editing frequency and `plan_item_deleted` to identify deletion patterns. These events describe actions and outcomes; they do not capture the text of a suggestion or its edits.

## Data minimization

Collect only the events and properties listed in this plan. Do not send brainstorm answers, task descriptions, AI-generated suggestions, names, email addresses, or other free-text content to analytics. Restrict access to event-level data and use aggregated results for routine product reviews.
