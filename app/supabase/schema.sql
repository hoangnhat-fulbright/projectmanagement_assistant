-- =====================================================================================
-- Trợ lý tuần — cơ sở dữ liệu cho bản chạy trên mạng (Supabase).
-- Cách dùng: mở Supabase → SQL Editor → dán toàn bộ file này → Run. Chạy lại nhiều lần không lỗi.
--
-- Ý tưởng:
--   * Mỗi dự án lưu toàn bộ trạng thái dùng chung thành MỘT tài liệu JSON (project_state.data),
--     kèm số phiên bản để phát hiện hai người lưu cùng lúc.
--   * Người đã đăng nhập chỉ ĐỌC được dữ liệu của dự án mình là thành viên (Row Level Security).
--   * Mọi thao tác GHI đi qua các hàm (RPC) bên dưới; không ai ghi thẳng vào bảng được.
--   * Vai trò: owner = nhóm trưởng · member = thành viên · observer = người quan sát (chỉ đọc).
-- =====================================================================================

-- ---------- Bảng ----------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_member text not null unique,
  invite_observer text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- id của người này trong data.members của dự án
  member_id text not null,
  role text not null check (role in ('owner', 'member', 'observer')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (project_id, member_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

create table if not exists public.project_state (
  project_id uuid primary key references public.projects (id) on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.ai_usage (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (project_id, day)
);

-- ---------- Quyền trên bảng: chỉ đọc, và chỉ cho người đã đăng nhập ----------

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_state enable row level security;
alter table public.ai_usage enable row level security;

revoke all on public.projects, public.project_members, public.project_state, public.ai_usage from public, anon, authenticated;

-- Mã mời KHÔNG nằm trong các cột được đọc: chỉ nhóm trưởng lấy được qua project_invites().
-- (Vì vậy "select *" trên projects sẽ bị từ chối; hãy chọn đúng các cột dưới đây hoặc gọi my_projects().)
grant select (id, name, created_by, created_at) on public.projects to authenticated;
grant select on public.project_members, public.project_state, public.ai_usage to authenticated;

-- Dùng trong policy. SECURITY DEFINER để policy của project_members không tự gọi lại chính nó.
create or replace function public.is_member(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project and pm.user_id = auth.uid()
  );
$$;

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select to authenticated using (public.is_member(id));

drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members
  for select to authenticated using (public.is_member(project_id));

drop policy if exists project_state_read on public.project_state;
create policy project_state_read on public.project_state
  for select to authenticated using (public.is_member(project_id));

drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage
  for select to authenticated using (public.is_member(project_id));

-- ---------- Hàm phụ (không gọi được từ bên ngoài) ----------

-- Mã mời 8 ký tự, chữ hoa + số dễ đọc (không có 0 O 1 I L). Lấy ngẫu nhiên từ gen_random_uuid().
create or replace function public.gen_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  -- Bỏ qua byte 6 và 8 của mỗi UUID vì chúng chứa các bit cố định (phiên bản, biến thể).
  picks constant int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  code text := '';
  i int;
begin
  foreach i in array picks loop
    code := code || substr(alphabet, 1 + (get_byte(raw, i) % length(alphabet)), 1);
  end loop;
  return code;
end;
$$;

-- Vai trò của người đang gọi trong một dự án; null nếu không phải thành viên.
create or replace function public.my_role(p_project uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pm.role from public.project_members pm
  where pm.project_id = p_project and pm.user_id = auth.uid();
$$;

-- Vai trò ghi trong data.members luôn theo bảng project_members (bảng mới là nguồn đúng).
create or replace function public.sync_member_roles(p_project uuid, p_data jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when jsonb_typeof(p_data -> 'members') = 'array' then
      jsonb_set(
        p_data,
        '{members}',
        coalesce(
          (
            select jsonb_agg(
              case when pm.role is null then t.m else jsonb_set(t.m, '{role}', to_jsonb(pm.role)) end
              order by t.ord
            )
            from jsonb_array_elements(p_data -> 'members') with ordinality as t (m, ord)
            left join public.project_members pm
              on pm.project_id = p_project and pm.member_id = t.m ->> 'id'
          ),
          '[]'::jsonb
        )
      )
    else p_data
  end;
$$;

-- ---------- RPC: lập dự án, vào dự án ----------

create or replace function public.create_project(p_name text, p_state jsonb, p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_id uuid;
  v_m text;
  v_o text;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_name = '' or btrim(coalesce(p_member_id, '')) = '' then raise exception 'bad_input'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then raise exception 'bad_input'; end if;
  if octet_length(p_state::text) > 2 * 1024 * 1024 then raise exception 'too_large'; end if;
  -- Chặn lạm dụng: mỗi tài khoản lập tối đa 20 dự án.
  if (select count(*) from public.projects p where p.created_by = v_uid) >= 20 then
    raise exception 'too_many';
  end if;

  loop
    v_m := public.gen_invite_code();
    v_o := public.gen_invite_code();
    exit when v_m <> v_o and not exists (
      select 1 from public.projects p
      where p.invite_member in (v_m, v_o) or p.invite_observer in (v_m, v_o)
    );
  end loop;

  insert into public.projects (name, invite_member, invite_observer, created_by)
  values (v_name, v_m, v_o, v_uid)
  returning id into v_id;

  insert into public.project_members (project_id, user_id, member_id, role)
  values (v_id, v_uid, p_member_id, 'owner');

  insert into public.project_state (project_id, data, version, updated_by)
  values (v_id, public.sync_member_roles(v_id, p_state), 1, v_uid);

  return jsonb_build_object('project_id', v_id, 'version', 1);
end;
$$;

create or replace function public.join_project(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_proj public.projects%rowtype;
  v_old public.project_members%rowtype;
  v_role text;
  v_mid text;
  v_data jsonb;
  v_max int;
  v_member jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_code = '' then raise exception 'bad_invite'; end if;

  select * into v_proj from public.projects p
  where p.invite_member = v_code or p.invite_observer = v_code;
  if not found then raise exception 'bad_invite'; end if;

  -- Đã là thành viên: trả lại thông tin cũ, không thêm lần hai.
  select * into v_old from public.project_members pm
  where pm.project_id = v_proj.id and pm.user_id = v_uid;
  if found then
    return jsonb_build_object('project_id', v_proj.id, 'member_id', v_old.member_id, 'role', v_old.role);
  end if;

  if v_name = '' then raise exception 'bad_input'; end if;
  if (select count(*) from public.project_members pm where pm.project_id = v_proj.id) >= 100 then
    raise exception 'project_full';
  end if;

  v_role := case when v_proj.invite_member = v_code then 'member' else 'observer' end;
  v_mid := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  select ps.data into v_data from public.project_state ps where ps.project_id = v_proj.id for update;

  -- Mã hiển thị TV-xx: số kế tiếp số lớn nhất đang có.
  select coalesce(max(substring(t.m ->> 'code' from '^TV-(\d{1,4})$')::int), 0) into v_max
  from jsonb_array_elements(
    case when jsonb_typeof(v_data -> 'members') = 'array' then v_data -> 'members' else '[]'::jsonb end
  ) as t (m);

  v_member := jsonb_build_object(
    'id', v_mid,
    'code', 'TV-' || lpad((v_max + 1)::text, 2, '0'),
    'name', v_name,
    'role', v_role,
    'background', '',
    'cvName', null
  );

  insert into public.project_members (project_id, user_id, member_id, role)
  values (v_proj.id, v_uid, v_mid, v_role);

  update public.project_state ps
  set data = jsonb_set(
        v_data,
        '{members}',
        (case when jsonb_typeof(v_data -> 'members') = 'array' then v_data -> 'members' else '[]'::jsonb end)
          || jsonb_build_array(v_member),
        true
      ),
      version = ps.version + 1,
      updated_at = now(),
      updated_by = v_uid
  where ps.project_id = v_proj.id;

  return jsonb_build_object('project_id', v_proj.id, 'member_id', v_mid, 'role', v_role);
end;
$$;

-- ---------- RPC: lưu trạng thái ----------

-- Trả về phiên bản mới, hoặc -1 nếu p_version không còn khớp (người khác đã lưu trước; không ghi gì).
create or replace function public.save_state(p_project uuid, p_version bigint, p_data jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.my_role(p_project);
  v_new bigint;
  v_name text;
begin
  if v_role is null or v_role not in ('owner', 'member') then raise exception 'forbidden'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad_input'; end if;
  if octet_length(p_data::text) > 2 * 1024 * 1024 then raise exception 'too_large'; end if;

  update public.project_state ps
  set data = public.sync_member_roles(p_project, p_data),
      version = ps.version + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where ps.project_id = p_project and ps.version = p_version
  returning ps.version into v_new;

  if not found then return -1; end if;

  -- Nhóm trưởng đổi tên dự án trong app (settings.company) thì tên ở danh sách dự án đổi theo.
  if v_role = 'owner' then
    v_name := left(btrim(coalesce(p_data #>> '{settings,company}', '')), 120);
    if v_name <> '' then
      update public.projects p set name = v_name where p.id = p_project and p.name is distinct from v_name;
    end if;
  end if;

  return v_new;
end;
$$;

-- ---------- RPC: quản lý thành viên (chỉ nhóm trưởng) ----------

create or replace function public.set_member_role(p_project uuid, p_member_id text, p_role text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.project_members%rowtype;
  v_data jsonb;
  v_new bigint;
begin
  if public.my_role(p_project) is distinct from 'owner' then raise exception 'forbidden'; end if;
  if p_role is null or p_role not in ('member', 'observer') then raise exception 'bad_input'; end if;

  select * into v_target from public.project_members pm
  where pm.project_id = p_project and pm.member_id = p_member_id;
  if not found then raise exception 'not_found'; end if;
  if v_target.role = 'owner' then raise exception 'forbidden'; end if;

  update public.project_members pm set role = p_role
  where pm.project_id = p_project and pm.member_id = p_member_id;

  select ps.data into v_data from public.project_state ps where ps.project_id = p_project for update;

  -- Người quan sát không nhận việc: các việc chưa xong của họ trở về "chưa ai nhận".
  if p_role = 'observer' and jsonb_typeof(v_data -> 'items') = 'array' then
    v_data := jsonb_set(
      v_data,
      '{items}',
      coalesce(
        (
          select jsonb_agg(
            case
              when t.i ->> 'assigneeId' = p_member_id and t.i ->> 'status' is distinct from 'done'
                then jsonb_set(t.i, '{assigneeId}', 'null'::jsonb)
              else t.i
            end
            order by t.ord
          )
          from jsonb_array_elements(v_data -> 'items') with ordinality as t (i, ord)
        ),
        '[]'::jsonb
      )
    );
  end if;

  update public.project_state ps
  set data = public.sync_member_roles(p_project, v_data),
      version = ps.version + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where ps.project_id = p_project
  returning ps.version into v_new;

  return v_new;
end;
$$;

create or replace function public.remove_member(p_project uuid, p_member_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.project_members%rowtype;
  v_data jsonb;
  v_new bigint;
begin
  if public.my_role(p_project) is distinct from 'owner' then raise exception 'forbidden'; end if;

  select * into v_target from public.project_members pm
  where pm.project_id = p_project and pm.member_id = p_member_id;
  if not found then raise exception 'not_found'; end if;
  if v_target.role = 'owner' then raise exception 'forbidden'; end if;

  delete from public.project_members pm
  where pm.project_id = p_project and pm.member_id = p_member_id;

  select ps.data into v_data from public.project_state ps where ps.project_id = p_project for update;

  if jsonb_typeof(v_data -> 'members') = 'array' then
    v_data := jsonb_set(
      v_data,
      '{members}',
      coalesce(
        (
          select jsonb_agg(t.m order by t.ord)
          from jsonb_array_elements(v_data -> 'members') with ordinality as t (m, ord)
          where t.m ->> 'id' is distinct from p_member_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  if jsonb_typeof(v_data -> 'items') = 'array' then
    v_data := jsonb_set(
      v_data,
      '{items}',
      coalesce(
        (
          select jsonb_agg(
            case
              when t.i ->> 'assigneeId' = p_member_id then jsonb_set(t.i, '{assigneeId}', 'null'::jsonb)
              else t.i
            end
            order by t.ord
          )
          from jsonb_array_elements(v_data -> 'items') with ordinality as t (i, ord)
        ),
        '[]'::jsonb
      )
    );
  end if;

  update public.project_state ps
  set data = v_data,
      version = ps.version + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where ps.project_id = p_project
  returning ps.version into v_new;

  return v_new;
end;
$$;

-- ---------- RPC: đọc ----------

create or replace function public.my_projects()
returns table (project_id uuid, name text, role text, member_id text)
language sql
stable
security definer
set search_path = public
as $$
  select pm.project_id, p.name, pm.role, pm.member_id
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  where pm.user_id = auth.uid()
  order by pm.joined_at desc;
$$;

create or replace function public.project_invites(p_project uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_proj public.projects%rowtype;
begin
  if public.my_role(p_project) is distinct from 'owner' then raise exception 'forbidden'; end if;
  select * into v_proj from public.projects p where p.id = p_project;
  return jsonb_build_object('member', v_proj.invite_member, 'observer', v_proj.invite_observer);
end;
$$;

-- ---------- RPC: lượt dùng AI ----------

-- Chỉ nhóm trưởng. Mỗi dự án tối đa 20 lượt mỗi ngày (ngày theo giờ Việt Nam).
-- Còn lượt: tăng đếm và trả về số lượt còn lại. Hết lượt: báo lỗi 'quota'.
-- Muốn đổi hạn mức thì sửa số 20 bên dưới rồi chạy lại file này.
create or replace function public.use_ai(p_project uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c_limit constant int := 20;
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_count int;
begin
  if public.my_role(p_project) is distinct from 'owner' then raise exception 'forbidden'; end if;

  insert into public.ai_usage as u (project_id, day, count)
  values (p_project, v_day, 1)
  on conflict (project_id, day) do update set count = u.count + 1 where u.count < c_limit
  returning u.count into v_count;

  if v_count is null then raise exception 'quota'; end if;
  return c_limit - v_count;
end;
$$;

-- ---------- Ai được gọi hàm nào ----------

revoke all on function
  public.is_member(uuid),
  public.my_role(uuid),
  public.gen_invite_code(),
  public.sync_member_roles(uuid, jsonb),
  public.create_project(text, jsonb, text),
  public.join_project(text, text),
  public.save_state(uuid, bigint, jsonb),
  public.set_member_role(uuid, text, text),
  public.remove_member(uuid, text),
  public.my_projects(),
  public.project_invites(uuid),
  public.use_ai(uuid)
from public, anon, authenticated;

grant execute on function
  public.is_member(uuid),
  public.create_project(text, jsonb, text),
  public.join_project(text, text),
  public.save_state(uuid, bigint, jsonb),
  public.set_member_role(uuid, text, text),
  public.remove_member(uuid, text),
  public.my_projects(),
  public.project_invites(uuid),
  public.use_ai(uuid)
to authenticated;

-- ---------- Báo thay đổi tức thời (Realtime) ----------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_state'
     )
  then
    alter publication supabase_realtime add table public.project_state;
  end if;
end;
$$;
