from contextlib import asynccontextmanager
from datetime import date
import hashlib
import hmac
import secrets
from uuid import UUID
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from psycopg import errors
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool, PoolTimeout
from pwdlib import PasswordHash
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from . import models as m

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("unused-" + secrets.token_urlsafe(32))
PREFIX = "/api/v1"

def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.load()
    if settings.secure_cookies and settings.local_onboarding:
        raise RuntimeError("Local verification is forbidden in production.")
    if settings.secure_cookies and settings.local_recovery:
        raise RuntimeError("Local password recovery is forbidden in production.")
    pool = ConnectionPool(settings.database_url, min_size=1, max_size=settings.pool_size, open=False,
                          timeout=5, kwargs={"row_factory": dict_row, "connect_timeout": 5})

    @asynccontextmanager
    async def lifespan(app):
        pool.open()
        pool.wait(timeout=15)
        try:
            with pool.connection() as conn:
                role = conn.execute("select rolsuper,rolbypassrls from pg_roles where rolname=current_user").fetchone()
                if role["rolsuper"] or role["rolbypassrls"]:
                    raise RuntimeError("API must use the restricted DATABASE_URL, never the migration owner.")
            yield
        finally:
            pool.close()

    app = FastAPI(title="ParentReport API", version="0.2.0", lifespan=lifespan)
    app.state.pool = pool
    app.state.settings = settings
    hosts = sorted({urlparse(x).hostname for x in settings.origins} | {"127.0.0.1", "localhost", "testserver"})
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)

    @app.middleware("http")
    async def request_boundary(request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if (origin and origin not in settings.origins) or request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "This request origin is not allowed."}, status_code=403)
            length = request.headers.get("content-length", "0")
            if not length.isdigit() or int(length) > 1024 * 1024:
                return JSONResponse({"detail": "Request is too large."}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(errors.InsufficientPrivilege)
    async def denied(request, exc):
        return JSONResponse({"detail": "Resource unavailable or permission revoked."}, status_code=404)

    @app.exception_handler(errors.UniqueViolation)
    async def conflict(request, exc):
        return JSONResponse({"detail": "A matching record already exists or this action was already completed."}, status_code=409)

    @app.exception_handler(errors.IntegrityError)
    async def invalid(request, exc):
        return JSONResponse({"detail": "Check the values, student/class scope and required marks."}, status_code=422)

    @app.exception_handler(PoolTimeout)
    async def unavailable(request, exc):
        return JSONResponse({"detail": "Database is busy. Please try again."}, status_code=503)

    def database(request: Request):
        with pool.connection() as conn:
            token = request.cookies.get(settings.cookie_name, "")
            actor = conn.execute("select app_private.get_api_session(%s) as data", (digest(token),)).fetchone()["data"]
            if not actor:
                raise HTTPException(401, "Please sign in.")
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), actor["csrf_token"]):
                    raise HTTPException(403, "Your session could not confirm this request. Refresh and try again.")
            conn.execute("select set_config('app.user_id',%s,true)", (actor["id"],))
            conn.execute("select set_config('app.allow_simulation',%s,true)", ("true" if settings.local_onboarding else "false",))
            request.state.actor = actor
            yield conn

    def write(conn, operation, body, **ids):
        payload = body.model_dump(mode="json") if body else {}
        payload.update({k: str(v) for k, v in ids.items()})
        return conn.execute("select app_private.api_write(%s,%s) as data", (operation, Jsonb(payload))).fetchone()["data"]

    def require_row(conn, table: str, resource: UUID):
        # Call sites use fixed table names; untrusted identifiers are never interpolated.
        row = conn.execute("select * from app." + table + " where id=%s", (resource,)).fetchone()
        if not row:
            raise HTTPException(404, "Resource unavailable or permission revoked.")
        return row

    @app.get("/health")
    def health():
        with pool.connection() as conn:
            conn.execute("select 1")
        return {"status": "ok", "database": "postgresql", "whatsapp": "simulation_only"}

    @app.post(PREFIX + "/auth/login")
    def login(body: m.Login, request: Request, response: Response):
        email = body.email.lower()
        ip = request.client.host if request.client else "unknown"
        # Commit counters before checking credentials, including failed attempts.
        with pool.connection() as conn:
            ip_count = conn.execute("select app_private.login_attempt(%s) as n", (digest("ip:" + ip),)).fetchone()["n"]
            account_count = conn.execute("select app_private.login_attempt(%s) as n", (digest("account:" + email),)).fetchone()["n"]
        if ip_count > 100 or account_count > 10:
            raise HTTPException(429, "Too many attempts. Please try again in 15 minutes.")
        with pool.connection() as conn:
            account = conn.execute("select app_private.login_lookup(%s) as data", (email,)).fetchone()["data"]
            hashed = (account or {}).get("password_hash") or DUMMY_HASH
            try:
                valid = passwords.verify(body.password, hashed)
            except (ValueError, TypeError):
                valid = False
            if not account or not valid:
                raise HTTPException(401, "Email or password is incorrect.")
            token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
            created = conn.execute("select app_private.start_authenticated_session(%s,%s,%s,%s,%s) as ok",
                (account["id"],hashed,digest(token),csrf,digest(request.cookies.get(settings.cookie_name,"")))).fetchone()["ok"]
            if not created:
                raise HTTPException(401,"Your password changed. Please sign in again.")
            actor = conn.execute("select app_private.get_api_session(%s) as data", (digest(token),)).fetchone()["data"]
        response.set_cookie(settings.cookie_name, token, max_age=8 * 60 * 60, httponly=True,
                            secure=settings.secure_cookies, samesite="strict", path="/")
        return actor

    @app.get(PREFIX + "/auth/me")
    def me(request: Request, conn=Depends(database)):
        return request.state.actor

    @app.post(PREFIX + "/auth/logout")
    def logout(request: Request, response: Response, conn=Depends(database)):
        conn.execute("select app_private.revoke_api_session(%s)", (digest(request.cookies[settings.cookie_name]),))
        response.delete_cookie(settings.cookie_name, path="/", httponly=True, secure=settings.secure_cookies, samesite="strict")
        return {"signed_out": True}

    @app.get(PREFIX + "/schools")
    def schools(conn=Depends(database)):
        return conn.execute("select * from app.schools order by name").fetchall()

    @app.get(PREFIX + "/classes")
    def classes(conn=Depends(database)):
        return conn.execute("select * from app.classes order by grade,section").fetchall()

    @app.post(PREFIX + "/classes", status_code=201)
    def create_class(body: m.ClassCreate, conn=Depends(database)):
        return write(conn, "create_class", body)

    @app.patch(PREFIX + "/classes/{class_id}")
    def update_class(class_id: UUID, body: m.ClassUpdate, conn=Depends(database)):
        return write(conn, "update_class", body, class_id=class_id)

    @app.get(PREFIX + "/schools/{school_id}/teachers")
    def teachers(school_id: UUID, conn=Depends(database)):
        rows = conn.execute("select app_private.staff_directory(%s) as data", (school_id,)).fetchone()["data"]
        if rows is None:
            raise HTTPException(404, "Resource unavailable.")
        return rows

    @app.post(PREFIX + "/teachers", status_code=201)
    def create_teacher(body: m.TeacherCreate, conn=Depends(database)):
        # Passwords are hashed before calling SQL; no plaintext credential is logged.
        payload = body.model_dump(mode="json")
        payload["password_hash"] = passwords.hash(payload.pop("password"))
        return conn.execute("select app_private.api_write('create_teacher',%s) as data", (Jsonb(payload),)).fetchone()["data"]

    @app.patch(PREFIX + "/teachers/{teacher_id}/access")
    def teacher_access(teacher_id: UUID, body: m.TeacherAccess, conn=Depends(database)):
        return write(conn, "teacher_access", body, teacher_id=teacher_id)

    @app.put(PREFIX + "/classes/{class_id}/assignment")
    def assignment(class_id: UUID, body: m.Assignment, conn=Depends(database)):
        return write(conn, "assign_teacher", body, class_id=class_id)

    @app.get(PREFIX + "/classes/{class_id}")
    def classroom(class_id: UUID, conn=Depends(database)):
        row = require_row(conn, "classes", class_id)
        sid = row["school_id"]
        allowed = conn.execute("select app_private.is_admin(%s) or app_private.can_teach(%s,%s) as ok", (sid,sid,class_id)).fetchone()["ok"]
        if not allowed:
            raise HTTPException(404, "Class workspace unavailable.")
        roster = conn.execute("""select e.id as enrollment_id,e.student_id,e.roll_number,s.name,s.admission_number
            from app.enrollments e join app.students s on s.id=e.student_id
            where e.class_id=%s and e.ended_on is null order by e.roll_number""", (class_id,)).fetchall()
        return {"class": row, "students": roster,
                "exams": conn.execute("select * from app.exams where class_id=%s order by exam_date desc", (class_id,)).fetchall()}

    @app.post(PREFIX + "/classes/{class_id}/students", status_code=201)
    def add_student(class_id: UUID, body: m.StudentCreate, conn=Depends(database)):
        return write(conn, "add_student", body, class_id=class_id)

    @app.post(PREFIX + "/classes/{class_id}/exams", status_code=201)
    def create_exam(class_id: UUID, body: m.ExamCreate, conn=Depends(database)):
        return write(conn, "create_exam", body, class_id=class_id)

    @app.get(PREFIX + "/exams/{exam_id}")
    def exam(exam_id: UUID, conn=Depends(database)):
        row = require_row(conn, "exams", exam_id)
        # Parents use report snapshots; they never receive a draft marks grid.
        allowed = conn.execute("select app_private.is_admin(%s) or app_private.can_teach(%s,%s) as ok",
                               (row["school_id"],row["school_id"],row["class_id"])).fetchone()["ok"]
        if not allowed:
            raise HTTPException(404, "Exam workspace unavailable.")
        return {"exam": row,
                "subjects": conn.execute("select * from app.exam_subjects where exam_id=%s order by name", (exam_id,)).fetchall(),
                "marks": conn.execute("select * from app.marks where exam_id=%s", (exam_id,)).fetchall()}

    @app.put(PREFIX + "/exams/{exam_id}/marks")
    def save_marks(exam_id: UUID, body: m.MarksSave, conn=Depends(database)):
        return write(conn, "save_marks", body, exam_id=exam_id)

    @app.post(PREFIX + "/exams/{exam_id}/publish")
    def publish(exam_id: UUID, conn=Depends(database)):
        return write(conn, "publish_exam", None, exam_id=exam_id)

    @app.post(PREFIX + "/exams/{exam_id}/simulate-reports")
    def simulate(exam_id: UUID, body: m.Simulation, conn=Depends(database)):
        return write(conn, "simulate_reports", body, exam_id=exam_id)

    @app.get(PREFIX + "/classes/{class_id}/attendance")
    def attendance(class_id: UUID, day: date, conn=Depends(database)):
        require_row(conn, "classes", class_id)
        return conn.execute("select * from app.attendance where class_id=%s and attendance_date=%s", (class_id,day)).fetchall()

    @app.put(PREFIX + "/classes/{class_id}/attendance")
    def save_attendance(class_id: UUID, body: m.AttendanceSave, conn=Depends(database)):
        return write(conn, "save_attendance", body, class_id=class_id)

    @app.get(PREFIX + "/notices")
    def notices(conn=Depends(database)):
        return conn.execute("""select n.*,exists(select 1 from app.notice_acknowledgements a
          where a.notice_id=n.id and a.guardian_id=app_private.current_user_id()) as acknowledged
          from app.notices n order by n.created_at desc limit 200""").fetchall()

    @app.post(PREFIX + "/notices", status_code=201)
    def create_notice(body: m.NoticeCreate, conn=Depends(database)):
        return write(conn, "create_notice", body)

    @app.post(PREFIX + "/notices/{notice_id}/acknowledge")
    def acknowledge(notice_id: UUID, conn=Depends(database)):
        return write(conn, "acknowledge_notice", None, notice_id=notice_id)

    @app.get(PREFIX + "/homework")
    def homework(conn=Depends(database)):
        return conn.execute("""select h.*,coalesce((select jsonb_agg(c.enrollment_id)
            from app.homework_completions c where c.homework_id=h.id),'[]'::jsonb) as completed_enrollment_ids
            from app.homework h order by h.due_date desc limit 200""").fetchall()

    @app.post(PREFIX + "/classes/{class_id}/homework", status_code=201)
    def create_homework(class_id: UUID, body: m.HomeworkCreate, conn=Depends(database)):
        return write(conn, "create_homework", body, class_id=class_id)

    @app.post(PREFIX + "/homework/{homework_id}/complete")
    def complete_homework(homework_id: UUID, body: m.HomeworkComplete, conn=Depends(database)):
        return write(conn, "complete_homework", body, homework_id=homework_id)

    @app.get(PREFIX + "/leave-requests")
    def leaves(conn=Depends(database)):
        return conn.execute("""select l.*,s.name as student_name,'Class '||c.grade||'-'||c.section as class_name
            from app.leave_requests l join app.enrollments e on e.id=l.enrollment_id
            join app.students s on s.id=e.student_id join app.classes c on c.id=l.class_id
            order by l.created_at desc limit 200""").fetchall()

    @app.post(PREFIX + "/leave-requests", status_code=201)
    def request_leave(body: m.LeaveCreate, conn=Depends(database)):
        return write(conn, "request_leave", body)

    @app.patch(PREFIX + "/leave-requests/{leave_id}")
    def review_leave(leave_id: UUID, body: m.LeaveReview, conn=Depends(database)):
        return write(conn, "review_leave", body, leave_id=leave_id)

    @app.get(PREFIX + "/reports")
    def reports(conn=Depends(database)):
        return conn.execute("select * from app.report_versions order by published_at desc limit 200").fetchall()

    @app.get(PREFIX + "/reports/{report_id}")
    def report(report_id: UUID, conn=Depends(database)):
        return require_row(conn, "report_versions", report_id)

    @app.get(PREFIX + "/me/children")
    # Parent ownership is independent of WhatsApp messaging consent.
    def children(conn=Depends(database)):
        return conn.execute("""select s.id,s.name,e.id as enrollment_id,e.class_id,e.roll_number,c.grade,c.section,sc.name as school_name
          from app.students s join app.enrollments e on e.student_id=s.id and e.ended_on is null
          join app.classes c on c.id=e.class_id join app.schools sc on sc.id=s.school_id
          where app_private.owns_child(s.school_id,s.id) order by s.name""").fetchall()

    @app.get(PREFIX + "/me/children/{student_id}/attendance")
    def child_attendance(student_id: UUID, conn=Depends(database)):
        child = require_row(conn, "students", student_id)
        if not conn.execute("select app_private.owns_child(%s,%s) as ok",(child["school_id"],student_id)).fetchone()["ok"]:
            raise HTTPException(404, "Child unavailable.")
        return conn.execute("""select a.* from app.attendance a join app.enrollments e on e.id=a.enrollment_id
            where e.student_id=%s order by a.attendance_date desc limit 90""", (student_id,)).fetchall()

    @app.get(PREFIX + "/me/guardian-links")
    def guardian_links(conn=Depends(database)):
        return conn.execute("select app_private.my_guardian_links() as data").fetchone()["data"]

    @app.delete(PREFIX + "/me/guardian-links/{link_id}/consent")
    def withdraw_consent(link_id: UUID, conn=Depends(database)):
        return write(conn,"withdraw_consent",None,link_id=link_id)

    from .onboarding import register_onboarding
    register_onboarding(app, settings, pool, database, passwords)
    from .schools import register_schools
    register_schools(app,settings,pool,database,passwords)
    from .accounts import register_accounts
    register_accounts(app,settings,pool,database,passwords)
    from .roster import register_roster
    register_roster(app,database)
    return app

app = create_app()

