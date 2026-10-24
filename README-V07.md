# DRE Jurídico Scientist PWA v0.7 — Indicadores, especialidades e metas

Esta é uma **versão piloto** sobre a v0.6, mantendo os recursos de 0.2–0.6.

## Funcionalidades novas
- `GET /api/management?month=AAAA-MM`: receitas, custos, despesas e resultado **indicativos**; comparativo com mês anterior (variação percentual somente com base anterior positiva); meta e percentual atingido; resultados **parciais** por área.
- `POST /api/management/contracts/{id}/specialty`: classifica contrato em uma especialidade fixa do catálogo. Requer papel admin/editor; confirma pertencimento ao escritório; auditoria de alteração.
- `POST /api/management/targets`: meta de receitas, por escritório e mês, com valores em centavos. Requer admin/editor e registra auditoria.
- Interface em Diagnóstico: acompanhamento de metas e especialidades; formulários exibidos só no desktop. Viewer não pode gravar dados pela API.

## Integridade e interpretação
1. Os dados vêm de **títulos classificados manualmente**; não significam receitas contabilmente reconhecidas.
2. Honorários condicionais e contas transitórias ficam **segregados**. Nada é reconhecido automaticamente.
3. Resultados por especialidade somam apenas títulos com contrato classificado; títulos sem especialidade ficam fora e são sinalizados. Não há rateio de custos indiretos.
4. Metas são um registro gerencial, não lançamentos contábeis. Atingimento acima de 100% é possível.
5. Valores de `entries` (legado) não são somados aos títulos.
6. O diagnóstico é para acompanhamento, não é uma DRE oficial, auditoria, conciliação bancária ou parecer tributário.
7. O resumo de valores não atribuídos é acumulado **em todos os períodos**, não apenas no mês selecionado.
8. A edição mobile é ocultada por layout; para bloquear gravação com segurança, utilizar contas `viewer`. O sistema **não** garante bloqueio por classe de dispositivo de administradores.

## Testes
Executar `PYTHONPATH=. pytest -q` na pasta do projeto. Teste v0.7 verifica cálculos, metas, classificação, autorização, isolamento multiempresa e valores monetários. Se não houver `pytest` instalado, instalar somente no ambiente de desenvolvimento.

## Próximos requisitos antes do uso real
MFA, controle de acesso em produção, migração de banco transacional, gestão de sessões, criptografia, backups, recuperação de desastres, proteção CSRF aplicável, testes de penetração, LGPD e sigilo profissional. Registrar dados **apenas fictícios** neste piloto. Comparativos devem ser considerados parciais até validar a base de títulos.
