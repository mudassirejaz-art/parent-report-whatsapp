create index report_campaigns_exam_history
 on app_private.report_campaigns(exam_id,created_at desc,id desc)
 where is_simulation;

-- Staff-only read model. Guardian identifiers and contact details never leave this function.
create function app_private.report_delivery_review(target_exam uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 assessment app.exams%rowtype;
 blocker text;
 report_rows jsonb;
 campaign_rows jsonb;
begin
 select * into assessment from app.exams where id=target_exam;
 if not found or not (app_private.is_admin(assessment.school_id)
    or app_private.can_teach(assessment.school_id,assessment.class_id)) then
  raise exception 'Exam unavailable' using errcode='42501';
 end if;

 blocker:=case
  when assessment.status<>'published' then 'not_published'
  when not exists(select 1 from app.classes
   where id=assessment.class_id and status='active' and sending_enabled) then 'class_sending_disabled'
 end;

 select coalesce(jsonb_agg(jsonb_build_object(
  'report_id',r.id,'student_name',r.snapshot->>'student_name','eligible_recipients',links.eligible,
  'reason',case
   when blocker is not null then blocker
   when en.ended_on is not null then 'enrollment_ended'
   when links.eligible>0 then 'eligible'
   when links.active_links=0 then 'no_guardian_link'
   when links.verified=0 then 'guardian_unverified'
   when links.consented=0 then 'consent_missing'
   else 'report_ineligible'
  end
 ) order by r.snapshot->>'student_name',r.id),'[]'::jsonb)
 into report_rows
 from app.report_versions r
 join app.enrollments en on en.id=r.enrollment_id
 cross join lateral (
  select count(*) as active_links,
   count(*) filter(where verified) as verified,
   count(*) filter(where verified and consented) as consented,
   count(*) filter(where blocker is null and app_private.send_eligible(r.id,id)) as eligible
  from (
   select l.id,
    (g.verified_at is not null and g.revoked_at is null and u.disabled_at is null
     and ((g.verification_method='provider' and not l.verification_is_simulation)
      or current_setting('app.allow_simulation',true)='true')) as verified,
    exists(select 1 from app_private.guardian_consents co
     where co.link_id=l.id and co.withdrawn_at is null) as consented
   from app_private.guardian_links l
   join app_private.guardian_contacts g on g.id=l.contact_id and g.user_id=l.guardian_id
   join app_private.users u on u.id=l.guardian_id
   where l.school_id=r.school_id and l.student_id=r.student_id and l.revoked_at is null
  ) candidates
 ) links
 where r.exam_id=target_exam;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',campaign.id,'created_at',campaign.created_at,'queued',totals.queued,
  'reports',totals.reports
 ) order by campaign.created_at desc,campaign.id desc),'[]'::jsonb)
 into campaign_rows
 from (select id,created_at from app_private.report_campaigns
  where exam_id=target_exam and is_simulation order by created_at desc,id desc limit 20) campaign
 cross join lateral (
  select count(*) filter(where status='queued') as queued,count(distinct report_id) as reports
  from app.report_deliveries where campaign_id=campaign.id and is_simulation
 ) totals;

 return jsonb_build_object('is_simulation',true,'blocker',blocker,
  'reports',report_rows,'campaigns',campaign_rows);
end $$;

revoke all on function app_private.report_delivery_review(uuid) from public;
grant execute on function app_private.report_delivery_review(uuid) to parentreport_runtime;
