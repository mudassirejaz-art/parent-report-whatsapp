
-- Send eligibility is separate from parent portal ownership. Revoking consent
-- blocks future WhatsApp sends without removing a parent's report access.
create function app_private.send_eligible(rid uuid,lid uuid) returns boolean
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
 and l.revoked_at is null and g.verified_at is not null and g.revoked_at is null
 and exists(select 1 from app_private.guardian_consents co where co.link_id=l.id and co.withdrawn_at is null)
 and exists(select 1 from app.exam_subjects es where es.exam_id=r.exam_id)
 and not exists(select 1 from app.exam_subjects es where es.exam_id=r.exam_id and not exists(
 select 1 from app.marks m where m.exam_id=es.exam_id and m.subject_id=es.id
 and m.enrollment_id=r.enrollment_id and m.obtained is not null)))
$$;
revoke all on function app_private.send_eligible(uuid,uuid) from public,parentreport_runtime;

create function app_private.record_audit() returns trigger language plpgsql
security definer set search_path='' as $$
declare row_data jsonb; sid uuid; entity_key text;
begin
 row_data := case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 sid := case when TG_TABLE_NAME='schools' then (row_data->>'id')::uuid else (row_data->>'school_id')::uuid end;
 entity_key := coalesce(row_data->>'id',
  concat_ws('/',row_data->>'class_id',row_data->>'student_id',row_data->>'user_id',
  row_data->>'teacher_id',row_data->>'enrollment_id',row_data->>'exam_id',row_data->>'subject_id',
  row_data->>'notice_id',row_data->>'guardian_id',row_data->>'homework_id',row_data->>'attendance_date'));
 insert into app_private.audit_events(school_id,actor_id,action,entity_type,entity_id)
 values(sid,app_private.current_user_id(),TG_OP,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,entity_key);
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function app_private.record_audit() from public,parentreport_runtime;

create trigger write_audit after insert or update or delete on app.schools for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.classes for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.students for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.enrollments for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.exams for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.exam_subjects for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.marks for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.report_versions for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.attendance for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.notices for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.notice_acknowledgements for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.homework for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.homework_completions for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.leave_requests for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app.report_deliveries for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app_private.school_memberships for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app_private.class_assignments for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app_private.guardian_links for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app_private.guardian_consents for each row execute function app_private.record_audit();

create trigger write_audit after insert or update or delete on app_private.report_campaigns for each row execute function app_private.record_audit();

