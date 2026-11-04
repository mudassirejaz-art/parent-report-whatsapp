-- Local-only guardian onboarding. Simulation is a per-transaction server flag,
-- never a client field; future provider verification requires a separate service.
alter table app_private.guardian_contacts add column verification_method text not null default 'fixture'
 check(verification_method in ('fixture','local_simulation','provider'));
alter table app_private.onboarding_invites
 add column enrollment_id uuid,
 add column consumed_at timestamptz,
 add column bad_attempts integer not null default 0 check(bad_attempts between 0 and 5),
 add foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id);
alter table app_private.guardian_submissions
 add column capability_hash text unique,
 add column phone_masked text,
 add column consumed_at timestamptz;
create index onboarding_enrollment on app_private.onboarding_invites(enrollment_id,created_at desc);
create index submissions_enrollment on app_private.guardian_submissions(enrollment_id,created_at desc);

create or replace function app_private.owns_child(sid uuid,student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.guardian_links l
 join app_private.guardian_contacts g on g.id=l.contact_id and g.user_id=l.guardian_id
 join app_private.users u on u.id=l.guardian_id join app.schools s on s.id=l.school_id
 where l.school_id=sid and l.student_id=student and l.guardian_id=app_private.current_user_id()
 and l.revoked_at is null and g.verified_at is not null and g.revoked_at is null and u.disabled_at is null and s.active
 and (g.verification_method='provider' or current_setting('app.allow_simulation',true)='true'))
$$;
create function app_private.onboarding(operation text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; cid uuid; en app.enrollments%rowtype; inv app_private.onboarding_invites%rowtype;
 sub app_private.guardian_submissions%rowtype; uid uuid; contact uuid; link uuid; rid uuid; existing_contact app_private.guardian_contacts%rowtype;
begin
 if current_setting('app.allow_simulation',true) is distinct from 'true' then
 raise exception 'Local onboarding is disabled' using errcode='42501'; end if;
 if operation in ('status','invite','revoke') then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  if operation='status' then
   return coalesce((select jsonb_agg(jsonb_build_object('enrollment_id',e.id,'student_name',st.name,
    'status',case when l.id is not null then 'verified' when last_sub.status='pending' and last_sub.expires_at<=now() then 'expired' else coalesce(last_sub.status,'not_submitted') end,
    'verification_method',g.verification_method,'phone_masked',coalesce(g.phone_masked,last_sub.phone_masked),
    'consented',exists(select 1 from app_private.guardian_consents co where co.link_id=l.id and co.withdrawn_at is null),
    'invite_id',latest.id,'invite_active',latest.revoked_at is null and latest.consumed_at is null and latest.expires_at>now(),
    'invite_expires_at',latest.expires_at))
    from app.enrollments e join app.students st on st.id=e.student_id
    left join app_private.guardian_links l on l.school_id=e.school_id and l.student_id=e.student_id and l.revoked_at is null
    left join app_private.guardian_contacts g on g.id=l.contact_id and g.revoked_at is null
    left join lateral(select ss.* from app_private.guardian_submissions ss where ss.enrollment_id=e.id order by ss.created_at desc limit 1) last_sub on true
    left join lateral(select ii.* from app_private.onboarding_invites ii where ii.enrollment_id=e.id order by ii.created_at desc limit 1) latest on true
    where e.class_id=cid and e.ended_on is null),'[]'::jsonb);
  elsif operation='revoke' then
   update app_private.onboarding_invites set revoked_at=now() where id=(p->>'invite_id')::uuid and class_id=cid;
   if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
   update app_private.guardian_submissions set status='expired',challenge_hash=null where invite_id=(p->>'invite_id')::uuid and status='pending';
   return jsonb_build_object('revoked',true);
  end if;
  if not exists(select 1 from app.classes where id=cid and status='active') then
   raise exception 'Activate this class before inviting a guardian' using errcode='23514'; end if;
  select * into en from app.enrollments where id=(p->>'enrollment_id')::uuid and class_id=cid and ended_on is null;
  if not found then raise exception 'Student unavailable' using errcode='42501'; end if;
  if exists(select 1 from app_private.guardian_links where school_id=sid and student_id=en.student_id and revoked_at is null)
   then raise exception 'A guardian is already linked' using errcode='23505'; end if;
  update app_private.onboarding_invites set revoked_at=now() where enrollment_id=en.id and revoked_at is null;
  update app_private.guardian_submissions set status='expired',challenge_hash=null where enrollment_id=en.id and status='pending';
  insert into app_private.onboarding_invites(school_id,class_id,enrollment_id,token_hash,expires_at,created_by)
  values(sid,cid,en.id,p->>'token_hash',now()+interval '24 hours',app_private.current_user_id()) returning id into rid;
  return jsonb_build_object('id',rid,'expires_in_hours',24);
 end if;
 if operation in ('invite_info','submit') then
  select * into inv from app_private.onboarding_invites where token_hash=p->>'token_hash';
  if not found then return jsonb_build_object('error','Invitation unavailable.'); end if;
  perform 1 from app.classes where id=inv.class_id for update;
  select * into inv from app_private.onboarding_invites where token_hash=p->>'token_hash' for update;
  if not found or inv.revoked_at is not null or inv.consumed_at is not null or inv.expires_at<=now() or inv.bad_attempts>=5
   then return jsonb_build_object('error','Invitation invalid, used, expired or revoked.'); end if;
  -- The issuer must still have access, even if another staff member knows the link.
  if not exists(select 1 from app.classes c join app.schools s on s.id=c.school_id
   join app_private.users u on u.id=inv.created_by join app_private.school_memberships m on m.user_id=u.id and m.school_id=s.id
   where c.id=inv.class_id and c.status='active' and s.active and u.disabled_at is null and m.suspended_at is null
   and (m.role='school_admin' or exists(select 1 from app_private.class_assignments a where a.class_id=c.id and a.teacher_id=u.id and a.revoked_at is null)))
   then return jsonb_build_object('error','Invitation access is no longer active.'); end if;
  if operation='invite_info' then
   return (select jsonb_build_object('school_name',s.name,'class_name','Class '||c.grade||'-'||c.section,'expires_at',inv.expires_at,'is_simulation',true)
    from app.classes c join app.schools s on s.id=c.school_id where c.id=inv.class_id);
  end if;
  select * into en from app.enrollments where id=inv.enrollment_id and ended_on is null;
  if not found or not exists(select 1 from app.students st where st.id=en.student_id and st.admission_number=p->>'admission_number') then
   update app_private.onboarding_invites set bad_attempts=bad_attempts+1 where id=inv.id;
   return jsonb_build_object('error','The admission number does not match this invitation.'); end if;
  if exists(select 1 from app_private.guardian_links where school_id=en.school_id and student_id=en.student_id and revoked_at is null)
   then return jsonb_build_object('error','A guardian is already linked. Ask your school for help.'); end if;
  insert into app_private.guardian_submissions(school_id,class_id,enrollment_id,invite_id,guardian_name,phone_ciphertext,phone_hmac,
   challenge_hash,capability_hash,phone_masked,expires_at)
  values(en.school_id,en.class_id,en.id,inv.id,p->>'guardian_name',p->>'phone_ciphertext',p->>'phone_hmac',
   p->>'challenge_hash',p->>'capability_hash',p->>'phone_masked',now()+interval '10 minutes') returning id into rid;
  update app_private.onboarding_invites set consumed_at=now() where id=inv.id;
  return jsonb_build_object('id',rid,'status','pending','is_simulation',true);
 end if;
 select * into sub from app_private.guardian_submissions where capability_hash=p->>'capability_hash';
 if not found then return jsonb_build_object('error','Verification link unavailable.'); end if;
 perform 1 from app.classes where id=sub.class_id for update;
 select * into sub from app_private.guardian_submissions where capability_hash=p->>'capability_hash' for update;
 select * into inv from app_private.onboarding_invites where id=sub.invite_id;
 -- A consumed invite is valid for its one pending submission; revocation still wins.
 if inv.revoked_at is not null or sub.expires_at<=now() or sub.attempts>=5 or sub.status<>'pending'
  then return jsonb_build_object('error','Verification used, expired, declined, locked or revoked.'); end if;
 -- Lock class to serialize against deactivation/assignment revocation.
 if not exists(select 1 from app.classes c join app.schools s on s.id=c.school_id
  join app_private.users u on u.id=inv.created_by join app_private.school_memberships m on m.user_id=u.id and m.school_id=s.id
  where c.id=sub.class_id and c.status='active' and s.active and m.suspended_at is null and u.disabled_at is null
  and (m.role='school_admin' or exists(select 1 from app_private.class_assignments a where a.class_id=c.id and a.teacher_id=u.id and a.revoked_at is null)))
  then return jsonb_build_object('error','Class or teacher access is no longer active.'); end if;
 if operation='verification_info' then
  return (select jsonb_build_object('student_name',st.name,'guardian_name',sub.guardian_name,'phone_masked',sub.phone_masked,
   'school_name',s.name,'class_name','Class '||c.grade||'-'||c.section,'expires_at',sub.expires_at,'is_simulation',true)
   from app.students st join app.schools s on s.id=st.school_id join app.classes c on c.id=sub.class_id where st.id=(select student_id from app.enrollments where id=sub.enrollment_id));
 end if;
 if operation not in ('complete_new','complete_existing') then raise exception 'Invalid onboarding action' using errcode='23514'; end if;
 if sub.challenge_hash is distinct from p->>'challenge_hash' then
  update app_private.guardian_submissions set attempts=attempts+1 where id=sub.id;
  return jsonb_build_object('error','Incorrect local test code. Five attempts lock verification.'); end if;
 if not (p->>'consent')::boolean then
  update app_private.guardian_submissions set status='declined',challenge_hash=null,consumed_at=now() where id=sub.id;
  return jsonb_build_object('status','declined','is_simulation',true);
 end if;
 select * into en from app.enrollments where id=sub.enrollment_id and ended_on is null for update;
 if not found or exists(select 1 from app_private.guardian_links where school_id=sub.school_id and student_id=en.student_id and revoked_at is null)
  then raise exception 'Student already linked or enrollment ended' using errcode='23505'; end if;
 -- Serialize same phone across parallel new-account or sibling-link requests.
 perform pg_advisory_xact_lock(hashtextextended(sub.phone_hmac,0));
 select * into existing_contact from app_private.guardian_contacts where phone_hmac=sub.phone_hmac;
 if operation='complete_existing' then
  uid := app_private.current_user_id();
  if uid is null or not exists(select 1 from app_private.users where id=uid and disabled_at is null)
   or exists(select 1 from app_private.school_memberships where user_id=uid)
   then raise exception 'Sign in with a parent account' using errcode='42501'; end if;
  if existing_contact.id is not null and (existing_contact.user_id<>uid or existing_contact.revoked_at is not null)
   then raise exception 'Phone already associated with another account' using errcode='23505'; end if;
 else
  if existing_contact.id is not null then raise exception 'Use the existing parent account for this phone' using errcode='23505'; end if;
  insert into app_private.users(display_name,email,password_hash) values(sub.guardian_name,lower(p->>'email'),p->>'password_hash') returning id into uid;
 end if;
 if existing_contact.id is null then
  insert into app_private.guardian_contacts(user_id,phone_ciphertext,phone_hmac,phone_masked,verified_at,verification_method)
   values(uid,sub.phone_ciphertext,sub.phone_hmac,sub.phone_masked,now(),'local_simulation') returning id into contact;
 else contact := existing_contact.id;
 end if;
 perform set_config('app.user_id',uid::text,true);
 insert into app_private.guardian_links(school_id,student_id,guardian_id,contact_id,verified_at)
 values(en.school_id,en.student_id,uid,contact,now()) returning id into link;
 insert into app_private.guardian_consents(school_id,link_id,student_id,policy_version,consent_text)
 values(en.school_id,link,en.student_id,'local-simulation-v1','LOCAL SIMULATION ONLY: parent explicitly agreed to WhatsApp school progress reports. No real phone verification or messages.');
 update app_private.guardian_submissions set status='verified',consumed_at=now(),challenge_hash=null where id=sub.id;
 return jsonb_build_object('status','verified','user_id',uid,'is_simulation',true);
end $$;
revoke all on function app_private.onboarding(text,jsonb) from public;
grant execute on function app_private.onboarding(text,jsonb) to parentreport_runtime;
create trigger invite_audit after insert or update on app_private.onboarding_invites for each row execute function app_private.record_audit();
create trigger submission_audit after insert or update on app_private.guardian_submissions for each row execute function app_private.record_audit();

