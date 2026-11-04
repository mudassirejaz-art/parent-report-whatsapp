import hashlib
import psycopg
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings
B='/api/v1/auth'
NEW='new-account-test-password-123'

def request_reset(env,role='admin'):
    r=env['root'].post(B+'/local-recovery',json={'email':env['accounts'][role]['email']})
    assert r.status_code==200,r.text
    return r.json()['reset_path'].split('#')[1]

@pytest.mark.parametrize('role',['admin','teacher_a','parent_a'])
def test_password_change_rotates_cookie_and_revokes_other_sessions(env,role):
    c=env['login'](role);other=env['login'](role)
    old=c.cookies.get('pr_session');old_csrf=c.headers['X-CSRF-Token']
    r=c.post(B+'/change-password',json={'current_password':env['accounts'][role]['password'],'new_password':NEW})
    assert r.status_code==200,r.text
    assert r.json()['id']==env['accounts'][role]['id']
    assert c.cookies.get('pr_session')!=old and r.json()['csrf_token']!=old_csrf
    assert other.get(B+'/me').status_code==401
    assert c.get(B+'/me').status_code==200
    c.headers['X-CSRF-Token']=r.json()['csrf_token']
    assert len(c.get(B+'/sessions').json())==1
    account=env['accounts'][role]
    assert env['root'].post(B+'/login',json={'email':account['email'],'password':account['password']}).status_code==401
    assert env['root'].post(B+'/login',json={'email':account['email'],'password':NEW}).status_code==200

def test_bad_password_validation_csrf_and_durable_limit(env):
    c=env['login']('admin');body={'current_password':'wrong','new_password':NEW}
    assert c.post(B+'/change-password',json=body,headers={'X-CSRF-Token':'wrong'}).status_code==403
    assert c.post(B+'/change-password',json=body|{'new_password':'short'}).status_code==422
    for _ in range(5): assert c.post(B+'/change-password',json=body).status_code==400
    assert c.post(B+'/change-password',json=body).status_code==429
    assert c.get(B+'/me').status_code==200

def test_sessions_are_private_and_revoke_only_owned(env):
    c=env['login']('admin');other=env['login']('admin');foreign=env['login']('parent_a')
    rows=c.get(B+'/sessions').json()
    assert len(rows)==2 and sum(x['current'] for x in rows)==1
    assert set(rows[0])=={'id','current','created_at','expires_at'}
    foreign_id=foreign.get(B+'/sessions').json()[0]['id']
    assert c.delete(B+'/sessions/'+foreign_id).status_code==404
    sid=next(x['id'] for x in rows if not x['current'])
    assert c.delete(B+'/sessions/'+sid).status_code==200
    assert other.get(B+'/me').status_code==401 and foreign.get(B+'/me').status_code==200
    assert c.get(B+'/me').status_code==200

def test_sign_out_others_and_current(env):
    c=env['login']('teacher_a');other=env['login']('teacher_a')
    assert c.post(B+'/sessions/revoke-others').json()['revoked']==1
    assert other.get(B+'/me').status_code==401
    own=c.get(B+'/sessions').json()[0]['id']
    assert c.delete(B+'/sessions/'+own).status_code==200
    assert c.get(B+'/me').status_code==401

def test_local_recovery_is_hashed_single_use_and_revokes_sessions(env):
    c=env['login']('admin');token=request_reset(env)
    with psycopg.connect(env['owner']) as db:
        row=db.execute('select token_hash,is_simulation from app_private.password_resets').fetchone()
        assert row==(hashlib.sha256(token.encode()).hexdigest(),True)
    data={'token':token,'new_password':NEW}
    r=env['root'].post(B+'/local-recovery/complete',json=data)
    assert r.status_code==200 and r.json()['is_simulation']
    assert 'set-cookie' not in r.headers
    assert c.get(B+'/me').status_code==401
    assert env['root'].post(B+'/local-recovery/complete',json=data).status_code==400
    assert env['root'].post(B+'/login',json={'email':env['accounts']['admin']['email'],'password':NEW}).status_code==200

@pytest.mark.parametrize('reason',['expired','replaced','disabled'])
def test_unusable_reset_capability(env,reason):
    token=request_reset(env)
    if reason=='replaced': request_reset(env)
    else:
        with psycopg.connect(env['owner']) as db:
            if reason=='expired': db.execute("update app_private.password_resets set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour'")
            else: db.execute('update app_private.users set disabled_at=now() where id=%s',(env['accounts']['admin']['id'],))
    assert env['root'].post(B+'/local-recovery/complete',json={'token':token,'new_password':NEW}).status_code==400

def test_unknown_email_has_same_shape_and_rate_is_durable(env):
    root=env['root']
    for _ in range(3):
        r=root.post(B+'/local-recovery',json={'email':'unknown@example.test'})
        assert r.status_code==200 and set(r.json())=={'is_simulation','reset_path','expires_in_seconds'}
    assert root.post(B+'/local-recovery',json={'email':'unknown@example.test'}).status_code==429
    token=r.json()['reset_path'].split('#')[1]
    assert root.post(B+'/local-recovery/complete',json={'token':token,'new_password':NEW}).status_code==400

def test_recovery_default_disabled_and_production_rejected(env):
    with TestClient(create_app(Settings(env['runtime']))) as c:
        assert not c.get(B+'/recovery-config').json()['local_only']
        assert c.post(B+'/local-recovery',json={'email':'unknown@example.test'}).status_code==503
        assert c.post(B+'/local-recovery/complete',json={'token':'A'*43,'new_password':NEW}).status_code==503
    with pytest.raises(RuntimeError,match='Local password recovery'):
        create_app(Settings(env['runtime'],secure_cookies=True,local_recovery=True))

def test_password_change_invalidates_pending_reset_and_stale_login(env):
    c=env['login']('admin');token=request_reset(env)
    with psycopg.connect(env['owner']) as db:
        old=db.execute('select password_hash from app_private.users where id=%s',(env['accounts']['admin']['id'],)).fetchone()[0]
    r=c.post(B+'/change-password',json={'current_password':env['accounts']['admin']['password'],'new_password':NEW})
    assert r.status_code==200
    assert env['root'].post(B+'/local-recovery/complete',json={'token':token,'new_password':NEW}).status_code==400
    with psycopg.connect(env['runtime']) as db:
        assert not db.execute('select app_private.start_authenticated_session(%s,%s,%s,%s,%s)',(env['accounts']['admin']['id'],old,'a'*64,'csrf','b'*64)).fetchone()[0]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute('select app_private.create_api_session(%s,%s,%s)',(env['accounts']['admin']['id'],'c'*64,'csrf'))

def test_login_account_switch_revokes_previous_cookie_session(env):
    c=env['login']('admin');old=c.cookies.get('pr_session')
    account=env['accounts']['parent_a']
    assert c.post(B+'/login',json={'email':account['email'],'password':account['password']}).status_code==200
    with TestClient(env['app']) as previous:
        previous.cookies.set('pr_session',old)
        assert previous.get(B+'/me').status_code==401

def test_unauthenticated_and_cross_origin_security_endpoints(env):
    root=env['root']
    assert root.get(B+'/sessions').status_code==401
    assert root.post(B+'/change-password',json={'current_password':'wrong','new_password':NEW}).status_code==401
    assert root.post(B+'/local-recovery',json={'email':'a@example.test'},headers={'Origin':'https://untrusted.example'}).status_code==403
