-- ParentReport: plain PostgreSQL 17+. Apply once using the migration runner.
-- app.user_id must be set LOCAL by a trusted backend after authentication.
create schema app;
create schema app_private;
revoke all on schema app, app_private from public;
grant usage on schema app, app_private to parentreport_runtime;

create table app_private.users (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (length(trim(display_name)) between 1 and 120),
 email text unique,
 password_hash text,
 disabled_at timestamptz,
 reading_language text not null default 'en' check (reading_language in ('en','roman-urdu')),
 created_at timestamptz not null default now()
);
create table app.schools (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 active boolean not null default true, city text, address text, contact_email text,
 logo_object_key text, tagline text, accent text not null default '#087F75' check(accent ~ '^#[0-9A-Fa-f]{6}$'),
 timezone text not null default 'Asia/Karachi' check(timezone = 'Asia/Karachi'),
 created_at timestamptz not null default now()
);
create table app_private.school_memberships (
 school_id uuid not null references app.schools(id), user_id uuid not null references app_private.users(id),
 role text not null check(role in ('school_admin','class_teacher')), suspended_at timestamptz,
 primary key(school_id,user_id), unique(school_id,user_id,role)
);
create table app.classes (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references app.schools(id),
 grade text not null check(length(trim(grade)) between 1 and 40), section text not null check(length(trim(section)) between 1 and 20),
 academic_year text not null check(length(trim(academic_year)) between 1 and 30),
 status text not null default 'draft' check(status in ('draft','active','inactive')),
 sending_enabled boolean not null default false, created_at timestamptz not null default now(),
 unique(school_id,id), unique(school_id,grade,section,academic_year)
);
create table app_private.class_assignments (
 school_id uuid not null, class_id uuid not null, teacher_id uuid not null,
 teacher_role text not null default 'class_teacher' check(teacher_role='class_teacher'),
 is_primary boolean not null default false, revoked_at timestamptz,
 primary key(school_id,class_id,teacher_id),
 foreign key(school_id,class_id) references app.classes(school_id,id),
 foreign key(school_id,teacher_id,teacher_role) references app_private.school_memberships(school_id,user_id,role)
);
create unique index one_primary_teacher on app_private.class_assignments(school_id,class_id) where is_primary and revoked_at is null;
create index assignments_teacher on app_private.class_assignments(teacher_id,school_id) where revoked_at is null;

create table app.students (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references app.schools(id),
 name text not null check(length(trim(name)) between 1 and 120),
 admission_number text not null check(length(trim(admission_number)) between 1 and 40),
 archived_at timestamptz, created_at timestamptz not null default now(),
 unique(school_id,id), unique(school_id,admission_number)
);
-- Enrollment preserves old results when a child changes class or academic year.
create table app.enrollments (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, student_id uuid not null,
 roll_number text not null check(length(trim(roll_number)) between 1 and 40),
 started_on date not null default current_date, ended_on date check(ended_on >= started_on),
 foreign key(school_id,class_id) references app.classes(school_id,id),
 foreign key(school_id,student_id) references app.students(school_id,id),
 unique(school_id,class_id,id), unique(school_id,class_id,student_id),
 unique(school_id,id,student_id), unique(school_id,class_id,roll_number)
);
create unique index one_current_enrollment on app.enrollments(school_id,student_id) where ended_on is null;
create index enrollments_student on app.enrollments(student_id,school_id);

create table app_private.guardian_contacts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references app_private.users(id),
 -- Encrypted E.164 phone and server-keyed HMAC; never browser fingerprints.
 phone_ciphertext text not null, phone_hmac text not null unique check(length(phone_hmac)=64),
 phone_masked text not null, verified_at timestamptz, revoked_at timestamptz,
 unique(id,user_id)
);
create table app_private.guardian_links (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, student_id uuid not null,
 guardian_id uuid not null, contact_id uuid not null, verified_at timestamptz not null, revoked_at timestamptz,
 foreign key(school_id,student_id) references app.students(school_id,id),
 foreign key(contact_id,guardian_id) references app_private.guardian_contacts(id,user_id),
 unique(school_id,id,student_id)
);
create unique index one_primary_guardian on app_private.guardian_links(school_id,student_id) where revoked_at is null;
create index guardian_links_user on app_private.guardian_links(guardian_id,school_id,student_id) where revoked_at is null;
create table app_private.guardian_consents (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, link_id uuid not null, student_id uuid not null,
 purpose text not null default 'whatsapp_reports' check(purpose='whatsapp_reports'),
 policy_version text not null, consent_text text not null, granted_at timestamptz not null default now(),
 withdrawn_at timestamptz check(withdrawn_at >= granted_at),
 foreign key(school_id,link_id,student_id) references app_private.guardian_links(school_id,id,student_id)
);
create unique index one_active_consent on app_private.guardian_consents(link_id,purpose) where withdrawn_at is null;
create table app_private.onboarding_invites (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null,
 token_hash text not null unique check(length(token_hash)=64), expires_at timestamptz not null,
 revoked_at timestamptz, created_by uuid not null references app_private.users(id), created_at timestamptz not null default now(),
 foreign key(school_id,class_id) references app.classes(school_id,id), unique(school_id,class_id,id),
 check(expires_at > created_at)
);
create table app_private.guardian_submissions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, enrollment_id uuid not null, invite_id uuid not null,
 guardian_name text not null, phone_ciphertext text not null, phone_hmac text not null check(length(phone_hmac)=64),
 status text not null default 'pending' check(status in ('pending','verified','declined','expired')),
 challenge_hash text, expires_at timestamptz not null, attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id),
 foreign key(school_id,class_id,invite_id) references app_private.onboarding_invites(school_id,class_id,id),
 check(expires_at > created_at)
);

create table app.exams (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 160), exam_date date not null,
 status text not null default 'draft' check(status in ('draft','published')),
 created_at timestamptz not null default now(),
 foreign key(school_id,class_id) references app.classes(school_id,id), unique(school_id,class_id,id)
);
create table app.exam_subjects (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, exam_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 100),
 maximum_marks numeric(8,2) not null check(maximum_marks > 0),
 foreign key(school_id,class_id,exam_id) references app.exams(school_id,class_id,id),
 unique(school_id,class_id,exam_id,id,maximum_marks), unique(exam_id,name)
);
create table app.marks (
 school_id uuid not null, class_id uuid not null, exam_id uuid not null, subject_id uuid not null, enrollment_id uuid not null,
 maximum_marks numeric(8,2) not null, obtained numeric(8,2), updated_at timestamptz not null default now(),
 primary key(exam_id,subject_id,enrollment_id),
 foreign key(school_id,class_id,exam_id,subject_id,maximum_marks) references app.exam_subjects(school_id,class_id,exam_id,id,maximum_marks),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id),
 check(obtained is null or (obtained >= 0 and obtained <= maximum_marks))
);
create index marks_enrollment on app.marks(school_id,class_id,enrollment_id);
-- Only the trusted publishing service creates these immutable snapshots.
create table app.report_versions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, exam_id uuid not null,
 enrollment_id uuid not null, student_id uuid not null, version integer not null check(version > 0),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 published_at timestamptz not null default now(), published_by uuid not null references app_private.users(id),
 foreign key(school_id,class_id,exam_id) references app.exams(school_id,class_id,id),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id),
 foreign key(school_id,enrollment_id,student_id) references app.enrollments(school_id,id,student_id),
 unique(exam_id,enrollment_id,version), unique(school_id,class_id,id,student_id)
);
create table app.attendance (
 school_id uuid not null, class_id uuid not null, enrollment_id uuid not null, attendance_date date not null,
 status text not null check(status in ('present','absent','late','leave')),
 note text check(length(note)<=1000), recorded_by uuid not null references app_private.users(id), updated_at timestamptz not null default now(),
 primary key(enrollment_id,attendance_date),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id)
);
create index attendance_register on app.attendance(school_id,class_id,attendance_date);
create table app.notices (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references app.schools(id),
 audience text not null check(audience in ('school','class','student')), class_id uuid, enrollment_id uuid,
 category text not null check(category in ('Announcement','Behaviour','Uniform','Achievement','Reminder')),
 title text not null check(length(trim(title)) between 1 and 160), body text not null check(length(trim(body)) between 1 and 5000),
 priority text not null default 'normal' check(priority in ('normal','important')),
 published boolean not null default false, author_id uuid not null references app_private.users(id),
 created_at timestamptz not null default now(),
 foreign key(school_id,class_id) references app.classes(school_id,id),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id),
 check((audience='school' and class_id is null and enrollment_id is null) or
       (audience='class' and class_id is not null and enrollment_id is null) or
       (audience='student' and class_id is not null and enrollment_id is not null)),
 check(category not in ('Behaviour','Uniform') or audience='student'),
 unique(school_id,id)
);
create index notices_feed on app.notices(school_id,class_id,created_at desc) where published;
create table app.notice_acknowledgements (
 school_id uuid not null, notice_id uuid not null, guardian_id uuid not null references app_private.users(id),
 acknowledged_at timestamptz not null default now(), primary key(notice_id,guardian_id),
 foreign key(school_id,notice_id) references app.notices(school_id,id)
);
create table app.homework (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null,
 subject text not null, title text not null check(length(trim(title)) between 1 and 160),
 instructions text not null check(length(instructions)<=5000), due_date date not null,
 author_id uuid not null references app_private.users(id), created_at timestamptz not null default now(),
 foreign key(school_id,class_id) references app.classes(school_id,id), unique(school_id,class_id,id)
);
create table app.homework_completions (
 school_id uuid not null, class_id uuid not null, homework_id uuid not null, enrollment_id uuid not null,
 guardian_id uuid not null references app_private.users(id), completed_at timestamptz not null default now(),
 primary key(homework_id,enrollment_id),
 foreign key(school_id,class_id,homework_id) references app.homework(school_id,class_id,id),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id)
);
create table app.leave_requests (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, enrollment_id uuid not null,
 guardian_id uuid not null references app_private.users(id), from_date date not null, to_date date not null,
 reason text not null check(length(trim(reason)) between 1 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','declined')),
 response text, reviewed_by uuid references app_private.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(school_id,class_id,enrollment_id) references app.enrollments(school_id,class_id,id),
 check(to_date >= from_date),
 check((status='pending' and reviewed_by is null and reviewed_at is null and response is null)
    or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create index leave_inbox on app.leave_requests(school_id,class_id,status,from_date);

create table app_private.report_campaigns (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, exam_id uuid not null,
 idempotency_key text not null, created_by uuid not null references app_private.users(id),
 is_simulation boolean not null default true, created_at timestamptz not null default now(),
 foreign key(school_id,class_id,exam_id) references app.exams(school_id,class_id,id),
 unique(school_id,idempotency_key), unique(school_id,class_id,id,is_simulation)
);
create table app.report_deliveries (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null,
 campaign_id uuid not null, report_id uuid not null, student_id uuid not null, guardian_link_id uuid not null,
 status text not null default 'queued' check(status in ('queued','sent','delivered','read','failed')),
 is_simulation boolean not null default true, provider_message_id text unique, failure_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(school_id,class_id,campaign_id,is_simulation) references app_private.report_campaigns(school_id,class_id,id,is_simulation),
 foreign key(school_id,class_id,report_id,student_id) references app.report_versions(school_id,class_id,id,student_id),
 foreign key(school_id,guardian_link_id,student_id) references app_private.guardian_links(school_id,id,student_id),
 unique(campaign_id,report_id,guardian_link_id),
 check(not is_simulation or provider_message_id is null)
);
create table app_private.audit_events (
 id bigint generated always as identity primary key, school_id uuid references app.schools(id),
 actor_id uuid references app_private.users(id), action text not null, entity_type text not null, entity_id text not null,
 -- Metadata must exclude phones, OTPs, tokens and report contents.
 metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_school_date on app_private.audit_events(school_id,created_at desc);

-- No browser-accessible credentials or roles. Only the trusted API may set this identity.
create function app_private.current_user_id() returns uuid language sql stable
 set search_path='' as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;

-- Narrow, non-exposed helpers avoid recursive RLS membership checks.
-- No user-id argument: the caller cannot ask about a different identity.
create function app_private.is_admin(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.school_memberships m join app_private.users u on u.id=m.user_id
 join app.schools s on s.id=m.school_id where m.school_id=sid and m.user_id=app_private.current_user_id()
 and m.role='school_admin' and m.suspended_at is null and u.disabled_at is null and s.active)
$$;
create function app_private.can_teach(sid uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.class_assignments a
 join app_private.school_memberships m on m.school_id=a.school_id and m.user_id=a.teacher_id
 join app_private.users u on u.id=m.user_id join app.schools s on s.id=m.school_id
 join app.classes c on c.school_id=a.school_id and c.id=a.class_id
 where a.school_id=sid and a.class_id=cid and a.teacher_id=app_private.current_user_id()
 and a.revoked_at is null and m.suspended_at is null and u.disabled_at is null and s.active and c.status='active')
$$;
create function app_private.owns_child(sid uuid,student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.guardian_links l
 join app_private.guardian_contacts g on g.id=l.contact_id and g.user_id=l.guardian_id
 join app_private.users u on u.id=l.guardian_id join app.schools s on s.id=l.school_id
 where l.school_id=sid and l.student_id=student and l.guardian_id=app_private.current_user_id()
 and l.revoked_at is null and g.verified_at is not null and g.revoked_at is null and u.disabled_at is null and s.active)
$$;
create function app_private.owns_enrollment(sid uuid,eid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.enrollments e where e.school_id=sid and e.id=eid and app_private.owns_child(e.school_id,e.student_id))
$$;
create function app_private.has_class_child(sid uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.enrollments e where e.school_id=sid and e.class_id=cid and e.ended_on is null
 and app_private.owns_child(e.school_id,e.student_id))
$$;
create function app_private.can_read_notice(nid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.notices n where n.id=nid and n.published and
 ((n.audience='school' and exists(select 1 from app_private.guardian_links l where l.school_id=n.school_id
 and app_private.owns_child(l.school_id,l.student_id)))
 or (n.audience='class' and app_private.has_class_child(n.school_id,n.class_id))
 or (n.audience='student' and app_private.owns_enrollment(n.school_id,n.enrollment_id))))
$$;

create function app_private.owns_link(lid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.guardian_links l where l.id=lid and l.guardian_id=app_private.current_user_id()
 and app_private.owns_child(l.school_id,l.student_id))
$$;
create function app_private.reject_mutation() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Immutable record: create a new version/event instead' using errcode='23514'; end
$$;
create trigger immutable_report before update or delete on app.report_versions for each row execute function app_private.reject_mutation();
create trigger immutable_audit before update or delete on app_private.audit_events for each row execute function app_private.reject_mutation();

-- Explicit least-privilege defaults: no rights for PUBLIC; no client writes.
revoke all on all tables in schema app,app_private from public,parentreport_runtime;
revoke all on all functions in schema app_private from public,parentreport_runtime;
grant execute on function app_private.current_user_id(),app_private.is_admin(uuid),app_private.can_teach(uuid,uuid),
 app_private.owns_child(uuid,uuid),app_private.owns_enrollment(uuid,uuid),app_private.has_class_child(uuid,uuid),
 app_private.can_read_notice(uuid) to parentreport_runtime;
grant select on all tables in schema app to parentreport_runtime;

-- The migration owner is used only by migrations and the future trusted write service.
-- Runtime is a read-only, RLS-restricted role; future write endpoints need dedicated policies.

grant execute on function app_private.owns_link(uuid) to parentreport_runtime;

alter table app.schools enable row level security;
create policy read_scope on app.schools for select to parentreport_runtime using (app_private.is_admin(id) or exists(select 1 from app.classes c where c.school_id=schools.id and app_private.can_teach(c.school_id,c.id)) or exists(select 1 from app.students st where st.school_id=schools.id and app_private.owns_child(st.school_id,st.id)));

alter table app.classes enable row level security;
create policy read_scope on app.classes for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,id) or app_private.has_class_child(school_id,id));

alter table app.students enable row level security;
create policy read_scope on app.students for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.owns_child(school_id,id) or exists(select 1 from app.enrollments e where e.school_id=students.school_id and e.student_id=students.id and app_private.can_teach(e.school_id,e.class_id)));

alter table app.enrollments enable row level security;
create policy read_scope on app.enrollments for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or app_private.owns_child(school_id,student_id));

alter table app.exams enable row level security;
create policy read_scope on app.exams for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or (status='published' and app_private.has_class_child(school_id,class_id)));

alter table app.exam_subjects enable row level security;
create policy read_scope on app.exam_subjects for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or exists(select 1 from app.exams e where e.id=exam_subjects.exam_id and e.status='published' and app_private.has_class_child(e.school_id,e.class_id)));

alter table app.marks enable row level security;
create policy read_scope on app.marks for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id));

alter table app.report_versions enable row level security;
create policy read_scope on app.report_versions for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or app_private.owns_child(school_id,student_id));

alter table app.attendance enable row level security;
create policy read_scope on app.attendance for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or app_private.owns_enrollment(school_id,enrollment_id));

alter table app.notices enable row level security;
create policy read_scope on app.notices for select to parentreport_runtime using (app_private.is_admin(school_id) or (audience='school' and published and exists(select 1 from app.classes c where c.school_id=notices.school_id and app_private.can_teach(c.school_id,c.id))) or app_private.can_teach(school_id,class_id) or app_private.can_read_notice(id));

alter table app.notice_acknowledgements enable row level security;
create policy read_scope on app.notice_acknowledgements for select to parentreport_runtime using (guardian_id=app_private.current_user_id() or app_private.is_admin(school_id) or exists(select 1 from app.notices n where n.id=notice_id and app_private.can_teach(n.school_id,n.class_id)));

alter table app.homework enable row level security;
create policy read_scope on app.homework for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or app_private.has_class_child(school_id,class_id));

alter table app.homework_completions enable row level security;
create policy read_scope on app.homework_completions for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or app_private.owns_enrollment(school_id,enrollment_id));

alter table app.leave_requests enable row level security;
create policy read_scope on app.leave_requests for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or (guardian_id=app_private.current_user_id() and app_private.owns_enrollment(school_id,enrollment_id)));

alter table app.report_deliveries enable row level security;
create policy read_scope on app.report_deliveries for select to parentreport_runtime using (app_private.is_admin(school_id) or app_private.can_teach(school_id,class_id) or app_private.owns_link(guardian_link_id));

alter table app_private.users enable row level security;

alter table app_private.school_memberships enable row level security;

alter table app_private.class_assignments enable row level security;

alter table app_private.guardian_contacts enable row level security;

alter table app_private.guardian_links enable row level security;

alter table app_private.guardian_consents enable row level security;

alter table app_private.onboarding_invites enable row level security;

alter table app_private.guardian_submissions enable row level security;

alter table app_private.report_campaigns enable row level security;

alter table app_private.audit_events enable row level security;

-- Keep newly-created objects closed until a later migration explicitly grants access.
alter default privileges in schema app,app_private revoke all on tables from public;
alter default privileges in schema app_private revoke execute on functions from public;

