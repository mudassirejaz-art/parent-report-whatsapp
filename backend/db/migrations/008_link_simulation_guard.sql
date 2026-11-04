-- A local link must never inherit real verification from a reused contact.
alter table app_private.guardian_links add column verification_is_simulation boolean not null default true;
create or replace function app_private.owns_child(sid uuid,student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.guardian_links l
 join app_private.guardian_contacts g on g.id=l.contact_id and g.user_id=l.guardian_id
 join app_private.users u on u.id=l.guardian_id join app.schools s on s.id=l.school_id
 where l.school_id=sid and l.student_id=student and l.guardian_id=app_private.current_user_id()
 and l.revoked_at is null and g.verified_at is not null and g.revoked_at is null and u.disabled_at is null and s.active
 and ((g.verification_method='provider' and not l.verification_is_simulation) or current_setting('app.allow_simulation',true)='true'))
$$;

create or replace function app_private.send_eligible(rid uuid,lid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from app.report_versions r
 join app.classes c on c.school_id=r.school_id and c.id=r.class_id
 join app.schools s on s.id=r.school_id
 join app.exams e on e.school_id=r.school_id and e.class_id=r.class_id and e.id=r.exam_id
 join app.enrollments en on en.school_id=r.school_id and en.class_id=r.class_id and en.id=r.enrollment_id
 join app_private.guardian_links l on l.school_id=r.school_id and l.student_id=r.student_id
 join app_private.guardian_contacts g on g.id=l.contact_id and g.user_id=l.guardian_id
 join app_private.users u on u.id=l.guardian_id
 where r.id=rid and l.id=lid and s.active and c.status='active' and c.sending_enabled
 and e.status='published' and en.ended_on is null and u.disabled_at is null
 and (app_private.is_admin(r.school_id) or app_private.can_teach(r.school_id,r.class_id))
 and ((g.verification_method='provider' and not l.verification_is_simulation) or current_setting('app.allow_simulation',true)='true')
 and l.revoked_at is null and g.verified_at is not null and g.revoked_at is null
 and exists(select 1 from app_private.guardian_consents co where co.link_id=l.id and co.withdrawn_at is null)
 and exists(select 1 from app.exam_subjects es where es.exam_id=r.exam_id)
 and not exists(select 1 from app.exam_subjects es where es.exam_id=r.exam_id and not exists(
 select 1 from app.marks m where m.exam_id=es.exam_id and m.subject_id=es.id
 and m.enrollment_id=r.enrollment_id and m.obtained is not null)))
$$;



