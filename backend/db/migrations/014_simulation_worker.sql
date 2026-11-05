alter table app.report_deliveries
 add column simulation_attempts integer not null default 0 check(simulation_attempts between 0 and 3),
 add column simulation_retry_at timestamptz;

create index report_deliveries_simulation_due on app.report_deliveries
 (simulation_retry_at asc nulls first,created_at,id) where is_simulation and status='queued';

-- The worker holds this row lock through the in-memory mock and completion.
-- The campaign creator's current access is checked without changing the caller's identity.
create function app_private.claim_simulation_delivery()
returns table(delivery_id uuid,attempts integer,eligible boolean)
language plpgsql security definer set search_path=''
set app.user_id='' set app.allow_simulation='true' as $$
declare
 job app.report_deliveries%rowtype;
 creator uuid;
begin
 select d.* into job from app.report_deliveries d
 where d.is_simulation and d.status='queued' and d.simulation_attempts<3
  and (d.simulation_retry_at is null or d.simulation_retry_at<=now())
 order by d.simulation_retry_at asc nulls first,d.created_at,d.id
 limit 1 for update of d skip locked;
 if not found then return; end if;

 select c.created_by into creator from app_private.report_campaigns c
 where c.id=job.campaign_id and c.is_simulation;
 perform set_config('app.user_id',creator::text,true);
 return query select job.id,job.simulation_attempts,
  app_private.send_eligible(job.report_id,job.guardian_link_id);
end $$;

create function app_private.finish_simulation_delivery(delivery uuid,outcome text)
returns text language sql security definer set search_path='' as $$
 update app.report_deliveries
 set status=case
      when outcome='delivered' then 'delivered'
      when outcome='ineligible' or simulation_attempts=2 then 'failed'
      else 'queued'
     end,
     simulation_attempts=simulation_attempts+case when outcome='ineligible' then 0 else 1 end,
     simulation_retry_at=case when outcome='temporary_failure' and simulation_attempts<2
      then now()+interval '5 seconds'*(simulation_attempts+1) end,
     failure_reason=case
      when outcome='ineligible' then 'simulation_ineligible'
      when outcome='temporary_failure' then 'mock_provider_unavailable'
     end,
     updated_at=now()
 where id=delivery and is_simulation and status='queued' and simulation_attempts<3
  and (simulation_retry_at is null or simulation_retry_at<=now())
  and outcome in ('delivered','temporary_failure','ineligible')
 returning status
$$;

revoke all on function app_private.claim_simulation_delivery() from public;
revoke all on function app_private.finish_simulation_delivery(uuid,text) from public;
grant execute on function app_private.claim_simulation_delivery() to parentreport_runtime;
grant execute on function app_private.finish_simulation_delivery(uuid,text) to parentreport_runtime;
