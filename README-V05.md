# DRE Jurídico PWA 0.5 — Conciliação assistida

Extensão da versão 0.4. CSV (Data;Valor;Descricao) e OFX textual são aceitos até 2MB/5000 linhas. Valores positivos são entradas; negativos, saídas. Importação **não** gera lançamentos contábeis nem pagamentos. Sugestões exatas por data, sinal e valor devem ser aprovadas manualmente por editor/admin. Um extrato e um movimento só podem ser conciliados uma vez. Fechamento bloqueia novas baixas e conciliações no mês fechado, mas **não** é escrituração oficial; ainda carece de trilha de reabertura, saldo bancário inicial/final, controle de arquivos diferentes com transações idênticas, regras para tarifas, estornos, transferências, lançamentos manuais antigos e homologação LGPD.

## Executar
Instalar `pip install -r requirements.txt`, criar escritório conforme README.md, iniciar `uvicorn server:app --host 127.0.0.1 --port 8000`. Os dados são armazenados em SQLite local no piloto. Não usar com dados sigilosos reais.

## CSV exemplo
```csv
Data;Valor;Descricao
2026-10-10;100,00;Honorários
2026-10-11;-20,00;Despesa
```

**Atenção:** a conciliação por correspondência exata não verifica titularidade ou autenticidade do extrato, nem reconcilia o saldo da conta bancária. O PDF e PWA offline permanecem fora do escopo desta versão.
