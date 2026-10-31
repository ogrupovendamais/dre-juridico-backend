# DRE Jurídico — Manual Operacional Interativo
### Pacote Oficial de Desenvolvimento e Implantação Web | Venda+ Tech

Este pacote contém o código-fonte estruturado do site do **DRE Jurídico**, pronto para implantação em qualquer ambiente de hospedagem web (Hostinger, cPanel, Apache) ou servidor VPS (Nginx, Ubuntu, Debian).

---

## 📁 Estrutura de Arquivos

```text
dre-juridico-web/
├── index.html              # Estrutura HTML semântica
├── .htaccess               # Configuração Apache / Hostinger (Gzip, Cache, Segurança)
├── nginx.conf              # Exemplo de configuração de bloco Nginx para VPS
├── README.md               # Instruções de publicação
├── css/
│   ├── style.css           # Estilos base, cores da marca, componentes e layout
│   └── responsive.css      # Regras responsivas, drawer móvel e breakpoints touch
├── js/
│   ├── app.js              # Controlador principal, busca, tema e menu gaveta
│   ├── calculators.js      # Motores dos simuladores DRE, Runway e Funil
│   └── lightbox.js         # Visualizador de telas em alta definição com zoom
└── assets/
    └── images/             # Telas homologadas do sistema em WebP e identidade visual
```

---

## 🚀 Como Publicar na Hostinger (Hospedagem de Sites)

A Hostinger utiliza servidores baseados em LiteSpeed/Apache com painel **hPanel**. O upload é imediato:

### Método 1: Via Gerenciador de Arquivos do hPanel (Recomendado - 2 minutos)
1. Acesse o [hPanel da Hostinger](https://hpanel.hostinger.com/).
2. Vá em **Sites** > Selecione o domínio ou subdomínio do cliente > Clique em **Gerenciador de Arquivos**.
3. Abra a pasta **`public_html`** (ou a pasta do subdomínio correspondente).
4. Envie o arquivo compactado **`dre-juridico-web.zip`** (fornecido junto deste pacote).
5. Clique com o botão direito no `.zip` dentro da Hostinger e selecione **Extrair** (*Extract*).
6. Certifique-se de que o arquivo `index.html` e as pastas `css/`, `js/` e `assets/` estejam diretamente dentro de `public_html`.
7. O arquivo `.htaccess` incluído já ativará automaticamente compressão Gzip e cache ultrarrápido!

### Método 2: Via FTP (FileZilla / WinSCP)
1. No hPanel, pegue os dados de **Acesso FTP** (Host, Usuário, Senha, Porta 21).
2. Conecte com o FileZilla.
3. Arraste todos os arquivos e pastas da pasta `dre-juridico-web/` para dentro de `public_html`.

---

## 🖥️ Como Publicar em VPS (Servidor Linux com Nginx)

Caso você opte por hospedar em uma VPS com Nginx:

1. **Enviar os arquivos para a VPS:**
   ```bash
   scp -r dre-juridico-web/* usuario@seu-ip:/var/www/dre-juridico-web/
   ```

2. **Permissões de pasta:**
   ```bash
   sudo chown -R www-data:www-data /var/www/dre-juridico-web
   sudo chmod -R 755 /var/www/dre-juridico-web
   ```

3. **Configurar o Nginx:**
   Copie as instruções de `nginx.conf` para `/etc/nginx/sites-available/dre-juridico.conf`:
   ```bash
   sudo ln -s /etc/nginx/sites-available/dre-juridico.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Certificado SSL Grátis (HTTPS):**
   ```bash
   sudo certbot --nginx -d seudominio.com.br
   ```

---

## 📱 Tecnologias Utilizadas
- **HTML5 Semântico:** Estrutura otimizada para SEO e indexação.
- **CSS3 Moderno:** Variáveis nativas (Design Tokens), Grid, Flexbox e tipografia fluida com `clamp()`.
- **Vanilla JavaScript (ES6+):** Zero frameworks pesados (React/Vue/jQuery desnecessários), garantindo carregamento instantâneo (< 0.5s).
- **Formatos WebP:** Imagens capturadas da plataforma real em alta resolução e baixo peso.

---

**Desenvolvido por Venda+ Tech** · *Tecnologia e Inteligência para Advocacia de Alta Performance.*
