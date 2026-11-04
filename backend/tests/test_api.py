from uuid import uuid4
import hashlib
import psycopg
import pytest

BASE="/api/v1"
def post(client,path,body=None):
    return client.post(BASE+path,json=body or {})

@pytest.mark.parametrize("path",["/classes","/reports","/notices","/me/children","/auth/me"])
def test_auth_required(env,path):
    assert env["root"].get(BASE+path).status_code==401

def test_health_and_real_login(env):
    assert env["root"].get("/health").json()["status"]=="ok"
    c=env["login"]("admin")
    actor=c.get(BASE+"/auth/me").json()
    assert actor["id"]==env["accounts"]["admin"]["id"]
    assert "password_hash" not in actor
    token=c.cookies["pr_session"]
    assert len(token)>=64
    with psycopg.connect(env["owner"]) as conn:
        saved=conn.execute("select token_hash from app_private.api_sessions").fetchone()[0]
        assert saved==hashlib.sha256(token.encode()).hexdigest()
        assert saved!=token

def test_password_and_forged_session_rejected(env):
    account=env["accounts"]["admin"]
    assert post(env["root"],"/auth/login",{"email":account["email"],"password":"incorrect"}).status_code==401
    assert post(env["root"],"/auth/login",{"email":"nobody@example.test","password":"incorrect"}).status_code==401
    env["root"].cookies.set("pr_session",env["accounts"]["admin"]["id"])
    assert env["root"].get(BASE+"/classes",headers={"X-User-ID":account["id"]}).status_code==401

def test_cookie_csrf_and_cross_site(env):
    c=env["login"]("admin")
    del c.headers["X-CSRF-Token"]
    payload={"school_id":env["ids"]["school"],"grade":"9","section":"A","academic_year":"2026-27"}
    assert post(c,"/classes",payload).status_code==403
    assert post(c,"/auth/logout").status_code==403
    c.headers["X-CSRF-Token"]=c.get(BASE+"/auth/me").json()["csrf_token"]
    assert post(c,"/classes",payload).status_code==201
    assert post(c,"/classes",payload|{"grade":"10"}).status_code==201
    assert c.post(BASE+"/classes",json=payload,headers={"Origin":"https://untrusted.example"}).status_code==403
    assert c.post(BASE+"/classes",json=payload,headers={"Sec-Fetch-Site":"cross-site"}).status_code==403

def test_logout_revokes_session(env):
    c=env["login"]("teacher_a")
    token=c.cookies["pr_session"]
    assert post(c,"/auth/logout").status_code==200
    c.cookies.set("pr_session",token)
    assert c.get(BASE+"/classes").status_code==401

def test_session_expiration_and_disabled_user(env):
    c=env["login"]("teacher_a")
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app_private.api_sessions set expires_at=now()-interval '1 minute',created_at=now()-interval '1 day'")
    assert c.get(BASE+"/auth/me").status_code==401
    c=env["login"]("teacher_b")
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app_private.users set disabled_at=now() where id=%s",(env["accounts"]["teacher_b"]["id"],))
    assert c.get(BASE+"/classes").status_code==401

def test_login_rate_limit(env):
    body={"email":"missing@example.test","password":"wrong"}
    codes=[post(env["root"],"/auth/login",body).status_code for _ in range(11)]
    assert codes[:10]==[401]*10
    assert codes[-1]==429

@pytest.mark.parametrize("role",["teacher_a","parent_a","foreign_admin"])
def test_only_same_school_admin_creates_class(env,role):
    c=env["login"](role)
    r=post(c,"/classes",{"school_id":env["ids"]["school"],"grade":"10","section":"A","academic_year":"2026-27"})
    assert r.status_code==404

def test_admin_and_teacher_tenant_isolation(env):
    admin=env["login"]("admin")
    own=admin.get(BASE+"/classes").json()
    assert len(own)==3
    assert all(c["school_id"]==env["ids"]["school"] for c in own)
    teacher=env["login"]("teacher_a")
    assert [c["id"] for c in teacher.get(BASE+"/classes").json()]==[env["ids"]["class_a"]]
    for key in ("class_b","inactive_class","foreign_class"):
        assert teacher.get(BASE+"/classes/"+env["ids"][key]).status_code==404

def test_assignment_revocation_and_class_deactivation(env):
    admin=env["login"]("admin");teacher=env["login"]("teacher_a");cid=env["ids"]["class_a"]
    url=BASE+"/classes/"+cid
    assignment={"teacher_id":env["accounts"]["teacher_a"]["id"],"assigned":False}
    assert admin.put(url+"/assignment",json=assignment).status_code==200
    assert teacher.get(url).status_code==404
    assert admin.put(url+"/assignment",json=assignment|{"assigned":True}).status_code==200
    assert teacher.get(url).status_code==200
    assert admin.patch(url,json={"status":"inactive","sending_enabled":False}).status_code==200
    assert teacher.get(url).status_code==404
    parent=env["login"]("parent_a")
    assert parent.get(BASE+"/reports/"+env["ids"]["report_a"]).status_code==200

def test_suspension_applies_to_existing_session(env):
    admin=env["login"]("admin");teacher=env["login"]("teacher_a")
    response=admin.patch(BASE+"/teachers/"+env["accounts"]["teacher_a"]["id"]+"/access",
                         json={"school_id":env["ids"]["school"],"suspended":True})
    assert response.status_code==200
    assert teacher.get(BASE+"/classes").json()==[]

def test_teacher_account_and_student_creation(env):
    c=env["login"]("admin");cid=env["ids"]["class_a"]
    result=post(c,"/teachers",{"school_id":env["ids"]["school"],"name":"Fictitious New Teacher","email":"new@example.test","password":"long-testing-password-123"})
    assert result.status_code==201,result.text
    listed=c.get(BASE+"/schools/"+env["ids"]["school"]+"/teachers").json()
    assert any(t["id"]==result.json()["id"] for t in listed)
    teacher=env["login"]("teacher_a")
    student=post(teacher,"/classes/"+cid+"/students",{"name":"Fictitious New Child","admission_number":"NEW-1","roll_number":"009"})
    assert student.status_code==201,student.text
    roster=teacher.get(BASE+"/classes/"+cid).json()["students"]
    assert any(s["name"]=="Fictitious New Child" for s in roster)
    assert post(teacher,"/classes/"+cid+"/students",{"name":"Another","admission_number":"NEW-1","roll_number":"010"}).status_code==409

def make_exam(env,client):
    cid=env["ids"]["class_a"]
    r=post(client,"/classes/"+cid+"/exams",{"name":"New Integration Assessment","date":"2026-11-04","subjects":[{"name":"English","maximum_marks":50}]})
    assert r.status_code==201,r.text
    eid=r.json()["id"]
    return eid,client.get(BASE+"/exams/"+eid).json()["subjects"][0]["id"]

def test_marks_publish_and_parent_report_isolation(env):
    teacher=env["login"]("teacher_a")
    eid,subject=make_exam(env,teacher)
    assert post(teacher,"/exams/"+eid+"/publish").status_code==422
    cells=[{"enrollment_id":env["ids"][en],"subject_id":subject,"obtained":value} for en,value in [("enrollment_a",42),("enrollment_other",36)]]
    r=teacher.put(BASE+"/exams/"+eid+"/marks",json={"marks":cells})
    assert r.status_code==200,r.text
    published=post(teacher,"/exams/"+eid+"/publish")
    assert published.status_code==200,published.text
    assert published.json()["published_reports"]==2
    assert post(teacher,"/exams/"+eid+"/publish").json()["published_reports"]==2
    assert teacher.put(BASE+"/exams/"+eid+"/marks",json={"marks":cells}).status_code==422
    p=env["login"]("parent_a")
    reports=p.get(BASE+"/reports").json()
    assert len(reports)==2
    assert all(r["student_id"]==env["ids"]["child_a"] for r in reports)
    assert p.get(BASE+"/reports/"+env["ids"]["report_other"]).status_code==404
    assert p.get(BASE+"/exams/"+eid).status_code==404

def test_marks_batch_is_atomic_and_validates_class(env):
    c=env["login"]("teacher_a");eid,sub=make_exam(env,c)
    valid={"enrollment_id":env["ids"]["enrollment_a"],"subject_id":sub,"obtained":40}
    invalid={"enrollment_id":env["ids"]["enrollment_other"],"subject_id":sub,"obtained":51}
    r=c.put(BASE+"/exams/"+eid+"/marks",json={"marks":[valid,invalid]})
    assert r.status_code==422
    assert c.get(BASE+"/exams/"+eid).json()["marks"]==[]
    foreign=valid|{"enrollment_id":env["ids"]["enrollment_b"]}
    assert c.put(BASE+"/exams/"+eid+"/marks",json={"marks":[valid,foreign]}).status_code==404
    assert c.get(BASE+"/exams/"+eid).json()["marks"]==[]
    assert c.put(BASE+"/exams/"+eid+"/marks",json={"marks":[valid,valid]}).status_code==422

def test_private_notices_and_acknowledgements(env):
    teacher=env["login"]("teacher_a");cid=env["ids"]["class_a"]
    r=post(teacher,"/notices",{"class_id":cid,"audience":"student","enrollment_id":env["ids"]["enrollment_a"],
                            "category":"Uniform","title":"Private uniform note","body":"Fictitious test notice."})
    assert r.status_code==201,r.text
    nid=r.json()["id"]
    first=env["login"]("parent_a");second=env["login"]("parent_b")
    assert len(first.get(BASE+"/notices").json())==1
    assert second.get(BASE+"/notices").json()==[]
    assert post(second,"/notices/"+nid+"/acknowledge").status_code==404
    assert post(first,"/notices/"+nid+"/acknowledge").status_code==200
    assert first.get(BASE+"/notices").json()[0]["acknowledged"]
    assert post(teacher,"/notices",{"school_id":env["ids"]["school"],"audience":"school","title":"Test","body":"Test"}).status_code==404
    assert post(teacher,"/notices",{"class_id":cid,"audience":"class","category":"Behaviour","title":"Test","body":"Test"}).status_code==422

def test_attendance_parent_isolation(env):
    c=env["login"]("teacher_a");cid=env["ids"]["class_a"]
    body={"date":"2026-11-04","records":[{"enrollment_id":env["ids"]["enrollment_a"],"status":"present"}]}
    assert c.put(BASE+"/classes/"+cid+"/attendance",json=body).status_code==200
    p=env["login"]("parent_a")
    assert len(p.get(BASE+"/me/children/"+env["ids"]["child_a"]+"/attendance").json())==1
    assert p.get(BASE+"/me/children/"+env["ids"]["child_other"]+"/attendance").status_code==404
    assert len(p.get(BASE+"/me/children").json())==2

def test_homework_and_leave_permissions(env):
    teacher=env["login"]("teacher_a");p=env["login"]("parent_a");other=env["login"]("parent_b")
    r=post(teacher,"/classes/"+env["ids"]["class_a"]+"/homework",{"subject":"English","title":"Read chapter","instructions":"Fictitious task","due_date":"2026-11-05"})
    assert r.status_code==201
    task=r.json()["id"]
    assert post(p,"/homework/"+task+"/complete",{"enrollment_id":env["ids"]["enrollment_b"]}).status_code==404
    assert post(p,"/homework/"+task+"/complete",{"enrollment_id":env["ids"]["enrollment_a"]}).status_code==200
    assert env["ids"]["enrollment_a"] in p.get(BASE+"/homework").json()[0]["completed_enrollment_ids"]
    payload={"enrollment_id":env["ids"]["enrollment_a"],"from_date":"2026-11-06","to_date":"2026-11-07","reason":"Fictitious leave"}
    r=post(p,"/leave-requests",payload)
    assert r.status_code==201,r.text
    assert post(p,"/leave-requests",payload).status_code==409
    assert post(other,"/leave-requests",payload).status_code==404
    leave=r.json()["id"]
    wrong=env["login"]("teacher_b")
    assert wrong.patch(BASE+"/leave-requests/"+leave,json={"status":"approved","response":"Approved"}).status_code==404
    assert teacher.patch(BASE+"/leave-requests/"+leave,json={"status":"approved","response":"Approved"}).status_code==200
    saved=p.get(BASE+"/leave-requests").json()[0]
    assert saved["status"]=="approved"
    assert saved["student_name"]=="Ahmed · Fictional"

def test_simulation_is_idempotent_and_never_real_delivery(env):
    teacher=env["login"]("teacher_a")
    payload={"idempotency_key":str(uuid4())}
    url="/exams/"+env["ids"]["exam"]+"/simulate-reports"
    first=post(teacher,url,payload);second=post(teacher,url,payload)
    assert first.status_code==200,first.text
    assert first.json()==second.json()
    assert first.json()["is_simulation"] and first.json()["queued"]==2
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("select count(*) from app.report_deliveries where not is_simulation or provider_message_id is not null").fetchone()[0]==0

def test_no_broad_sql_permissions_or_identity_injection(env):
    c=env["login"]("teacher_a")
    # Extra client identity/role fields are rejected before any write.
    assert post(c,"/classes",{"school_id":env["ids"]["school"],"grade":"11","section":"A","academic_year":"2026-27","user_id":env["accounts"]["admin"]["id"]}).status_code==422
    assert c.get(BASE+"/schools/"+env["ids"]["school"]+"/teachers").status_code==404

