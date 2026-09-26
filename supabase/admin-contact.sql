-- Contacter l'administrateur : n'importe quel compte, ami ou pas.
--
-- A executer apres social.sql, notifications.sql et social-pseudo.sql.
--
-- Pourquoi une table a part plutot qu'un lien d'amitie automatique : ecrire a
-- l'administrateur ne doit pas faire de lui un ami. Un lien accepterait du meme
-- coup le partage de progression, l'acces au profil, les cercles et la
-- messagerie dans les deux sens — beaucoup plus que ce qu'on demande en
-- appuyant sur un bouton. Le canal est donc separe, et ne transporte que des
-- messages.
--
-- Le fil est designe par `user_id` : celui du membre qui a ecrit. L'administrateur
-- repond dans le meme fil. Un membre ne voit que le sien ; un administrateur voit
-- tous les fils.

create table if not exists public.admin_contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_by_admin_at timestamptz,
  read_by_user_at timestamptz
);
create index if not exists admin_contact_messages_fil on public.admin_contact_messages(user_id,created_at desc);
create index if not exists admin_contact_messages_non_lus on public.admin_contact_messages(user_id)
  where read_by_admin_at is null;

alter table public.admin_contact_messages enable row level security;
revoke all on public.admin_contact_messages from anon,authenticated;
-- Aucun update ni delete : l'horodatage de lecture passe par les fonctions
-- ci-dessous, qui decident qui a le droit de marquer quoi. Un grant d'update
-- ouvert laisserait un membre marquer comme lu un message qu'il n'a pas lu.
grant select,insert on public.admin_contact_messages to authenticated;

drop policy if exists "contact admin read" on public.admin_contact_messages;
create policy "contact admin read" on public.admin_contact_messages for select to authenticated
  using (user_id=(select auth.uid()) or private.is_app_admin());

drop policy if exists "contact admin write" on public.admin_contact_messages;
create policy "contact admin write" on public.admin_contact_messages for insert to authenticated
  with check (
    sender_id=(select auth.uid())
    and (user_id=(select auth.uid()) or private.is_app_admin())
    and not private.is_social_suspended((select auth.uid()))
  );

-- Qui est administrateur. Une seule definition, plutot que la meme sous-requete
-- recopiee dans quatre endroits : c'est en la recopiant qu'on se trompe.
--
-- Elle sert aussi a distinguer « message d'un membre » de « reponse de
-- l'administrateur ». Comparer l'expediteur a `user_id` ne marcherait pas : dans
-- son propre fil, un membre ecrit avec `sender_id = user_id`, et le message
-- passerait pour une reponse. Mesure par le banc, qui a vu « 0 non lu » la ou il
-- attendait 1.
create or replace function private.est_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_admins a where a.user_id=p_user);
$$;
revoke all on function private.est_admin(uuid) from public,anon,authenticated;

-- « Ce message est une reponse de l'administrateur ». Etre ecrit par un
-- administrateur ne suffit pas : un administrateur est aussi un membre, et
-- lorsqu'il ecrit dans son propre fil, `sender_id` vaut `user_id`. Sans la
-- seconde condition, son propre message lui serait notifie comme une reponse, et
-- compterait comme une reponse non lue qu'il ne pourrait jamais lire.
--
-- Une seule definition, employee par les quatre endroits qui posent la
-- question : le declencheur, le marquage de lecture, le compteur et la liste des
-- fils. C'est en la recopiant qu'on se trompe — le banc l'a deja montre une fois.
create or replace function private.est_reponse_admin(p_sender uuid,p_fil uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_sender<>p_fil and private.est_admin(p_sender);
$$;
revoke all on function private.est_reponse_admin(uuid,uuid) from public,anon,authenticated;

-- Le membre ecrit a l'administrateur. C'est le seul chemin d'ecriture pour lui :
-- il ne peut pas choisir un autre fil que le sien, et ne peut pas se faire
-- passer pour l'administrateur.
create or replace function public.ecrire_a_l_admin(p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_body text;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  v_body := btrim(coalesce(p_body,''));
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Message vide ou trop long (2000 caracteres au maximum)';
  end if;
  if private.is_social_suspended(v_user) then
    raise exception 'Messagerie suspendue : tu ne peux pas ecrire pour le moment';
  end if;
  insert into public.admin_contact_messages(user_id,sender_id,body) values(v_user,v_user,v_body)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.ecrire_a_l_admin(text) from public,anon;
grant execute on function public.ecrire_a_l_admin(text) to authenticated;

-- L'administrateur repond dans le fil d'un membre.
create or replace function public.repondre_au_membre(p_user uuid,p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_body text;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  if not private.is_app_admin() then raise exception 'Acces administrateur refuse'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user) then
    raise exception 'Destinataire inconnu';
  end if;
  v_body := btrim(coalesce(p_body,''));
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Message vide ou trop long (2000 caracteres au maximum)';
  end if;
  insert into public.admin_contact_messages(user_id,sender_id,body) values(p_user,v_user,v_body)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.repondre_au_membre(uuid,text) from public,anon;
grant execute on function public.repondre_au_membre(uuid,text) to authenticated;

-- Marquer un fil comme lu. Chacun ne marque que de son cote : le membre marque
-- les reponses qu'il a lues, l'administrateur marque les demandes qu'il a lues.
-- La condition porte sur « reponse d'un administrateur », jamais sur « ecrit par
-- quelqu'un d'autre que moi » : dans son fil, un membre ecrit en son propre nom.
create or replace function public.marquer_contact_lu(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  if private.is_app_admin() then
    update public.admin_contact_messages set read_by_admin_at=now()
      where user_id=p_user and not private.est_reponse_admin(sender_id,user_id) and read_by_admin_at is null;
  end if;
  if p_user=v_user then
    update public.admin_contact_messages set read_by_user_at=now()
      where user_id=v_user and private.est_reponse_admin(sender_id,user_id) and read_by_user_at is null;
  end if;
end $$;
revoke all on function public.marquer_contact_lu(uuid) from public,anon;
grant execute on function public.marquer_contact_lu(uuid) to authenticated;

-- Ce que le membre n'a pas encore lu, pour la pastille du bouton.
create or replace function public.mes_reponses_admin_non_lues() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.admin_contact_messages m
  where m.user_id=(select auth.uid()) and private.est_reponse_admin(m.sender_id,m.user_id)
    and m.read_by_user_at is null;
$$;
revoke all on function public.mes_reponses_admin_non_lues() from public,anon;
grant execute on function public.mes_reponses_admin_non_lues() to authenticated;

-- Les fils, pour l'administrateur : qui a ecrit, quand, et ce qu'il reste a lire.
create or replace function public.fils_contact_admin()
returns table(user_id uuid,display_name text,handle text,dernier_message text,dernier_at timestamptz,non_lus integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_app_admin() then raise exception 'Acces administrateur refuse'; end if;
  return query
    select f.user_id,
      coalesce(p.display_name,'Membre')::text,
      p.handle::text,
      (select m.body from public.admin_contact_messages m
        where m.user_id=f.user_id order by m.created_at desc limit 1),
      f.dernier_at,
      (select count(*)::integer from public.admin_contact_messages m
        where m.user_id=f.user_id and not private.est_reponse_admin(m.sender_id,m.user_id) and m.read_by_admin_at is null)
    from (
      select m.user_id,max(m.created_at) as dernier_at
      from public.admin_contact_messages m group by m.user_id
    ) f
    left join public.friend_profiles p on p.id=f.user_id
    order by f.dernier_at desc;
end $$;
revoke all on function public.fils_contact_admin() from public,anon;
grant execute on function public.fils_contact_admin() to authenticated;

-- La notification. Deux sens : une demande arrive aux administrateurs, une
-- reponse revient au membre. Sans elle, le bouton ne servirait a rien : personne
-- ne verrait qu'il y a un message a lire.
create or replace function private.notify_admin_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_device record; v_nom text; v_cible uuid; v_titre text; v_corps text;
begin
  if private.est_reponse_admin(new.sender_id,new.user_id) then
    -- L'administrateur repond : la notification va au membre.
    v_cible := new.user_id;
    v_titre := 'Reponse de l administrateur';
    v_corps := left(new.body,600);
  else
    -- Un membre ecrit : la notification va a chaque administrateur.
    v_titre := 'Message d un membre';
    select coalesce(p.display_name,'Un membre') into v_nom from public.friend_profiles p where p.id=new.sender_id;
    v_corps := coalesce(v_nom,'Un membre')||' : '||left(new.body,600);
  end if;
  if v_cible is not null then
    if exists(select 1 from public.notification_preferences p where p.user_id=v_cible and not p.messages_enabled) then
      return new;
    end if;
    for v_device in select d.expo_push_token from public.push_devices d where d.user_id=v_cible loop
      perform net.http_post(url:='https://exp.host/--/api/v2/push/send',
        body:=jsonb_build_object('to',v_device.expo_push_token,'title',v_titre,'body',v_corps,
          'data',jsonb_build_object('kind','admin-contact'),
          'sound','default','priority','high','channelId','messages'),
        headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
    end loop;
    return new;
  end if;
  for v_device in
    select d.expo_push_token from public.push_devices d
    join public.app_admins a on a.user_id=d.user_id
    where d.user_id<>new.sender_id
  loop
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',
      body:=jsonb_build_object('to',v_device.expo_push_token,'title',v_titre,'body',v_corps,
        'data',jsonb_build_object('kind','admin-contact','userId',new.user_id),
        'sound','default','priority','high','channelId','messages'),
      headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
  end loop;
  return new;
end $$;
revoke all on function private.notify_admin_contact() from public,anon,authenticated;
drop trigger if exists notify_admin_contact on public.admin_contact_messages;
create trigger notify_admin_contact after insert on public.admin_contact_messages
  for each row execute function private.notify_admin_contact();

-- L'administrateur suit les nouveaux messages sans recharger l'ecran.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_contact_messages') then
    alter publication supabase_realtime add table public.admin_contact_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
