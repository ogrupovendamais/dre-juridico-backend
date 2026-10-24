# DRE Juridico Scientist 3.0 RC1 — Gate de homologacao

A RC1 e uma **candidata a homologacao**, nao uma liberacao comercial.

## Executar

Com dependencias instaladas, uma chave de criptografia **de teste** e base isolada:

```sh
python -m pytest -q tests
python release_gate_rc1.py --output release-report.json
```

O segundo comando sai com codigo 2 (bloqueado) enquanto nao houver atestacoes documentadas. Esse codigo de saida e **esperado** para RC1. Mesmo com todos os itens atestados, o status sera `REQUIRES_FINAL_MANUAL_SIGNOFF`, nunca `APPROVED` automaticamente.

## Limites tecnicos

- `postgres_drill29.py` testa primitives em tabelas temporarias. **Nao** homologa endpoints reais.
- Testes SQLite **nao** demonstram desempenho/seguranca concorrente PostgreSQL.
- Sem testes de dispositivos fisicos ou revisao profissional da DRE.
- Backups e restauracao ainda precisam ser exercitados em ambiente remoto isolado.
- Um administrador autenticado em dispositivo mobile ainda pode usar endpoints de escrita: criar conta `viewer` dedicada para consultas; nao considerar deteccao de dispositivo uma garantia de seguranca.
- A auditoria e a identidade visual atuais sao parciais; requisitos de LGPD e sigilo profissional pendentes.
- **Nao utilizar dados sigilosos reais antes da autorizacao formal**.

## Marca

Preservados links no rodape: https://lp.grupovendamaistech.com.br/ e https://wa.me/5515998417512.
