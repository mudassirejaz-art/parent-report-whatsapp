-- Idempotent, all-or-nothing class imports. No guardian/contact linking is implied.
create unique index roster_import_request on app_private.audit_events(school_id,actor_id,entity_id,(metadata->>'request_id'))
 where action='roster_imported';

create function app_private.import_roster(cid uuid,items jsonb,preview boolean,request_id uuid,file_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; cell jsonb; problems jsonb; reviewed jsonb:='[]'; bad integer:=0; pos integer:=0;
 nm text; admission text; roll text; previous jsonb; result jsonb;
begin
 sid:=app_private.require_class(cid);
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 200 then
  raise exception 'Import requires 1 to 200 students' using errcode='23514'; end if;
 if not preview then
  if request_id is null or file_hash is null or length(file_hash)<>64 then
   raise exception 'Import request is incomplete' using errcode='23514'; end if;
  select metadata into previous from app_private.audit_events where school_id=sid and actor_id=app_private.current_user_id()
   and entity_id=cid::text and action='roster_imported' and metadata->>'request_id'=request_id::text;
  if found then
   if previous->>'file_hash'<>file_hash then raise exception 'Import request already used' using errcode='23505'; end if;
   return jsonb_build_object('imported',true,'count',(previous->>'count')::integer,'replayed',true);
  end if;
 end if;
 for cell in select value from jsonb_array_elements(items) loop
  pos:=pos+1; problems:='[]';
  nm:=trim(coalesce(cell->>'name','')); admission:=trim(coalesce(cell->>'admission_number','')); roll:=trim(coalesce(cell->>'roll_number',''));
  if length(nm) not between 1 and 120 or nm ~ '[[:cntrl:]]' then problems:=problems||'"Student name must contain 1 to 120 characters without line breaks or control characters."'::jsonb; end if;
  if length(admission) not between 1 and 40 or admission ~ '[[:cntrl:]]' then problems:=problems||'"Admission number must contain 1 to 40 characters without control characters."'::jsonb; end if;
  if length(roll) not between 1 and 40 or roll ~ '[[:cntrl:]]' then problems:=problems||'"Roll number must contain 1 to 40 characters without control characters."'::jsonb; end if;
  if admission<>'' and (select count(*) from jsonb_array_elements(items) x where trim(x->>'admission_number')=admission)>1 then
   problems:=problems||'"Duplicate admission number in this file."'::jsonb; end if;
  if roll<>'' and (select count(*) from jsonb_array_elements(items) x where trim(x->>'roll_number')=roll)>1 then
   problems:=problems||'"Duplicate roll number in this file."'::jsonb; end if;
  if exists(select 1 from app.students where school_id=sid and admission_number=admission) then
   problems:=problems||'"Admission number is already in use in this school."'::jsonb; end if;
  if exists(select 1 from app.enrollments where class_id=cid and roll_number=roll) then
   problems:=problems||'"Roll number is already in use in this class."'::jsonb; end if;
  if jsonb_array_length(problems)>0 then bad:=bad+1; end if;
  reviewed:=reviewed||jsonb_build_array(jsonb_build_object('row',cell->'row','name',nm,'admission_number',admission,'roll_number',roll,'errors',problems));
 end loop;
 result:=jsonb_build_object('rows',reviewed,'total',pos,'invalid',bad,'ready',bad=0,'imported',false);
 if preview or bad>0 then return result; end if;
 -- Consistent admission ordering avoids cross-class multi-key insert deadlocks.
 for cell in select value from jsonb_array_elements(reviewed) order by value->>'admission_number' loop
  perform app_private.api_write('add_student',cell||jsonb_build_object('class_id',cid));
 end loop;
 insert into app_private.audit_events(school_id,actor_id,action,entity_type,entity_id,metadata)
 values(sid,app_private.current_user_id(),'roster_imported','class',cid::text,
  jsonb_build_object('request_id',request_id,'file_hash',file_hash,'count',pos));
 return jsonb_build_object('imported',true,'count',pos,'replayed',false);
end $$;
revoke all on function app_private.import_roster(uuid,jsonb,boolean,uuid,text) from public;
grant execute on function app_private.import_roster(uuid,jsonb,boolean,uuid,text) to parentreport_runtime;
