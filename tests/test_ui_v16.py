from pathlib import Path

def test_filters_and_navigation_markup():
    root=Path(__file__).resolve().parents[1]
    html=(root/'web/index.html').read_text()
    js=(root/'web/app.js').read_text()
    for token in ('entries-search','entries-kind','entries-month','entries-clear','entries-filter-count','nav-heading'):
        assert token in html
    assert 'function filterEntries()' in js
    assert 'filterEntries()' in js
    assert 'data-record-id' in js
    assert 'Os totais gerais não são alterados pelos filtros' in js
