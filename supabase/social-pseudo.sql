-- Pseudo @ : chaque compte choisit le sien, et on peut se faire ajouter par
-- pseudo au lieu du seul code d'invitation.
--
-- A executer apres social.sql et social-v2.sql. Les comptes existants sont
-- conserves : le pseudo est facultatif, et un compte sans pseudo continue de
-- fonctionner par code d'invitation.
--
-- Trois choix, et leurs raisons :
--
--   * Le pseudo est stocke SANS l'arrobase et en minuscules. « @Sarah » et
--     « @sarah » sont donc le meme pseudo, et la contrainte de forme le
--     garantit mieux qu'une convention cote application : un client ne peut pas
--     ecrire une variante majuscule, meme en s'adressant directement a la table.
--   * La colonne n'est pas modifiable par un grant direct. Seule la fonction
--     `choisir_pseudo` l'ecrit, ce qui laisse un seul chemin d'ecriture.
--   * Les mots reserves evitent qu'un compte se fasse passer pour
--     l'administrateur — ce qui compte d'autant plus qu'on peut desormais lui
--     ecrire.

alter table public.friend_profiles add column if not exists handle text;

alter table public.friend_profiles drop constraint if exists friend_profiles_handle_forme;
alter table public.friend_profiles add constraint friend_profiles_handle_forme check (
  handle is null or (
    handle ~ '^[a-z0-9][a-z0-9._-]{2,19}$'
    and handle <> all (array['admin','administrateur','administratrice','moderateur','moderatrice',
                             'support','aide','coran','quranhifz','fcpe','professeur','maitresse'])
  )
);

-- Deux comptes ne peuvent pas porter le meme pseudo. Les valeurs nulles ne se
-- genent pas entre elles : un compte sans pseudo n'empeche personne.
create unique index if not exists friend_profiles_handle_unique on public.friend_profiles(handle);

-- Le pseudo normalise, ou null s'il est inutilisable. Une seule definition,
-- partagee par le choix, la recherche et l'invitation : trois copies de cette
-- regle finiraient par diverger.
create or replace function private.normaliser_pseudo(p_texte text) returns text
language plpgsql immutable set search_path = '' as $$
declare v_texte text;
begin
  v_texte := lower(btrim(coalesce(p_texte,'')));
  if left(v_texte,1)='@' then v_texte := btrim(substr(v_texte,2)); end if;
  if v_texte !~ '^[a-z0-9][a-z0-9._-]{2,19}$' then return null; end if;
  if v_texte = any (array['admin','administrateur','administratrice','moderateur','moderatrice',
                          'support','aide','coran','quranhifz','fcpe','professeur','maitresse']) then
    return null;
  end if;
  return v_texte;
end $$;
revoke all on function private.normaliser_pseudo(text) from public,anon;
grant execute on function private.normaliser_pseudo(text) to authenticated;

create or replace function public.choisir_pseudo(p_handle text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_handle text; v_pris uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  v_handle := private.normaliser_pseudo(p_handle);
  if v_handle is null then
    raise exception 'Pseudo invalide : 3 a 20 caracteres, lettres, chiffres, point, tiret ou souligne, sans mot reserve';
  end if;
  select id into v_pris from public.friend_profiles where handle=v_handle;
  if v_pris is not null and v_pris<>v_user then raise exception 'Ce pseudo est deja pris'; end if;
  insert into public.friend_profiles(id,display_name,handle) values(v_user,'Apprenant',v_handle)
    on conflict(id) do update set handle=excluded.handle;
  return v_handle;
end $$;
revoke all on function public.choisir_pseudo(text) from public,anon;
grant execute on function public.choisir_pseudo(text) to authenticated;

-- Retrouver quelqu'un par son pseudo. Passe par une fonction `security definer`
-- parce que la politique de lecture des profils ne laisse voir que soi, ses amis
-- et son cercle : une recherche directe dans la table ne trouverait personne.
-- On ne rend que ce qui est necessaire pour confirmer avant d'inviter.
create or replace function public.trouver_par_pseudo(p_handle text)
returns table(id uuid,display_name text,handle text,deja_lie boolean)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_handle text;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  v_handle := private.normaliser_pseudo(p_handle);
  if v_handle is null then return; end if;
  return query
    select p.id,p.display_name,p.handle,
      exists(select 1 from public.friend_links l where
        (l.requester_id=v_user and l.recipient_id=p.id)
        or (l.recipient_id=v_user and l.requester_id=p.id))
    from public.friend_profiles p
    where p.handle=v_handle and p.id<>v_user;
end $$;
revoke all on function public.trouver_par_pseudo(text) from public,anon;
grant execute on function public.trouver_par_pseudo(text) to authenticated;

-- L'invitation accepte desormais un code OU un pseudo. Le parametre garde son
-- nom : renommer un parametre d'entree demande de detruire la fonction, et
-- PostgreSQL refuse de changer le type de retour d'une fonction existante
-- (42P13) — le piege qui a deja fait echouer une installation.
create or replace function public.request_friend(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_target uuid; v_link uuid; v_pseudo text;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  select id into v_target from public.friend_profiles where invite_code=upper(btrim(p_code));
  if v_target is null then
    v_pseudo := private.normaliser_pseudo(p_code);
    if v_pseudo is not null then
      select id into v_target from public.friend_profiles where handle=v_pseudo;
    end if;
  end if;
  if v_target is null then raise exception 'Code d invitation ou pseudo introuvable'; end if;
  if v_target=v_user then raise exception 'Tu ne peux pas t inviter toi-meme'; end if;
  if exists(select 1 from public.friend_links where
    (requester_id=v_user and recipient_id=v_target) or (requester_id=v_target and recipient_id=v_user))
    then raise exception 'Invitation ou relation deja existante'; end if;
  insert into public.friend_links(requester_id,recipient_id) values(v_user,v_target) returning id into v_link;
  return v_link;
end $$;
revoke all on function public.request_friend(text) from public,anon;
grant execute on function public.request_friend(text) to authenticated;

notify pgrst, 'reload schema';
