from io import BytesIO
import hashlib
import psycopg
import pytest
from PIL import Image, PngImagePlugin
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings

B="/api/v1"
PROFILE={"name":"Fictitious Renamed School","city":"Lahore","address":"Fictitious school address",
         "contact_email":"office@example.test","tagline":"Learning together","accent":"#263A77"}
SIGNUP={"school_name":"Fictitious New School","slug":"fictitious-new-school","city":"Lahore",
        "admin_name":"Fictitious School Owner","email":"newschool@example.test","password":"school-test-password-123"}

def png(size=(100,100),metadata=True):
    out=BytesIO();im=Image.new("RGBA",size,(10,80,65,255))
    info=PngImagePlugin.PngInfo()
    if metadata: info.add_text("Comment","Private test metadata to strip")
    im.save(out,format="PNG",pnginfo=info)
    return out.getvalue()

def upload(client,sid,image=None,mime="image/png"):
    return client.put(B+"/schools/"+sid+"/logo",content=png() if image is None else image,headers={"Content-Type":mime})

def test_registration_creates_only_a_new_tenant_admin(env):
    r=env["root"].post(B+"/auth/register-school",json=SIGNUP)
    assert r.status_code==201,r.text
    sid=r.json()["school_id"]
    assert sid!=env["ids"]["school"]
    assert "set-cookie" not in r.headers
    user=TestClient(env["app"])
    signed=user.post(B+"/auth/login",json={"email":SIGNUP["email"],"password":SIGNUP["password"]})
    assert signed.status_code==200
    assert signed.json()["memberships"]==[{"role":"school_admin","school_id":sid,"school_name":SIGNUP["school_name"]}]
    user.headers["X-CSRF-Token"]=signed.json()["csrf_token"]
    assert [s["id"] for s in user.get(B+"/schools").json()]==[sid]
    assert user.get(B+"/classes").json()==[]
    assert user.get(B+"/classes/"+env["ids"]["class_a"]).status_code==404
    assert user.patch(B+"/schools/"+env["ids"]["school"],json=PROFILE).status_code==404
    created=user.post(B+"/classes",json={"school_id":sid,"grade":"1","section":"A","academic_year":"2026-27"})
    assert created.status_code==201
    user.close()

@pytest.mark.parametrize("existing",["admin","teacher_a","parent_a"])
def test_registration_cannot_promote_existing_accounts_and_rolls_back(env,existing):
    account=env["accounts"][existing]
    r=env["root"].post(B+"/auth/register-school",json=SIGNUP|{"email":account["email"]})
    assert r.status_code==409
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("select count(*) from app.schools where slug=%s",(SIGNUP["slug"],)).fetchone()[0]==0
        assert conn.execute("select count(*) from app_private.users where email=%s",(account["email"],)).fetchone()[0]==1
        if existing!="admin":
            assert conn.execute("select count(*) from app_private.school_memberships where user_id=%s and role='school_admin'",(account["id"],)).fetchone()[0]==0

def test_duplicate_school_slug_does_not_leave_an_orphan_user(env):
    existing=SIGNUP|{"slug":"parentreport-local-fixtures"}
    assert env["root"].post(B+"/auth/register-school",json=existing).status_code==409
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("select count(*) from app_private.users where email=%s",(SIGNUP["email"],)).fetchone()[0]==0

def test_registration_rejects_role_injection_and_invalid_handles(env):
    assert env["root"].post(B+"/auth/register-school",json=SIGNUP|{"school_id":env["ids"]["school"],"role":"school_admin"}).status_code==422
    assert env["root"].post(B+"/auth/register-school",json=SIGNUP|{"slug":"invalid handle"}).status_code==422
    assert env["root"].post(B+"/auth/register-school",json=SIGNUP|{"password":"short"}).status_code==422
    assert env["root"].post(B+"/auth/register-school",json=SIGNUP,headers={"Origin":"https://untrusted.example"}).status_code==403

def test_signup_rate_limit_is_durable(env):
    for _ in range(3):
        assert env["root"].post(B+"/auth/register-school",json=SIGNUP|{"email":env["accounts"]["admin"]["email"]}).status_code==409
    assert env["root"].post(B+"/auth/register-school",json=SIGNUP|{"email":env["accounts"]["admin"]["email"]}).status_code==429

def test_registration_can_be_closed_without_changing_existing_login(env):
    app=create_app(Settings(env["runtime"]))
    with TestClient(app) as c:
        assert not c.get(B+"/auth/registration-config").json()["enabled"]
        assert c.post(B+"/auth/register-school",json=SIGNUP).status_code==503
        account=env["accounts"]["admin"]
        assert c.post(B+"/auth/login",json={"email":account["email"],"password":account["password"]}).status_code==200

def test_admin_profile_update_and_family_visibility(env):
    admin=env["login"]("admin");sid=env["ids"]["school"]
    assert admin.patch(B+"/schools/"+sid,json=PROFILE).status_code==200
    for role in ("admin","teacher_a","parent_a"):
        c=env["login"](role)
        record=next(s for s in c.get(B+"/schools").json() if s["id"]==sid)
        assert record["name"]==PROFILE["name"] and record["accent"]==PROFILE["accent"]
    parent=env["login"]("parent_a")
    original=parent.get(B+"/reports/"+env["ids"]["report_a"]).json()["snapshot"]
    assert original["school_name"]!=PROFILE["name"]

@pytest.mark.parametrize("role",["teacher_a","parent_a","foreign_admin"])
def test_branding_writes_are_admin_and_tenant_scoped(env,role):
    c=env["login"](role);sid=env["ids"]["school"]
    assert c.patch(B+"/schools/"+sid,json=PROFILE).status_code==404
    assert upload(c,sid).status_code==404
    assert c.delete(B+"/schools/"+sid+"/logo").status_code==404

def test_profile_validation_and_csrf(env):
    c=env["login"]("admin");sid=env["ids"]["school"]
    assert c.patch(B+"/schools/"+sid,json=PROFILE|{"accent":"#ffffff"}).status_code==422
    assert c.patch(B+"/schools/"+sid,json=PROFILE|{"active":False,"logo_object_key":"https://untrusted.example/file.svg"}).status_code==422
    assert c.patch(B+"/schools/"+sid,json=PROFILE|{"address":"x"*501}).status_code==422
    assert c.patch(B+"/schools/"+sid,json=PROFILE|{"city":"","address":"","contact_email":"","tagline":""}).status_code==200
    del c.headers["X-CSRF-Token"]
    assert c.patch(B+"/schools/"+sid,json=PROFILE).status_code==403
    assert upload(c,sid).status_code==403

def test_logo_is_private_sanitized_and_removed_atomically(env):
    admin=env["login"]("admin");sid=env["ids"]["school"]
    r=upload(admin,sid)
    assert r.status_code==200,r.text
    assert r.json()["logo_object_key"].startswith("db-logo:")
    assert env["root"].get(B+"/schools/"+sid+"/logo").status_code==401
    unrelated=env["login"]("foreign_admin")
    assert unrelated.get(B+"/schools/"+sid+"/logo").status_code==404
    for role in ("admin","teacher_a","parent_a"):
        c=env["login"](role)
        result=c.get(B+"/schools/"+sid+"/logo")
        assert result.status_code==200 and result.headers["content-type"]=="image/png"
        assert result.headers["x-content-type-options"]=="nosniff"
        assert result.headers["cache-control"]=="no-store"
        with Image.open(BytesIO(result.content)) as im:
            assert im.size==(100,100)
            assert "Comment" not in im.info
    with psycopg.connect(env["owner"]) as conn:
        content,digest=conn.execute("select content,sha256 from app_private.school_logos where school_id=%s",(sid,)).fetchone()
        assert hashlib.sha256(bytes(content)).hexdigest()==digest
        conn.execute("set local role parentreport_runtime")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select * from app_private.school_logos")
        conn.rollback()
    assert admin.delete(B+"/schools/"+sid+"/logo").status_code==200
    assert admin.get(B+"/schools/"+sid+"/logo").status_code==404
    assert next(s for s in admin.get(B+"/schools").json() if s["id"]==sid)["logo_object_key"] is None

@pytest.mark.parametrize("content,mime,status",[
    (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>","image/svg+xml",415),
    (b"<svg></svg>","image/png",422),
    (b"not an image","image/jpeg",422),
    (b"","image/png",413),
    (b"x"*1048577,"image/png",413),
])
def test_invalid_logo_uploads_are_rejected(env,content,mime,status):
    c=env["login"]("admin");sid=env["ids"]["school"]
    assert upload(c,sid,content,mime).status_code==status
    assert c.get(B+"/schools/"+sid+"/logo").status_code==404

def test_logo_pixel_limit_and_jpeg_conversion(env):
    c=env["login"]("admin");sid=env["ids"]["school"]
    assert upload(c,sid,png((2049,1))).status_code==422
    image=Image.new("RGB",(800,400),(20,80,100));out=BytesIO();image.save(out,format="JPEG")
    assert upload(c,sid,out.getvalue(),"image/jpeg").status_code==200
    data=c.get(B+"/schools/"+sid+"/logo").content
    with Image.open(BytesIO(data)) as decoded:
        assert decoded.format=="PNG" and decoded.size==(512,256)

