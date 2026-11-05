from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import psycopg
import pytest
from app.roster import parse_roster
from fastapi import HTTPException
B='/api/v1/classes/'
CSV='name,admission_number,roll_number\nFictitious One,IMPORT-01,901\n"Fictitious, Two",IMPORT-02,902\n'
def path(env,end='import-preview',cid=None):return B+(cid or env['ids']['class_a'])+'/students/'+end

def test_preview_has_no_writes_and_commit_is_atomic_idempotent(env):
 c=env['login']('teacher_a');before=c.get(B+env['ids']['class_a']).json()['students'];key=str(uuid4())
 r=c.post(path(env),json={'csv':CSV});assert r.status_code==200,r.text
 assert r.json()['ready'] and r.json()['total']==2 and r.json()['rows'][1]['name']=='Fictitious, Two'
 assert c.get(B+env['ids']['class_a']).json()['students']==before
 data={'csv':CSV,'request_id':key}
 r=c.post(path(env,'import'),json=data);assert r.status_code==200,r.text
 assert r.json()=={'imported':True,'count':2,'replayed':False}
 assert c.post(path(env,'import'),json=data).json()['replayed']
 assert len(c.get(B+env['ids']['class_a']).json()['students'])==len(before)+2
 assert c.post(path(env,'import'),json=data|{'csv':CSV.replace('IMPORT-01','DIFFERENT')}).status_code==409
 with psycopg.connect(env['owner']) as db:
  assert db.execute("select count(*) from app_private.audit_events where action='roster_imported'").fetchone()[0]==1
  assert db.execute("select count(*) from app_private.guardian_links where student_id in (select id from app.students where admission_number like 'IMPORT-%')").fetchone()[0]==0

@pytest.mark.parametrize('role',['parent_a','teacher_b','foreign_admin'])
def test_roster_import_is_class_scoped(env,role):
 c=env['login'](role)
 for action in ['import-preview','import']:
  data={'csv':CSV}|({'request_id':str(uuid4())} if action=='import' else {})
  assert c.post(path(env,action),json=data).status_code==404

def test_invalid_rows_block_entire_import(env):
 c=env['login']('admin');bad=CSV+'Missing admission,,903\nDuplicate roll,IMPORT-03,901\n'
 r=c.post(path(env),json={'csv':bad});assert r.status_code==200,r.text
 assert not r.json()['ready'] and r.json()['invalid']==3
 assert 'Duplicate roll number in this file.' in r.json()['rows'][0]['errors']
 assert c.post(path(env,'import'),json={'csv':bad,'request_id':str(uuid4())}).status_code==409
 with psycopg.connect(env['owner']) as db:assert db.execute("select count(*) from app.students where admission_number like 'IMPORT-%'").fetchone()[0]==0

def test_existing_school_admission_and_class_roll_conflicts_are_safe(env):
 c=env['login']('teacher_a')
 with psycopg.connect(env['owner']) as db:
  row=db.execute('select s.admission_number,e.roll_number from app.students s join app.enrollments e on e.student_id=s.id where e.class_id=%s limit 1',(env['ids']['class_a'],)).fetchone()
 content=f'name,admission_number,roll_number\nFictitious Existing,{row[0]},999\nFictitious Roll,IMPORT-NEW,{row[1]}\n'
 r=c.post(path(env),json={'csv':content});assert r.status_code==200
 assert r.json()['invalid']==2
 assert 'Admission number is already in use in this school.' in r.json()['rows'][0]['errors']
 assert 'Roll number is already in use in this class.' in r.json()['rows'][1]['errors']

def test_recheck_after_preview_and_after_assignment_revoked(env):
 c=env['login']('teacher_a');admin=env['login']('admin')
 assert c.post(path(env),json={'csv':CSV}).json()['ready']
 admin.post(B+env['ids']['class_a']+'/students',json={'name':'Fictitious Later','admission_number':'IMPORT-01','roll_number':'999'})
 assert c.post(path(env,'import'),json={'csv':CSV,'request_id':str(uuid4())}).status_code==409
 with psycopg.connect(env['owner']) as db:
  assert db.execute("select count(*) from app.students where admission_number='IMPORT-02'").fetchone()[0]==0
  db.execute('update app_private.class_assignments set revoked_at=now() where teacher_id=%s',(env['accounts']['teacher_a']['id'],))
 assert c.post(path(env,'import'),json={'csv':CSV,'request_id':str(uuid4())}).status_code==404

def test_deactivated_class_and_suspended_teacher_are_denied(env):
 c=env['login']('teacher_a')
 with psycopg.connect(env['owner']) as db:db.execute("update app.classes set status='inactive' where id=%s",(env['ids']['class_a'],))
 assert c.post(path(env),json={'csv':CSV}).status_code==404
 with psycopg.connect(env['owner']) as db:
  db.execute("update app.classes set status='active' where id=%s",(env['ids']['class_a'],))
  db.execute('update app_private.school_memberships set suspended_at=now() where user_id=%s',(env['accounts']['teacher_a']['id'],))
 assert c.post(path(env),json={'csv':CSV}).status_code==404

def test_import_csrf_and_identity_injection_rejected(env):
 c=env['login']('teacher_a')
 assert env['root'].post(path(env),json={'csv':CSV}).status_code==401
 assert c.post(path(env),json={'csv':CSV},headers={'X-CSRF-Token':'wrong'}).status_code==403
 assert c.post(path(env,'import'),json={'csv':CSV,'request_id':str(uuid4()),'school_id':env['ids']['school']}).status_code==422
 assert c.post(path(env,'import'),json={'csv':CSV}).status_code==422

def test_retry_concurrency_cannot_add_twice(env):
 c=env['login']('teacher_a');data={'csv':CSV,'request_id':str(uuid4())}
 with ThreadPoolExecutor(max_workers=2) as executor:
  replies=list(executor.map(lambda _:c.post(path(env,'import'),json=data),range(2)))
 assert [r.status_code for r in replies]==[200,200]
 assert sorted(r.json()['replayed'] for r in replies)==[False,True]
 with psycopg.connect(env['owner']) as db:assert db.execute("select count(*) from app.students where admission_number like 'IMPORT-%'").fetchone()[0]==2

@pytest.mark.parametrize('text',[
 '', 'name,roll_number\nA,1', 'name,name,roll_number\nA,B,1',
 'name,admission_number,roll_number,phone\nA,ADM,1,0300',
 'name,admission_number,roll_number\n',
 'name,admission_number,roll_number\nA,ADM,1,extra',
 'name,admission_number,roll_number\n"Unclosed,ADM,1',
 'name,admission_number,roll_number\nA,ADM,\x00',
 'name,admission_number,roll_number\n'+''.join(f'A,A{i},{i}\n' for i in range(201)),
 'name,admission_number,roll_number\n'+('x'*100_000),
])
def test_csv_parser_rejects_invalid_structure_and_limits(text):
 with pytest.raises(HTTPException):parse_roster(text)

def test_csv_bom_crlf_reordered_headers_and_quoted_names():
 rows=parse_roster('\ufeffroll_number,name,admission_number\r\n001,"Fictitious, Ali",ADM001\r\n\r\n')
 assert rows==[{'roll_number':'001','name':'Fictitious, Ali','admission_number':'ADM001','row':2}]

def test_school_wide_conflicts_do_not_expose_other_class_names(env):
 c=env['login']('teacher_a')
 with psycopg.connect(env['owner']) as db:
  row=db.execute('select s.admission_number,s.name from app.students s join app.enrollments e on e.student_id=s.id where e.class_id=%s limit 1',(env['ids']['class_b'],)).fetchone()
 content='name,admission_number,roll_number\nNew Import,'+row[0]+',998\n'
 r=c.post(path(env),json={'csv':content})
 assert r.status_code==200 and not r.json()['ready']
 assert row[1] not in r.text

def test_largest_batch_preserves_identifiers_and_parent_isolation(env):
 c=env['login']('teacher_a');parent=env['login']('parent_a')
 children=parent.get('/api/v1/me/children').json();reports=parent.get('/api/v1/reports').json()
 content='name,admission_number,roll_number\n'+''.join(f'Fictitious Student {i},BULK-{i:04},{i:04}\n' for i in range(1000,1200))
 r=c.post(path(env,'import'),json={'csv':content,'request_id':str(uuid4())})
 assert r.status_code==200 and r.json()['count']==200
 assert parent.get('/api/v1/me/children').json()==children
 assert parent.get('/api/v1/reports').json()==reports
 with psycopg.connect(env['owner']) as db:
  assert db.execute("select count(*) from app.students where admission_number like 'BULK-%'").fetchone()[0]==200

def test_different_requests_for_same_rows_cannot_duplicate(env):
 c=env['login']('teacher_a')
 with ThreadPoolExecutor(max_workers=2) as executor:
  replies=list(executor.map(lambda _:c.post(path(env,'import'),json={'csv':CSV,'request_id':str(uuid4())}),range(2)))
 assert sorted(r.status_code for r in replies)==[200,409]
