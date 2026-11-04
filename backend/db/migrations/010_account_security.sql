-- Account-owned sessions, atomic password changes and explicitly local reset capabilities.
alter table app_private.api_sessions add column id uuid not null default gen_random_uuid();
alter table app_private.api_sessions add unique(id);

create table app_private.password_resets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references app_private.users(id),
 token_hash text not null unique check(length(token_hash)=64),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 used_at timestamptz, is_simulation boolean not null default true check(is_simulation),
 check(expires_at>created_at)
);
create index reset_user on app_private.password_resets(user_id,expires_at);
alter table app_private.password_resets enable row level security;
revoke all on app_private.password_resets from public,parentreport_runtime;

create function app_private.start_authenticated_session(uid uuid,expected_hash text,new_token text,csrf text,previous_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_hash text;
begin
 select password_hash into current_hash from app_private.users where id=uid and disabled_at is null for update;
 if not found or current_hash is distinct from expected_hash then return false; end if;
 -- A cookie proves possession of its previous session even when switching accounts.
 update app_private.api_sessions set revoked_at=now() where token_hash=previous_token and revoked_at is null;
 insert into app_private.api_sessions(token_hash,user_id,csrf_token,expires_at) values(new_token,uid,csrf,now()+interval '8 hours');
 return true;
end $$;
-- Old unchecked session creation must not be used by the runtime API.
revoke all on function app_private.create_api_session(uuid,text,text) from parentreport_runtime;

create function app_private.my_sessions(current_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'created_at',s.created_at,'expires_at',s.expires_at,
 'current',s.token_hash=current_token) order by s.created_at desc),'[]'::jsonb)
 from app_private.api_sessions s join app_private.users u on u.id=s.user_id
 where s.user_id=app_private.current_user_id() and s.revoked_at is null and s.expires_at>now() and u.disabled_at is null
$$;
create function app_private.revoke_owned_session(sid uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update app_private.api_sessions set revoked_at=now() where id=sid and user_id=app_private.current_user_id()
 and revoked_at is null and expires_at>now();
 return found;
end $$;
create function app_private.revoke_other_sessions(current_token text) returns integer
language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 update app_private.api_sessions set revoked_at=now() where user_id=app_private.current_user_id()
 and token_hash<>current_token and revoked_at is null and expires_at>now();
 get diagnostics total=ROW_COUNT;
 return total;
end $$;
create function app_private.own_password_hash() returns text
language sql stable security definer set search_path='' as $$
 select password_hash from app_private.users where id=app_private.current_user_id() and disabled_at is null
$$;
create function app_private.change_own_password(expected_hash text,new_hash text,current_token text,new_token text,csrf text) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.current_user_id(); actual_hash text;
begin
 select password_hash into actual_hash from app_private.users where id=uid and disabled_at is null for update;
 if not found or actual_hash is distinct from expected_hash then return false; end if;
 if not exists(select 1 from app_private.api_sessions where token_hash=current_token and user_id=uid
  and revoked_at is null and expires_at>now()) then return false; end if;
 update app_private.users set password_hash=new_hash where id=uid;
 update app_private.api_sessions set revoked_at=now() where user_id=uid and revoked_at is null;
 update app_private.password_resets set used_at=now() where user_id=uid and used_at is null;
 insert into app_private.api_sessions(token_hash,user_id,csrf_token,expires_at) values(new_token,uid,csrf,now()+interval '8 hours');
 insert into app_private.audit_events(actor_id,action,entity_type,entity_id) values(uid,'password_changed','account',uid::text);
 return true;
end $$;

create function app_private.request_local_password_reset(mail text,capability_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 if current_setting('app.allow_local_recovery',true) is distinct from 'true' then
 raise exception 'Local recovery disabled' using errcode='42501'; end if;
 select id into uid from app_private.users where lower(email)=lower(mail) and disabled_at is null for update;
 if uid is null then return; end if;
 update app_private.password_resets set used_at=now() where user_id=uid and used_at is null;
 insert into app_private.password_resets(user_id,token_hash,expires_at) values(uid,capability_hash,now()+interval '15 minutes');
 insert into app_private.audit_events(action,entity_type,entity_id,metadata)
 values('local_password_reset_requested','account',uid::text,'{"is_simulation":true}');
end $$;
create function app_private.local_reset_valid(capability_hash text) returns boolean
language sql stable security definer set search_path='' as $$
 select current_setting('app.allow_local_recovery',true)='true' and exists(
 select 1 from app_private.password_resets r join app_private.users u on u.id=r.user_id
 where r.token_hash=capability_hash and r.used_at is null and r.expires_at>now() and u.disabled_at is null)
$$;
create function app_private.complete_local_password_reset(capability_hash text,new_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid; reset app_private.password_resets%rowtype;
begin
 if current_setting('app.allow_local_recovery',true) is distinct from 'true' then
 raise exception 'Local recovery disabled' using errcode='42501'; end if;
 select user_id into uid from app_private.password_resets where token_hash=capability_hash;
 if uid is null then return false; end if;
 -- All password/reset operations lock user first, then reset/session rows.
 perform 1 from app_private.users where id=uid and disabled_at is null for update;
 if not found then return false; end if;
 select * into reset from app_private.password_resets where token_hash=capability_hash for update;
 if reset.used_at is not null or reset.expires_at<=now() then return false; end if;
 update app_private.users set password_hash=new_hash where id=uid;
 update app_private.api_sessions set revoked_at=now() where user_id=uid and revoked_at is null;
 update app_private.password_resets set used_at=now() where user_id=uid and used_at is null;
 insert into app_private.audit_events(action,entity_type,entity_id,metadata)
 values('local_password_reset_completed','account',uid::text,'{"is_simulation":true}');
 return true;
end $$;

revoke all on function app_private.start_authenticated_session(uuid,text,text,text,text),app_private.my_sessions(text),
 app_private.revoke_owned_session(uuid),app_private.revoke_other_sessions(text),app_private.own_password_hash(),
 app_private.change_own_password(text,text,text,text,text),app_private.request_local_password_reset(text,text),
 app_private.local_reset_valid(text),app_private.complete_local_password_reset(text,text) from public;
grant execute on function app_private.start_authenticated_session(uuid,text,text,text,text),app_private.my_sessions(text),
 app_private.revoke_owned_session(uuid),app_private.revoke_other_sessions(text),app_private.own_password_hash(),
 app_private.change_own_password(text,text,text,text,text),app_private.request_local_password_reset(text,text),
 app_private.local_reset_valid(text),app_private.complete_local_password_reset(text,text) to parentreport_runtime;

