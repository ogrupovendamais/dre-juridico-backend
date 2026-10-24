import os, tempfile
fd,path=tempfile.mkstemp(suffix='.db');os.close(fd)
os.environ['DATABASE_URL']='sqlite:///'+path
from fastapi.testclient import TestClient
import server
client=TestClient(server.app)

def test_password_rotation_revokes_all_sessions_and_isolation():
    server.bootstrap('Test Office','security@demo.test','old password123')
    server.bootstrap('Other Office','other-security@demo.test','other password123')
    def login(email,pw):
        result=client.post('/api/login',json={'email':email,'password':pw})
        assert result.status_code==200,result.text
        return {'Authorization':'Bearer '+result.json()['token']}
    first=login('security@demo.test','old password123')
    second=login('security@demo.test','old password123')
    other=login('other-security@demo.test','other password123')
    wrong=client.post('/api/account/change-password',headers=first,json={'current_password':'incorrect','new_password':'new password123'})
    assert wrong.status_code==403
    assert client.get('/api/me',headers=first).status_code==200
    assert client.post('/api/account/change-password',headers=first,json={'current_password':'old password123','new_password':'new password123'}).status_code==200
    assert client.get('/api/me',headers=first).status_code==401
    assert client.get('/api/me',headers=second).status_code==401
    assert client.get('/api/me',headers=other).status_code==200
    assert client.post('/api/login',json={'email':'security@demo.test','password':'old password123'}).status_code==401
    updated=login('security@demo.test','new password123')
    assert client.get('/api/me',headers=updated).status_code==200
    assert client.get('/api/me',headers=updated).headers['cache-control']=='no-store'
    assert client.get('/',headers=updated).headers['x-frame-options']=='DENY'
