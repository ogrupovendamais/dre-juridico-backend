from test_server import server,client,signin
from operations20 import status, EXPECTED_SCHEMA

def test_preflight_403_viewer_and_tenant_stats():
    office=server.bootstrap('Preflight 20','preflight-admin@example.test','piloto-admin-seguro-20')
    server.create_user(office,'preflight-viewer@example.test','piloto-viewer-seguro-20')
    admin=signin('preflight-admin@example.test','piloto-admin-seguro-20')
    viewer=signin('preflight-viewer@example.test','piloto-viewer-seguro-20')
    assert client.get('/api/admin/preflight',headers=viewer).status_code==403
    r=client.get('/api/admin/preflight',headers=admin)
    assert r.status_code==200,r.text
    data=r.json()
    assert EXPECTED_SCHEMA in data['schema_versions']
    assert data['schema_current'] and data['integrity_pass']
    assert data['office_count']>=1
    assert client.get('/api/admin/preflight').status_code==401

def test_preflight_headers_and_idempotent_schema():
    from operations20 import upgrade
    upgrade(server.db)
    with server.db() as c:
        from sqlalchemy import text
        assert c.execute(text('SELECT COUNT(*) FROM schema_history WHERE version=20')).scalar_one()==1
    r=client.get('/api/me')
    assert r.headers['cache-control']=='no-store'
    assert r.headers['permissions-policy'].startswith('camera=()')
