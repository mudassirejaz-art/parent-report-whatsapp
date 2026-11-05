alter table app.report_deliveries add column provider_phone_number_id text
 check (provider_phone_number_id is null or
        (not is_simulation and provider_phone_number_id ~ '^[0-9]{1,32}$'));

-- Apply only forward progress. A positive delivery receipt outranks failure.
create function app_private.record_whatsapp_status(sender text,message_id text,next_status text)
returns void language sql security definer set search_path='' as $$
 update app.report_deliveries
 set status=next_status, updated_at=now(),
     failure_reason=case when next_status='failed' then 'whatsapp_delivery_failed' end
 where provider_message_id=message_id and provider_phone_number_id=sender and not is_simulation
 and (
  (status='queued' and next_status in ('sent','failed','delivered','read'))
  or (status='sent' and next_status in ('failed','delivered','read'))
  or (status='failed' and next_status in ('delivered','read'))
  or (status='delivered' and next_status='read')
 )
$$;
revoke all on function app_private.record_whatsapp_status(text,text,text) from public;
grant execute on function app_private.record_whatsapp_status(text,text,text) to parentreport_runtime;
