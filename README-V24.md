# PWA 2.4 — Auditoria funcional incremental

- Preserva a versão 2.3, incluindo paleta Venda+ Tech e links de site e WhatsApp.
- Formulários financeiros selecionados impedem múltiplos envios rápidos no navegador enquanto uma operação de API está em andamento. É uma proteção visual complementar: idempotência e transações seguras no servidor ainda exigem auditoria abrangente.
- Navegação mobile: setas direita/esquerda alternam abas quando os botões estão focados; formulários financeiros seguem ocultos no modo mobile.
- Botões ocupados/desativados agora têm estados de interface perceptíveis.
- A confirmação em dispositivos físicos, a instalação PWA em iOS/Android, homologação PostgreSQL, teste de segurança independente e validação dos cálculos por contador permanecem pendentes.
- Não utilizar dados reais sensíveis durante a avaliação. O perfil viewer é a única proteção de escrita independente do tamanho da tela.
