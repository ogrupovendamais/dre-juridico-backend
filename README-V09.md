# DRE Juridico Scientist PWA 0.9 — Capacidade e custos indiretos

Esta versao preserva todos os modulos v0.8 e adiciona `planning.py` e interfaces no painel de Diagnosticos.

## Novas operacoes

- Cadastro/atualizacao de capacidade disponivel (em minutos por profissional por mes) via `POST /api/planning/capacity`.
- Comparacao entre horas registradas e capacidade declarada com sinalizacao quando exceder o total.
- Pools de despesas indiretas DECLARADOS pelo usuario com anotacao obrigatoria da origem, via `POST /api/planning/overhead`.
- `GET /api/planning?month=AAAA-MM`: simula rateio de cada pool entre contratos com horas registradas no mes, proporcional aos minutos. Diferencas de arredondamento em centavos sao absorvidas na ultima linha para preservar o total do pool.
- Sem base de minutos no mes: o pool fica integralmente `NO_ALLOCATION_BASIS` e nao e atribuido.
- Perfis viewer podem visualizar, mas a API bloqueia cadastro e mudancas (`403`). Todas as consultas e gravacoes sao isoladas por escritorio.

## Limites importantes

- Nao e uma contabilidade oficial; nao alterar resultados DRE com custos simulados.
- Os valores de pools podem se sobrepor aos titulos existentes; nao somar automaticamente.
- O metodo de rateio por minutos nao indica causalidade, nem recupera horas nao apontadas.
- Capacidade declarada nao e igual a horas faturaveis; taxa de utilizacao nao e indicador confiavel de produtividade sem contexto.
- Somente visualizacao no mobile e somente a permissao `viewer` tem bloqueio de escrita no backend. Um usuario com papel `admin` ou `editor` ainda pode usar a API de escrita a partir de um telefone; nao ha restricao robusta por dispositivo.
- Piloto tecnico: sem homologacao de seguranca, LGPD ou uso com informacoes sigilosas reais.

## Testes

No diretorio da aplicacao:

```bash
python -m pip install -r requirements.txt pytest httpx
PYTHONPATH=. pytest -q
```

Para rodar, siga o `README.md` principal. Dependencias SQLite de desenvolvimento nao devem ser confundidas com uma implantacao segura em producao.
