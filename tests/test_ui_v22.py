from pathlib import Path

WEB=Path(__file__).resolve().parents[1]/'web'

def test_feedback_and_navigation_semantics():
    html=(WEB/'index.html').read_text()
    js=(WEB/'app.js').read_text()
    assert 'id="request-feedback"' in html
    assert 'aria-live="polite"' in html
    assert 'aria-current' in js
    assert 'prefers-reduced-motion' in js
    assert 'pendingRequests22' in js

def test_mobile_does_not_offer_financial_forms():
    html=(WEB/'index.html').read_text()
    assert 'class="mobile-nav"' in html
    assert 'class="desktop-only"' in html
    assert 'data-view="lancamentos"' in html
