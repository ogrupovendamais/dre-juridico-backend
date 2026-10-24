# PWA 1.8 - Rastreabilidade operacional

* Registros financeiros do módulo `finance.py` agora geram também eventos detalhados (identificador, ator, escritório, data, ação, referência). Baixas registram valor em centavos, data e saldo anterior/posterior; títulos registram competência, valor e conta, sem expor dados pessoais no detalhe.
* Eventos são gravados na mesma transação da operação. A trilha **não é imutável, não é completa** (outros módulos permanecem no histórico legado) e não substitui registros contábeis.
* Administração: `GET /api/audit18?limit=100` e `GET /api/audit18/export.csv`. Autorização `admin`, escopo restrito ao escritório autenticado. Exportação da trilha detalhada existente, não auditoria completa.
* Base: `schema_history` registra versão 18. A atualização é **aditiva e somente para frente**; não inclui rollback, nem prova de migração de todos os esquemas legados. Faça backup e ensaio de restauração antes de atualizar.
* Valores contábeis e regras anteriores não foram modificados. Desktop continua operacional e mobile apenas de consulta visual. Use conta `viewer` no mobile; contas `admin` continuam com permissões de API.
* Piloto de demonstração: não usar dados sigilosos reais antes da homologação de segurança e privacidade.
