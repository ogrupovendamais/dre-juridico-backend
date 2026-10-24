import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)

def test_capacity_overhead_and_tenant():
    suffix=uuid.uuid4().hex[:12];pw='senha_super_segura_123'
    a=server.bootstrap('A'+suffix,suffix+'a@a.example',pw)
    server.bootstrap('B'+suffix,suffix+'b@a.example',pw)
    server.create_user(a,suffix+'v@a.example',pw)
    def head(mail):
        r=c.post('/api/login',json={'email':suffix+mail+'@a.example','password':pw});assert r.status_code==200
        return {'Authorization':'Bearer '+r.json()['token']}
    ha,hb,hv=head('a'),head('b'),head('v')
    def make(path,body,h=ha):
        res=c.post('/api/'+path,json=body,headers=h);assert res.status_code==201,res.text;return res.json()['id']
    customer=make('customers',{'name':'Cliente teste'})
    contract=make('contracts',{'customer_id':customer,'label':'Contrato Teste','fee_type':'fixo'})
    pro=make('productivity/professionals',{'name':'Pessoa teste','hourly_cost':'100.00'})
    make('productivity/worklogs',{'professional_id':pro,'contract_id':contract,'date':'2026-10-16','minutes':120})
    payload={'professional_id':pro,'month':'2026-10','available_minutes':600}
    assert c.post('/api/planning/capacity',json=payload,headers=hv).status_code==403
    assert c.post('/api/planning/capacity',json=payload,headers=hb).status_code==422
    make('planning/capacity',payload)
    overhead={'month':'2026-10','label':'Estrutura compartilhada','amount':'200.00','basis':'minutes_logged','source_note':'Hipótese manual sem lançamento na DRE'}
    assert c.post('/api/planning/overhead',json=overhead,headers=hv).status_code==403
    make('planning/overhead',overhead)
    x=c.get('/api/planning?month=2026-10',headers=hv).json()
    assert x['professionals'][0]['utilization_pct']==20
    assert x['pools'][0]['allocations'][0]['allocated_cents']==20000
    assert x['pools'][0]['status']=='SIMULATION_ONLY'
    assert c.get('/api/planning?month=2026-10',headers=hb).json()['pools']==[]
    assert c.post('/api/planning/overhead',json={**overhead,'amount':'1.001'},headers=ha).status_code==422
    assert c.post('/api/planning/overhead',json={**overhead,'basis':'revenue'},headers=ha).status_code==422
    assert c.get('/api/planning?month=2026-13',headers=ha).status_code==422
    empty=c.get('/api/planning?month=2026-11',headers=ha).json()
    assert empty['professionals'][0]['utilization_pct'] is None
    make('planning/overhead',{**overhead,'month':'2026-11'})
    x=c.get('/api/planning?month=2026-11',headers=ha).json()
    assert x['pools'][0]['status']=='NO_ALLOCATION_BASIS' and x['pools'][0]['unallocated_cents']==20000
