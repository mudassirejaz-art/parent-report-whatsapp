-- Server-side, revocable authentication. No Supabase or browser-stored bearer tokens.
create table app_private.api_sessions (
 token_hash text primary key check(length(token_hash)=64),
 user_id uuid not null references app_private.users(id),
 csrf_token text not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz,
 check(expires_at > created_at)
);
create index sessions_user on app_private.api_sessions(user_id,expires_at);
create table app_private.login_buckets (
 key_hash text primary key, attempts integer not null check(attempts>0),
 window_started_at timestamptz not null default now()
);
alter table app_private.api_sessions enable row level security;
alter table app_private.login_buckets enable row level security;
revoke all on app_private.api_sessions,app_private.login_buckets from public,parentreport_runtime;

create function app_private.login_attempt(bucket text) returns integer
language sql security definer set search_path='' as $$
 insert into app_private.login_buckets(key_hash,attempts) values(bucket,1)
 on conflict(key_hash) do update set
 attempts=case when app_private.login_buckets.window_started_at < now()-interval '15 minutes' then 1 else app_private.login_buckets.attempts+1 end,
 window_started_at=case when app_private.login_buckets.window_started_at < now()-interval '15 minutes' then now() else app_private.login_buckets.window_started_at end
 returning attempts
$$;
create function app_private.login_lookup(mail text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'password_hash',password_hash) from app_private.users
 where lower(email)=lower(mail) and disabled_at is null
$$;
create unique index users_lower_email on app_private.users(lower(email)) where email is not null;

create function app_private.create_api_session(uid uuid,hashed_token text,csrf text) returns void
language sql security definer set search_path='' as $$
 insert into app_private.api_sessions(token_hash,user_id,csrf_token,expires_at)
 select hashed_token,id,csrf,now()+interval '8 hours' from app_private.users where id=uid and disabled_at is null
$$;
create function app_private.get_api_session(hashed_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email,'language',u.reading_language,
 'csrf_token',s.csrf_token,'expires_at',s.expires_at,
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('school_id',m.school_id,'role',m.role,'school_name',sc.name))
 from app_private.school_memberships m join app.schools sc on sc.id=m.school_id
 where m.user_id=u.id and m.suspended_at is null and sc.active),'[]'::jsonb),
 'is_parent',exists(select 1 from app_private.guardian_links l where l.guardian_id=u.id and l.revoked_at is null))
 from app_private.api_sessions s join app_private.users u on u.id=s.user_id
 where s.token_hash=hashed_token and s.revoked_at is null and s.expires_at>now() and u.disabled_at is null
$$;
create function app_private.revoke_api_session(hashed_token text) returns void
language sql security definer set search_path='' as $$
 update app_private.api_sessions set revoked_at=now() where token_hash=hashed_token and user_id=app_private.current_user_id()
$$;
create function app_private.staff_directory(sid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when app_private.is_admin(sid) then coalesce((select jsonb_agg(jsonb_build_object(
 'id',u.id,'name',u.display_name,'email',u.email,'suspended',m.suspended_at is not null,
 'class_ids',coalesce((select jsonb_agg(a.class_id) from app_private.class_assignments a where a.school_id=sid and a.teacher_id=u.id and a.revoked_at is null),'[]'::jsonb)))
 from app_private.school_memberships m join app_private.users u on u.id=m.user_id where m.school_id=sid and m.role='class_teacher'),'[]'::jsonb)
 else null end
$$;
-- Locks class mutations together, so deactivation and assignment revocation
-- serialize against marks saving and publication.
create function app_private.require_class(cid uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 select school_id into sid from app.classes where id=cid for update;
 if sid is null or not(app_private.is_admin(sid) or app_private.can_teach(sid,cid)) then
 raise exception 'Resource unavailable' using errcode='42501'; end if;
 return sid;
end $$;
revoke all on function app_private.login_attempt(text),app_private.login_lookup(text),
 app_private.create_api_session(uuid,text,text),app_private.get_api_session(text),app_private.revoke_api_session(text),
 app_private.staff_directory(uuid),app_private.require_class(uuid) from public;
grant execute on function app_private.login_attempt(text),app_private.login_lookup(text),
 app_private.create_api_session(uuid,text,text),app_private.get_api_session(text),app_private.revoke_api_session(text),
 app_private.staff_directory(uuid) to parentreport_runtime;

