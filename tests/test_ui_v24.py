from pathlib import Path
WEB=Path(__file__).resolve().parents[1]/'web'

def test_v24_submit_guard_and_keyboard_nav():
    app=(WEB/'app.js').read_text()
    assert 'pendingForms24' in app and 'stopImmediatePropagation' in app
    assert "'ArrowLeft','ArrowRight'" in app
    assert 'pendingRequests22' in app

def test_v24_brand_links_and_styles():
    html=(WEB/'index.html').read_text()
    assert 'https://lp.grupovendamaistech.com.br/' in html
    assert 'https://wa.me/5515998417512' in html
    assert '#010E38' in html and '#EBB52C' in html
    assert 'btn[aria-busy' in html
