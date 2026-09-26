-- Rappels & Invocations : daily content shown on the home screen.
--
-- Three kinds share one table because they are the same object with the same
-- fields: a rappel, an invocation, and a custom text written by the admin.
-- Categories are a separate table so the admin can manage them by kind.
--
-- Apply after social.sql : the policies use private.is_app_admin().
-- Apply before admin-notifications.sql is not required.

create table if not exists public.daily_content_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rappel','invocation','personnalise')),
  name text not null,
  icon text not null default '✦',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create table if not exists public.daily_contents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rappel','invocation','personnalise')),
  category_id uuid references public.daily_content_categories(id) on delete set null,
  title text not null,
  arabic_text text,
  phonetic text,
  translation text,
  explanation text,
  source text,
  audio_path text,
  position int not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Redundant with the primary key, and that is the point : it lets the
  -- schedule below carry the kind and reference it, so the database itself
  -- guarantees that the kind written on a date is the kind of the content.
  unique (id, kind)
);

create table if not exists public.daily_content_schedule (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  kind text not null check (kind in ('rappel','invocation','personnalise')),
  scheduled_date date not null,
  created_at timestamptz not null default now(),
  -- One content per kind and per date, enforced by the database and not by
  -- the interface : the day's reminder cannot be doubled, and the composite
  -- key refuses a kind that does not match the content it points at.
  unique (scheduled_date, kind),
  foreign key (content_id, kind) references public.daily_contents(id, kind) on delete cascade
);

create table if not exists public.daily_content_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.daily_contents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create index if not exists daily_content_schedule_date on public.daily_content_schedule(scheduled_date);
create index if not exists daily_contents_kind_position on public.daily_contents(kind, position);
create index if not exists daily_contents_active on public.daily_contents(active);

-- updated_at is maintained by the database, never by the client.
create or replace function private.touch_daily_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.touch_daily_content() from public,anon,authenticated;

drop trigger if exists touch_daily_content on public.daily_contents;
create trigger touch_daily_content before update on public.daily_contents
  for each row execute function private.touch_daily_content();

-- ---------------------------------------------------------------- access ----
alter table public.daily_content_categories enable row level security;
alter table public.daily_contents enable row level security;
alter table public.daily_content_schedule enable row level security;
alter table public.daily_content_favorites enable row level security;

-- The content is meant to be read by everyone, account or not : that is the
-- point of a daily reminder. Writing is reserved to the administrator.
revoke all on public.daily_content_categories from anon, authenticated;
revoke all on public.daily_contents from anon, authenticated;
revoke all on public.daily_content_schedule from anon, authenticated;
revoke all on public.daily_content_favorites from anon, authenticated;

grant select on public.daily_content_categories to anon, authenticated;
grant select on public.daily_contents to anon, authenticated;
grant select, insert, delete on public.daily_content_favorites to authenticated;
grant insert, update, delete on public.daily_content_categories to authenticated;
grant insert, update, delete on public.daily_contents to authenticated;
grant insert, update, delete on public.daily_content_schedule to authenticated;

-- The schedule itself is not readable by members : the selection function
-- below reads it as its owner. Nobody needs to know what is planned for
-- tomorrow, and hiding it also hides the drafts of the administrator.

drop policy if exists daily_categories_read on public.daily_content_categories;
create policy daily_categories_read on public.daily_content_categories for select to anon
using (active);

drop policy if exists daily_categories_read_member on public.daily_content_categories;
create policy daily_categories_read_member on public.daily_content_categories for select to authenticated
using (active or private.is_app_admin());

drop policy if exists daily_categories_admin on public.daily_content_categories;
create policy daily_categories_admin on public.daily_content_categories for all to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

-- Two policies rather than one, and that is not cosmetic : social.sql revokes
-- execute on private.is_app_admin() from anon. A single policy
-- "using (active or private.is_app_admin())" would therefore raise
-- 42501 permission denied for function is_app_admin as soon as one inactive
-- row exists, because the second term is evaluated precisely on the rows the
-- first one rejects. The visitor would get an error instead of the published
-- content. So the anonymous policy never names the function.
drop policy if exists daily_contents_read on public.daily_contents;
create policy daily_contents_read on public.daily_contents for select to anon
using (active);

drop policy if exists daily_contents_read_member on public.daily_contents;
create policy daily_contents_read_member on public.daily_contents for select to authenticated
using (active or private.is_app_admin());

drop policy if exists daily_contents_admin on public.daily_contents;
create policy daily_contents_admin on public.daily_contents for all to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

drop policy if exists daily_schedule_read on public.daily_content_schedule;
create policy daily_schedule_read on public.daily_content_schedule for select to authenticated
using (private.is_app_admin());

drop policy if exists daily_schedule_admin on public.daily_content_schedule;
create policy daily_schedule_admin on public.daily_content_schedule for all to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

-- A favourite belongs to one person, and to that person only.
drop policy if exists daily_favorites_read on public.daily_content_favorites;
create policy daily_favorites_read on public.daily_content_favorites for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists daily_favorites_insert on public.daily_content_favorites;
create policy daily_favorites_insert on public.daily_content_favorites for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists daily_favorites_delete on public.daily_content_favorites;
create policy daily_favorites_delete on public.daily_content_favorites for delete to authenticated
using (user_id = (select auth.uid()));

-- --------------------------------------------------------------- storage ----
-- Private bucket, readable by everyone because the content is public : the app
-- asks for a short-lived signed link, never a permanent address.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('daily-content-audio','daily-content-audio',false,5242880,array['audio/mp4','audio/3gpp','audio/m4a','audio/mpeg'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['audio/mp4','audio/3gpp','audio/m4a','audio/mpeg'];

drop policy if exists daily_audio_read on storage.objects;
create policy daily_audio_read on storage.objects for select to anon, authenticated
using (bucket_id='daily-content-audio');

drop policy if exists daily_audio_admin_insert on storage.objects;
create policy daily_audio_admin_insert on storage.objects for insert to authenticated
with check (bucket_id='daily-content-audio' and private.is_app_admin());

drop policy if exists daily_audio_admin_update on storage.objects;
create policy daily_audio_admin_update on storage.objects for update to authenticated
using (bucket_id='daily-content-audio' and private.is_app_admin())
with check (bucket_id='daily-content-audio' and private.is_app_admin());

drop policy if exists daily_audio_admin_delete on storage.objects;
create policy daily_audio_admin_delete on storage.objects for delete to authenticated
using (bucket_id='daily-content-audio' and private.is_app_admin());

-- ------------------------------------------------------------- selection ----
-- The content of a given day, in one call : the schedule first, and a stable
-- fallback when nothing was planned, so the card is never empty.
--
-- The fallback is deterministic (a rotation by the day number), not random :
-- two people asking for the same day see the same thing, and a refresh does
-- not shuffle the card under the reader's eyes.
create or replace function public.daily_content_for_date(p_date date)
returns table (
  id uuid,
  kind text,
  category text,
  title text,
  arabic_text text,
  phonetic text,
  translation text,
  explanation text,
  source text,
  audio_path text,
  planned boolean
)
language sql stable security definer set search_path = '' as $$
  with planned as (
    select c.*
    from public.daily_content_schedule s
    join public.daily_contents c on c.id = s.content_id and c.kind = s.kind
    where s.scheduled_date = p_date and c.active
  ),
  fallback as (
    select c.*,
           row_number() over (partition by c.kind order by c.position, c.created_at, c.id) as rn,
           count(*) over (partition by c.kind) as total
    from public.daily_contents c
    where c.active
  ),
  picked as (
    select c.*, ((extract(epoch from p_date)::int / 86400) % nullif(c.total,0)) + 1 as wanted
    from fallback c
  )
  select c.id, c.kind, cat.name, c.title, c.arabic_text, c.phonetic, c.translation, c.explanation, c.source, c.audio_path, true
  from planned c
  left join public.daily_content_categories cat on cat.id = c.category_id
  union all
  select c.id, c.kind, cat.name, c.title, c.arabic_text, c.phonetic, c.translation, c.explanation, c.source, c.audio_path, false
  from picked c
  left join public.daily_content_categories cat on cat.id = c.category_id
  where c.rn = c.wanted
    and not exists (select 1 from planned p where p.kind = c.kind)
  order by kind, title;
$$;
revoke all on function public.daily_content_for_date(date) from public;
grant execute on function public.daily_content_for_date(date) to anon, authenticated;

-- Favourites of the signed-in user, with the content itself, in one call.
create or replace function public.my_daily_favorites()
returns table (
  id uuid,
  kind text,
  category text,
  title text,
  arabic_text text,
  phonetic text,
  translation text,
  explanation text,
  source text,
  audio_path text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, cat.name, c.title, c.arabic_text, c.phonetic, c.translation,
         c.explanation, c.source, c.audio_path, f.created_at
  from public.daily_content_favorites f
  join public.daily_contents c on c.id = f.content_id
  left join public.daily_content_categories cat on cat.id = c.category_id
  where f.user_id = (select auth.uid())
  order by f.created_at desc;
$$;
revoke all on function public.my_daily_favorites() from public,anon;
grant execute on function public.my_daily_favorites() to authenticated;
