# PWA 3.0 — Experiência comercial (candidata a homologação)

## O que mudou
- Assistente de instalação: botão nativo onde suportado e instrução alternativa no navegador. Não promete instalação em HTTP remoto: usar HTTPS, ou localhost para testes.
- Manifesto revisado e Service Worker para **recursos estáticos públicos somente**. Requisições `/api/`, dados financeiros, sessões e autenticação **não são armazenados em cache**. Offline não oferece acesso ao financeiro.
- Primeiros passos com dados fictícios e aviso de leitura no mobile.
- Identidade Venda+ Tech, rodapé do site e WhatsApp nativo clicáveis preservados.

## Requisitos de homologação ainda bloqueantes
1. PostgreSQL real: concorrência e bloqueios testados nas rotas financeiras do aplicativo.
2. HTTPS e gestão segura de chaves, restauração de backups e migrações de esquema.
3. Testes interativos em Windows/macOS, Android e iOS (instalação, rotação, zoom, formulários, erros).
4. Revisão de autorização: contas admin abertas no mobile continuam tecnicamente capazes de escritas por API; o uso visual exige `viewer`.
5. Contabilidade: reconciliação, reconhecimento de honorários e revisão por profissional habilitado.
6. Auditoria independente de segurança e adequação à LGPD e ao sigilo profissional.

**Status: piloto técnico. Não usar dados sigilosos reais.**
