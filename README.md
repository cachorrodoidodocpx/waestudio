# WA Estúdio Fotográfico — site + painel de portfólio

Este projeto funciona como site estático no Cloudflare Pages e pode ganhar upload de fotos pelo navegador usando **Pages Functions + Cloudflare R2**.

## O que já está pronto
- Fotos recebidas nesta conversa já colocadas e otimizadas em `assets/portfolio/`.
- WhatsApp: `5548991868509`.
- Categorias: casamento, gestante, baby reborn, infantil, família, ensaios, natal e datas especiais.
- `/admin.html` com login, upload múltiplo e exclusão de fotos.
- API pública `/api/gallery` para montar o portfólio.
- Imagens enviadas pelo painel são servidas em `/media/...` através do R2.

## Configuração do painel no Cloudflare
O site público continua estático. Para o painel funcionar, crie um bucket R2 (recomendado: `wa-estudio-media`) e faça o binding dele no projeto Pages com o nome `MEDIA`.

Em **Pages > seu projeto > Settings > Functions > Bindings**, adicione um **R2 bucket** com variável `MEDIA`.

Crie também estes Secrets/Variables no projeto:
- `ADMIN_PASSWORD` — senha do painel.
- `SESSION_SECRET` — uma string aleatória longa, usada para assinar a sessão.

Depois faça novo deploy.

### Publicação
Para este projeto com `functions/`, use Git integration ou deploy via Wrangler. O upload por drag-and-drop do painel do Pages não compila a pasta `functions/`.

Exemplo via Wrangler:

```bash
npx wrangler pages deploy . --project-name wa-estudio-fotografico
```

Ou conecte o repositório GitHub ao Pages. Não há build command.

## R2 e custo
O Cloudflare R2 possui franquia mensal de 10 GB de armazenamento, 1 milhão de operações Classe A e 10 milhões de operações Classe B; o tráfego de saída (egress) do R2 é gratuito. O R2 é uma assinatura/serviço de armazenamento com cobrança por uso, então o excedente da franquia pode gerar cobrança.

As Pages Functions do plano Free usam a cota do Workers Free (100.000 requests/dia). As requisições a assets estáticos continuam gratuitas e ilimitadas.

## Organização das fotos locais
Você ainda pode manter imagens no repositório em:

`assets/portfolio/<categoria>/`

Mas, para a rotina do fotógrafo, a forma mais prática passa a ser usar o `/admin.html`: escolha a categoria, selecione várias fotos e envie.
