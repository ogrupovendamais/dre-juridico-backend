# DRE Jurídico Scientist — PWA piloto v0.3

Este pacote **mantém** os arquivos da versão 0.2 e acrescenta cadastro de clientes, contratos, plano de contas, títulos financeiros, baixas parciais e relatório gerencial separado por competência. **Não é software homologado para uso em produção, nem DRE oficial.**

## Iniciar

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python server.py create-office --office "Escritorio de teste" --email admin@example.test
uvicorn server:app --host 127.0.0.1 --port 8080
```

Abrir http://127.0.0.1:8080. Para usuário de consulta: `python server.py create-viewer --office-id ID --email viewer@example.test`.

## Mudanças

- Contas de natureza `receita`, `custo`, `despesa` e `transitoria`, com código único por escritório.
- Clientes e contratos vinculados a escritórios e modalidade de honorários.
- Títulos com competência (AAAA-MM), vencimento, valor, contrato opcional e conta contábil gerencial.
- Baixa parcial com impedimento de valor superior ao saldo e evento de auditoria; **o módulo registra apenas a última data e o valor acumulado**, portanto não monta fluxo de caixa histórico mensal confiável.
- Relatório gerencial por competência, **indicativo**, baseado nos títulos informados manualmente e não em regras contábeis de reconhecimento de receita ou despesas.
- Multiempresa: todos os endpoints novos filtram dados do escritório autenticado. Conta `viewer` recebe HTTP 403 ao alterar dados.
- Interface desktop para cadastros e baixa; interface mobile exclusivamente de leitura. **Bloqueio de escrita por dispositivo não é garantido** para uma conta com perfil `editor`/`admin` que chame a API diretamente.
- O módulo simplificado v0.2 permanece como base **separada**, sem soma automática com os títulos da v0.3, impedindo dupla contagem silenciosa.

## Testes

```bash
python -m pytest -q
```

## Limitações de produção

Não usar dados reais sigilosos. Antes da produção: MFA, segurança de sessão e CSRF, migrações gerenciadas, constraints e chaves estrangeiras, backups/restauração, TLS, controle de acesso mais granular, logs completos de eventos de caixa, ledger imutável/estornos, conciliação contábil e bancária, tratamento de transações de terceiros, regras formais de reconhecimento de honorários, revisão profissional contábil, testes de segurança e política LGPD. O login do piloto não tem recuperação de senha nem gerenciamento de usuários na interface.
