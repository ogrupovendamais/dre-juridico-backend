"""Transactional idempotency guard for sensitive write routes.

Requires a client-provided unique Idempotency-Key per intended operation.
Duplicate attempts with identical content return the original response; reuse
with a different payload is a conflict. Unique constraint serializes competing
requests where the database provides transactional unique-index locks.
"""
import hashlib
import json
import re
import secrets
from fastapi import HTTPException
from sqlalchemy import text

KEY_RE = re.compile(r'^[A-Za-z0-9_-]{12,128}$')

def setup(db):
    with db() as c:
        c.execute(text('''CREATE TABLE IF NOT EXISTS idempotency_requests (
            id VARCHAR(40) PRIMARY KEY, office_id VARCHAR(40) NOT NULL,
            user_id VARCHAR(40) NOT NULL, operation VARCHAR(80) NOT NULL,
            request_key VARCHAR(128) NOT NULL, payload_hash CHAR(64) NOT NULL,
            response_json TEXT, UNIQUE(office_id,user_id,operation,request_key))'''))

def fingerprint(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'),ensure_ascii=False).encode()).hexdigest()

def reserve(c,u,operation,key,payload):
    if key is None:
        raise HTTPException(428,'Envie Idempotency-Key para esta operacao financeira')
    if not KEY_RE.fullmatch(key):
        raise HTTPException(422,'Idempotency-Key deve ter 12 a 128 caracteres ASCII (letras, numeros, _ ou -)')
    digest=fingerprint(payload)
    c.execute(text('''INSERT INTO idempotency_requests
        (id,office_id,user_id,operation,request_key,payload_hash,response_json)
        VALUES (:id,:o,:u,:op,:k,:hash,NULL)
        ON CONFLICT (office_id,user_id,operation,request_key) DO NOTHING'''),
        {'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'], 'op':operation,'k':key,'hash':digest})
    row=c.execute(text('''SELECT payload_hash,response_json FROM idempotency_requests
       WHERE office_id=:o AND user_id=:u AND operation=:op AND request_key=:k'''),
       {'o':u['office_id'],'u':u['id'],'op':operation,'k':key}).fetchone()
    if not row or row[0]!=digest:
        raise HTTPException(409,'Chave idempotente reutilizada com dados diferentes')
    if row[1] is not None:
        return json.loads(row[1])
    # row with NULL is the reservation inserted in this transaction;
    # a second transaction on SQLite / PostgreSQL waits for the unique lock.
    return None

def finish(c,u,operation,key,response):
    c.execute(text('''UPDATE idempotency_requests SET response_json=:v
      WHERE office_id=:o AND user_id=:u AND operation=:op AND request_key=:k'''),
      {'v':json.dumps(response,separators=(',',':')),'o':u['office_id'],'u':u['id'],'op':operation,'k':key})
