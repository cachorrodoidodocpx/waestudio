# WA Estúdio Fotográfico — Cloudflare Workers + R2

Site estático com painel administrativo para adicionar/remover fotos. O projeto usa **Cloudflare Workers Static Assets** para o site e **Cloudflare R2** para as imagens enviadas pelo painel.

## Estrutura
- `public/index.html` — site público
- `public/admin.html` — painel administrativo
- `public/styles.css` / `public/script.js` — visual e comportamento
- `public/assets/` — logo e algumas fotos iniciais do portfólio
- `src/index.js` — Worker com API, autenticação e acesso ao R2
- `wrangler.toml` — configuração do Worker, assets e R2

## Cloudflare
Crie um bucket R2 chamado exatamente:

`wa-estudio-media`

Depois, no Worker, crie os secrets:

- `ADMIN_PASSWORD` — senha do painel
- `SESSION_SECRET` — string aleatória longa, diferente da senha

O `wrangler.toml` já declara o binding `MEDIA` apontando para `wa-estudio-media`.

## Deploy pelo painel da Cloudflare
O repositório deve ter esta estrutura na raiz. No formulário de deploy:

- Build command: deixe vazio
- Deploy command: `npx wrangler deploy`

## Como usar o painel
Abra `https://SEU-DOMINIO/admin.html`, entre com a senha, escolha a categoria, selecione as fotos e envie. As fotos são armazenadas em R2 e aparecem na galeria pública.

Categorias: Casamentos, Gestante, Baby Reborn, Acompanhamento Infantil, Família, Ensaios, Natal e Datas Especiais.

## Limites no painel
- JPG, PNG ou WEBP
- até 15 MB por foto
- múltiplas fotos por envio

## Observação
As fotos que já estão em `public/assets/portfolio/` são arquivos estáticos e continuam funcionando mesmo antes de qualquer upload pelo painel. As fotos novas entram pelo R2.
