"""School self-registration and private, tenant-scoped branding."""
import hashlib
from io import BytesIO
from typing import Annotated
from uuid import UUID
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import Depends, HTTPException, Request, Response
from pydantic import StringConstraints, model_validator
from psycopg.types.json import Jsonb
from starlette.concurrency import run_in_threadpool
from .models import Model, Name, Password

Email=Annotated[str,StringConstraints(strip_whitespace=True,min_length=3,max_length=254,pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
OptionalEmail=Annotated[str,StringConstraints(strip_whitespace=True,max_length=254,pattern=r"^$|^[^\s@]+@[^\s@]+\.[^\s@]+$")]
SchoolName=Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=160)]
City=Annotated[str,StringConstraints(strip_whitespace=True,max_length=120)]
class SchoolRegistration(Model):
    school_name: SchoolName
    slug: Annotated[str,StringConstraints(strip_whitespace=True,min_length=3,max_length=60,pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
    city: City = ""
    admin_name: Name
    email: Email
    password: Password

def white_contrast(color):
    channels=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    linear=[c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4 for c in channels]
    luminance=sum(c*k for c,k in zip(linear,(0.2126,0.7152,0.0722)))
    return 1.05/(luminance+0.05)

class SchoolProfile(Model):
    name: SchoolName
    city: City = ""
    address: Annotated[str,StringConstraints(strip_whitespace=True,max_length=500)] = ""
    contact_email: OptionalEmail = ""
    tagline: Annotated[str,StringConstraints(strip_whitespace=True,max_length=180)] = ""
    accent: Annotated[str,StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")] = "#087F75"

    @model_validator(mode="after")
    def readable_color(self):
        if white_contrast(self.accent)<4.5:
            raise ValueError("Choose a darker accent so white button text stays readable.")
        return self

def normalize_logo(data:bytes) -> bytes:
    if not data or len(data)>1048576:
        raise HTTPException(413,"Choose a logo smaller than 1 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error",Image.DecompressionBombWarning)
            with Image.open(BytesIO(data),formats=["PNG","JPEG","WEBP"]) as candidate:
                if candidate.width>2048 or candidate.height>2048 or candidate.width*candidate.height>4194304:
                    raise HTTPException(422,"Choose a logo no larger than 2048 by 2048 pixels.")
                candidate.verify()
            with Image.open(BytesIO(data),formats=["PNG","JPEG","WEBP"]) as image:
                if getattr(image,"n_frames",1)!=1:
                    raise HTTPException(422,"Choose a still logo image, not an animation.")
                image.load()
                pixels=ImageOps.exif_transpose(image).convert("RGBA")
                pixels.thumbnail((512,512),Image.Resampling.LANCZOS)
                # A fresh canvas strips EXIF, GPS, ICC, comments and unrelated chunks.
                clean=Image.new("RGBA",pixels.size)
                clean.paste(pixels)
                output=BytesIO()
                clean.save(output,format="PNG",optimize=True)
                if len(output.getvalue())>524288:
                    clean.thumbnail((256,256),Image.Resampling.LANCZOS)
                    output=BytesIO()
                    clean.save(output,format="PNG",optimize=True)
                result=output.getvalue()
                if len(result)>524288:
                    raise HTTPException(422,"Choose a smaller or simpler logo.")
                return result
    except HTTPException:
        raise
    except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        raise HTTPException(422,"The file is not a valid PNG, JPEG or WebP logo.")

def register_schools(app,settings,pool,database,passwords):
    prefix="/api/v1"

    @app.get(prefix+"/auth/registration-config")
    def registration_config():
        return {"enabled":settings.registration_enabled}

    @app.post(prefix+"/auth/register-school",status_code=201)
    def register_school(body:SchoolRegistration,request:Request):
        if not settings.registration_enabled:
            raise HTTPException(503,"School registration is currently closed. Contact the administrator.")
        ip=request.client.host if request.client else "unknown"
        # Counters commit before hashing or unique-constraint failures.
        with pool.connection() as conn:
            n=conn.execute("select app_private.login_attempt(%s) as n",
                           (hashlib.sha256(("school-signup:"+ip).encode()).hexdigest(),)).fetchone()["n"]
            account=conn.execute("select app_private.login_attempt(%s) as n",
                           (hashlib.sha256(("school-signup-email:"+body.email.lower()).encode()).hexdigest(),)).fetchone()["n"]
        if n>5 or account>3:
            raise HTTPException(429,"Too many registration attempts. Please try again in 15 minutes.")
        payload=body.model_dump()
        payload["email"]=body.email.lower()
        payload["password_hash"]=passwords.hash(payload.pop("password"))
        with pool.connection() as conn:
            result=conn.execute("select app_private.register_school(%s) as data",(Jsonb(payload),)).fetchone()["data"]
        # Registration does not replace an existing browser login.
        return result

    @app.patch(prefix+"/schools/{school_id}")
    def update_school(school_id:UUID,body:SchoolProfile,conn=Depends(database)):
        return conn.execute("select app_private.update_school(%s,%s) as data",
                            (school_id,Jsonb(body.model_dump()))).fetchone()["data"]

    @app.get(prefix+"/schools/{school_id}/logo",response_class=Response,responses={200:{"content":{"image/png":{}}}})
    def logo(school_id:UUID,conn=Depends(database)):
        image=conn.execute("select app_private.get_school_logo(%s) as content",(school_id,)).fetchone()["content"]
        if image is None:
            raise HTTPException(404,"School logo unavailable.")
        return Response(bytes(image),media_type="image/png",headers={"Content-Disposition":"inline"})

    @app.put(prefix+"/schools/{school_id}/logo")
    async def upload_logo(school_id:UUID,request:Request,conn=Depends(database)):
        def authorize():
            return conn.execute("select app_private.is_admin(%s) as allowed",(school_id,)).fetchone()["allowed"]
        if not await run_in_threadpool(authorize):
            raise HTTPException(404,"School settings unavailable.")
        if request.headers.get("content-type","").split(";")[0].lower() not in {"image/png","image/jpeg","image/webp"}:
            raise HTTPException(415,"Choose a PNG, JPEG or WebP image.")
        raw=bytearray()
        async for part in request.stream():
            raw.extend(part)
            if len(raw)>1048576:
                raise HTTPException(413,"Choose a logo smaller than 1 MB.")
        normalized=await run_in_threadpool(normalize_logo,bytes(raw))
        digest=hashlib.sha256(normalized).hexdigest()
        def save():
            conn.execute("select app_private.save_school_logo(%s,%s,%s)",(school_id,normalized,digest))
        await run_in_threadpool(save)
        return {"saved":True,"logo_object_key":"db-logo:"+digest}

    @app.delete(prefix+"/schools/{school_id}/logo")
    def remove_logo(school_id:UUID,conn=Depends(database)):
        conn.execute("select app_private.remove_school_logo(%s)",(school_id,))
        return {"removed":True}

