from pathlib import Path

def test_ui_v17():
 r=Path(__file__).resolve().parents[1]
 h=(r/'web/index.html').read_text()
 j=(r/'web/app.js').read_text()
 for token in ['bills-search','bills-status','bills-size','bills-prev','bills-next','bank-search','bank-filter']:
  assert f'id="{token}"' in h
 assert 'function renderBills()' in j
 assert 'function renderBankRows()' in j
