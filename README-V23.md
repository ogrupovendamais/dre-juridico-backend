# PWA 2.3 - Identidade Venda+ Tech e auditoria de interface

## Escopo concluido
- Base integral 2.2 mantida.
- Paleta oficial do Brandkit: #010E38 (navy), #EBB52C (gold), #F1F4F9 (ice).
- Uso de Montserrat como primeira preferencia de fonte, com fallback local system-ui. A fonte nao acompanha o pacote; se nao estiver instalada, usa fallback. Nao ha requisicao externa de fontes.
- Assinatura textual VENDA+ TECH na pagina de login e menu lateral. A assinatura textual **nao substitui os arquivos oficiais do logotipo**, que devem ser incorporados quando disponibilizados em SVG/PNG conforme brandkit.
- Links clicaveis HTTPS para https://lp.grupovendamaistech.com.br/ e WhatsApp nativo via https://wa.me/5515998417512, na tela de login e no rodape do aplicativo.
- Rodape responsivo; links abrem em nova aba com rel="noopener noreferrer".
- Ajustes de contraste, botoes, foco por teclado, cards e menu inferior mobile.
- Cor do manifest e SVG do icone harmonizadas a marca. Icone original do prototipo segue ilustrativo, nao e o simbolo oficial da marca.

## QA executado
`DRE_MFA_FERNET_KEY=<chave Fernet de teste> PYTHONPATH=. pytest -q`
Resultado local: 29 passed; inclui regressao de backend e testes estruturais do front-end.
`node --check web/app.js` validado; compilacao Python validada.

## Limitacoes e checklist manual pendente
- **Nao foram executados testes browser end-to-end reais** por falta de navegador automatizado validado no ambiente. Validar Chrome/Edge no Windows, Safari iOS e Chrome Android: login, MFA, menus, estados de carregamento, fluxos desktop e consulta viewer.
- Mobile continua ocultando os formularios pela interface, e a API nega escrita ao perfil viewer. Conta admin em dispositivo mobile ainda pode enviar requisicoes diretas de alteracao; exigir perfil viewer para uso mobile ate haver arquitetura de permissao especifica.
- O rodape abre links externos ao acionar o usuario; nao implementa nenhuma integracao com API WhatsApp.
- Conteudo de teste e piloto; nao homologado para dados financeiros/juridicos sigilosos reais.
- Sem implantacao HTTPS, revisao de seguranca independente, teste de recuperacao de desastre em producao ou homologacao contábil.

## Procedimento de revisao de interface recomendado
1. Abrir em desktop 1280 px e 1920 px e verificar os links visiveis no rodape.
2. Abrir em 390 px e 320 px e conferir links, tabelas e menu inferior sem sobreposicao.
3. Entrar como viewer; verificar ausencia de formularios mobile e bloqueio HTTP 403 em operacoes de escrita.
4. Entrar como admin no desktop e concluir fluxos com dados ficticios; confirmar estados de erro e loading.
5. Verificar manualmente URL, logo e identidade com o Brandkit oficial antes de uso comercial.
