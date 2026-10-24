# PWA 0.6 — DRE gerencial integrada (indicativa)

## Mudanças
- Endpoint somente de leitura `GET /api/executive?month=AAAA-MM`, segregado por escritório autenticado.
- Demonstrativo de títulos por competência (classificação informada), sem somar lançamentos legados.
- Segregação de contas transitórias e honorários de êxito/sucumbenciais/mistos para revisão humana antes de qualquer reconhecimento.
- Caixa baseado nas baixas individualizadas, separado do resultado gerencial por competência.
- Indicadores e alertas visualizados no desktop e no mobile, sem novas operações de escrita.

## Limitações
Não equivale a escrituração contábil, DRE oficial, DFC ou auditoria bancária. Impostos, provisões, adiantamentos de clientes, reembolsos e honorários condicionais exigem análise individual. Títulos não são automaticamente receitas reconhecidas. O perfil `viewer` é o único bloqueio de escrita imposto na API; esconder formulários em telas pequenas não bloqueia contas administrativas no servidor. Não inserir dados jurídicos reais neste piloto.

## Executar
Ver README.md da versão original. `pip install -r requirements.txt`; `python server.py bootstrap ...` conforme documentação. `uvicorn server:app --reload`; `pytest -q`.
