"""Account-owned security actions; recovery is deliberately local-only."""
import hashlib
import hmac
import secrets
from uuid import UUID
from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

class PasswordChange(StrictBody):
    current_password: str = Field(min_length=1,max_length=128)
    new_password: str = Field(min_length=12,max_length=128)

class RecoveryRequest(StrictBody):
    email: str = Field(min_length=3,max_length=254,pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

class RecoveryComplete(StrictBody):
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    new_password: str = Field(min_length=12,max_length=128)

def register_accounts(app,settings,pool,database,passwords):
    prefix="/api/v1/auth"

    def rate(conn,key,limit):
        count=conn.execute("select app_private.login_attempt(%s) as n",(digest(key),)).fetchone()["n"]
        conn.commit()  # A failed action must not roll back its rate counter.
        if count>limit:
            raise HTTPException(429,"Too many attempts. Please try again in 15 minutes.")

    @app.get(prefix+"/sessions")
    def sessions(request:Request,conn=Depends(database)):
        return conn.execute("select app_private.my_sessions(%s) as data",(digest(request.cookies[settings.cookie_name]),)).fetchone()["data"]

    @app.delete(prefix+"/sessions/{session_id}")
    def revoke(session_id:UUID,request:Request,response:Response,conn=Depends(database)):
        current=conn.execute("select app_private.my_sessions(%s) as data",(digest(request.cookies[settings.cookie_name]),)).fetchone()["data"]
        ok=conn.execute("select app_private.revoke_owned_session(%s) as ok",(session_id,)).fetchone()["ok"]
        if not ok: raise HTTPException(404,"Session unavailable.")
        if any(s["id"]==str(session_id) and s["current"] for s in current):
            response.delete_cookie(settings.cookie_name,path="/",httponly=True,secure=settings.secure_cookies,samesite="strict")
        return {"revoked":True}

    @app.post(prefix+"/sessions/revoke-others")
    def revoke_others(request:Request,conn=Depends(database)):
        count=conn.execute("select app_private.revoke_other_sessions(%s) as n",(digest(request.cookies[settings.cookie_name]),)).fetchone()["n"]
        return {"revoked":count}

    @app.post(prefix+"/change-password")
    def change(body:PasswordChange,request:Request,response:Response,conn=Depends(database)):
        rate(conn,"password-change:"+request.state.actor["id"],5)
        # commit clears transaction-local scope; revalidate both session and CSRF.
        old_token=digest(request.cookies[settings.cookie_name])
        actor=conn.execute("select app_private.get_api_session(%s) as data",(old_token,)).fetchone()["data"]
        if not actor: raise HTTPException(401,"Please sign in again.")
        if not hmac.compare_digest(request.headers.get("x-csrf-token",""),actor["csrf_token"]):
            raise HTTPException(403,"Refresh your session and try again.")
        conn.execute("select set_config('app.user_id',%s,true)",(actor["id"],))
        old_hash=conn.execute("select app_private.own_password_hash() as hash").fetchone()["hash"]
        if not old_hash or not passwords.verify(body.current_password,old_hash):
            raise HTTPException(400,"Current password is incorrect.")
        if body.current_password==body.new_password:
            raise HTTPException(422,"Choose a different new password.")
        token,csrf=secrets.token_urlsafe(48),secrets.token_urlsafe(32)
        ok=conn.execute("select app_private.change_own_password(%s,%s,%s,%s,%s) as ok",
            (old_hash,passwords.hash(body.new_password),old_token,digest(token),csrf)).fetchone()["ok"]
        if not ok: raise HTTPException(409,"Your account changed. Please sign in again.")
        response.set_cookie(settings.cookie_name,token,max_age=8*3600,httponly=True,secure=settings.secure_cookies,samesite="strict",path="/")
        return conn.execute("select app_private.get_api_session(%s) as data",(digest(token),)).fetchone()["data"]

    @app.get(prefix+"/recovery-config")
    def recovery_config():
        return {"local_only":settings.local_recovery,"email_delivery":False}

    def local_only():
        if not settings.local_recovery: raise HTTPException(503,"Password recovery is not configured. Contact your school administrator.")

    @app.post(prefix+"/local-recovery")
    def request_reset(body:RecoveryRequest,request:Request):
        local_only()
        ip=request.client.host if request.client else "unknown"
        with pool.connection() as conn:
            rate(conn,"reset-ip:"+ip,20)
            rate(conn,"reset-email:"+str(body.email).lower(),3)
            conn.execute("select set_config('app.allow_local_recovery','true',true)")
            token=secrets.token_urlsafe(32)
            conn.execute("select app_private.request_local_password_reset(%s,%s)",(str(body.email),digest(token)))
        # Same shape for unknown emails; no real delivery or account-existence claim.
        return {"is_simulation":True,"reset_path":"/reset-password#"+token,"expires_in_seconds":900}

    @app.post(prefix+"/local-recovery/complete")
    def complete(body:RecoveryComplete,request:Request):
        local_only()
        ip=request.client.host if request.client else "unknown"
        with pool.connection() as conn:
            rate(conn,"reset-complete-ip:"+ip,20)
            conn.execute("select set_config('app.allow_local_recovery','true',true)")
            key=digest(body.token)
            valid=conn.execute("select app_private.local_reset_valid(%s) as ok",(key,)).fetchone()["ok"]
            if not valid: raise HTTPException(400,"Reset link is invalid, expired or already used.")
            ok=conn.execute("select app_private.complete_local_password_reset(%s,%s) as ok",(key,passwords.hash(body.new_password))).fetchone()["ok"]
            if not ok: raise HTTPException(400,"Reset link is invalid, expired or already used.")
        return {"is_simulation":True,"password_changed":True,"sign_in_required":True}
