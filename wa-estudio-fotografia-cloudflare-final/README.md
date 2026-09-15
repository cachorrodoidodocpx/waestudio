# WA Estúdio Fotográfico — Cloudflare Workers + R2 + Admin

Site estático com painel administrativo completo para gerenciar as sessões e todas as fotos de “Histórias reais”.

## O que o painel faz
- Lista todas as fotos atuais, inclusive as fotos que vieram na primeira versão.
- Importa as fotos iniciais para o R2, tornando-as editáveis.
- Adiciona novas fotos a qualquer sessão.
- Troca uma foto por outra.
- Exclui fotos.
- Cria novas sessões (ex.: Animais, Corporativo, Pets).
- Edita nome e subtítulo das sessões.
- Reordena sessões.
- Exclui uma sessão e todas as fotos dela.

## Estrutura
- `public/` — site e assets estáticos
- `src/index.js` — Worker/API
- `wrangler.toml` — configuração do Worker + R2

## Cloudflare
O projeto usa:
- R2 bucket binding `MEDIA` apontando para `wa-estudio-media`.
- Assets estáticos binding `ASSETS`.
- Secret `ADMIN_PASSWORD`.
- Secret `SESSION_SECRET`.

No primeiro acesso ao painel, as fotos que vieram no pacote continuam sendo estáticas. Use **“Importar fotos atuais para o painel”** uma vez. Depois disso, o site passa a usar o R2 como fonte do portfólio e você poderá administrar tudo pelo `/admin.html`.
