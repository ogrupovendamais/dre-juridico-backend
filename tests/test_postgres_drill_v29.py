import pytest
from postgres_drill29 import require_disposable


def test_postgres_drill_refuses_missing_confirmation():
    with pytest.raises(ValueError,match='DESCARTAVEL'):
        require_disposable('postgresql+psycopg://user:pass@localhost/test', False)


def test_postgres_drill_refuses_non_postgres():
    with pytest.raises(ValueError,match='PostgreSQL'):
        require_disposable('sqlite:///test.db', True)


def test_postgres_drill_refuses_admin_db():
    with pytest.raises(ValueError,match='dedicado'):
        require_disposable('postgresql+psycopg://user:pass@localhost/postgres', True)
