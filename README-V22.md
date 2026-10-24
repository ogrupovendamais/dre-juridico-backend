# DRE Jurídico Scientist — PWA 2.2 (piloto técnico)

## Escopo

- Mantém o código e o banco da 2.1, sem alteração de regras contábeis ou esquemas.
- Acrescenta feedback textual de carregamento e falhas para chamadas da API principal, com `role=status` e aviso de erro visível.
- Marca a página ativa com `aria-current=page` em menus desktop/mobile; respeita movimento reduzido na navegação.
- Reforça responsividade de cartões, mensagens e tabelas em telas pequenas.
- Mantém cadastro/edição na interface desktop e consulta mobile; autorizações continuam por papel (`viewer`), não por identificação segura do dispositivo.

## Limitações

- Não inclui ensaio automatizado em navegador real ou aparelho físico.
- Parte das rotinas legadas utiliza `fetch` direto e mensagens locais, fora do indicador global de carregamento.
- Não constitui homologação de produção ou aprovação para dados sigilosos reais.
- Executar testes em banco limpo, configurando a chave de testes `DRE_MFA_FERNET_KEY`.

## Verificações

- `node --check web/app.js`
- `PYTHONPATH=. pytest -q`
- Testes de presença de componentes e comportamento lógico básico não substituem auditoria de acessibilidade em navegador.
