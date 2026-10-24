# DRE Jurídico PWA — v0.4 (piloto)

## Mudanças
- A baixa parcial de um título cria um movimento financeiro individual e imutável no registro de movimentos, com data e valor em centavos, na mesma transação do saldo acumulado.
- `GET /api/cash-movements`: histórico de movimentos por escritório.
- `GET /api/cash-report`: agrupamento mensal por data de baixa.
- `GET /api/reconciliation`: conferência interna entre baixas acumuladas e movimentos individuais; aponta divergências.
- O painel Financeiro apresenta os movimentos e o resumo do caixa, também no modo de consulta mobile.
- O modelo de permissão viewer continua bloqueando gravações no servidor, independentemente do dispositivo.

## Compatibilidade e limitações
- Baixas registradas na v0.3 **não** têm movimentos históricos reconstruíveis; ficam assinaladas como divergência de histórico.
- Não há conciliação com extrato bancário, partidas dobradas, importador bancário, reconhecimento CPC 47 nem demonstração contábil oficial.
- Lançamentos simplificados da v0.2 permanecem separados, sem agregação com títulos e movimentos.
- Uma conta admin no celular continua podendo escrever via API: usar exclusivamente perfil viewer para consulta mobile.
- Não é adequado para dados reais/confidenciais antes de hardening de segurança, MFA, backups e revisão de privacidade.
- Para executar: instalar `requirements.txt`, criar escritório com `python server.py create-office --office "Piloto" --email "admin@exemplo.com"`, iniciar `uvicorn server:app --reload` e abrir `http://localhost:8000`.

## Próximo incremento
Reversões auditáveis, extrato bancário com conciliação por correspondência, fechamento mensal e integração progressiva ao motor Scientist.
