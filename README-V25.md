# DRE Jurídico Scientist PWA 2.5 — Idempotência financeira

Versão incremental sobre o piloto 2.4, **não homologada para produção**.

## Entregue
- `idempotency25.py`: tabela de reservas transacionais com índice único por escritório, usuário, operação e chave; comparação de hash do payload normalizado; repetição devolve a resposta da primeira transação.
- Proteção obrigatória nas rotas POST `/api/entries` e POST `/api/bills/{id}/settle`.
- A chave `Idempotency-Key` é obrigatória, composta por 12 a 128 caracteres ASCII permitidos `[A-Za-z0-9_-]`. Ausência retorna HTTP 428; reaproveitamento com outro conteúdo retorna HTTP 409.
- O frontend emite chave única por solicitação nesses dois fluxos. O mobile permanece somente para consulta na interface; autorização efetiva decorre do papel `viewer` na API.
- Teste sintético de repetição, divergência de payload e unicidade de movimento financeiro. Suíte de regressão aprovada.

## Exemplo de solicitação
```
POST /api/bills/{id}/settle
Authorization: Bearer <token>
Idempotency-Key: pagamento_20261017_ref_00001
Content-Type: application/json

{"amount":"75.00","date":"2026-10-12"}
```
Usar a **mesma chave** apenas para repetir a **mesma intenção de pagamento**. Novo pagamento requer nova chave. O cliente deve preservar a chave em caso de timeout se desejar obter garantia contra repetição após falha de rede. A interface gera uma nova chave a cada tentativa disparada; portanto, o fluxo de retry pós-timeout ainda requer aperfeiçoamento.

## Limites conhecidos
- A proteção cobre somente as duas rotas listadas; outros endpoints de criação e importação ainda necessitam adoção gradual.
- Para concorrência robusta em produção, validar comportamento transacional real no PostgreSQL e em múltiplas instâncias.
- A tabela de idempotência ainda não tem política auditável de retenção/expurgo.
- Testes automatizados Python, checagem sintática JavaScript e ZIP não substituem testes interativos em dispositivos físicos.
- Auditoria imutável, backup/restauração externa, HTTPS, observabilidade e homologação financeira ainda pendentes.
- Dados fictícios apenas; não armazenar dados jurídicos sigilosos reais.

## Marca
Identidade Venda+ Tech preservada da versão 2.3. Site: https://lp.grupovendamaistech.com.br/; WhatsApp: https://wa.me/5515998417512.
