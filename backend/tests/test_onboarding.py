"""No provider calls. Every phone/code/consent here is fictional local testing."""
import hashlib
import psycopg
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings

B="/api/v1"
PHONE="+923000000001"
PASS="local-parent-password-123"

def pending(env,phone=PHONE,admission="ONBOARD-1"):
    teacher=env["login"]("teacher_a");cid=env["ids"]["class_a"]
    r=teacher.post(B+"/classes/"+cid+"/students",json={"name":"Fictitious Onboarding Child","admission_number":admission,"roll_number":admission})
    assert r.status_code==201,r.text
    roster=teacher.get(B+"/classes/"+cid).json()["students"]
    child=next(s for s in roster if s["admission_number"]==admission)
    r=teacher.post(B+"/classes/"+cid+"/guardian-invites",json={"enrollment_id":child["enrollment_id"]})
    assert r.status_code==201,r.text
    token=r.json()["token"]
    result=env["root"].post(B+"/onboarding/submit",json={"token":token,"admission_number":admission,"guardian_name":"Fictitious Guardian","phone":phone})
    assert result.status_code==201,result.text
    cap=result.json()["token"]
    info=env["root"].post(B+"/onboarding/verification-info",json={"token":cap})
    assert info.status_code==200,info.text
    return teacher,child,token,cap,info.json()["local_test_code"]

def register(env,cap,code,email="newparent@example.test",consent=True):
    return env["root"].post(B+"/onboarding/register",json={"token":cap,"code":code,"consent":consent,"email":email,"password":PASS})

def test_complete_new_parent_and_encrypted_contact(env):
    teacher,child,token,cap,code=pending(env)
    cid=env["ids"]["class_a"]
    statuses=teacher.get(B+"/classes/"+cid+"/guardian-links").json()
    assert next(s for s in statuses if s["enrollment_id"]==child["enrollment_id"])["status"]=="pending"
    r=register(env,cap,code)
    assert r.status_code==200 and r.json()["status"]=="verified" and r.json()["is_simulation"]
    assert "user_id" not in r.json()
    c=TestClient(env["app"])
    login=c.post(B+"/auth/login",json={"email":"newparent@example.test","password":PASS})
    assert login.status_code==200
    assert [s["id"] for s in c.get(B+"/me/children").json()]==[child["student_id"]]
    assert c.get(B+"/reports/"+env["ids"]["report_a"]).status_code==404
    rows=teacher.get(B+"/classes/"+cid+"/guardian-links").json()
    linked=next(s for s in rows if s["enrollment_id"]==child["enrollment_id"])
    assert linked["status"]=="verified" and linked["consented"] and linked["verification_method"]=="local_simulation"
    assert PHONE not in str(rows)
    with psycopg.connect(env["owner"]) as conn:
        encrypted,lookup,method=conn.execute("select phone_ciphertext,phone_hmac,verification_method from app_private.guardian_contacts where verification_method='local_simulation'").fetchone()
        assert encrypted!=PHONE and len(lookup)==64 and method=="local_simulation"
        assert Fernet(env["app"].state.settings.onboarding_key.encode()).decrypt(encrypted.encode()).decode()==PHONE
        assert conn.execute("select token_hash from app_private.onboarding_invites where token_hash=%s",(hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    assert register(env,cap,code).status_code==400
    c.close()

def test_student_submission_does_not_create_guardian_or_consent(env):
    _,child,_,_,_=pending(env)
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("select count(*) from app_private.guardian_links where student_id=%s",(child["student_id"],)).fetchone()[0]==0
        assert conn.execute("select count(*) from app_private.users where email='newparent@example.test'").fetchone()[0]==0

def test_declined_consent_has_no_account_or_link(env):
    teacher,child,_,cap,code=pending(env)
    r=env["root"].post(B+"/onboarding/decline",json={"token":cap,"code":code,"consent":False})
    assert r.status_code==200 and r.json()["status"]=="declined"
    assert register(env,cap,code).status_code==400
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("select count(*) from app_private.guardian_links where student_id=%s",(child["student_id"],)).fetchone()[0]==0
        assert conn.execute("select status from app_private.guardian_submissions where enrollment_id=%s",(child["enrollment_id"],)).fetchone()[0]=="declined"

def test_wrong_code_attempts_commit_and_lock(env):
    _,_,_,cap,code=pending(env)
    wrong="000000" if code!="000000" else "111111"
    for _ in range(5):
        assert register(env,cap,wrong).status_code==400
    assert register(env,cap,code).status_code==400
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("select attempts from app_private.guardian_submissions where capability_hash=%s",(hashlib.sha256(cap.encode()).hexdigest(),)).fetchone()[0]==5

@pytest.mark.parametrize("change",["expired","revoked","inactive","assignment_revoked","teacher_suspended"])
def test_verification_rechecks_scope_and_expiry(env,change):
    _,child,_,cap,code=pending(env)
    with psycopg.connect(env["owner"]) as conn:
        if change=="expired":
            conn.execute("update app_private.guardian_submissions set expires_at=now()-interval '1 minute',created_at=now()-interval '1 day'")
        elif change=="revoked":
            conn.execute("update app_private.onboarding_invites set revoked_at=now()")
        elif change=="inactive":
            conn.execute("update app.classes set status='inactive' where id=%s",(env["ids"]["class_a"],))
        elif change=="assignment_revoked":
            conn.execute("update app_private.class_assignments set revoked_at=now() where teacher_id=%s",(env["accounts"]["teacher_a"]["id"],))
        else:
            conn.execute("update app_private.school_memberships set suspended_at=now() where user_id=%s",(env["accounts"]["teacher_a"]["id"],))
    assert register(env,cap,code).status_code==400

def test_only_assigned_staff_issue_invites(env):
    teacher=env["login"]("teacher_b")
    assert teacher.post(B+"/classes/"+env["ids"]["class_a"]+"/guardian-invites",json={"enrollment_id":env["ids"]["enrollment_a"]}).status_code==404
    parent=env["login"]("parent_a")
    assert parent.get(B+"/classes/"+env["ids"]["class_a"]+"/guardian-links").status_code==404
    assert env["root"].post(B+"/classes/"+env["ids"]["class_a"]+"/guardian-invites",json={"enrollment_id":env["ids"]["enrollment_a"]}).status_code==401

def test_invite_single_use_reissue_and_admission_lock(env):
    teacher,child,old,cap,code=pending(env)
    cid=env["ids"]["class_a"]
    body={"token":old,"admission_number":"ONBOARD-1","guardian_name":"Test","phone":PHONE}
    assert env["root"].post(B+"/onboarding/submit",json=body).status_code==400
    new=teacher.post(B+"/classes/"+cid+"/guardian-invites",json={"enrollment_id":child["enrollment_id"]})
    assert new.status_code==201
    assert register(env,cap,code).status_code==400
    token=new.json()["token"]
    for _ in range(5):
        assert env["root"].post(B+"/onboarding/submit",json=body|{"token":token,"admission_number":"WRONG"}).status_code==400
    assert env["root"].post(B+"/onboarding/submit",json=body|{"token":token}).status_code==400

def test_existing_parent_links_sibling_and_cannot_take_another_phone(env):
    _,first,_,cap,code=pending(env)
    assert register(env,cap,code).status_code==200
    _,second,_,cap2,code2=pending(env,admission="ONBOARD-2")
    assert register(env,cap2,code2,email="othernew@example.test").status_code==409
    impostor=env["login"]("parent_b")
    assert impostor.post(B+"/onboarding/link-existing",json={"token":cap2,"code":code2,"consent":True}).status_code==409
    parent=TestClient(env["app"])
    signed=parent.post(B+"/auth/login",json={"email":"newparent@example.test","password":PASS})
    parent.headers["X-CSRF-Token"]=signed.json()["csrf_token"]
    linked=parent.post(B+"/onboarding/link-existing",json={"token":cap2,"code":code2,"consent":True})
    assert linked.status_code==200,linked.text
    assert len(parent.get(B+"/me/children").json())==2
    parent.close()

def test_disabled_mode_and_production_fail_closed(env):
    _,_,_,cap,code=pending(env)
    assert register(env,cap,code).status_code==200
    app=create_app(Settings(env["runtime"]))
    # Even reuse of a future provider-verified contact cannot upgrade a simulated link.
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app_private.guardian_contacts set verification_method='provider' where verification_method='local_simulation'")
    with TestClient(app) as c:
        assert c.post(B+"/onboarding/verification-info",json={"token":cap}).status_code==503
        login=c.post(B+"/auth/login",json={"email":"newparent@example.test","password":PASS})
        assert login.status_code==200
        assert c.get(B+"/me/children").json()==[]
    with pytest.raises(RuntimeError,match="forbidden"):
        create_app(Settings(env["runtime"],secure_cookies=True,local_onboarding=True))

def test_parent_can_withdraw_consent_without_losing_child(env):
    _,child,_,cap,code=pending(env)
    assert register(env,cap,code).status_code==200
    parent=TestClient(env["app"])
    signed=parent.post(B+"/auth/login",json={"email":"newparent@example.test","password":PASS})
    parent.headers["X-CSRF-Token"]=signed.json()["csrf_token"]
    link=parent.get(B+"/me/guardian-links").json()[0]
    assert link["consented"]
    other=env["login"]("parent_b")
    assert other.delete(B+"/me/guardian-links/"+link["id"]+"/consent").status_code==404
    assert parent.delete(B+"/me/guardian-links/"+link["id"]+"/consent").status_code==200
    assert not parent.get(B+"/me/guardian-links").json()[0]["consented"]
    assert parent.get(B+"/me/children").json()[0]["id"]==child["student_id"]
    parent.close()

def test_invalid_numbers_and_missing_consent_are_rejected(env):
    _,_,token,cap,code=pending(env)
    assert env["root"].post(B+"/onboarding/submit",json={"token":token,"admission_number":"ONBOARD-1","guardian_name":"Test","phone":"+14155550123"}).status_code==422
    assert env["root"].post(B+"/onboarding/register",json={"token":cap,"code":code,"email":"newparent@example.test","password":PASS}).status_code==422
    assert env["root"].post(B+"/onboarding/register",json={"token":cap,"code":code,"consent":True,"email":"invalid","password":PASS}).status_code==422

