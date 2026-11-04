-- All writes use a fixed operation switch, parameterized values and explicit
-- actor checks. No blanket table write grants and no migration-owner API URL.
create function app_private.api_write(operation text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid := app_private.current_user_id(); sid uuid; cid uuid; eid uuid; result_id uuid;
 exam app.exams%rowtype; rec record; cell jsonb; max_marks numeric; requested numeric;
 count_rows integer := 0; report_count integer := 0; snap jsonb; campaign app_private.report_campaigns%rowtype;
begin
 if uid is null or not exists(select 1 from app_private.users where id=uid and disabled_at is null) then
 raise exception 'Authentication required' using errcode='42501'; end if;
 if operation='create_class' then
  sid := (p->>'school_id')::uuid;
  if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
  insert into app.classes(school_id,grade,section,academic_year,status,sending_enabled)
  values(sid,trim(p->>'grade'),trim(p->>'section'),trim(p->>'academic_year'),p->>'status',(p->>'sending_enabled')::boolean)
  returning id into result_id;
 elsif operation='update_class' then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
  update app.classes set status=p->>'status',sending_enabled=(p->>'sending_enabled')::boolean where id=cid;
  result_id := cid;
 elsif operation='create_teacher' then
  sid := (p->>'school_id')::uuid;
  if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
  insert into app_private.users(display_name,email,password_hash)
  values(trim(p->>'name'),lower(trim(p->>'email')),p->>'password_hash') returning id into result_id;
  insert into app_private.school_memberships(school_id,user_id,role) values(sid,result_id,'class_teacher');
 elsif operation='teacher_access' then
  sid := (p->>'school_id')::uuid;
  if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
  update app_private.school_memberships set suspended_at=case when (p->>'suspended')::boolean then now() else null end
  where school_id=sid and user_id=(p->>'teacher_id')::uuid and role='class_teacher';
  if not found then raise exception 'Teacher unavailable' using errcode='42501'; end if;
 elsif operation='assign_teacher' then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from app_private.school_memberships where school_id=sid and user_id=(p->>'teacher_id')::uuid
     and role='class_teacher' and suspended_at is null) then raise exception 'Teacher unavailable' using errcode='42501'; end if;
  if (p->>'assigned')::boolean then
   insert into app_private.class_assignments(school_id,class_id,teacher_id) values(sid,cid,(p->>'teacher_id')::uuid)
   on conflict(school_id,class_id,teacher_id) do update set revoked_at=null;
  else
   update app_private.class_assignments set revoked_at=now(),is_primary=false
   where school_id=sid and class_id=cid and teacher_id=(p->>'teacher_id')::uuid;
  end if;
 elsif operation='add_student' then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  insert into app.students(school_id,name,admission_number) values(sid,trim(p->>'name'),trim(p->>'admission_number'))
  returning id into result_id;
  insert into app.enrollments(school_id,class_id,student_id,roll_number) values(sid,cid,result_id,trim(p->>'roll_number'));
 elsif operation='create_exam' then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  if jsonb_array_length(p->'subjects') not between 1 and 30 then raise exception 'Add 1 to 30 subjects' using errcode='23514'; end if;
  insert into app.exams(school_id,class_id,name,exam_date) values(sid,cid,trim(p->>'name'),(p->>'date')::date)
  returning id into result_id;
  for cell in select value from jsonb_array_elements(p->'subjects') loop
   insert into app.exam_subjects(school_id,class_id,exam_id,name,maximum_marks)
   values(sid,cid,result_id,trim(cell->>'name'),(cell->>'maximum_marks')::numeric);
  end loop;
 elsif operation in ('save_marks','publish_exam','simulate_reports') then
  select * into exam from app.exams where id=(p->>'exam_id')::uuid;
  if not found then raise exception 'Exam unavailable' using errcode='42501'; end if;
  sid := app_private.require_class(exam.class_id); cid := exam.class_id;
  select * into exam from app.exams where id=exam.id for update;
  if operation='save_marks' then
   if exam.status<>'draft' then raise exception 'Published marks are locked' using errcode='23514'; end if;
   for cell in select value from jsonb_array_elements(p->'marks') loop
    select maximum_marks into max_marks from app.exam_subjects where id=(cell->>'subject_id')::uuid and exam_id=exam.id;
    if max_marks is null or not exists(select 1 from app.enrollments where id=(cell->>'enrollment_id')::uuid
      and school_id=sid and class_id=cid and ended_on is null) then raise exception 'Cell outside exam roster' using errcode='42501'; end if;
    requested := (cell->>'obtained')::numeric;
    insert into app.marks(school_id,class_id,exam_id,subject_id,enrollment_id,maximum_marks,obtained)
    values(sid,cid,exam.id,(cell->>'subject_id')::uuid,(cell->>'enrollment_id')::uuid,max_marks,requested)
    on conflict(exam_id,subject_id,enrollment_id) do update set obtained=excluded.obtained,updated_at=now();
   end loop;
  elsif operation='publish_exam' then
   if exam.status='published' then
    select count(*) into report_count from app.report_versions where exam_id=exam.id;
    return jsonb_build_object('id',exam.id,'published_reports',report_count);
   end if;
   if not exists(select 1 from app.exam_subjects where exam_id=exam.id)
    or not exists(select 1 from app.enrollments where class_id=cid and ended_on is null)
    or exists(select 1 from app.enrollments en cross join app.exam_subjects es
      where en.class_id=cid and en.ended_on is null and es.exam_id=exam.id and not exists(
      select 1 from app.marks m where m.exam_id=exam.id and m.subject_id=es.id and m.enrollment_id=en.id and m.obtained is not null))
   then raise exception 'Complete all marks before publishing' using errcode='23514'; end if;
   for rec in select en.id,en.student_id,s.name from app.enrollments en join app.students s on s.id=en.student_id
    where en.class_id=cid and en.ended_on is null loop
    select jsonb_build_object('student_name',rec.name,'school_name',sc.name,
     'class_name','Class '||c.grade||'-'||c.section,'exam_name',exam.name,'exam_date',exam.exam_date,
     'subjects',(select jsonb_agg(jsonb_build_object('name',es.name,'maximum',m.maximum_marks,'obtained',m.obtained) order by es.name)
      from app.marks m join app.exam_subjects es on es.id=m.subject_id where m.exam_id=exam.id and m.enrollment_id=rec.id),
     'total',(select sum(obtained) from app.marks where exam_id=exam.id and enrollment_id=rec.id),
     'maximum',(select sum(maximum_marks) from app.marks where exam_id=exam.id and enrollment_id=rec.id))
    into snap from app.schools sc join app.classes c on c.school_id=sc.id where c.id=cid;
    insert into app.report_versions(school_id,class_id,exam_id,enrollment_id,student_id,version,snapshot,published_by)
    values(sid,cid,exam.id,rec.id,rec.student_id,1,snap,uid);
    report_count := report_count+1;
   end loop;
   update app.exams set status='published' where id=exam.id;
   return jsonb_build_object('id',exam.id,'published_reports',report_count);
  else
   if not exists(select 1 from app.classes where id=cid and status='active' and sending_enabled)
    or exam.status<>'published' then raise exception 'Publish exam and enable class sending first' using errcode='23514'; end if;
   select * into campaign from app_private.report_campaigns where school_id=sid and idempotency_key=p->>'idempotency_key';
   if found then
    if campaign.exam_id<>exam.id then raise exception 'Idempotency key already used' using errcode='23505'; end if;
    select count(*) into count_rows from app.report_deliveries where campaign_id=campaign.id;
    return jsonb_build_object('id',campaign.id,'queued',count_rows,'is_simulation',true);
   end if;
   insert into app_private.report_campaigns(school_id,class_id,exam_id,idempotency_key,created_by)
   values(sid,cid,exam.id,p->>'idempotency_key',uid) returning id into result_id;
   for rec in select r.id,r.student_id,l.id as link_id from app.report_versions r join app_private.guardian_links l
    on l.school_id=r.school_id and l.student_id=r.student_id where r.exam_id=exam.id and app_private.send_eligible(r.id,l.id) loop
    insert into app.report_deliveries(school_id,class_id,campaign_id,report_id,student_id,guardian_link_id)
    values(sid,cid,result_id,rec.id,rec.student_id,rec.link_id);
    count_rows := count_rows+1;
   end loop;
   return jsonb_build_object('id',result_id,'queued',count_rows,'is_simulation',true);
  end if;
 elsif operation='save_attendance' then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  for cell in select value from jsonb_array_elements(p->'records') loop
   if not exists(select 1 from app.enrollments where id=(cell->>'enrollment_id')::uuid and class_id=cid and ended_on is null)
    then raise exception 'Student outside current roster' using errcode='42501'; end if;
   insert into app.attendance(school_id,class_id,enrollment_id,attendance_date,status,note,recorded_by)
   values(sid,cid,(cell->>'enrollment_id')::uuid,(p->>'date')::date,cell->>'status',cell->>'note',uid)
   on conflict(enrollment_id,attendance_date) do update set status=excluded.status,note=excluded.note,recorded_by=uid,updated_at=now();
  end loop;
 elsif operation='create_notice' then
  if p->>'audience'='school' then
   sid := (p->>'school_id')::uuid;
   if not app_private.is_admin(sid) then raise exception 'Admin access required' using errcode='42501'; end if;
  else
   cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  end if;
  insert into app.notices(school_id,audience,class_id,enrollment_id,category,title,body,priority,published,author_id)
  values(sid,p->>'audience',cid,(p->>'enrollment_id')::uuid,p->>'category',trim(p->>'title'),trim(p->>'body'),p->>'priority',(p->>'published')::boolean,uid)
  returning id into result_id;
 elsif operation='acknowledge_notice' then
  result_id := (p->>'notice_id')::uuid;
  if not app_private.can_read_notice(result_id) then raise exception 'Notice unavailable' using errcode='42501'; end if;
  insert into app.notice_acknowledgements(school_id,notice_id,guardian_id)
  select school_id,id,uid from app.notices where id=result_id on conflict do nothing;
 elsif operation='create_homework' then
  cid := (p->>'class_id')::uuid; sid := app_private.require_class(cid);
  insert into app.homework(school_id,class_id,subject,title,instructions,due_date,author_id)
  values(sid,cid,trim(p->>'subject'),trim(p->>'title'),trim(p->>'instructions'),(p->>'due_date')::date,uid) returning id into result_id;
 elsif operation='complete_homework' then
  select * into rec from app.homework where id=(p->>'homework_id')::uuid;
  if not found or not exists(select 1 from app.enrollments en where en.id=(p->>'enrollment_id')::uuid
    and en.class_id=rec.class_id and en.school_id=rec.school_id and app_private.owns_child(en.school_id,en.student_id))
  then raise exception 'Homework unavailable' using errcode='42501'; end if;
  insert into app.homework_completions(school_id,class_id,homework_id,enrollment_id,guardian_id)
  values(rec.school_id,rec.class_id,rec.id,(p->>'enrollment_id')::uuid,uid) on conflict do nothing;
 elsif operation='request_leave' then
  select * into rec from app.enrollments where id=(p->>'enrollment_id')::uuid and ended_on is null;
  if not found or not app_private.owns_child(rec.school_id,rec.student_id) then raise exception 'Child unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(rec.id::text,0));
  if exists(select 1 from app.leave_requests where enrollment_id=rec.id and status in ('pending','approved')
    and from_date <= (p->>'to_date')::date and to_date >= (p->>'from_date')::date)
  then raise exception 'A leave request already covers these dates' using errcode='23505'; end if;
  insert into app.leave_requests(school_id,class_id,enrollment_id,guardian_id,from_date,to_date,reason)
  values(rec.school_id,rec.class_id,rec.id,uid,(p->>'from_date')::date,(p->>'to_date')::date,trim(p->>'reason')) returning id into result_id;
 elsif operation='review_leave' then
  select * into rec from app.leave_requests where id=(p->>'leave_id')::uuid;
  if not found then raise exception 'Request unavailable' using errcode='42501'; end if;
  sid := app_private.require_class(rec.class_id);
  update app.leave_requests set status=p->>'status',response=p->>'response',reviewed_by=uid,reviewed_at=now()
   where id=rec.id and status='pending';
  if not found then raise exception 'Request already reviewed' using errcode='23505'; end if;
 elsif operation='withdraw_consent' then
  select * into rec from app_private.guardian_links where id=(p->>'link_id')::uuid and guardian_id=uid and revoked_at is null;
  if not found or not app_private.owns_child(rec.school_id,rec.student_id) then raise exception 'Link unavailable' using errcode='42501'; end if;
  update app_private.guardian_consents set withdrawn_at=now() where link_id=rec.id and withdrawn_at is null;
 else
  raise exception 'Unknown operation' using errcode='23514';
 end if;
 return jsonb_build_object('id',result_id,'saved',true);
end $$;
revoke all on function app_private.api_write(text,jsonb) from public;
grant execute on function app_private.api_write(text,jsonb) to parentreport_runtime;

