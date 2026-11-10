-- =====================================================================================
-- Agents Development Tracker - database setup
--
-- Run this ONCE in a new Supabase project: Dashboard > SQL Editor > paste everything > Run.
-- It creates the tables, the security rules (who may read / change what), the sprite
-- storage bucket, and the starting data (20 skills, default body / shirt / hat, mock items).
--
-- Who can do what (enforced here in the database, not just hidden in the website):
--   * Everyone who is logged in can READ every agent (feedback text is the one exception).
--   * An AGENT can change, on their own character only: display name, body, shirt, hat
--     (only unlocked ones), skill passions, and traits they added themselves.
--   * An ADMIN can change everything for everyone.
--   * Nobody who is not logged in can read or change anything.
-- =====================================================================================


-- ------------------------------------------------------------------------------ tables

-- Everything that can be drawn on an agent. kind: head | body | shirt | hat
create table public.items (
  id                  text primary key,
  kind                text not null check (kind in ('head', 'body', 'shirt', 'hat')),
  name                text not null check (char_length(name) between 1 and 60),
  sprite_path         text,                       -- file inside the "sprites" storage bucket; null = placeholder shape
  unlocked_by_default boolean not null default false,
  unlock_description  text not null default '',
  placeholder_color   text not null default '#787878',
  placeholder_width   numeric not null default 0.40,   -- bodies only: width of the placeholder shape
  sort                integer not null default 0,
  created_at          timestamptz not null default now()
);

-- One row per login. The login name itself lives in Supabase Auth and is never stored here.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role         text not null default 'agent' check (role in ('admin', 'agent')),
  title        text not null default 'Agent' check (char_length(title) <= 60),
  body_id      text references public.items (id) on delete set null,   -- null = the default item
  shirt_id     text references public.items (id) on delete set null,
  hat_id       text references public.items (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Locked items an admin has unlocked for an agent.
create table public.agent_unlocks (
  agent_id uuid not null references public.profiles (id) on delete cascade,
  item_id  text not null references public.items (id) on delete cascade,
  primary key (agent_id, item_id)
);

-- The skill template: every agent has exactly these skills.
create table public.skills (
  id   uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  sort integer not null default 0
);

-- Each agent's level and passion in each template skill.
create table public.agent_skills (
  agent_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  level    integer not null default 0 check (level between 0 and 20),
  passion  text not null default 'none' check (passion in ('none', 'minor', 'major')),
  primary key (agent_id, skill_id)
);

create table public.traits (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  by_admin    boolean not null default false,     -- set automatically; admin traits are drawn yellow
  created_at  timestamptz not null default now()
);

create table public.agent_paths (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.dev_actions (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  brief           text not null default '',
  stars           integer not null default 3 check (stars between 0 and 5),
  skill_id        uuid references public.skills (id) on delete set null,
  action_type     text not null default '',
  description     text not null default '',
  happened_at     timestamptz not null default now(),
  agents_impacted text not null default '',
  xp              integer not null default 0 check (xp >= 0),
  difficulty      integer not null default 1 check (difficulty between 1 and 5),
  path_id         uuid references public.agent_paths (id) on delete set null,
  path_xp         integer not null default 0 check (path_xp >= 0),
  created_at      timestamptz not null default now()
);

-- Feedback is kept apart from the action so it can have a stricter read rule:
-- only the agent it is about, and admins, can read it.
create table public.action_feedback (
  action_id uuid primary key references public.dev_actions (id) on delete cascade,
  agent_id  uuid not null references public.profiles (id) on delete cascade,
  feedback  text not null default ''
);

create index on public.agent_skills (skill_id);
create index on public.traits (agent_id);
create index on public.agent_paths (agent_id);
create index on public.dev_actions (agent_id);
create index on public.action_feedback (agent_id);


-- --------------------------------------------------------------------------- functions

-- True when the person making the request is an admin.
create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- True when the agent may wear the item: it exists, is of the right kind,
-- and is either unlocked for everyone or unlocked for this agent.
create function public.can_wear(p_agent uuid, p_item text, p_kind text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.items i
    where i.id = p_item
      and i.kind = p_kind
      and (i.unlocked_by_default
           or exists (select 1 from public.agent_unlocks u
                      where u.agent_id = p_agent and u.item_id = i.id))
  );
$$;

-- A new login automatically gets a profile and a row for every template skill.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                  'Agent'), 40)
  );
  insert into public.agent_skills (agent_id, skill_id)
  select new.id, s.id from public.skills s;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A new template skill is automatically given to every existing agent at level 0.
create function public.handle_new_skill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.agent_skills (agent_id, skill_id)
  select p.id, new.id from public.profiles p
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_skill_created
  after insert on public.skills
  for each row execute function public.handle_new_skill();

-- Guards. "auth.uid() is null" means the change comes from the dashboard / SQL editor or
-- from the admin function using the secret key, which are both trusted.

-- Agents may only change their display name and what they wear (unlocked items only).
create function public.guard_profile_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if new.id <> old.id or new.role <> old.role or new.title <> old.title
     or new.created_at <> old.created_at then
    raise exception 'Only an admin can change this.' using errcode = '42501';
  end if;

  if new.body_id is distinct from old.body_id and new.body_id is not null
     and not public.can_wear(new.id, new.body_id, 'body') then
    raise exception 'That body is not available.' using errcode = '42501';
  end if;
  if new.shirt_id is distinct from old.shirt_id and new.shirt_id is not null
     and not public.can_wear(new.id, new.shirt_id, 'shirt') then
    raise exception 'That shirt is locked.' using errcode = '42501';
  end if;
  if new.hat_id is distinct from old.hat_id and new.hat_id is not null
     and not public.can_wear(new.id, new.hat_id, 'hat') then
    raise exception 'That hat is locked.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Agents may only change the passion of a skill, never its level.
create function public.guard_agent_skill_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;
  if new.level <> old.level or new.agent_id <> old.agent_id or new.skill_id <> old.skill_id then
    raise exception 'Only an admin can change skill levels.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger agent_skills_guard
  before update on public.agent_skills
  for each row execute function public.guard_agent_skill_update();

-- Marks who added a trait. Agents cannot fake or change the "added by admin" mark.
create function public.guard_trait()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.by_admin := true;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.by_admin := false;
  elsif new.by_admin <> old.by_admin or new.agent_id <> old.agent_id then
    raise exception 'Only an admin can change this.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger traits_guard
  before insert or update on public.traits
  for each row execute function public.guard_trait();

-- When an admin locks an item again, the agent stops wearing it (falls back to the default).
create function public.handle_unlock_removed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set body_id  = null where id = old.agent_id and body_id  = old.item_id;
  update public.profiles set shirt_id = null where id = old.agent_id and shirt_id = old.item_id;
  update public.profiles set hat_id   = null where id = old.agent_id and hat_id   = old.item_id;
  return old;
end;
$$;

create trigger on_unlock_removed
  after delete on public.agent_unlocks
  for each row execute function public.handle_unlock_removed();


-- ------------------------------------------------------------------- access (grants)
-- New Supabase projects no longer expose tables to the website automatically,
-- so access is granted explicitly. Nothing is granted to "anon" (not logged in).

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.items, public.profiles, public.agent_unlocks, public.skills, public.agent_skills,
  public.traits, public.agent_paths, public.dev_actions, public.action_feedback
to authenticated, service_role;

revoke all on
  public.items, public.profiles, public.agent_unlocks, public.skills, public.agent_skills,
  public.traits, public.agent_paths, public.dev_actions, public.action_feedback
from anon;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_wear(uuid, text, text) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_wear(uuid, text, text) to authenticated, service_role;


-- ------------------------------------------------------ row level security (policies)

alter table public.items           enable row level security;
alter table public.profiles        enable row level security;
alter table public.agent_unlocks   enable row level security;
alter table public.skills          enable row level security;
alter table public.agent_skills    enable row level security;
alter table public.traits          enable row level security;
alter table public.agent_paths     enable row level security;
alter table public.dev_actions     enable row level security;
alter table public.action_feedback enable row level security;

-- items: everyone reads, admins manage
create policy items_read   on public.items for select to authenticated using (true);
create policy items_insert on public.items for insert to authenticated with check (public.is_admin());
create policy items_update on public.items for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy items_delete on public.items for delete to authenticated using (public.is_admin());

-- profiles: everyone reads; you update yourself (limited by profiles_guard), admins update anyone.
-- Profiles are created and deleted only through Supabase Auth (the admin function).
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- unlocks: everyone reads, only admins unlock / lock
create policy unlocks_read   on public.agent_unlocks for select to authenticated using (true);
create policy unlocks_insert on public.agent_unlocks for insert to authenticated with check (public.is_admin());
create policy unlocks_delete on public.agent_unlocks for delete to authenticated using (public.is_admin());

-- skill template: everyone reads, admins manage
create policy skills_read   on public.skills for select to authenticated using (true);
create policy skills_insert on public.skills for insert to authenticated with check (public.is_admin());
create policy skills_update on public.skills for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy skills_delete on public.skills for delete to authenticated using (public.is_admin());

-- agent skills: everyone reads; you update your own passion (level is blocked by agent_skills_guard)
create policy agent_skills_read   on public.agent_skills for select to authenticated using (true);
create policy agent_skills_insert on public.agent_skills for insert to authenticated with check (public.is_admin());
create policy agent_skills_update on public.agent_skills for update to authenticated
  using (agent_id = (select auth.uid()) or public.is_admin())
  with check (agent_id = (select auth.uid()) or public.is_admin());
create policy agent_skills_delete on public.agent_skills for delete to authenticated using (public.is_admin());

-- traits: everyone reads; you add to yourself and change / remove only traits you added
create policy traits_read   on public.traits for select to authenticated using (true);
create policy traits_insert on public.traits for insert to authenticated
  with check (agent_id = (select auth.uid()) or public.is_admin());
create policy traits_update on public.traits for update to authenticated
  using ((agent_id = (select auth.uid()) and not by_admin) or public.is_admin())
  with check (agent_id = (select auth.uid()) or public.is_admin());
create policy traits_delete on public.traits for delete to authenticated
  using ((agent_id = (select auth.uid()) and not by_admin) or public.is_admin());

-- pursued paths: everyone reads, admins manage
create policy paths_read   on public.agent_paths for select to authenticated using (true);
create policy paths_insert on public.agent_paths for insert to authenticated with check (public.is_admin());
create policy paths_update on public.agent_paths for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy paths_delete on public.agent_paths for delete to authenticated using (public.is_admin());

-- development actions: everyone reads, admins manage
create policy actions_read   on public.dev_actions for select to authenticated using (true);
create policy actions_insert on public.dev_actions for insert to authenticated with check (public.is_admin());
create policy actions_update on public.dev_actions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy actions_delete on public.dev_actions for delete to authenticated using (public.is_admin());

-- feedback: only the agent it is about and admins can read it.
-- (To let every agent read everyone's feedback, replace the "using" part of feedback_read with: using (true))
create policy feedback_read   on public.action_feedback for select to authenticated
  using (agent_id = (select auth.uid()) or public.is_admin());
create policy feedback_insert on public.action_feedback for insert to authenticated with check (public.is_admin());
create policy feedback_update on public.action_feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy feedback_delete on public.action_feedback for delete to authenticated using (public.is_admin());


-- ------------------------------------------------------------------- sprite storage
-- A public bucket: anyone with a file's link can view the image, only admins can upload or delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sprites', 'sprites', true, 2097152, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy sprites_read   on storage.objects for select to authenticated using (bucket_id = 'sprites');
create policy sprites_insert on storage.objects for insert to authenticated with check (bucket_id = 'sprites' and public.is_admin());
create policy sprites_update on storage.objects for update to authenticated using (bucket_id = 'sprites' and public.is_admin());
create policy sprites_delete on storage.objects for delete to authenticated using (bucket_id = 'sprites' and public.is_admin());


-- ----------------------------------------------------------------------- starting data

insert into public.skills (name, sort)
select 'Skill ' || n, n from generate_series(1, 20) as n;

insert into public.items (id, kind, name, unlocked_by_default, unlock_description, placeholder_color, placeholder_width, sort) values
  ('head_default',  'head',  'Head',         true,  '', '#e2bc9a', 0.40, 0),
  ('body_standard', 'body',  'Standard',     true,  '', '#e2bc9a', 0.40, 1),
  ('body_thin',     'body',  'Thin',         true,  '', '#e2bc9a', 0.30, 2),
  ('body_hulk',     'body',  'Hulk',         true,  '', '#e2bc9a', 0.54, 3),
  ('body_fat',      'body',  'Fat',          true,  '', '#e2bc9a', 0.62, 4),
  ('shirt_default', 'shirt', 'Basic Shirt',  true,  '', '#688098', 0.40, 1),
  ('shirt_mock_1',  'shirt', 'Mock Shirt 1', false, 'Reach level 10 in any skill.',           '#965448', 0.40, 2),
  ('shirt_mock_2',  'shirt', 'Mock Shirt 2', false, 'Complete 10 development actions.',       '#588a60', 0.40, 3),
  ('shirt_mock_3',  'shirt', 'Mock Shirt 3', false, 'Receive a 5-star rating on an action.',  '#80649c', 0.40, 4),
  ('hat_default',   'hat',   'Basic Hat',    true,  '', '#8c744c', 0.40, 1),
  ('hat_mock_1',    'hat',   'Mock Hat 1',   false, 'Reach level 20 in any skill.',                  '#aa3c3c', 0.40, 2),
  ('hat_mock_2',    'hat',   'Mock Hat 2',   false, 'Earn 1000 experience towards a pursued path.',  '#466eaa', 0.40, 3);
