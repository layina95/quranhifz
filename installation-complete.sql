-- =====================================================================
--  Installation complete de la base, en un seul collage
-- =====================================================================
--
--  Ce fichier reunit les 12 scripts du dossier supabase/, dans l'ordre
--  verifie. Collez-le en entier dans le SQL Editor de Supabase, puis Run.
--
--  L'ordre a ete eprouve sur une base PostgreSQL neuve : les 12 scripts
--  s'appliquent sans erreur, et la sequence se rejoue telle quelle. Un
--  message « already exists » est donc sans gravite si vous relancez.
--
--  Ne collez pas ce fichier deux fois en meme temps dans deux onglets.
--
--  Fichier engendre : ne le modifiez pas a la main, modifiez supabase/, puis
--  relancez « node scripts/assembler-installation.mjs ».
--
-- =====================================================================

-- =====================================================================
--  01/12   schema.sql
-- =====================================================================

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;
drop policy if exists "own state select" on public.user_state;
drop policy if exists "own state insert" on public.user_state;
drop policy if exists "own state update" on public.user_state;
drop policy if exists "own state delete" on public.user_state;
create policy "own state select" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state insert" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own state update" on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own state delete" on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);

-- =====================================================================
--  02/12   social.sql
-- =====================================================================

-- À exécuter après schema.sql. Aucun accès ami à public.user_state.
create schema if not exists private;
grant usage on schema private to authenticated;

create table if not exists public.friend_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  share_online boolean not null default true,
  share_location boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.friend_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  blocked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester_id <> recipient_id),
  check (blocked_by is null or blocked_by in (requester_id,recipient_id))
);
create unique index if not exists friend_links_pair on public.friend_links
  (least(requester_id,recipient_id),greatest(requester_id,recipient_id));

create table if not exists public.friend_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal_label text not null default '',
  weekly_verses integer not null default 0 check (weekly_verses >= 0),
  weekly_sessions integer not null default 0 check (weekly_sessions >= 0),
  goal_percent numeric(5,2) not null default 0 check (goal_percent between 0 and 100),
  quran_percent numeric(5,2) not null default 0 check (quran_percent between 0 and 100),
  current_start integer check (current_start between 1 and 6236),
  current_end integer check (current_end between 1 and 6236),
  online_until timestamptz,
  updated_at timestamptz not null default now(),
  check (current_start is null or current_end >= current_start)
);

create table if not exists public.friend_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.friend_group_members (
  group_id uuid not null references public.friend_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  primary key (group_id,user_id)
);

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.friend_links(id) on delete cascade,
  group_id uuid references public.friend_groups(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','encouragement')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  check ((link_id is null) <> (group_id is null))
);
create index if not exists friend_messages_link_time on public.friend_messages(link_id,created_at desc);
create index if not exists friend_messages_group_time on public.friend_messages(group_id,created_at desc);

create table if not exists public.friend_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.friend_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  excerpt text not null,
  created_at timestamptz not null default now(),
  unique (message_id,reporter_id)
);

-- Les administrateurs sont attribués par le propriétaire du projet dans SQL Editor.
-- Aucun client ne peut créer son propre rôle administrateur.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.social_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  suspended_until timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.friend_message_reports add column if not exists status text not null default 'open';
alter table public.friend_message_reports add column if not exists reviewed_at timestamptz;
alter table public.friend_message_reports add column if not exists reviewed_by uuid references auth.users(id);
alter table public.friend_message_reports drop constraint if exists friend_message_reports_status_check;
alter table public.friend_message_reports add constraint friend_message_reports_status_check check (status in ('open','reviewed'));

create table if not exists public.friend_shared_goals (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.friend_links(id) on delete cascade,
  week_start date not null,
  target_sessions integer not null check (target_sessions between 1 and 14),
  proposed_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (link_id,week_start)
);
create table if not exists public.friend_review_appointments (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.friend_links(id) on delete cascade,
  starts_at timestamptz not null,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function private.is_friend(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_links l
    where l.status='accepted' and
    ((l.requester_id=(select auth.uid()) and l.recipient_id=p_other)
      or (l.recipient_id=(select auth.uid()) and l.requester_id=p_other)));
$$;
create or replace function private.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_admins where user_id=(select auth.uid()));
$$;
create or replace function private.is_social_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.social_suspensions
    where user_id=p_user and (suspended_until is null or suspended_until>now()));
$$;
create or replace function private.has_friend_link(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_links l
    where l.status in ('pending','accepted') and
    ((l.requester_id=(select auth.uid()) and l.recipient_id=p_other)
      or (l.recipient_id=(select auth.uid()) and l.requester_id=p_other)));
$$;
create or replace function private.active_link(p_link uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_links l where l.id=p_link
    and l.status='accepted' and (select auth.uid()) in (l.requester_id,l.recipient_id));
$$;
create or replace function private.group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_group_members m where m.group_id=p_group
    and m.user_id=(select auth.uid()) and m.accepted_at is not null);
$$;
create or replace function private.group_invitee(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_group_members m where m.group_id=p_group
    and m.user_id=(select auth.uid()));
$$;
create or replace function private.group_moderator(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_group_members m where m.group_id=p_group
    and m.user_id=(select auth.uid()) and m.accepted_at is not null
    and m.role in ('owner','moderator'));
$$;
create or replace function private.shared_group(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.friend_group_members mine
    join public.friend_group_members theirs on theirs.group_id=mine.group_id
    where mine.user_id=(select auth.uid()) and theirs.user_id=p_other
      and mine.accepted_at is not null and theirs.accepted_at is not null);
$$;
create or replace function private.can_read_chat(p_link uuid,p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_link is not null then private.active_link(p_link)
    else private.group_member(p_group) end;
$$;

revoke all on function private.is_friend(uuid),private.has_friend_link(uuid),private.active_link(uuid),
  private.group_member(uuid),private.group_invitee(uuid),private.group_moderator(uuid),
  private.shared_group(uuid),private.can_read_chat(uuid,uuid) from public,anon;
revoke all on function private.is_app_admin(),private.is_social_suspended(uuid) from public,anon;
grant execute on function private.is_app_admin(),private.is_social_suspended(uuid) to authenticated;
grant execute on function private.is_friend(uuid),private.has_friend_link(uuid),private.active_link(uuid),
  private.group_member(uuid),private.group_invitee(uuid),private.group_moderator(uuid),
  private.shared_group(uuid),private.can_read_chat(uuid,uuid) to authenticated;

alter table public.friend_profiles enable row level security;
alter table public.friend_links enable row level security;
alter table public.friend_progress enable row level security;
alter table public.friend_groups enable row level security;
alter table public.friend_group_members enable row level security;
alter table public.friend_messages enable row level security;
alter table public.friend_message_reports enable row level security;
alter table public.friend_shared_goals enable row level security;
alter table public.friend_review_appointments enable row level security;
alter table public.app_admins enable row level security;
alter table public.social_suspensions enable row level security;

revoke all on public.friend_profiles,public.friend_links,public.friend_progress,
  public.friend_groups,public.friend_group_members,public.friend_messages,
  public.friend_message_reports,public.friend_shared_goals,public.friend_review_appointments from anon,authenticated;
revoke all on public.app_admins,public.social_suspensions from anon,authenticated;
grant select on public.app_admins,public.social_suspensions to authenticated;
grant select,insert on public.friend_profiles to authenticated;
grant update(display_name,share_online,share_location) on public.friend_profiles to authenticated;
grant select on public.friend_links to authenticated;
grant select,insert on public.friend_progress to authenticated;
grant update(goal_label,weekly_verses,weekly_sessions,goal_percent,quran_percent,current_start,current_end,updated_at) on public.friend_progress to authenticated;
grant select on public.friend_groups,public.friend_group_members to authenticated;
grant select,insert on public.friend_messages to authenticated;
grant select on public.friend_message_reports to authenticated;
grant select,insert on public.friend_shared_goals,public.friend_review_appointments to authenticated;

drop policy if exists "profiles read" on public.friend_profiles;
drop policy if exists "profiles insert" on public.friend_profiles;
drop policy if exists "profiles update" on public.friend_profiles;
create policy "profiles read" on public.friend_profiles for select to authenticated
  using (id=(select auth.uid()) or private.has_friend_link(id) or private.shared_group(id) or private.is_app_admin());
create policy "profiles insert" on public.friend_profiles for insert to authenticated
  with check (id=(select auth.uid()));
create policy "profiles update" on public.friend_profiles for update to authenticated
  using (id=(select auth.uid())) with check (id=(select auth.uid()));

drop policy if exists "links read" on public.friend_links;
create policy "links read" on public.friend_links for select to authenticated
  using ((select auth.uid()) in (requester_id,recipient_id));

drop policy if exists "progress own read" on public.friend_progress;
drop policy if exists "progress own insert" on public.friend_progress;
drop policy if exists "progress own update" on public.friend_progress;
create policy "progress own read" on public.friend_progress for select to authenticated using (user_id=(select auth.uid()));
create policy "progress own insert" on public.friend_progress for insert to authenticated with check (user_id=(select auth.uid()));
create policy "progress own update" on public.friend_progress for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists "groups read" on public.friend_groups;
create policy "groups read" on public.friend_groups for select to authenticated using (private.group_invitee(id));
drop policy if exists "group members read" on public.friend_group_members;
create policy "group members read" on public.friend_group_members for select to authenticated
  using (user_id=(select auth.uid()) or private.group_member(group_id));

drop policy if exists "chat read" on public.friend_messages;
drop policy if exists "chat send" on public.friend_messages;
create policy "chat read" on public.friend_messages for select to authenticated
  using (private.can_read_chat(link_id,group_id) or private.is_app_admin());
create policy "chat send" on public.friend_messages for insert to authenticated
  with check (sender_id=(select auth.uid()) and private.can_read_chat(link_id,group_id)
    and not private.is_social_suspended((select auth.uid())));

drop policy if exists "reports own read" on public.friend_message_reports;
drop policy if exists "reports moderators read" on public.friend_message_reports;
create policy "reports own read" on public.friend_message_reports for select to authenticated
  using (reporter_id=(select auth.uid()));
create policy "reports moderators read" on public.friend_message_reports for select to authenticated
  using (exists(select 1 from public.friend_messages m where m.id=message_id
    and m.group_id is not null and private.group_moderator(m.group_id)));
drop policy if exists "reports admins read" on public.friend_message_reports;
create policy "reports admins read" on public.friend_message_reports for select to authenticated
  using (private.is_app_admin());
drop policy if exists "admins own read" on public.app_admins;
create policy "admins own read" on public.app_admins for select to authenticated
  using (user_id=(select auth.uid()));
drop policy if exists "suspensions read" on public.social_suspensions;
create policy "suspensions read" on public.social_suspensions for select to authenticated
  using (user_id=(select auth.uid()) or private.is_app_admin());

drop policy if exists "shared goals read" on public.friend_shared_goals;
drop policy if exists "shared goals propose" on public.friend_shared_goals;
create policy "shared goals read" on public.friend_shared_goals for select to authenticated
  using (private.active_link(link_id));
create policy "shared goals propose" on public.friend_shared_goals for insert to authenticated
  with check (proposed_by=(select auth.uid()) and accepted_at is null and private.active_link(link_id));

drop policy if exists "appointments read" on public.friend_review_appointments;
drop policy if exists "appointments propose" on public.friend_review_appointments;
create policy "appointments read" on public.friend_review_appointments for select to authenticated
  using (private.active_link(link_id));
create policy "appointments propose" on public.friend_review_appointments for insert to authenticated
  with check (proposed_by=(select auth.uid()) and accepted_at is null and starts_at>now() and private.active_link(link_id));

create or replace function public.ensure_social_profile() returns public.friend_profiles
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_profile public.friend_profiles;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  insert into public.friend_profiles(id,display_name) values(v_user,'Apprenant') on conflict(id) do nothing;
  select * into v_profile from public.friend_profiles where id=v_user;
  return v_profile;
end $$;

create or replace function public.request_friend(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_target uuid; v_link uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  select id into v_target from public.friend_profiles where invite_code=upper(btrim(p_code));
  if v_target is null then raise exception 'Code ami introuvable'; end if;
  if v_target=v_user then raise exception 'Tu ne peux pas t’inviter toi-même'; end if;
  if exists(select 1 from public.friend_links where
    (requester_id=v_user and recipient_id=v_target) or (requester_id=v_target and recipient_id=v_user))
    then raise exception 'Invitation ou relation déjà existante'; end if;
  insert into public.friend_links(requester_id,recipient_id) values(v_user,v_target) returning id into v_link;
  return v_link;
end $$;

create or replace function public.accept_friend(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.friend_links set status='accepted',accepted_at=now()
    where id=p_link and recipient_id=auth.uid() and status='pending';
  if not found then raise exception 'Invitation indisponible'; end if;
end $$;
create or replace function public.decline_friend(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friend_links where id=p_link and recipient_id=auth.uid() and status='pending';
  if not found then raise exception 'Invitation indisponible'; end if;
end $$;
create or replace function public.remove_friend(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friend_links where id=p_link and status='accepted'
    and auth.uid() in (requester_id,recipient_id);
  if not found then raise exception 'Amitié introuvable'; end if;
end $$;
create or replace function public.block_friend(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_link uuid;
begin
  if v_user is null or v_user=p_other then raise exception 'Compte invalide'; end if;
  if exists(select 1 from public.friend_links where status='blocked' and blocked_by<>v_user
    and ((requester_id=v_user and recipient_id=p_other) or (requester_id=p_other and recipient_id=v_user)))
    then raise exception 'Personne indisponible'; end if;
  select id into v_link from public.friend_links where
    (requester_id=v_user and recipient_id=p_other) or (requester_id=p_other and recipient_id=v_user);
  if v_link is null then
    insert into public.friend_links(requester_id,recipient_id,status,blocked_by)
      values(v_user,p_other,'blocked',v_user);
  else
    update public.friend_links set status='blocked',blocked_by=v_user,accepted_at=null where id=v_link;
  end if;
end $$;
create or replace function public.unblock_friend(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friend_links where status='blocked' and blocked_by=auth.uid()
    and (requester_id=p_other or recipient_id=p_other);
  if not found then raise exception 'Blocage introuvable'; end if;
end $$;

create or replace function public.publish_social_progress(
  p_goal_label text,p_weekly_verses integer,p_weekly_sessions integer,
  p_goal_percent numeric,p_quran_percent numeric,p_current_start integer,p_current_end integer
) returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  insert into public.friend_progress(user_id,goal_label,weekly_verses,weekly_sessions,goal_percent,quran_percent,current_start,current_end,updated_at)
    values(v_user,left(p_goal_label,100),p_weekly_verses,p_weekly_sessions,p_goal_percent,p_quran_percent,p_current_start,p_current_end,now())
    on conflict(user_id) do update set goal_label=excluded.goal_label,weekly_verses=excluded.weekly_verses,
      weekly_sessions=excluded.weekly_sessions,goal_percent=excluded.goal_percent,quran_percent=excluded.quran_percent,
      current_start=excluded.current_start,current_end=excluded.current_end,updated_at=now();
end $$;
create or replace function public.set_social_online(p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  insert into public.friend_progress(user_id,online_until)
    values(v_user,case when p_active then now()+interval '75 seconds' else now() end)
    on conflict(user_id) do update set online_until=excluded.online_until;
end $$;
create or replace function public.friend_overview(p_other uuid)
returns table(id uuid,display_name text,goal_label text,weekly_verses integer,weekly_sessions integer,
  goal_percent numeric,quran_percent numeric,current_start integer,current_end integer,is_online boolean,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_friend(p_other) then raise exception 'Ami non autorisé'; end if;
  return query select p.id,p.display_name,coalesce(f.goal_label,''),coalesce(f.weekly_verses,0),
    coalesce(f.weekly_sessions,0),coalesce(f.goal_percent,0),coalesce(f.quran_percent,0),
    case when p.share_location then f.current_start else null end,
    case when p.share_location then f.current_end else null end,
    p.share_online and coalesce(f.online_until>now(),false),f.updated_at
    from public.friend_profiles p left join public.friend_progress f on f.user_id=p.id where p.id=p_other;
end $$;

create or replace function public.create_friend_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_group uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  insert into public.friend_groups(name,owner_id) values(btrim(p_name),v_user) returning id into v_group;
  insert into public.friend_group_members(group_id,user_id,role,accepted_at)
    values(v_group,v_user,'owner',now());
  return v_group;
end $$;
create or replace function public.invite_group_member(p_group uuid,p_friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.group_moderator(p_group) or not private.is_friend(p_friend)
    then raise exception 'Invitation non autorisée'; end if;
  if (select count(*) from public.friend_group_members where group_id=p_group)>=5
    then raise exception 'Ce cercle est limité à cinq personnes'; end if;
  insert into public.friend_group_members(group_id,user_id,invited_by)
    values(p_group,p_friend,auth.uid());
end $$;
create or replace function public.accept_group_invite(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.friend_group_members where group_id=p_group and accepted_at is not null)>=5
    then raise exception 'Ce cercle est complet'; end if;
  update public.friend_group_members set accepted_at=now()
    where group_id=p_group and user_id=auth.uid() and accepted_at is null;
  if not found then raise exception 'Invitation introuvable'; end if;
end $$;
create or replace function public.decline_group_invite(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friend_group_members where group_id=p_group and user_id=auth.uid() and accepted_at is null;
  if not found then raise exception 'Invitation introuvable'; end if;
end $$;
create or replace function public.set_group_moderator(p_group uuid,p_member uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.friend_groups where id=p_group and owner_id=auth.uid())
    then raise exception 'Seul le créateur peut nommer un modérateur'; end if;
  update public.friend_group_members set role=case when p_enabled then 'moderator' else 'member' end
    where group_id=p_group and user_id=p_member and role<>'owner' and accepted_at is not null;
  if not found then raise exception 'Membre introuvable'; end if;
end $$;
create or replace function public.remove_group_member(p_group uuid,p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_member<>auth.uid() and not private.group_moderator(p_group)
    then raise exception 'Action non autorisée'; end if;
  delete from public.friend_group_members where group_id=p_group and user_id=p_member and role<>'owner';
  if not found then raise exception 'Membre introuvable'; end if;
end $$;
create or replace function public.delete_friend_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friend_groups where id=p_group and owner_id=auth.uid();
  if not found then raise exception 'Cercle introuvable'; end if;
end $$;

create or replace function public.delete_friend_message(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_message public.friend_messages;
begin
  select * into v_message from public.friend_messages where id=p_message;
  if not found or not (private.can_read_chat(v_message.link_id,v_message.group_id) or private.is_app_admin())
    then raise exception 'Message introuvable'; end if;
  if v_message.sender_id<>auth.uid() and v_message.group_id is not null
    and not private.group_moderator(v_message.group_id) and not private.is_app_admin()
    then raise exception 'Action non autorisée'; end if;
  if v_message.sender_id<>auth.uid() and v_message.group_id is null and not private.is_app_admin()
    then raise exception 'Action non autorisée'; end if;
  update public.friend_messages set body='[Message supprimé]',deleted_at=now(),deleted_by=auth.uid()
    where id=p_message and deleted_at is null;
end $$;

create or replace function public.resolve_friend_report(p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_message public.friend_messages;
begin
  if not private.is_app_admin() then raise exception 'Action réservée à l’administrateur'; end if;
  select m.* into v_message from public.friend_message_reports r
    join public.friend_messages m on m.id=r.message_id where r.id=p_report;
  if not found then raise exception 'Signalement introuvable'; end if;
  update public.friend_message_reports set status='reviewed',reviewed_at=now(),reviewed_by=auth.uid()
    where id=p_report;
end $$;
create or replace function public.suspend_social_member(p_user uuid,p_reason text,p_until timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_app_admin() then raise exception 'Action réservée à l’administrateur'; end if;
  if p_user=auth.uid() then raise exception 'Auto-suspension interdite'; end if;
  if exists(select 1 from public.app_admins where user_id=p_user) then raise exception 'Compte administrateur protégé'; end if;
  if p_until is not null and p_until<=now() then raise exception 'Date de fin invalide'; end if;
  insert into public.social_suspensions(user_id,reason,suspended_until,created_by)
    values(p_user,btrim(p_reason),p_until,auth.uid())
    on conflict(user_id) do update set reason=excluded.reason,suspended_until=excluded.suspended_until,
      created_by=excluded.created_by,created_at=now();
end $$;
create or replace function public.unsuspend_social_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_app_admin() then raise exception 'Action réservée à l’administrateur'; end if;
  delete from public.social_suspensions where user_id=p_user;
end $$;
create or replace function public.report_friend_message(p_message uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_message public.friend_messages;
begin
  select * into v_message from public.friend_messages where id=p_message;
  if not found or v_message.deleted_at is not null or not private.can_read_chat(v_message.link_id,v_message.group_id)
    then raise exception 'Message indisponible'; end if;
  insert into public.friend_message_reports(message_id,reporter_id,reason,excerpt)
    values(p_message,auth.uid(),btrim(p_reason),v_message.body)
    on conflict(message_id,reporter_id) do nothing;
end $$;

create or replace function public.accept_shared_goal(p_goal uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.friend_shared_goals set accepted_at=now() where id=p_goal and accepted_at is null
    and proposed_by<>auth.uid() and private.active_link(link_id);
  if not found then raise exception 'Objectif partagé indisponible'; end if;
end $$;
create or replace function public.accept_review_appointment(p_appointment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.friend_review_appointments set accepted_at=now()
    where id=p_appointment and accepted_at is null and starts_at>now()
      and proposed_by<>auth.uid() and private.active_link(link_id);
  if not found then raise exception 'Rendez-vous indisponible'; end if;
end $$;
create or replace function public.cancel_review_appointment(p_appointment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friend_review_appointments where id=p_appointment and private.active_link(link_id);
  if not found then raise exception 'Rendez-vous indisponible'; end if;
end $$;

revoke execute on function public.ensure_social_profile(),public.request_friend(text),
  public.accept_friend(uuid),public.decline_friend(uuid),public.remove_friend(uuid),
  public.block_friend(uuid),public.unblock_friend(uuid),
  public.publish_social_progress(text,integer,integer,numeric,numeric,integer,integer),
  public.set_social_online(boolean),public.friend_overview(uuid),
  public.create_friend_group(text),public.invite_group_member(uuid,uuid),
  public.accept_group_invite(uuid),public.decline_group_invite(uuid),
  public.set_group_moderator(uuid,uuid,boolean),public.remove_group_member(uuid,uuid),
  public.delete_friend_group(uuid),public.delete_friend_message(uuid),
  public.report_friend_message(uuid,text),public.accept_shared_goal(uuid),
  public.accept_review_appointment(uuid),public.cancel_review_appointment(uuid) from public,anon;
revoke execute on function public.resolve_friend_report(uuid),
  public.suspend_social_member(uuid,text,timestamptz),public.unsuspend_social_member(uuid) from public,anon;
grant execute on function public.ensure_social_profile(),public.request_friend(text),
  public.accept_friend(uuid),public.decline_friend(uuid),public.remove_friend(uuid),
  public.block_friend(uuid),public.unblock_friend(uuid),
  public.publish_social_progress(text,integer,integer,numeric,numeric,integer,integer),
  public.set_social_online(boolean),public.friend_overview(uuid),
  public.create_friend_group(text),public.invite_group_member(uuid,uuid),
  public.accept_group_invite(uuid),public.decline_group_invite(uuid),
  public.set_group_moderator(uuid,uuid,boolean),public.remove_group_member(uuid,uuid),
  public.delete_friend_group(uuid),public.delete_friend_message(uuid),
  public.report_friend_message(uuid,text),public.accept_shared_goal(uuid),
  public.accept_review_appointment(uuid),public.cancel_review_appointment(uuid) to authenticated;
grant execute on function public.resolve_friend_report(uuid),
  public.suspend_social_member(uuid,text,timestamptz),public.unsuspend_social_member(uuid) to authenticated;

-- =====================================================================
--  03/12   notifications.sql
-- =====================================================================

-- À exécuter après social.sql. La table des messages existante est conservée.
create extension if not exists pg_net with schema extensions;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_devices (
  installation_id text primary key check (char_length(installation_id) between 16 and 100),
  expo_push_token text not null unique check (expo_push_token like 'ExpoPushToken[%]' or expo_push_token like 'ExponentPushToken[%]'),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  active_link_id uuid,
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user_id on public.push_devices(user_id);

alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;
revoke all on public.notification_preferences,public.push_devices from anon,authenticated;
grant select,insert,update,delete on public.notification_preferences,public.push_devices to authenticated;

drop policy if exists "notification settings own" on public.notification_preferences;
create policy "notification settings own" on public.notification_preferences
  for all to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
drop policy if exists "push devices own" on public.push_devices;
create policy "push devices own" on public.push_devices
  for all to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));

create or replace function private.notify_private_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_sender text;
  v_device record;
begin
  if new.link_id is null then return new; end if;
  select case when l.requester_id=new.sender_id then l.recipient_id else l.requester_id end
    into v_recipient from public.friend_links l
    where l.id=new.link_id and l.status='accepted'
      and new.sender_id in (l.requester_id,l.recipient_id);
  if v_recipient is null then return new; end if;
  if exists(select 1 from public.notification_preferences p
    where p.user_id=v_recipient and not p.messages_enabled) then return new; end if;
  select p.display_name into v_sender from public.friend_profiles p where p.id=new.sender_id;

  for v_device in
    select d.expo_push_token from public.push_devices d
      where d.user_id=v_recipient
        and not (d.active_link_id is not null and d.active_link_id=new.link_id
          and d.last_active_at>now()-interval '30 seconds')
  loop
    perform net.http_post(
      url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object(
        'to',v_device.expo_push_token,
        'title','Nouveau message de '||coalesce(v_sender,'un ami'),
        'body',left(new.body,600),
        'data',jsonb_build_object('kind','private-message','linkId',new.link_id,'messageId',new.id),
        'sound','default','priority','high','channelId','messages'
      ),
      headers:='{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds:=5000
    );
  end loop;
  return new;
end;
$$;
revoke all on function private.notify_private_message() from public,anon,authenticated;
drop trigger if exists notify_private_message on public.friend_messages;
create trigger notify_private_message after insert on public.friend_messages
  for each row execute function private.notify_private_message();

-- =====================================================================
--  04/12   social-v2.sql
-- =====================================================================

-- À exécuter après social.sql et notifications.sql. Les comptes et messages existants sont conservés.
alter table public.friend_profiles add column if not exists share_progress boolean not null default false;
alter table public.friend_profiles alter column share_online set default false;
alter table public.friend_profiles alter column share_location set default false;
update public.friend_profiles set share_online=false,share_location=false;
grant update(display_name,share_online,share_location,share_progress) on public.friend_profiles to authenticated;

create or replace function public.friend_overview(p_other uuid)
returns table(id uuid,display_name text,goal_label text,weekly_verses integer,weekly_sessions integer,
  goal_percent numeric,quran_percent numeric,current_start integer,current_end integer,is_online boolean,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_friend(p_other) then raise exception 'Ami non autorisé'; end if;
  return query select p.id,p.display_name,
    case when p.share_progress then coalesce(f.goal_label,'') else '' end,
    case when p.share_progress then coalesce(f.weekly_verses,0) else 0 end,
    case when p.share_progress then coalesce(f.weekly_sessions,0) else 0 end,
    case when p.share_progress then coalesce(f.goal_percent,0) else 0 end,
    case when p.share_progress then coalesce(f.quran_percent,0) else 0 end,
    case when p.share_progress and p.share_location then f.current_start else null end,
    case when p.share_progress and p.share_location then f.current_end else null end,
    p.share_online and coalesce(f.online_until>now(),false),
    case when p.share_progress then f.updated_at else null end
    from public.friend_profiles p left join public.friend_progress f on f.user_id=p.id where p.id=p_other;
end $$;

create table if not exists public.friend_message_reads (
  link_id uuid not null references public.friend_links(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key(link_id,user_id)
);
create table if not exists public.friend_message_hidden (
  message_id uuid not null references public.friend_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(message_id,user_id)
);
alter table public.friend_message_reads enable row level security;
alter table public.friend_message_hidden enable row level security;
revoke all on public.friend_message_reads,public.friend_message_hidden from anon,authenticated;
grant select,insert,update on public.friend_message_reads to authenticated;
grant select,insert,delete on public.friend_message_hidden to authenticated;
drop policy if exists "own message reads" on public.friend_message_reads;
create policy "own message reads" on public.friend_message_reads for all to authenticated
  using (user_id=(select auth.uid()) and private.can_read_chat(link_id,null))
  with check (user_id=(select auth.uid()) and private.can_read_chat(link_id,null));
drop policy if exists "own hidden messages" on public.friend_message_hidden;
create policy "own hidden messages" on public.friend_message_hidden for all to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.friend_messages m where m.id=message_id and private.can_read_chat(m.link_id,m.group_id)))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.friend_messages m where m.id=message_id and private.can_read_chat(m.link_id,m.group_id)));

create or replace function public.my_unread_messages() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.friend_messages m
  join public.friend_links l on l.id=m.link_id and l.status='accepted'
  left join public.friend_message_reads r on r.link_id=l.id and r.user_id=auth.uid()
  where auth.uid() in (l.requester_id,l.recipient_id)
    and m.sender_id<>auth.uid() and m.deleted_at is null
    and m.created_at>coalesce(r.last_read_at,l.created_at)
    and not exists(select 1 from public.friend_message_hidden h where h.message_id=m.id and h.user_id=auth.uid());
$$;
revoke all on function public.my_unread_messages() from public,anon;
grant execute on function public.my_unread_messages() to authenticated;

alter table public.notification_preferences add column if not exists friend_requests_enabled boolean not null default true;
alter table public.notification_preferences add column if not exists shared_progress_enabled boolean not null default false;
alter table public.notification_preferences add column if not exists revision_reminders_enabled boolean not null default false;
alter table public.notification_preferences add column if not exists message_preview_enabled boolean not null default true;
alter table public.friend_messages drop constraint if exists friend_messages_kind_check;
alter table public.friend_messages add constraint friend_messages_kind_check check (kind in ('text','encouragement','progress'));

create or replace function private.notify_private_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_sender text; v_device record; v_preview boolean;
begin
  if new.link_id is null then return new; end if;
  select case when l.requester_id=new.sender_id then l.recipient_id else l.requester_id end
    into v_recipient from public.friend_links l
    where l.id=new.link_id and l.status='accepted'
      and new.sender_id in (l.requester_id,l.recipient_id);
  if v_recipient is null then return new; end if;
  if exists(select 1 from public.notification_preferences p where p.user_id=v_recipient and
    ((new.kind='progress' and not p.shared_progress_enabled) or (new.kind<>'progress' and not p.messages_enabled))) then return new; end if;
  select coalesce(p.message_preview_enabled,true) into v_preview from public.notification_preferences p where p.user_id=v_recipient;
  select p.display_name into v_sender from public.friend_profiles p where p.id=new.sender_id;
  for v_device in select d.expo_push_token from public.push_devices d
    where d.user_id=v_recipient and not (d.active_link_id is not null and d.active_link_id=new.link_id and d.last_active_at>now()-interval '30 seconds')
  loop
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object('to',v_device.expo_push_token,
        'title',case when not coalesce(v_preview,true) then 'Nouveau message' when new.kind='progress' then coalesce(v_sender,'Un ami')||' a partagé une étape' else coalesce(v_sender,'Un ami')||' t’a envoyé un message' end,
        'body',case when coalesce(v_preview,true) then left(new.body,600) else 'Vous avez reçu un nouveau message' end,
        'data',jsonb_build_object('kind',case when new.kind='progress' then 'friend-progress' else 'private-message' end,'linkId',new.link_id,'messageId',new.id),
        'sound','default','priority','high','channelId','messages'),
      headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
  end loop;
  return new;
end $$;

create or replace function private.notify_friend_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_sender uuid; v_kind text; v_name text; v_device record;
begin
  if tg_op='INSERT' and new.status='pending' then
    v_recipient:=new.recipient_id; v_sender:=new.requester_id; v_kind:='friend-request';
  elsif tg_op='UPDATE' and old.status='pending' and new.status='accepted' then
    v_recipient:=new.requester_id; v_sender:=new.recipient_id; v_kind:='friend-accepted';
  else return new; end if;
  if exists(select 1 from public.notification_preferences p where p.user_id=v_recipient and not p.friend_requests_enabled) then return new; end if;
  select display_name into v_name from public.friend_profiles where id=v_sender;
  for v_device in select expo_push_token from public.push_devices where user_id=v_recipient loop
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object('to',v_device.expo_push_token,
        'title',case when v_kind='friend-request' then 'Nouvelle invitation' else 'Invitation acceptée' end,
        'body',case when v_kind='friend-request' then coalesce(v_name,'Un membre')||' souhaite devenir ton ami' else coalesce(v_name,'Un membre')||' a accepté ton invitation' end,
        'data',jsonb_build_object('kind',v_kind,'linkId',new.id),
        'sound','default','priority','high','channelId','messages'),
      headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
  end loop;
  return new;
end $$;
revoke all on function private.notify_friend_link() from public,anon,authenticated;
drop trigger if exists notify_friend_link on public.friend_links;
create trigger notify_friend_link after insert or update of status on public.friend_links
  for each row execute function private.notify_friend_link();

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friend_messages') then
    alter publication supabase_realtime add table public.friend_messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friend_links') then
    alter publication supabase_realtime add table public.friend_links;
  end if;
end $$;

-- =====================================================================
--  05/12   friend-avatars.sql
-- =====================================================================

-- Apply after social.sql. Avatars stay in a private bucket and can only be read
-- by their owner or an accepted friend. Recordings keep their own policies.
alter table public.friend_profiles add column if not exists avatar_path text;
grant update(avatar_path) on public.friend_profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('friend-avatars','friend-avatars',false,2097152,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];

drop policy if exists friend_avatars_read on storage.objects;
create policy friend_avatars_read on storage.objects for select to authenticated using (
  bucket_id='friend-avatars' and (
    split_part(name,'/',1)=(select auth.uid())::text
    or exists(select 1 from public.friend_links l where l.status='accepted'
      and ((l.requester_id=(select auth.uid()) and l.recipient_id::text=split_part(name,'/',1))
        or (l.recipient_id=(select auth.uid()) and l.requester_id::text=split_part(name,'/',1))))
  )
);
drop policy if exists friend_avatars_insert on storage.objects;
create policy friend_avatars_insert on storage.objects for insert to authenticated
with check (bucket_id='friend-avatars' and name=(select auth.uid())::text||'/avatar.jpg');
drop policy if exists friend_avatars_update on storage.objects;
create policy friend_avatars_update on storage.objects for update to authenticated
using (bucket_id='friend-avatars' and name=(select auth.uid())::text||'/avatar.jpg')
with check (bucket_id='friend-avatars' and name=(select auth.uid())::text||'/avatar.jpg');
drop policy if exists friend_avatars_delete on storage.objects;
create policy friend_avatars_delete on storage.objects for delete to authenticated
using (bucket_id='friend-avatars' and name=(select auth.uid())::text||'/avatar.jpg');

drop policy if exists friend_read_receipts on public.friend_message_reads;
create policy friend_read_receipts on public.friend_message_reads for select to authenticated using (
  exists(select 1 from public.friend_links l where l.id=link_id and l.status='accepted'
    and (select auth.uid()) in (l.requester_id,l.recipient_id))
);

-- =====================================================================
--  06/12   friend-realtime.sql
-- =====================================================================

-- Private ephemeral typing and read indicators for existing friend rooms.
-- Message contents continue to use friend_messages with its existing RLS.
create or replace function private.friend_room_access(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_topic is null or p_topic !~ '^friend-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id:=substring(p_topic from 13)::uuid;
  return private.active_link(v_id) or private.group_member(v_id);
end $$;
revoke all on function private.friend_room_access(text) from public,anon;
grant execute on function private.friend_room_access(text) to authenticated;

drop policy if exists friend_room_receive on realtime.messages;
create policy friend_room_receive on realtime.messages for select to authenticated
using (extension='broadcast' and private.friend_room_access(realtime.topic()));
drop policy if exists friend_room_send on realtime.messages;
create policy friend_room_send on realtime.messages for insert to authenticated
with check (extension='broadcast' and private.friend_room_access(realtime.topic()));

-- =====================================================================
--  07/12   fix-social-push.sql
-- =====================================================================

-- An empty active_link_id means the recipient is not viewing a conversation.
-- SQL's NULL logic previously excluded that device from the push loop.
create or replace function private.notify_private_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_sender text; v_device record; v_preview boolean;
begin
  if new.link_id is null then return new; end if;
  select case when l.requester_id=new.sender_id then l.recipient_id else l.requester_id end
    into v_recipient from public.friend_links l
    where l.id=new.link_id and l.status='accepted'
      and new.sender_id in (l.requester_id,l.recipient_id);
  if v_recipient is null then return new; end if;
  if exists(select 1 from public.notification_preferences p where p.user_id=v_recipient and
    ((new.kind='progress' and not p.shared_progress_enabled) or (new.kind<>'progress' and not p.messages_enabled))) then return new; end if;
  select coalesce(p.message_preview_enabled,true) into v_preview from public.notification_preferences p where p.user_id=v_recipient;
  select p.display_name into v_sender from public.friend_profiles p where p.id=new.sender_id;
  for v_device in select d.expo_push_token from public.push_devices d
    where d.user_id=v_recipient and not (d.active_link_id is not null and d.active_link_id=new.link_id and d.last_active_at>now()-interval '30 seconds')
  loop
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object('to',v_device.expo_push_token,
        'title',case when not coalesce(v_preview,true) then 'Nouveau message' when new.kind='progress' then coalesce(v_sender,'Un ami')||' a partagé une étape' else coalesce(v_sender,'Un ami')||' t’a envoyé un message' end,
        'body',case when coalesce(v_preview,true) then left(new.body,600) else 'Vous avez reçu un nouveau message' end,
        'data',jsonb_build_object('kind',case when new.kind='progress' then 'friend-progress' else 'private-message' end,'linkId',new.link_id,'messageId',new.id),
        'sound','default','priority','high','channelId','messages'),
      headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
  end loop;
  return new;
end $$;
revoke all on function private.notify_private_message() from public,anon,authenticated;

-- =====================================================================
--  08/12   recitations.sql
-- =====================================================================

-- Additive migration. Existing learning state, accounts and messages are unchanged.
create table if not exists public.recitations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_verse_id integer not null check (start_verse_id between 1 and 6236),
  end_verse_id integer not null check (end_verse_id between 1 and 6236 and end_verse_id >= start_verse_id),
  duration_ms integer not null check (duration_ms > 0),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  listened_at timestamptz,
  constraint recitation_own_path check (storage_path like user_id::text || '/%')
);
alter table public.recitations add column if not exists listened_at timestamptz;

create table if not exists public.recitation_corrections (
  id uuid primary key default gen_random_uuid(),
  recitation_id text not null references public.recitations(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  verse_id integer not null check (verse_id between 1 and 6236),
  comment text,
  voice_path text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint correction_has_content check (nullif(btrim(comment),'') is not null or voice_path is not null)
);
create table if not exists public.recitation_feedback (
  id uuid primary key default gen_random_uuid(),
  recitation_id text not null references public.recitations(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  comment text,
  voice_path text,
  created_at timestamptz not null default now(),
  constraint feedback_has_content check (nullif(btrim(comment),'') is not null or voice_path is not null)
);
create index if not exists recitations_user_date_idx on public.recitations(user_id,created_at desc);
create index if not exists corrections_recitation_idx on public.recitation_corrections(recitation_id,created_at desc);

alter table public.recitations enable row level security;
alter table public.recitation_corrections enable row level security;
alter table public.recitation_feedback enable row level security;
revoke all on public.recitations,public.recitation_corrections,public.recitation_feedback from anon;
grant select,insert,update on public.recitations to authenticated;
grant select,insert,update on public.recitation_corrections to authenticated;
grant select,insert on public.recitation_feedback to authenticated;

drop policy if exists recitations_read on public.recitations;
create policy recitations_read on public.recitations for select to authenticated
using (user_id=(select auth.uid()) or private.is_app_admin());
drop policy if exists recitations_insert on public.recitations;
create policy recitations_insert on public.recitations for insert to authenticated
with check (user_id=(select auth.uid()));
drop policy if exists recitations_update on public.recitations;
create policy recitations_update on public.recitations for update to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

drop policy if exists corrections_read on public.recitation_corrections;
create policy corrections_read on public.recitation_corrections for select to authenticated
using (private.is_app_admin() or exists(select 1 from public.recitations r where r.id=recitation_id and r.user_id=(select auth.uid())));
drop policy if exists corrections_admin_insert on public.recitation_corrections;
create policy corrections_admin_insert on public.recitation_corrections for insert to authenticated
with check (
  private.is_app_admin() and admin_id=(select auth.uid())
  and exists(select 1 from public.recitations r where r.id=recitation_id and verse_id between r.start_verse_id and r.end_verse_id)
);
drop policy if exists corrections_admin_update on public.recitation_corrections;
create policy corrections_admin_update on public.recitation_corrections for update to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

drop policy if exists feedback_read on public.recitation_feedback;
create policy feedback_read on public.recitation_feedback for select to authenticated
using (private.is_app_admin() or exists(select 1 from public.recitations r where r.id=recitation_id and r.user_id=(select auth.uid())));
drop policy if exists feedback_admin_insert on public.recitation_feedback;
create policy feedback_admin_insert on public.recitation_feedback for insert to authenticated
with check (private.is_app_admin() and admin_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recitations','recitations',false,52428800,array['audio/mp4','audio/3gpp','audio/m4a'])
on conflict (id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['audio/mp4','audio/3gpp','audio/m4a'];

drop policy if exists recitation_files_owner_insert on storage.objects;
create policy recitation_files_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='recitations' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists recitation_files_read on storage.objects;
create policy recitation_files_read on storage.objects for select to authenticated
using (
  bucket_id='recitations' and (
    split_part(name,'/',1)=(select auth.uid())::text
    or private.is_app_admin()
    or exists (
      select 1 from public.recitation_corrections c
      join public.recitations r on r.id=c.recitation_id
      where c.voice_path=name and r.user_id=(select auth.uid())
    )
    or exists (
      select 1 from public.recitation_feedback f
      join public.recitations r on r.id=f.recitation_id
      where f.voice_path=name and r.user_id=(select auth.uid())
    )
  )
);
drop policy if exists recitation_feedback_admin_insert on storage.objects;
create policy recitation_feedback_admin_insert on storage.objects for insert to authenticated
with check (bucket_id='recitations' and split_part(name,'/',1)='feedback' and private.is_app_admin());

-- =====================================================================
--  09/12   notification-corrections.sql
-- =====================================================================

-- Apply after social.sql, notifications.sql, social-v2.sql and recitations.sql.
-- Additive: existing accounts, recordings and notification choices are preserved.
create extension if not exists pg_net with schema extensions;

alter table public.notification_preferences
  add column if not exists corrections_enabled boolean not null default true;
alter table public.recitations
  add column if not exists correction_revision integer not null default 0,
  add column if not exists corrected_at timestamptz,
  add column if not exists last_correction_request_id text;

create or replace function private.notify_recitation_corrected() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_device record;
begin
  if new.correction_revision <= old.correction_revision then return new; end if;
  if exists(select 1 from public.notification_preferences p
    where p.user_id=new.user_id and not p.corrections_enabled) then return new; end if;
  for v_device in select d.expo_push_token from public.push_devices d where d.user_id=new.user_id loop
    perform net.http_post(
      url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object(
        'to',v_device.expo_push_token,
        'title','Ta récitation a été corrigée',
        'body','Le professeur a ajouté ses observations. Ouvre Mes récitations pour les consulter.',
        'data',jsonb_build_object('kind','recitation-corrected','recitationId',new.id,'revision',new.correction_revision),
        'sound','default','priority','high','channelId','corrections'),
      headers:='{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds:=5000
    );
  end loop;
  return new;
end $$;
revoke all on function private.notify_recitation_corrected() from public,anon,authenticated;
drop trigger if exists notify_recitation_corrected on public.recitations;
create trigger notify_recitation_corrected after update of correction_revision on public.recitations
  for each row when (new.correction_revision > old.correction_revision)
  execute function private.notify_recitation_corrected();

create or replace function public.finalize_recitation_correction(
  p_recitation_id text,
  p_request_id text,
  p_verses jsonb,
  p_general_comment text,
  p_voice_path text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_rec public.recitations%rowtype; v_item jsonb; v_verse integer; v_comment text; v_revision integer;
begin
  if auth.uid() is null or not private.is_app_admin() then raise exception 'Accès administrateur refusé'; end if;
  if p_request_id is null or length(p_request_id) not between 12 and 100 then raise exception 'Identifiant de correction invalide'; end if;
  if p_verses is null or jsonb_typeof(p_verses)<>'array' or jsonb_array_length(p_verses)>6236 then raise exception 'Liste des versets invalide'; end if;
  select * into v_rec from public.recitations where id=p_recitation_id for update;
  if not found then raise exception 'Récitation introuvable'; end if;
  if v_rec.last_correction_request_id=p_request_id then return v_rec.correction_revision; end if;
  if jsonb_array_length(p_verses)=0 and nullif(btrim(coalesce(p_general_comment,'')),'') is null and p_voice_path is null
    then raise exception 'Correction vide'; end if;
  if p_voice_path is not null and (
    p_voice_path not like 'feedback/'||auth.uid()::text||'/%'
    or not exists(select 1 from storage.objects where bucket_id='recitations' and name=p_voice_path)
  ) then raise exception 'Correction vocale introuvable'; end if;

  for v_item in select value from jsonb_array_elements(p_verses) loop
    if jsonb_typeof(v_item)<>'object' or (v_item->>'verseId') !~ '^[0-9]+$' then raise exception 'Verset invalide'; end if;
    v_verse:=(v_item->>'verseId')::integer;
    if v_verse not between v_rec.start_verse_id and v_rec.end_verse_id then raise exception 'Verset hors de la récitation'; end if;
    v_comment:=nullif(btrim(left(coalesce(v_item->>'comment',''),2000)),'');
    insert into public.recitation_corrections(recitation_id,admin_id,verse_id,comment,voice_path)
      values(v_rec.id,auth.uid(),v_verse,coalesce(v_comment,'À retravailler'),p_voice_path);
  end loop;
  if nullif(btrim(coalesce(p_general_comment,'')),'') is not null or p_voice_path is not null then
    insert into public.recitation_feedback(recitation_id,admin_id,comment,voice_path)
      values(v_rec.id,auth.uid(),nullif(btrim(left(coalesce(p_general_comment,''),4000)),''),p_voice_path);
  end if;
  update public.recitations set correction_revision=correction_revision+1,corrected_at=now(),last_correction_request_id=p_request_id
    where id=v_rec.id returning correction_revision into v_revision;
  return v_revision;
end $$;
revoke all on function public.finalize_recitation_correction(text,text,jsonb,text,text) from public,anon;
grant execute on function public.finalize_recitation_correction(text,text,jsonb,text,text) to authenticated;

-- =====================================================================
--  10/12   recitation-sharing.sql
-- =====================================================================

-- Apply after social-v2.sql and recitations.sql. Existing messages and recordings remain private.
alter table public.friend_messages
  add column if not exists recitation_id text references public.recitations(id) on delete set null;
alter table public.friend_messages drop constraint if exists friend_messages_kind_check;
alter table public.friend_messages add constraint friend_messages_kind_check
  check (kind in ('text','encouragement','progress','recitation'));

create or replace function private.validate_recitation_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'recitation' then
    if new.group_id is not null or new.link_id is null or new.recitation_id is null
      or not exists(select 1 from public.recitations r
        where r.id=new.recitation_id and r.user_id=new.sender_id)
    then raise exception 'Récitation privée invalide'; end if;
  elsif new.recitation_id is not null then
    raise exception 'Pièce jointe invalide';
  end if;
  return new;
end $$;
revoke all on function private.validate_recitation_message() from public,anon,authenticated;
drop trigger if exists validate_recitation_message on public.friend_messages;
create trigger validate_recitation_message before insert on public.friend_messages
  for each row execute function private.validate_recitation_message();

create or replace function private.can_play_shared_recitation(p_recitation_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.recitations r
    join public.friend_messages m on m.recitation_id=r.id and m.kind='recitation' and m.deleted_at is null
    join public.friend_links l on l.id=m.link_id and l.status='accepted'
    where r.id=p_recitation_id and m.sender_id=r.user_id
      and auth.uid() in (l.requester_id,l.recipient_id)
      and auth.uid()<>r.user_id
      and r.user_id in (l.requester_id,l.recipient_id)
  );
$$;
revoke all on function private.can_play_shared_recitation(text) from public,anon;
grant execute on function private.can_play_shared_recitation(text) to authenticated;

drop policy if exists recitations_read on public.recitations;
create policy recitations_read on public.recitations for select to authenticated
  using (user_id=(select auth.uid()) or private.is_app_admin() or private.can_play_shared_recitation(id));

drop policy if exists recitation_files_read on storage.objects;
create policy recitation_files_read on storage.objects for select to authenticated
using (
  bucket_id='recitations' and (
    split_part(name,'/',1)=(select auth.uid())::text
    or private.is_app_admin()
    or exists(select 1 from public.recitations r
      where r.storage_path=name and private.can_play_shared_recitation(r.id))
    or exists(select 1 from public.recitation_corrections c
      join public.recitations r on r.id=c.recitation_id
      where c.voice_path=name and r.user_id=(select auth.uid()))
    or exists(select 1 from public.recitation_feedback f
      join public.recitations r on r.id=f.recitation_id
      where f.voice_path=name and r.user_id=(select auth.uid()))
  )
);

grant delete on public.recitations to authenticated;
drop policy if exists recitations_owner_delete on public.recitations;
create policy recitations_owner_delete on public.recitations for delete to authenticated
  using (user_id=(select auth.uid()));
drop policy if exists recitation_files_owner_delete on storage.objects;
create policy recitation_files_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='recitations' and split_part(name,'/',1)=(select auth.uid())::text);

-- =====================================================================
--  11/12   admin-notifications.sql
-- =====================================================================

-- One-off administrator reminders. Apply after social.sql and notifications.sql.
-- Expo tokens remain private in push_devices; the client can only call the guarded RPC.
create extension if not exists pg_net with schema extensions;

alter table public.notification_preferences
  add column if not exists admin_messages_enabled boolean not null default true;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  admin_id uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id),
  title text not null,
  body text not null,
  recipient_count integer not null default 0,
  device_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists admin_notifications_created_at on public.admin_notifications(created_at desc);
alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from anon,authenticated;
grant select on public.admin_notifications to authenticated;
drop policy if exists admin_notifications_read on public.admin_notifications;
create policy admin_notifications_read on public.admin_notifications for select to authenticated
  using (private.is_app_admin());

create or replace function public.admin_notification_recipients()
returns table(user_id uuid, display_name text, device_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_app_admin() then raise exception 'Accès administrateur refusé'; end if;
  return query
    select d.user_id,
      coalesce(nullif(btrim(p.display_name),''),'Élève '||left(d.user_id::text,8)) as display_name,
      count(*)::bigint as device_count
    from public.push_devices d
    left join public.friend_profiles p on p.id=d.user_id
    left join public.notification_preferences pref on pref.user_id=d.user_id
    where coalesce(pref.admin_messages_enabled,true)
    group by d.user_id,p.display_name
    order by 2;
end $$;
revoke all on function public.admin_notification_recipients() from public,anon;
grant execute on function public.admin_notification_recipients() to authenticated;

create or replace function public.send_admin_notification(
  p_target uuid, p_title text, p_body text, p_request_id text
) returns table(recipient_count integer, device_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_device record; v_recipients integer; v_devices integer;
begin
  if auth.uid() is null or not private.is_app_admin() then raise exception 'Accès administrateur refusé'; end if;
  p_title:=btrim(coalesce(p_title,'')); p_body:=btrim(coalesce(p_body,''));
  if char_length(p_title) not between 3 and 80 or char_length(p_body) not between 3 and 500
    then raise exception 'Titre ou message invalide'; end if;
  if p_request_id is null or char_length(p_request_id) not between 16 and 100
    then raise exception 'Identifiant d’envoi invalide'; end if;
  select count(distinct d.user_id)::integer,count(*)::integer into v_recipients,v_devices
    from public.push_devices d
    left join public.notification_preferences pref on pref.user_id=d.user_id
    where (p_target is null or d.user_id=p_target) and coalesce(pref.admin_messages_enabled,true);
  if v_devices=0 then raise exception 'Aucun appareil autorisé pour ce destinataire'; end if;
  if v_devices>500 then raise exception 'Envoi trop volumineux : limite de 500 appareils'; end if;
  insert into public.admin_notifications(request_id,admin_id,target_user_id,title,body,recipient_count,device_count)
    values(p_request_id,auth.uid(),p_target,p_title,p_body,v_recipients,v_devices)
    on conflict(request_id) do nothing returning id into v_id;
  if v_id is null then
    return query select n.recipient_count,n.device_count from public.admin_notifications n
      where n.request_id=p_request_id and n.admin_id=auth.uid();
    if not found then raise exception 'Identifiant d’envoi déjà utilisé'; end if;
    return;
  end if;
  for v_device in
    select distinct d.expo_push_token from public.push_devices d
    left join public.notification_preferences pref on pref.user_id=d.user_id
    where (p_target is null or d.user_id=p_target) and coalesce(pref.admin_messages_enabled,true)
  loop
    perform net.http_post(
      url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object('to',v_device.expo_push_token,'title',p_title,'body',p_body,
        'data',jsonb_build_object('kind','admin-reminder','notificationId',v_id),
        'sound','default','priority','high','channelId','admin'),
      headers:='{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds:=5000
    );
  end loop;
  return query select v_recipients,v_devices;
end $$;
revoke all on function public.send_admin_notification(uuid,text,text,text) from public,anon;
grant execute on function public.send_admin_notification(uuid,text,text,text) to authenticated;

-- =====================================================================
--  12/12   daily-content.sql
-- =====================================================================

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

-- Une table deja creee par une version anterieure n'est pas touchee par un
-- « create table if not exists » : les colonnes ajoutees depuis ne se creent pas
-- toutes seules, et la premiere ecriture est refusee avec
--   could not find the 'explanation' column of 'daily_contents' in the schema cache
-- Ces lignes rendent la migration convergente : quelle que soit la version deja
-- en base, elle se termine sur la forme attendue. Chacune est sans effet quand la
-- colonne est deja la, et aucune n'est « not null » — ajouter une colonne
-- obligatoire a une table qui porte deja des lignes echouerait.
alter table public.daily_contents add column if not exists kind text;
alter table public.daily_contents add column if not exists category_id uuid;
alter table public.daily_contents add column if not exists title text;
alter table public.daily_contents add column if not exists arabic_text text;
alter table public.daily_contents add column if not exists phonetic text;
alter table public.daily_contents add column if not exists translation text;
alter table public.daily_contents add column if not exists explanation text;
alter table public.daily_contents add column if not exists source text;
alter table public.daily_contents add column if not exists audio_path text;
alter table public.daily_contents add column if not exists position int;
alter table public.daily_contents add column if not exists active boolean;
alter table public.daily_contents add column if not exists created_by uuid;
alter table public.daily_contents add column if not exists created_at timestamptz;
alter table public.daily_contents add column if not exists updated_at timestamptz;
alter table public.daily_content_categories add column if not exists kind text;
alter table public.daily_content_categories add column if not exists name text;
alter table public.daily_content_categories add column if not exists icon text;
alter table public.daily_content_categories add column if not exists position int;
alter table public.daily_content_categories add column if not exists active boolean;
alter table public.daily_content_categories add column if not exists created_at timestamptz;

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
--
-- On DETRUIT avant de recreer, et ce n'est pas une precaution de style :
-- « create or replace » ne peut pas changer le type de retour d'une fonction.
-- Or c'est exactement ce qui differe quand la fonction vient d'une version
-- anterieure — la colonne « explanation » ajoutee ici en fait partie. PostgreSQL
-- refuse alors en 42P13 et s'arrete la, laissant tout le reste du fichier non
-- applique. C'est ce qui a fait echouer la premiere installation.
drop function if exists public.daily_content_for_date(date);
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
-- Meme raison que ci-dessus : le type de retour a change avec « explanation ».
drop function if exists public.my_daily_favorites();
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

-- PostgREST garde en memoire la forme des tables exposees. Il est prevenu des
-- changements, mais relit le schema de facon asynchrone : une requete partie juste
-- apres la migration peut encore se voir refuser une colonne pourtant creee, avec
-- « could not find the 'x' column of 'y' in the schema cache ». Forcer la relecture
-- ici ferme cette fenetre, et ne coute rien.
notify pgrst, 'reload schema';

-- =====================================================================
--  Fin. Controle : dans une nouvelle requete, executez
--    select count(*) from pg_tables where schemaname = 'public';
--  Attendu : 24.
-- =====================================================================
