"""Opt-in fictional development accounts. Never used by application startup."""
from pathlib import Path
from uuid import uuid4
import json
import os
import secrets
from dotenv import dotenv_values
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pwdlib import PasswordHash

ROOT = Path(__file__).resolve().parents[1]
HASHER = PasswordHash.recommended()

def seed(conn):
    ids = {name: str(uuid4()) for name in (
        "school", "foreign_school", "class_a", "class_b", "inactive_class", "foreign_class",
        "child_a", "child_b", "child_other", "foreign_child",
        "enrollment_a", "enrollment_b", "enrollment_other", "foreign_enrollment",
        "exam", "subject", "report_a", "report_other")}
    accounts = {}
    for role in ("admin", "teacher_a", "teacher_b", "parent_a", "parent_b", "foreign_admin"):
        user_id, password = str(uuid4()), secrets.token_urlsafe(18)
        email = role + "@parentreport.example.test"
        name = "Local " + role.replace("_", " ").title()
        conn.execute("insert into app_private.users(id,display_name,email,password_hash) values(%s,%s,%s,%s)",
                     (user_id,name,email,HASHER.hash(password)))
        accounts[role] = {"id":user_id,"email":email,"password":password}
    for key, name, slug in (("school","Bright Future Academy · Local fixtures","parentreport-local-fixtures"),
                             ("foreign_school","Separate School · Local fixtures","parentreport-separate-fixtures")):
        conn.execute("insert into app.schools(id,name,slug,city) values(%s,%s,%s,'Lahore')",(ids[key],name,slug))
    for school, account, role in (("school","admin","school_admin"),("school","teacher_a","class_teacher"),
                                 ("school","teacher_b","class_teacher"),("foreign_school","foreign_admin","school_admin")):
        conn.execute("insert into app_private.school_memberships(school_id,user_id,role) values(%s,%s,%s)",
                     (ids[school],accounts[account]["id"],role))
    for key, school, grade, status in (("class_a","school","6","active"),("class_b","school","7","active"),
                                     ("inactive_class","school","8","inactive"),("foreign_class","foreign_school","6","active")):
        conn.execute("""insert into app.classes(id,school_id,grade,section,academic_year,status,sending_enabled)
                        values(%s,%s,%s,'A','2026-27',%s,true)""",(ids[key],ids[school],grade,status))
    for cls, teacher in (("class_a","teacher_a"),("class_b","teacher_b"),("inactive_class","teacher_a")):
        conn.execute("insert into app_private.class_assignments(school_id,class_id,teacher_id) values(%s,%s,%s)",
                     (ids["school"],ids[cls],accounts[teacher]["id"]))
    for key, en, cls, school, name in (
        ("child_a","enrollment_a","class_a","school","Ahmed · Fictional"),
        ("child_b","enrollment_b","class_b","school","Ayesha · Fictional"),
        ("child_other","enrollment_other","class_a","school","Bilal · Fictional"),
        ("foreign_child","foreign_enrollment","foreign_class","foreign_school","Separate Child · Fictional")):
        conn.execute("insert into app.students(id,school_id,name,admission_number) values(%s,%s,%s,%s)",
                     (ids[key],ids[school],name,"LOCAL-"+key))
        conn.execute("insert into app.enrollments(id,school_id,class_id,student_id,roll_number) values(%s,%s,%s,%s,%s)",
                     (ids[en],ids[school],ids[cls],ids[key],key))
    # No real numbers and no OTP claim: these are explicitly synthetic fixture links.
    for account, children in (("parent_a",("child_a","child_b")),("parent_b",("child_other",))):
        contact = str(uuid4())
        conn.execute("""insert into app_private.guardian_contacts(id,user_id,phone_ciphertext,phone_hmac,phone_masked,verified_at)
                     values(%s,%s,'SYNTHETIC-FIXTURE-NO-PHONE',%s,'Fictional guardian contact',now())""",
                     (contact,accounts[account]["id"],secrets.token_hex(32)))
        for child in children:
            link = str(uuid4())
            ids["link_"+child] = link
            conn.execute("""insert into app_private.guardian_links(id,school_id,student_id,guardian_id,contact_id,verified_at)
                         values(%s,%s,%s,%s,%s,now())""",(link,ids["school"],ids[child],accounts[account]["id"],contact))
            conn.execute("""insert into app_private.guardian_consents(school_id,link_id,student_id,policy_version,consent_text)
                         values(%s,%s,%s,'local-fixture-v1','Fictitious local testing only. Not real parent consent.')""",
                         (ids["school"],link,ids[child]))
    conn.execute("""insert into app.exams(id,school_id,class_id,name,exam_date,status)
                 values(%s,%s,%s,'October Assessment · Local fixtures','2026-10-31','published')""",
                 (ids["exam"],ids["school"],ids["class_a"]))
    conn.execute("""insert into app.exam_subjects(id,school_id,class_id,exam_id,name,maximum_marks) values(%s,%s,%s,%s,'Mathematics',100)""",
                 (ids["subject"],ids["school"],ids["class_a"],ids["exam"]))
    for child,en,report,obtained in (("child_a","enrollment_a","report_a",85),("child_other","enrollment_other","report_other",72)):
        conn.execute("""insert into app.marks(school_id,class_id,exam_id,subject_id,enrollment_id,maximum_marks,obtained)
                     values(%s,%s,%s,%s,%s,100,%s)""",
                     (ids["school"],ids["class_a"],ids["exam"],ids["subject"],ids[en],obtained))
        snapshot = {"student_name":"Ahmed · Fictional" if child=="child_a" else "Bilal · Fictional",
                    "school_name":"Bright Future Academy · Local fixtures","class_name":"Class 6-A",
                    "exam_name":"October Assessment · Local fixtures","exam_date":"2026-10-31",
                    "subjects":[{"name":"Mathematics","obtained":obtained,"maximum":100}],"total":obtained,"maximum":100}
        conn.execute("""insert into app.report_versions(id,school_id,class_id,exam_id,enrollment_id,student_id,version,snapshot,published_by)
                     values(%s,%s,%s,%s,%s,%s,1,%s,%s)""",
                     (ids[report],ids["school"],ids["class_a"],ids["exam"],ids[en],ids[child],Jsonb(snapshot),accounts["admin"]["id"]))
    return {"accounts":accounts,"ids":ids,"notice":"Fictional local accounts. Passwords are generated; do not commit this file."}

def main():
    values = dotenv_values(ROOT / ".env")
    if os.environ.get("APP_ENV",values.get("APP_ENV","development")) == "production":
        raise SystemExit("Local fixtures are disabled in production.")
    url = os.environ.get("MIGRATION_DATABASE_URL") or values.get("MIGRATION_DATABASE_URL")
    if not url:
        raise SystemExit("MIGRATION_DATABASE_URL required for this local provisioning command.")
    target = ROOT / ".local" / "accounts.json"
    with psycopg.connect(url,row_factory=dict_row) as conn:
        exists = conn.execute("select 1 from app.schools where slug='parentreport-local-fixtures'").fetchone()
        if exists:
            print("Fictional fixture school already exists. Existing users/passwords were preserved.")
            print("Local credentials: backend/.local/accounts.json")
            return
        result = seed(conn)
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding="utf-8")
    print("Fictional local school/accounts created. Credentials: backend/.local/accounts.json")
    print("No passwords or real guardian contacts were printed.")

if __name__ == "__main__":
    main()

