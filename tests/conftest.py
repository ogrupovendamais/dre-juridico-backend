import os
import uuid
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

if not os.environ.get('DRE_MFA_FERNET_KEY'):
    os.environ['DRE_MFA_FERNET_KEY'] = Fernet.generate_key().decode()

_original_post = TestClient.post

def _post_with_key(self, url, *args, **kwargs):
    if url in ('/api/entries','/api/bills') or (url.startswith('/api/bills/') and url.endswith('/settle')):
        headers = dict(kwargs.pop('headers', {}) or {})
        headers.setdefault('Idempotency-Key', 'test_' + uuid.uuid4().hex)
        kwargs['headers'] = headers
    return _original_post(self, url, *args, **kwargs)

TestClient.post = _post_with_key
