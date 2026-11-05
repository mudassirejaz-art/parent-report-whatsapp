alter table app.report_deliveries add column live_attempted_at timestamptz;
create index report_live_due on app.report_deliveries(school_id,created_at,id)
 where not is_simulation and status='queued' and live_attempted_at is null;

create function app_private.queue_live_reports(target uuid,request_key text,sender text)
returns jsonb language plpgsql security definer set search_path=''
set app.allow_simulation='false' as $$
declare assessment app.exams%rowtype; sid uuid; run_id uuid; queued_count integer;
begin
 select * into assessment from app.exams where id=target;
 if not found then raise exception 'Exam unavailable' using errcode='42501'; end if;
 sid:=app_private.require_class(assessment.class_id);
 if sid is distinct from nullif(current_setting('app.whatsapp_school',true),'')::uuid then
  raise exception 'Live sending unavailable' using errcode='42501'; end if;
 if assessment.status<>'published' or not exists(select 1 from app.classes
  where id=assessment.class_id and status='active' and sending_enabled) then
  raise exception 'Class sending is disabled or exam is unpublished' using errcode='23514'; end if;
 select id into run_id from app_private.report_campaigns
 where school_id=sid and exam_id=target and idempotency_key=request_key and not is_simulation;
 if found then
  select count(*) into queued_count from app.report_deliveries where campaign_id=run_id;
  return jsonb_build_object('id',run_id,'queued',queued_count);
 end if;
 insert into app_private.report_campaigns(school_id,class_id,exam_id,idempotency_key,created_by,is_simulation)
 values(sid,assessment.class_id,target,request_key,app_private.current_user_id(),false) returning id into run_id;
 insert into app.report_deliveries(school_id,class_id,campaign_id,report_id,student_id,guardian_link_id,is_simulation,provider_phone_number_id)
 select sid,r.class_id,run_id,r.id,r.student_id,l.id,false,sender
 from app.report_versions r join app_private.guardian_links l on l.school_id=sid and l.student_id=r.student_id
 where r.exam_id=target and app_private.send_eligible(r.id,l.id)
 and exists(select 1 from app_private.guardian_consents co where co.link_id=l.id
  and co.withdrawn_at is null and co.policy_version='whatsapp-reports-v1')
 and not exists(select 1 from app.report_deliveries d where d.report_id=r.id and d.guardian_link_id=l.id and not d.is_simulation);
 get diagnostics queued_count=row_count;
 return jsonb_build_object('id',run_id,'queued',queued_count);
end $$;

create unique index report_real_recipient_once on app.report_deliveries(report_id,guardian_link_id)
 where not is_simulation;

create function app_private.claim_live_delivery(school uuid,sender text)
returns table(delivery_id uuid,ciphertext text)
language plpgsql security definer set search_path=''
set app.user_id='' set app.allow_simulation='false' as $$
declare job app.report_deliveries%rowtype; creator uuid;
begin
 select d.* into job from app.report_deliveries d
 where d.school_id=school and d.provider_phone_number_id=sender
 and not d.is_simulation and d.status='queued' and d.live_attempted_at is null
 order by d.created_at,d.id limit 1 for update of d skip locked;
 if not found then return; end if;
 select c.created_by into creator from app_private.report_campaigns c where c.id=job.campaign_id;
 perform set_config('app.user_id',creator::text,true);
 if not app_private.send_eligible(job.report_id,job.guardian_link_id)
  or not exists(select 1 from app_private.guardian_consents co where co.link_id=job.guardian_link_id
   and co.withdrawn_at is null and co.policy_version='whatsapp-reports-v1') then
  update app.report_deliveries set status='failed',failure_reason='live_ineligible',updated_at=now() where id=job.id;
  return query select job.id,null::text;
  return;
 end if;
 update app.report_deliveries set live_attempted_at=now(),updated_at=now() where id=job.id;
 return query select job.id,g.phone_ciphertext from app_private.guardian_links l
 join app_private.guardian_contacts g on g.id=l.contact_id where l.id=job.guardian_link_id;
end $$;

create function app_private.finish_live_delivery(job uuid,sender text,message_id text)
returns void language sql security definer set search_path='' as $$
 update app.report_deliveries set provider_message_id=coalesce(provider_message_id,message_id),
 status=case when status<>'queued' then status when message_id is not null then 'sent' else 'failed' end,
 failure_reason=case when status='queued' and message_id is null then 'live_acceptance_unconfirmed' else failure_reason end,
 updated_at=now()
 where id=job and not is_simulation and provider_phone_number_id=sender and live_attempted_at is not null
 and (provider_message_id is null or message_id is null or provider_message_id=message_id)
$$;

create function app_private.correlate_live_status(job uuid,sender text,message_id text)
returns void language sql security definer set search_path='' as $$
 update app.report_deliveries set provider_message_id=message_id,
  status=case when failure_reason='live_acceptance_unconfirmed' then 'queued' else status end,
  failure_reason=case when failure_reason='live_acceptance_unconfirmed' then null else failure_reason end
 where id=job and not is_simulation and provider_phone_number_id=sender and live_attempted_at is not null
 and provider_message_id is null
 and not exists(select 1 from app.report_deliveries where provider_message_id=message_id)
$$;

revoke all on function app_private.queue_live_reports(uuid,text,text),app_private.claim_live_delivery(uuid,text),
 app_private.finish_live_delivery(uuid,text,text),app_private.correlate_live_status(uuid,text,text) from public;
grant execute on function app_private.queue_live_reports(uuid,text,text),app_private.claim_live_delivery(uuid,text),
 app_private.finish_live_delivery(uuid,text,text),app_private.correlate_live_status(uuid,text,text) to parentreport_runtime;
