"""Capability-based, student-bound guardian onboarding."""
import hashlib
import hmac
import re
import secrets
import httpx
from typing import Annotated
from uuid import UUID
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from pydantic import Field, StringConstraints, model_validator
from psycopg.types.json import Jsonb
from .models import Model, Name, Short, Password, Login

Token = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{43}$")]
Code = Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")]

class Capability(Model):
    token: Token

class Invitation(Model):
    enrollment_id: UUID

class Submission(Capability):
    admission_number: Short
    guardian_name: Name
    phone: Annotated[str,StringConstraints(strip_whitespace=True,min_length=10,max_length=22)]

    @model_validator(mode="after")
    def pakistan_mobile(self):
        value=re.sub(r"[\s()-]","",self.phone)
        if value.startswith("03"):
            value="+92"+value[1:]
        elif value.startswith("923"):
            value="+"+value
        if not re.fullmatch(r"\+923[0-9]{9}",value):
            raise ValueError("Use a Pakistani mobile number, for example +923001234567.")
        self.phone=value
        return self

class Verification(Capability):
    code: Code
    consent: bool

class Registration(Verification):
    email: Annotated[str,StringConstraints(strip_whitespace=True,min_length=3,max_length=254,pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
    password: Password

def register_onboarding(app,settings,pool,database,passwords):
    prefix="/api/v1"
    live = settings.whatsapp_live
    cipher=Fernet(settings.onboarding_key.encode()) if settings.local_onboarding or live else None

    def enabled():
        if not settings.local_onboarding and not live:
            raise HTTPException(503,"Guardian verification is not configured.")

    def keyed(value):
        return hmac.new(settings.onboarding_key.encode(),value.encode(),hashlib.sha256).hexdigest()

    def local_code(token):
        return str(int(keyed("local-code:"+token),16)%1000000).zfill(6)

    def hashed(value):
        return hashlib.sha256(value.encode()).hexdigest()

    def invoke(conn,operation,payload):
        return conn.execute("select app_private.onboarding(%s,%s) as data",(operation,Jsonb(payload))).fetchone()["data"]

    def checked(result):
        if isinstance(result,dict) and result.get("error"):
            raise HTTPException(400,result["error"])
        return result

    def public_action(request,operation,payload,password_to_hash=None):
        enabled()
        ip=request.client.host if request.client else "unknown"
        with pool.connection() as conn:
            count=conn.execute("select app_private.login_attempt(%s) as n",(hashed("onboarding:"+ip),)).fetchone()["n"]
        if count>100:
            raise HTTPException(429,"Too many onboarding attempts. Try again in 15 minutes.")
        if password_to_hash is not None:
            payload["password_hash"]=passwords.hash(password_to_hash)
        with pool.connection() as conn:
            if live:
                conn.execute("select set_config('app.whatsapp_school',%s,true)", (live.school_id,))
            else:
                conn.execute("select set_config('app.allow_simulation','true',true)")
            result=invoke(conn,operation,payload)
        # Business errors are checked AFTER commit, so bad attempts are durable.
        return checked(result)

    @app.get(prefix+"/onboarding/config")
    def mode():
        return {"local_testing":settings.local_onboarding,"provider_configured":live is not None}

    @app.get(prefix+"/classes/{class_id}/guardian-links")
    def statuses(class_id:UUID,conn=Depends(database)):
        enabled()
        return checked(invoke(conn,"status",{"class_id":str(class_id)}))

    @app.post(prefix+"/classes/{class_id}/guardian-invites",status_code=201)
    def create_invite(class_id:UUID,body:Invitation,conn=Depends(database)):
        enabled()
        token=secrets.token_urlsafe(32)
        result=checked(invoke(conn,"invite",{"class_id":str(class_id),"enrollment_id":str(body.enrollment_id),"token_hash":hashed(token)}))
        return {**result,"token":token,"path":"/enroll#"+token,"is_simulation":live is None}

    @app.delete(prefix+"/classes/{class_id}/guardian-invites/{invite_id}")
    def revoke(class_id:UUID,invite_id:UUID,conn=Depends(database)):
        enabled()
        return checked(invoke(conn,"revoke",{"class_id":str(class_id),"invite_id":str(invite_id)}))

    @app.post(prefix+"/onboarding/invite-info")
    def info(body:Capability,request:Request):
        return public_action(request,"invite_info",{"token_hash":hashed(body.token)})

    @app.post(prefix+"/onboarding/submit",status_code=201)
    def submit(body:Submission,request:Request):
        enabled()
        cap=secrets.token_urlsafe(32)
        code=f"{secrets.randbelow(1_000_000):06d}" if live else local_code(cap)
        result=public_action(request,"submit",{
            "token_hash":hashed(body.token),"admission_number":body.admission_number,"guardian_name":body.guardian_name,
            "phone_ciphertext":cipher.encrypt(body.phone.encode()).decode(),"phone_hmac":keyed("phone:"+body.phone),
            "phone_masked":body.phone[:3]+" *** *** "+body.phone[-4:],
            "capability_hash":hashed(cap),"challenge_hash":keyed(cap+":"+code)})
        if live:
            try:
                with httpx.Client(trust_env=False) as client:
                    live.sender.send_template(client, body.phone, live.otp_template, live.language, code=code)
            except (ValueError, RuntimeError):
                raise HTTPException(502,"Verification delivery could not be confirmed. Ask your school for a new invitation.") from None
        return {**result,"verification_path":"/verify-guardian#"+cap,"token":cap,"is_simulation":live is None}

    @app.post(prefix+"/onboarding/verification-info")
    def verification_info(body:Capability,request:Request):
        result=public_action(request,"verification_info",{"capability_hash":hashed(body.token)})
        return {**result,"local_test_code":local_code(body.token)} if not live else result

    @app.post(prefix+"/onboarding/register")
    def register(body:Registration,request:Request):
        enabled()
        payload={"capability_hash":hashed(body.token),"challenge_hash":keyed(body.token+":"+body.code),
                 "consent":body.consent,"email":body.email.lower()}
        result=public_action(request,"complete_new",payload,password_to_hash=body.password)
        # Explicit sign-in afterwards; registration never overwrites a staff session.
        return {k:v for k,v in result.items() if k!="user_id"}

    @app.post(prefix+"/onboarding/link-existing")
    def existing(body:Verification,conn=Depends(database)):
        enabled()
        result=invoke(conn,"complete_existing",{"capability_hash":hashed(body.token),
                     "challenge_hash":keyed(body.token+":"+body.code),"consent":body.consent})
        if result.get("error"):
            conn.commit()  # Keep a wrong-code attempt even when returning HTTP 400.
            checked(result)
        return {k:v for k,v in result.items() if k!="user_id"}

    @app.post(prefix+"/onboarding/decline")
    def decline(body:Verification,request:Request):
        if body.consent:
            raise HTTPException(422,"This action records a refusal of consent.")
        return public_action(request,"complete_new",{"capability_hash":hashed(body.token),
            "challenge_hash":keyed(body.token+":"+body.code),"consent":False})

