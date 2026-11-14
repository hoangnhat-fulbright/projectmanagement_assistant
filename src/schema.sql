-- Mô hình dữ liệu giai đoạn 1 và 2. Xem wiki/07-mo-hinh-du-lieu.md.
-- Mọi câu lệnh đều chạy lại an toàn (IF NOT EXISTS), kể cả trên database đã có dữ liệu.

CREATE TABLE IF NOT EXISTS meetings (
  id              uuid PRIMARY KEY,
  title           text NOT NULL,
  started_at      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'ready', 'failed')),
  error           text,
  auto_send       boolean NOT NULL DEFAULT true,
  extractor       text,
  raw_transcript  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id            uuid PRIMARY KEY,
  meeting_id    uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  email         text NOT NULL,
  is_organizer  boolean NOT NULL DEFAULT false,
  position      int NOT NULL,
  UNIQUE (meeting_id, email)
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id          uuid PRIMARY KEY,
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx         int NOT NULL,
  speaker     text,
  at_seconds  int,
  text        text NOT NULL,
  UNIQUE (meeting_id, idx)
);

CREATE TABLE IF NOT EXISTS tasks (
  id                    uuid PRIMARY KEY,
  meeting_id            uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  -- Thứ tự trong cuộc họp, để danh sách và email luôn theo một trật tự cố định.
  position              int NOT NULL DEFAULT 0,
  owner_participant_id  uuid REFERENCES participants(id),
  status                text NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'committed', 'in_progress', 'done',
                                          'declined', 'expired', 'cancelled')),
  due_at                timestamptz,
  due_is_inferred       boolean NOT NULL DEFAULT false,
  due_spoken_as         text,
  effort_minutes        int NOT NULL DEFAULT 30,
  source_segment_id     uuid REFERENCES transcript_segments(id),
  source_quote          text NOT NULL,
  confidence            real NOT NULL DEFAULT 0,
  owner_confidence      real NOT NULL DEFAULT 0,
  needs_review          boolean NOT NULL DEFAULT false,
  -- Lần gần nhất gửi yêu cầu xác nhận cho người làm hiện tại. NULL = chưa gửi.
  sent_at               timestamptz,
  reminder_sent_at      timestamptz,
  committed_at          timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_meeting_idx ON tasks (meeting_id);
CREATE INDEX IF NOT EXISTS tasks_pending_idx ON tasks (status, sent_at);

-- Nhật ký chỉ ghi thêm cho mọi thay đổi trên task.
CREATE TABLE IF NOT EXISTS task_events (
  id                    bigserial PRIMARY KEY,
  task_id               uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type                  text NOT NULL,
  actor_participant_id  uuid,
  channel               text NOT NULL,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS task_events_task_idx ON task_events (task_id, id);

-- Token dùng một lần cho liên kết trong email. Chỉ lưu mã băm.
CREATE TABLE IF NOT EXISTS action_tokens (
  id              uuid PRIMARY KEY,
  token_hash      text NOT NULL UNIQUE,
  meeting_id      uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  task_id         uuid REFERENCES tasks(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('confirm', 'amend', 'decline', 'confirm_all')),
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL
);

-- Mọi thứ đã gửi đi. body_* chỉ được lưu khi chạy không có SMTP (hộp thư thử).
CREATE TABLE IF NOT EXISTS notifications (
  id                        uuid PRIMARY KEY,
  meeting_id                uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  recipient_participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  channel                   text NOT NULL,
  kind                      text NOT NULL,
  subject                   text NOT NULL,
  body_html                 text,
  body_text                 text,
  error                     text,
  sent_at                   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_sent_idx ON notifications (sent_at DESC);

-- ---------- Giai đoạn 2: Context-Aware Nudging ----------

-- Buổi kế tiếp của chuỗi họp này: "cuộc họp liên quan" mặc định cho các task sinh ra ở đây.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS next_occurrence_at timestamptz;

-- Cuộc họp liên quan của riêng một task (ghi đè buổi kế tiếp của chuỗi họp).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_meeting_title text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_meeting_at timestamptz;
-- "Nhắc ở khoảng trống sau": số lần đã hoãn và mốc mà lần nhắc kế tiếp phải bắt đầu sau đó.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS nudge_snooze_count int NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS nudge_snoozed_until timestamptz;

-- Thêm các nút trên email nhắc việc vào danh sách hành động của token.
ALTER TABLE action_tokens DROP CONSTRAINT IF EXISTS action_tokens_action_check;
ALTER TABLE action_tokens ADD CONSTRAINT action_tokens_action_check
  CHECK (action IN ('confirm', 'amend', 'decline', 'confirm_all', 'done', 'start', 'snooze', 'reschedule'));

-- Người đã có dữ liệu lịch: giờ làm việc và múi giờ. Chưa có tài khoản nên nhận diện qua email.
CREATE TABLE IF NOT EXISTS calendar_people (
  email              text PRIMARY KEY,
  timezone           text NOT NULL,
  work_start_minute  int NOT NULL,
  work_end_minute    int NOT NULL CHECK (work_end_minute > work_start_minute),
  -- Các ngày làm việc, 0 = Chủ nhật … 6 = Thứ Bảy, cách nhau bằng dấu phẩy.
  work_days          text NOT NULL DEFAULT '1,2,3,4,5',
  -- Nguồn dữ liệu: 'manual' (nhập tay), tên một CalendarSource ('google' về sau).
  source             text NOT NULL,
  synced_at          timestamptz NOT NULL
);

-- Bản sao lịch bận/rảnh. Cố ý KHÔNG có tiêu đề hay mô tả sự kiện.
CREATE TABLE IF NOT EXISTS busy_blocks (
  id                 uuid PRIMARY KEY,
  person_email       text NOT NULL REFERENCES calendar_people(email) ON DELETE CASCADE,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('meeting', 'focus', 'out_of_office')),
  calendar_event_id  text,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS busy_blocks_person_idx ON busy_blocks (person_email, starts_at);

-- Lịch nhắc. Vừa là nhật ký, vừa là hàng đợi: việc định kỳ gửi các dòng `scheduled` đã đến giờ.
CREATE TABLE IF NOT EXISTS nudges (
  id             uuid PRIMARY KEY,
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('confirm_reminder', 'prep', 'gap', 'deadline')),
  scheduled_for  timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'sent', 'cancelled', 'skipped')),
  -- Vì sao chọn thời điểm này: mốc nào, khoảng trống nào, điểm bao nhiêu.
  reason         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'done', 'started', 'snoozed', 'due_changed', hoặc NULL nếu chưa phản hồi.
  response       text,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL
);
-- Không bao giờ có hai lời nhắc cùng loại đang chờ cho một task.
CREATE UNIQUE INDEX IF NOT EXISTS nudges_one_scheduled_idx ON nudges (task_id, kind) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS nudges_due_idx ON nudges (scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS nudges_task_idx ON nudges (task_id);
