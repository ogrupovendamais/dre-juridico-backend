from pathlib import Path
import uuid
from fastapi.testclient import TestClient
import server


def test_v28_persists_only_key_and_digest_in_session_tab():
    js=(Path(__file__).resolve().parents[1]/'web/app.js').read_text(encoding='utf-8')
    assert "sessionStorage.setItem(storageKey,idempotencyKey)" in js
    assert "sessionStorage.getItem(storageKey)" in js
    assert "crypto.subtle.digest('SHA-256'" in js
    assert 'response.status>=400&&response.status<500' in js
    assert 'if(storageKey){sessionStorage.removeItem(storageKey)' in js
    assert 'clearPendingFinancial28();' in js
    assert "sessionStorage.setItem(storageKey,options.body)" not in js


def test_v28_replay_after_new_session_client_does_not_duplicate():
    c=TestClient(server.app)
    suffix=uuid.uuid4().hex[:12]
    email=suffix+'@test.invalid'
    server.bootstrap('Recovery '+suffix,email,'Senha de exemplo muito forte 123')
    tk=c.post('/api/login',json={'email':email,'password':'Senha de exemplo muito forte 123'}).json()['token']
    h={'Authorization':'Bearer '+tk,'Idempotency-Key':'recover_'+uuid.uuid4().hex}
    data={'tipo':'receita','data':'2026-08-10','descricao':'Contrato exemplo','area':'Trabalhista','valor':'150.00'}
    # Repeat request with a new HTTP client as if browser reloaded.
    response=c.post('/api/entries',headers=h,json=data)
    assert response.status_code in (200,201),response.text
    with TestClient(server.app) as c2:
        retry=c2.post('/api/entries',headers=h,json=data)
        assert retry.status_code in (200,201),retry.text
        assert response.json()==retry.json()
        different=c2.post('/api/entries',headers=h,json={**data,'descricao':'Outro contrato'})
        assert different.status_code==409
