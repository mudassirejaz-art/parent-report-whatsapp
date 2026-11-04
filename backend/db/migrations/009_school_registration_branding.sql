-- Atomic school provisioning and admin-only branding; logos stay private in PostgreSQL.
create table app_private.school_logos (
 school_id uuid primary key references app.schools(id),
 content bytea not null check(octet_length(content) between 8 and 524288),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz not null default now(),
 check(substring(content from 1 for 8)=decode('89504e470d0a1a0a','hex'))
);
alter table app_private.school_logos enable row level security;
revoke all on app_private.school_logos from public,parentreport_runtime;

create function app_private.register_school(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; sid uuid;
begin
 if length(p->>'slug') not between 3 and 60 or (p->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
 raise exception 'Invalid school handle' using errcode='23514'; end if;
 -- No existing user or tenant can be promoted or claimed through registration.
 insert into app_private.users(display_name,email,password_hash)
 values(trim(p->>'admin_name'),lower(trim(p->>'email')),p->>'password_hash') returning id into uid;
 perform set_config('app.user_id',uid::text,true);
 insert into app.schools(name,slug,city,contact_email)
 values(trim(p->>'school_name'),p->>'slug',trim(p->>'city'),lower(trim(p->>'email'))) returning id into sid;
 insert into app_private.school_memberships(school_id,user_id,role) values(sid,uid,'school_admin');
 return jsonb_build_object('school_id',sid,'created',true);
end $$;

create function app_private.update_school(sid uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from app.schools where id=sid for update;
 if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(p->>'city')>120 or length(p->>'address')>500 or length(p->>'tagline')>180 or length(p->>'contact_email')>254 then
 raise exception 'School details too long' using errcode='23514'; end if;
 update app.schools set name=trim(p->>'name'),city=trim(p->>'city'),address=trim(p->>'address'),
 contact_email=lower(trim(p->>'contact_email')),tagline=trim(p->>'tagline'),accent=p->>'accent' where id=sid;
 return jsonb_build_object('saved',true,'school_id',sid);
end $$;

create function app_private.save_school_logo(sid uuid,image_bytes bytea,image_sha text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from app.schools where id=sid for update;
 if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
 insert into app_private.school_logos(school_id,content,sha256) values(sid,image_bytes,image_sha)
 on conflict(school_id) do update set content=excluded.content,sha256=excluded.sha256,updated_at=now();
 update app.schools set logo_object_key='db-logo:'||image_sha where id=sid;
end $$;
create function app_private.remove_school_logo(sid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from app.schools where id=sid for update;
 if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
 delete from app_private.school_logos where school_id=sid;
 update app.schools set logo_object_key=null where id=sid;
end $$;
create function app_private.get_school_logo(sid uuid) returns bytea
language sql stable security definer set search_path='' as $$
 select l.content from app_private.school_logos l where l.school_id=sid and
 (app_private.is_admin(sid)
 or exists(select 1 from app.classes c where c.school_id=sid and app_private.can_teach(sid,c.id))
 or exists(select 1 from app.students st where st.school_id=sid and app_private.owns_child(sid,st.id)))
$$;
revoke all on function app_private.register_school(jsonb),app_private.update_school(uuid,jsonb),
 app_private.save_school_logo(uuid,bytea,text),app_private.remove_school_logo(uuid),app_private.get_school_logo(uuid) from public;
grant execute on function app_private.register_school(jsonb),app_private.update_school(uuid,jsonb),
 app_private.save_school_logo(uuid,bytea,text),app_private.remove_school_logo(uuid),app_private.get_school_logo(uuid) to parentreport_runtime;

