import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
import server

c = TestClient(server.app)

def login(email, password):
    r = c.post('/api/login', json={'email': email, 'password': password})
    assert r.status_code == 200, r.text
    return {'Authorization': 'Bearer ' + r.json()['token']}

def test_dre_groups_and_system_defaults():
    tag = uuid.uuid4().hex[:8]
    a = server.bootstrap('Escritório Alpha ' + tag, tag + 'alpha@test.dev', 'Senha Alpha 12345')
    ha = login(tag + 'alpha@test.dev', 'Senha Alpha 12345')

    # 1. Obter grupos DRE
    r_groups = c.get('/api/dre-groups', headers=ha)
    assert r_groups.status_code == 200
    groups = r_groups.json()
    assert len(groups) == 11  # 10 grupos DRE + G99
    assert groups[0]['code'] == '01'
    assert groups[-1]['code'] == '99'
    assert groups[-1]['affects_dre'] == 0

    # 2. Obter naturezas padrão
    r_natures = c.get('/api/operation-natures', headers=ha)
    assert r_natures.status_code == 200
    natures = r_natures.json()
    assert len(natures) >= 45  # Contém catálogo padrão
    nat_0101 = next((n for n in natures if n['id'] == 'NAT_0101'), None)
    assert nat_0101 is not None
    assert nat_0101['is_system_default'] == 1
    assert nat_0101['group_code'] == '01'
    assert nat_0101['operation_type'] == 'receita'

def test_custom_natures_multi_tenant_isolation_and_permissions():
    tag = uuid.uuid4().hex[:8]
    office_a = server.bootstrap('Escritório A ' + tag, tag + 'a@test.dev', 'Senha Forte A 12345')
    office_b = server.bootstrap('Escritório B ' + tag, tag + 'b@test.dev', 'Senha Forte B 12345')
    server.create_user(office_a, tag + 'v@test.dev', 'Senha Forte V 12345', role='viewer')

    ha = login(tag + 'a@test.dev', 'Senha Forte A 12345')
    hb = login(tag + 'b@test.dev', 'Senha Forte B 12345')
    hv = login(tag + 'v@test.dev', 'Senha Forte V 12345')

    # Visualizador não pode criar natureza
    payload = {
        'group_id': 'G01',
        'operation_type': 'receita',
        'code': '01.90.' + tag[:4],
        'name': 'Honorários de Arbitragem Personalizada',
        'description': 'Exclusivo do escritório A'
    }
    r_view = c.post('/api/operation-natures', json=payload, headers=hv)
    assert r_view.status_code == 403

    # Editor/Admin do escritório A cria natureza
    r_create = c.post('/api/operation-natures', json=payload, headers=ha)
    assert r_create.status_code == 201, r_create.text
    nat_id = r_create.json()['id']

    # Escritório A enxerga a nova natureza
    r_list_a = c.get('/api/operation-natures', headers=ha).json()
    assert any(n['id'] == nat_id for n in r_list_a)

    # Escritório B NÃO enxerga a nova natureza do escritório A (Isolamento Multi-tenant estrito)
    r_list_b = c.get('/api/operation-natures', headers=hb).json()
    assert not any(n['id'] == nat_id for n in r_list_b)

    # Escritório B não pode alterar a natureza de A
    r_hack = c.put(f'/api/operation-natures/{nat_id}', json={'name': 'Hack', 'description': 'desc', 'is_active': True}, headers=hb)
    assert r_hack.status_code == 404

def test_rules_g99_and_default_protection():
    tag = uuid.uuid4().hex[:8]
    office = server.bootstrap('Escritório Regras ' + tag, tag + 'regras@test.dev', 'Senha Forte Regras 12345')
    h = login(tag + 'regras@test.dev', 'Senha Forte Regras 12345')

    # Regra: Grupo 99 aceita somente tipo patrimonial
    invalid_g99 = {
        'group_id': 'G99',
        'operation_type': 'receita',
        'code': '99.90.' + tag[:4],
        'name': 'Tentativa Inválida Receita em G99',
        'description': ''
    }
    r1 = c.post('/api/operation-natures', json=invalid_g99, headers=h)
    assert r1.status_code == 422

    # Regra: Grupos DRE 01-10 não aceitam patrimonial
    invalid_g01 = {
        'group_id': 'G01',
        'operation_type': 'patrimonial',
        'code': '01.99.' + tag[:4],
        'name': 'Tentativa Inválida Patrimonial em G01',
        'description': ''
    }
    r2 = c.post('/api/operation-natures', json=invalid_g01, headers=h)
    assert r2.status_code == 422

    # Proteção de Nomes e Exclusão em Naturezas Padrão do Sistema
    r_edit_sys = c.put('/api/operation-natures/NAT_0101', json={'name': 'Nome Modificado Ilegal', 'description': 'desc', 'is_active': True}, headers=h)
    assert r_edit_sys.status_code == 403

    r_del_sys = c.delete('/api/operation-natures/NAT_0101', headers=h)
    assert r_del_sys.status_code == 403

    # Inativação/Ativação permitida para padrão do sistema
    r_toggle = c.post('/api/operation-natures/NAT_0101/toggle-active', headers=h)
    assert r_toggle.status_code == 200
    assert r_toggle.json()['is_active'] is False

    # Restaurar
    r_toggle_back = c.post('/api/operation-natures/NAT_0101/toggle-active', headers=h)
    assert r_toggle_back.status_code == 200
    assert r_toggle_back.json()['is_active'] is True

def test_subcategories_and_delete_protection_with_linked_records():
    tag = uuid.uuid4().hex[:8]
    office = server.bootstrap('Escritório Vínculos ' + tag, tag + 'vinc@test.dev', 'Senha Forte Vinc 12345')
    h = login(tag + 'vinc@test.dev', 'Senha Forte Vinc 12345')

    # Criar natureza customizada
    r_nat = c.post('/api/operation-natures', json={
        'group_id': 'G06',
        'operation_type': 'despesa',
        'code': '06.88.' + tag[:4],
        'name': 'Patrocínio Eventos Jurídicos OAB',
        'description': 'Marketing Institucional Permitido'
    }, headers=h)
    assert r_nat.status_code == 201
    nat_id = r_nat.json()['id']

    # Adicionar Subcategoria (Nível 3)
    r_sub = c.post(f'/api/operation-natures/{nat_id}/subcategories', json={'name': 'Congresso Direito Tributário'}, headers=h)
    assert r_sub.status_code == 201
    sub_id = r_sub.json()['id']

    # Criar uma conta contábil para o título
    acc_id = c.post('/api/accounts', json={'code': '5.01.' + tag[:4], 'name': 'Despesas Eventos', 'kind': 'despesa'}, headers=h).json()['id']

    # Criar título vinculado à natureza
    bill_data = {
        'account_id': acc_id,
        'description': 'Inscrição no Congresso Tributário',
        'competence': '2026-10',
        'due_date': '2026-10-25',
        'amount': '1500.00',
        'nature_id': nat_id,
        'subcategory_id': sub_id
    }
    r_bill = c.post('/api/bills', json=bill_data, headers=h)
    assert r_bill.status_code == 201, r_bill.text

    # Tentativa de excluir a natureza com título vinculado deve retornar 409 Conflict
    r_del = c.delete(f'/api/operation-natures/{nat_id}', headers=h)
    assert r_del.status_code == 409
    assert 'não pode ser excluída' in r_del.json()['detail']

def test_complete_dre_calculation_and_g99_segregation():
    tag = uuid.uuid4().hex[:8]
    office = server.bootstrap('Escritório DRE ' + tag, tag + 'dre@test.dev', 'Senha Forte DRE 12345')
    h = login(tag + 'dre@test.dev', 'Senha Forte DRE 12345')

    # Criar contas
    acc_rec = c.post('/api/accounts', json={'code': '3.01.' + tag[:4], 'name': 'Honorários Brutos', 'kind': 'receita'}, headers=h).json()['id']
    acc_ded = c.post('/api/accounts', json={'code': '4.01.' + tag[:4], 'name': 'Tributos s/ Faturamento', 'kind': 'despesa'}, headers=h).json()['id']
    acc_cst = c.post('/api/accounts', json={'code': '5.01.' + tag[:4], 'name': 'Honorários Correspondentes', 'kind': 'custo'}, headers=h).json()['id']
    acc_adm = c.post('/api/accounts', json={'code': '6.01.' + tag[:4], 'name': 'Aluguel do Escritório', 'kind': 'despesa'}, headers=h).json()['id']
    acc_fin = c.post('/api/accounts', json={'code': '7.01.' + tag[:4], 'name': 'Tarifas Bancárias', 'kind': 'despesa'}, headers=h).json()['id']
    acc_pat = c.post('/api/accounts', json={'code': '9.01.' + tag[:4], 'name': 'Aporte de Sócios', 'kind': 'transitoria'}, headers=h).json()['id']

    # 1. G01 Receita Bruta: R$ 50.000,00 (NAT_0101)
    c.post('/api/bills', json={'account_id': acc_rec, 'description': 'Honorários Contratuais Outubro', 'competence': '2026-10', 'due_date': '2026-10-15', 'amount': '50000.00', 'nature_id': 'NAT_0101'}, headers=h)

    # 2. G02 Deduções: R$ 3.000,00 (NAT_0201 - Tributos Faturamento)
    c.post('/api/bills', json={'account_id': acc_ded, 'description': 'Simples Nacional Outubro', 'competence': '2026-10', 'due_date': '2026-10-20', 'amount': '3000.00', 'nature_id': 'NAT_0201'}, headers=h)

    # 3. G03 Custos dos Serviços: R$ 7.000,00 (NAT_0301 - Correspondentes)
    c.post('/api/bills', json={'account_id': acc_cst, 'description': 'Diligências de correspondentes', 'competence': '2026-10', 'due_date': '2026-10-22', 'amount': '7000.00', 'nature_id': 'NAT_0301'}, headers=h)

    # 4. G05 Despesas Administrativas: R$ 5.000,00 (NAT_0501 - Aluguel)
    c.post('/api/bills', json={'account_id': acc_adm, 'description': 'Aluguel sede', 'competence': '2026-10', 'due_date': '2026-10-10', 'amount': '5000.00', 'nature_id': 'NAT_0501'}, headers=h)

    # 5. G09 Resultado Financeiro: R$ 200,00 (NAT_0904 - Tarifas)
    c.post('/api/bills', json={'account_id': acc_fin, 'description': 'Tarifas mensais banco', 'competence': '2026-10', 'due_date': '2026-10-30', 'amount': '200.00', 'nature_id': 'NAT_0904'}, headers=h)

    # 6. G99 Operação Patrimonial (NÃO AFETA DRE): R$ 100.000,00 (NAT_9904 - Aporte de Capital)
    c.post('/api/bills', json={'account_id': acc_pat, 'description': 'Aporte de Capital Social Sócios', 'competence': '2026-10', 'due_date': '2026-10-05', 'amount': '100000.00', 'nature_id': 'NAT_9904'}, headers=h)

    # Consulta DRE completa de 2026-10
    r_dre = c.get('/api/dre/complete?month=2026-10', headers=h)
    assert r_dre.status_code == 200, r_dre.text
    data = r_dre.json()

    dre = data['dre']
    # Cálculos esperados:
    # Receita Bruta = 50.000,00
    # Deduções = 3.000,00
    # Receita Líquida = 50.000 - 3.000 = 47.000,00
    # Custos Serviços = 7.000,00
    # Resultado Bruto = 47.000 - 7.000 = 40.000,00
    # Despesas Operacionais = 5.000,00
    # EBIT (Resultado Operacional) = 40.000 - 5.000 = 35.000,00
    # Resultado Financeiro = 200,00
    # LAIR = 35.000 - 200 = 34.800,00
    # Lucro Líquido = 34.800,00
    assert dre['receita_bruta'] == 50000.00
    assert dre['deducoes_receita'] == 3000.00
    assert dre['receita_liquida'] == 47000.00
    assert dre['custos_servicos'] == 7000.00
    assert dre['resultado_bruto'] == 40000.00
    assert dre['despesas_operacionais']['administrativas'] == 5000.00
    assert dre['despesas_operacionais']['total'] == 5000.00
    assert dre['resultado_operacional_ebit'] == 35000.00
    assert dre['resultado_financeiro'] == 200.00
    assert dre['resultado_antes_tributos_lair'] == 34800.00
    assert dre['resultado_liquido_exercicio'] == 34800.00
    assert dre['margem_liquida_pct'] == 69.60

    # Segregação Estrita do G99:
    # Os R$ 100.000,00 de aporte não alteraram em absolutamente nada o lucro nem a receita da DRE!
    patrimonial = data['operacoes_nao_dre_patrimoniais']
    assert patrimonial['total'] == 100000.00
    assert len(patrimonial['detalhes']) == 1
    assert patrimonial['detalhes'][0]['nature_code'] == '99.04'
