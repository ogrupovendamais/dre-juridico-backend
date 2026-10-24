# DRE Jurídico Scientist PWA v0.8 — Horas e custos por contrato

Continuação integral do piloto v0.7. Inclui cadastro de profissionais com **custo-hora informado**, registros de minutos trabalhados, custo histórico por lançamento e relatório por contrato/profissional com filtro de mês. Uma mudança posterior no cadastro do custo-hora **não recalcula** os apontamentos anteriores. As escritas exigem `admin` ou `editor`, e a API isola informações por escritório.

Rotas: `POST/GET /api/productivity/professionals`, `POST /api/productivity/worklogs`, `GET /api/productivity?month=AAAA-MM`.

**Limites contábeis:** receita considerada vem de títulos de receitas não condicionais vinculados ao contrato, ainda sem reconhecimento contábil validado. Margem candidata subtrai apenas custo das horas informadas. Se o custo de pessoal já estiver contabilizado como título do contrato, haverá potencial duplicação: o custo das horas **não entra automaticamente na DRE**. Nenhuma alocação de indiretos ou avaliação de produtividade real/capacidade é feita. Sem apuração tributária oficial. Preservar sigilo usando **dados fictícios**.

### Desenvolvimento local

`pip install -r requirements.txt` e `PYTHONPATH=. pytest -q` dentro da pasta. Inicialização e usuários permanecem documentados em `README.md`.

O mobile não apresenta formulários, mas somente as contas viewer têm bloqueio da escrita no servidor. Esta versão **não** tem garantia segura de bloqueio por dispositivo para contas editor/admin, nem homologação LGPD/segurança de produção.
