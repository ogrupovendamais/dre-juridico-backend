from postgres_probe_rc3 import validate_test_url, probe
import pytest

@pytest.mark.parametrize('raw', ['','sqlite:///temp.db','postgresql://u:p@localhost/postgres','postgresql://u:p@localhost/template1'])
def test_guard_rejects_unsafe_url(raw):
    with pytest.raises(ValueError):validate_test_url(raw)

def test_credentials_never_in_success_report():
    class Connection:
        def __enter__(self):return self
        def __exit__(self,*a):return False
        def execute(self,statement):
            class Result:
                def scalar_one(self):return '16.3' if 'server_version' in str(statement) else 1
            return Result()
        def rollback(self):pass
    class Engine:
        def connect(self):return Connection()
        def dispose(self):pass
    report=probe('postgresql+psycopg://user:supersecret@localhost:5432/dre_test',lambda *a,**k:Engine())
    assert report['postgresql_connection']=='passed'
    assert report['business_routes_tested'] is False
    assert report['commercial_release']=='BLOCKED'
    assert 'supersecret' not in str(report)

def test_connect_error_is_redacted():
    def broken(*a,**k):raise RuntimeError('bad password SUPERSECRET')
    report=probe('postgresql://user:pass@localhost/dre_test',broken)
    assert report['postgresql_connection']=='failed'
    assert 'SUPERSECRET' not in str(report)
