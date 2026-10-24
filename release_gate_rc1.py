"""Fail-closed release checklist for a pilot. Offline checks never imply real-environment approval.

External evidence can be provided as JSON ONLY by an accountable reviewer after checks.
The script never creates an approval merely because a source file exists.
"""
import argparse
import datetime as dt
import json
from pathlib import Path

CHECKS = {
    'postgres_real_routes': 'Concorrencia e transacoes das rotas financeiras reais em PostgreSQL de homologacao',
    'database_migrations': 'Upgrade, rollback planejado e reconciliacao de dados em ambiente de homologacao',
    'backup_restore': 'Backup criptografado, restauracao isolada e tempos de recuperacao aferidos',
    'deployment_security': 'HTTPS, secrets, isolamento multiempresa, autorizacao e cabecalhos revisados',
    'browser_devices': 'Fluxos de cadastro e leitura em navegadores e dispositivos reais',
    'accounting_review': 'Revisao de reconhecimento de receitas, competencia, caixa e indicadores por profissional',
    'privacy_legal': 'Revisao LGPD, sigilo juridico, retencao e contratos aplicaveis',
    'pilot_acceptance': 'Aceite documentado de piloto controlado sem dados sigilosos ate autorizacao',
}

def assess(evidence=None):
    evidence = evidence or {}
    results = []
    for key, title in CHECKS.items():
        e = evidence.get(key, {})
        # Attestation requires accountable reviewer + dated artifact; a boolean alone is not sufficient.
        approved = isinstance(e, dict) and e.get('passed') is True and bool(str(e.get('reviewer','')).strip()) and bool(str(e.get('artifact','')).strip()) and bool(str(e.get('date','')).strip())
        results.append({'key':key, 'criterion':title, 'status':'approved_with_attestation' if approved else 'blocked_no_evidence', 'artifact':e.get('artifact') if approved else None})
    return {'product':'DRE Juridico Scientist', 'release':'3.0-rc1', 'commercial_release':'BLOCKED' if any(x['status']!='approved_with_attestation' for x in results) else 'REQUIRES_FINAL_MANUAL_SIGNOFF', 'assessed_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(), 'criteria':results, 'note':'Local unit tests and source checks do not establish commercial readiness. Evidence is an attestation, not independently verified by this tool.'}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--evidence',type=Path,help='Optional signed-off evidence inventory; never use untrusted evidence as proof')
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    data=json.loads(args.evidence.read_text(encoding='utf-8')) if args.evidence else {}
    if not isinstance(data,dict): parser.error('Evidence must be an object')
    result=assess(data)
    rendered=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output: args.output.write_text(rendered,encoding='utf-8')
    else: print(rendered)
    return 0 if result['commercial_release']=='REQUIRES_FINAL_MANUAL_SIGNOFF' else 2

if __name__=='__main__':raise SystemExit(main())
