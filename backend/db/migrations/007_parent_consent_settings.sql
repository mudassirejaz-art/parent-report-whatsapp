-- Only a parent can inspect their own masked links and consent history.
create function app_private.my_guardian_links() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'student_name',st.name,'phone_masked',g.phone_masked,
 'verification_method',g.verification_method,'consented',exists(select 1 from app_private.guardian_consents co where co.link_id=l.id and co.withdrawn_at is null))),
 '[]'::jsonb)
 from app_private.guardian_links l join app.students st on st.id=l.student_id
 join app_private.guardian_contacts g on g.id=l.contact_id
 where l.guardian_id=app_private.current_user_id() and app_private.owns_child(l.school_id,l.student_id)
$$;
revoke all on function app_private.my_guardian_links() from public;
grant execute on function app_private.my_guardian_links() to parentreport_runtime;

