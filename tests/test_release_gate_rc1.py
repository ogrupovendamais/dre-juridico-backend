from release_gate_rc1 import assess, CHECKS

def test_no_evidence_fails_closed():
    data=assess()
    assert data['commercial_release']=='BLOCKED'
    assert len(data['criteria'])==len(CHECKS)
    assert all(x['status']=='blocked_no_evidence' for x in data['criteria'])

def test_boolean_not_sufficient_for_approval():
    data=assess({key:{'passed':True} for key in CHECKS})
    assert data['commercial_release']=='BLOCKED'

def test_partial_attestation_remains_blocked():
    key=next(iter(CHECKS))
    data=assess({key:{'passed':True,'reviewer':'QA','artifact':'ticket-123','date':'2026-10-18'}})
    assert data['commercial_release']=='BLOCKED'
    assert sum(x['status']=='approved_with_attestation' for x in data['criteria'])==1

def test_complete_attestations_still_require_manual_signoff():
    data=assess({key:{'passed':True,'reviewer':'QA','artifact':'record','date':'2026-10-18'} for key in CHECKS})
    assert data['commercial_release']=='REQUIRES_FINAL_MANUAL_SIGNOFF'
