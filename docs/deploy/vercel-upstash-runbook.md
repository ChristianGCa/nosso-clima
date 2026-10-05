# Runbook preliminar: Vercel + Upstash

**Estado:** rascunho de 2026-10-04 para P1 após aprovação da implementação P0. Não execute como procedimento de publicação: nomes reais de projetos, região, quotas, variáveis finais, CI e rollback ainda dependem de Preview e revisão final. Ver [plano](../../tasks/vercel-plan.md) e [pesquisa](vercel-research-2026-10-04.md).

## P1a: preparação local em 2026-10-04

Revisão de base: `a8c22f0`, com alterações locais anteriores ainda não commitadas. Esta preparação não conclui P1a, pois não houve Preview.

| Verificação | Resultado local |
|---|---|
| `node --version` | `v24.21.0` |
| `npm --version` | `11.19.0`; npm 12 exigido ainda não foi verificado |
| `vercel --version` | CLI `62.2.0` |
| `vercel whoami` | `Logged out`; nenhum projeto foi criado ou implantado |
| `git remote -v` | Nenhum remote configurado neste checkout |
| `npm run check` | Passou: TypeScript, Biome, 369 testes da API, 73 do web e fronteiras |
| `npm run build --workspace @nosso-clima/api` | Passou |
| `npm run build --workspace @nosso-clima/web` | Passou |

O `npm ci` local com npm 12.0.2 foi comprovado depois em [P9](#p9-gates-locais-e-sinais-operacionais--2026-10-05). Para concluir P1a ainda são necessários instalação e builds **em cada projeto Vercel** com npm 12, além de Preview protegido que comprove diretórios raiz, entrada Fastify, versão efetiva, API direta, rewrite pareado, 404 JSON, CORS/Origin e headers/cache. A [documentação atual de monorepos](https://vercel.com/docs/monorepos), [Fastify](https://vercel.com/docs/frameworks/backend/fastify), [rewrites](https://vercel.com/docs/routing/rewrites) e [Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) orienta a configuração, mas não substitui a medição no projeto real.

### P1a: configuração manual e evidência de Preview

Executar somente na conta do proprietário. O agente não configura a Vercel. Manter o repositório Git privado e criar uma branch de ensaio; não promover o deploy a Production. No plano Hobby, [Standard Protection protege Previews, mas não o domínio Production](https://vercel.com/docs/deployment-protection). A importação Git pode disparar um primeiro deploy Production: antes de configurar variáveis, o web falha sem `API_ORIGIN` e a API falha sem a configuração obrigatória. Não considerar esse deploy um ambiente de teste protegido.

1. Publicar a revisão testada no GitHub privado e importar **o mesmo repositório duas vezes**, no mesmo time Vercel. Criar os projetos `nosso-clima-api` e `nosso-clima-web` (ou nomes disponíveis). Em **Settings → Build and Deployment**, conferir Root Directory `apps/api` e `apps/web`, respectivamente; Node.js `24.x`; frameworks Fastify e Vite; saída web `dist`. Os arquivos `apps/api/vercel.json` e `apps/web/vercel.mjs` fixam os frameworks. Não configurar fallback SPA para `/api`.
2. Em ambos os projetos, habilitar **Vercel Authentication / Standard Protection** para Preview. Para pares protegidos, testar pelo navegador autenticado na Vercel e com acesso aos dois projetos do mesmo time: a [autorização automática no rewrite](https://vercel.com/changelog/deployment-protection-now-supports-protected-rewrites) não vale para Shareable Link nem Protection Bypass for Automation. Não compartilhar cookies nem tokens de bypass como evidência.
3. Em ambos os projetos, definir o **Install Command** como `node --version && npx --yes npm@12.0.2 --version && npx --yes npm@12.0.2 ci`. A [versão padrão do npm na Vercel pode diferir](https://vercel.com/docs/package-managers); a versão deve aparecer no log de **cada** build. Se `npm ci` não localizar o lockfile da raiz com o Root Directory escolhido, registrar o erro e corrigir a configuração antes de avançar, sem criar lockfiles por app nem alterar `engines`.
4. Criar uma base Upstash Free de Preview e conectar **somente ao projeto API** para que a entrada Fastify valide sua configuração. Preencher no escopo Preview os nomes da [tabela abaixo](#variáveis-somente-nomes-nunca-valores); gerar as duas chaves HMAC diferentes e manter valores fora do Git, logs e relatório. Para P1a, a política provisória pode usar `1000` em cada um dos quatro tetos e em ambos os custos, `60000` para cooldown e `10000` para probe: não executar consultas válidas à Open-Meteo nesta fatia; esses valores **não** são a política de P1b/Production. Configurar `NODE_ENV=production` e `HOST=0.0.0.0`. Como a URL web ainda não existe, começar `CORS_ALLOWED_ORIGINS` com uma origem HTTPS provisória que não será usada, como `https://example.com`; substituí-la pela URL web Preview antes de verificar CORS.
5. Implantar **API Preview** a partir da branch de ensaio. Registrar commit, URL do deploy e URL estável da branch (nenhuma delas Production), região, Node/npm vistos no build e a Function Fastify detectada. Abrir `/health` no Preview autenticado: esperar `200` e `{"status":"ok"}`. `GET /api/v1/locations?query=a` deve dar `400` com `VALIDATION_ERROR`; `/api/rota-inexistente` deve dar `404` com `NOT_FOUND`. A rota de health não usa Redis; as outras passam pelo limite compartilhado e precisam de Redis funcional e identidade confiável da Vercel. Nenhuma das três deve chamar Open-Meteo. Erro de configuração na inicialização bloqueia o ensaio.
6. No **projeto web Preview**, definir apenas `API_ORIGIN=https://<host-da-branch-api-preview>` (sem barra final, caminho ou segredo), usando a URL de **branch** da API para que o alvo continue válido após um redeploy. Deixar `VITE_API_BASE_URL` ausente. Implantar web Preview da mesma revisão, obter sua URL de branch e trocar `CORS_ALLOWED_ORIGINS` na API para essa origem HTTPS exata. Redeployar a API e verificar que a URL de branch agora aponta para o novo deploy; confirmar o commit nos dois projetos. Conferir no navegador autenticado que `/` abre e que `/api/rota-inexistente` responde JSON `404`, sem HTML da SPA, redirecionamento para login ou mudança da URL para o domínio API. Repetir `/health` **diretamente na API** e as rotas `/api/*` **pelo web**. Verificar no log de invocações da API que o pedido reescrito chegou ao deploy Preview pareado; `API_ORIGIN` nunca deve apontar para API Production. A [URL de branch segue o último deploy daquela branch](https://vercel.com/docs/environment-variables/system-environment-variables); registrar também os IDs dos deploys efetivamente testados.
7. Em DevTools → Network, registrar somente status e cabeçalhos, sem cookies/IP: `Cache-Control: private, no-store` e `Vercel-CDN-Cache-Control: no-store` para API direta; no rewrite, `Cache-Control: private, no-store` e ausência de `HIT` após repetir a requisição. Em `/`, conferir CSP, HSTS, `Referrer-Policy`, `nosniff` e HTML revalidável; em um `/assets/*` com hash, `immutable`. Conferir que o navegador pede `/api/*` no domínio web. Para CORS, usar um cliente HTTP autorizado a acessar a API protegida e enviar separadamente `Origin` igual à URL web, ausente e divergente: somente a origem permitida deve receber `Access-Control-Allow-Origin`. Não compartilhar cookies/tokens usados pelo cliente. Comparar status, envelope, método e query entre API direta e rewrite.

Registrar **data, commit, nomes/IDs dos dois projetos, URLs Preview, Root Directory, frameworks, versões Node/npm, Install Command sem segredos, região, status/envelopes e cabeçalhos observados**. Capturas devem ocultar IP, cookies, tokens e valores de variáveis. Se qualquer prova falhar, manter P1a aberta e corrigir a causa antes de P1b. P1a não aprova publicação nem demonstra Redis, WAF ou ausência de IP na saída.

## Preparação local

Repositório com Node 24.15+ (<25), npm 12 e `package-lock.json`:

```bash
npm ci
npm run check
npm run test:coverage
npm run build --workspace @nosso-clima/api
npm run build --workspace @nosso-clima/web
npm audit --audit-level=high
```

`npm run test:e2e`, `npm run test:performance` e o workflow de CI estão implementados localmente. Registrar as versões reais usadas no build da Vercel em P1. Uma execução local bem-sucedida não prova o comportamento de Functions, CDN ou Redis.

## P9: gates locais e sinais operacionais — 2026-10-05

Revisão de base `ab9c97d` com alterações de P9 ainda locais. O perfil `artifacts/performance.json` é gerado por `npm run test:performance`, ignorado no Git e publicado como artefato pela CI. O teste usa o web compilado, Chromium móvel 360×800 @2x, CPU 4× mais lenta, latência de 150 ms, download de 200.000 bytes/s, forecast em fixture e uma carga fria por cenário. Mede LCP e CLS com `PerformanceObserver`. Preview e condições reais de rede seguem para P1/Checkpoint B.

| Gate | Resultado local |
|---|---|
| `npm ci` com npm 12.0.2 | Passou a partir do lockfile, sem alteração do lockfile; `npm run check` repetido com essa instalação passou |
| `npm run check` | Passou: 495 testes da API, 90 do web, tipos, Biome e fronteiras |
| `npm run test:coverage` | API 94,89%/91,23%/94,69%/97,91%; web 96,88%/89,84%/97,43%/98,94% (statements/branches/functions/lines) |
| `npm run test:a11y` | Passou em neutro, estados interativos, dez imagens e desktop; contraste mínimo acima de 4,5:1 para texto comum |
| `npm run test:e2e` | Passou: 5 testes com Function local e provedor simulado |
| `npm run test:performance` | Neutro: LCP 1.000 ms, CLS 0,000; cidade restaurada: LCP 1.008 ms, CLS 0,000. Antes da reserva de altura no carregamento, CLS restaurado era 0,399 |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| Gitleaks 8.30.1 `dir --redact --no-banner` | Conteúdo atual sem achados |
| Gitleaks 8.30.1 `detect --redact --no-banner` sem intervalo | Passou: 85 commits verificados; a exceção aprovada cobre somente o fingerprint histórico do teste de porta explícita no commit `2c49d94` |

O workflow [ci.yml](../../.github/workflows/ci.yml) usa checkout completo, Node 24.21.0, npm 12.0.2, `npm ci`, checks, cobertura, auditoria, acessibilidade, E2E, performance e Gitleaks 8.30.1 com SHA-256 verificado. O scan examina a árvore atual e todo o histórico Git. A exceção de fingerprint único foi aprovada pelo proprietário em 2026-10-05, registrada em [CONSTRAINTS.md](../../CONSTRAINTS.md) com responsável e expiração em 2026-12-31. Sem Git remote, ainda não existe execução hospedada.

Os logs da API usam `requestId` gerado pelo servidor e molde da rota. Para operação, contar `request_completed` por status e duração, `cache_hit`/`cache_miss`, `rate_limit_rejected` por origem local/compartilhada, `visitor_limit_unavailable`, `redis_unavailable`, `provider_access_rejected` por `reason` (`quota_denied`, `circuit_open`, `redis_unavailable`, `upstream_rate_limited`) e `geocoding_upstream_failed`/`forecast_upstream_failed` por categoria. Esses campos não contêm IP, digest, texto de busca, coordenadas, fuso, URL ou mensagem arbitrária. O WAF e os comandos mensais Upstash exigem métricas/alarme da conta em P1c; canal, limiares e recebimento da notificação ainda não foram testados. Em P1, distinguir `upstream_rate_limited` de `rate_limit_rejected` ao configurar alerta, e usar eventos de 503/negação de cota para investigar indisponibilidade.

## Projetos e ambientes propostos

| Projeto | Root Directory | Resultado esperado | Configuração a validar em P1 |
|---|---|---|---|
| Web | `apps/web` | Vite estático; `/api/*` reescrito à API | Instalação com workspaces/lockfile da raiz, rewrite pareado em Preview/Production, SPA fallback que não capture `/api/*`, headers/CSP/cache |
| API | `apps/api` | Fastify em Node 24 Vercel Function | Entrada sem `listen`, instalação com workspaces/lockfile da raiz, `/api/v1/*` e `/health`, CORS/Origin e domínio direto público |

A [Vercel documenta projetos por diretório](https://vercel.com/docs/monorepos) e [rewrites](https://vercel.com/docs/routing/rewrites). `apps/api/vercel.json` fixa o framework Fastify. `apps/web/vercel.mjs` gera em build os rewrites de `/api` e `/api/*` para a origem HTTPS indicada por `API_ORIGIN`, além de CSP, cabeçalhos de segurança e cache. A [configuração programática da Vercel](https://vercel.com/docs/project-configuration/vercel-ts) permite ler variáveis do ambiente no build. `API_ORIGIN` ausente, insegura ou igual à origem web aborta a geração. O pareamento real entre deploys Preview ainda precisa ser comprovado em P1a; não apontar Preview web para API Production.

### Variáveis: somente nomes, nunca valores

| Escopo | Variável | Regra |
|---|---|---|
| API Preview/Production | `NODE_ENV` / `HOST` | `production` / `0.0.0.0`; `HOST` é exigido pelo parser compartilhado, embora a Function não chame `listen` |
| API Preview/Production | `UPSTASH_REDIS_REST_URL` | URL raiz `https:` da Upstash, sem credenciais, caminho adicional, query ou fragmento; conferir ambiente e região |
| API Preview/Production | `UPSTASH_REDIS_REST_TOKEN` | Token REST secreto apenas server-side, distinto por ambiente quando possível |
| API Preview/Production | `RATE_LIMIT_HMAC_KEY` | 32 bytes aleatórios codificados em 64 caracteres hexadecimais, gerados separadamente para cada ambiente com `openssl rand -hex 32`; guardar como variável sensível |
| API Preview/Production | `CACHE_HMAC_KEY` | Outro segredo de 32 bytes em 64 caracteres hexadecimais, gerado separadamente por ambiente com `openssl rand -hex 32`; usado só para derivar chaves opacas de cache e mantido apenas na API |
| API Preview/Production | `CORS_ALLOWED_ORIGINS` ou substituto específico de Vercel | Somente origem web exata; resolver Preview pareado em P1 |
| API Preview/Production | `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Quatro tetos inteiros positivos de créditos ponderados; 1.000 créditos representam uma chamada de peso 1. Devem ficar abaixo dos limites oficiais e incluir a margem confirmada em P1b |
| API Preview/Production | `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS` | Custo inteiro de cada consulta, no mínimo 1.000 créditos e não maior que nenhum teto. O peso real da previsão depende da calculadora/prova P1b |
| API Preview/Production | `OPEN_METEO_429_COOLDOWN_MS`, `OPEN_METEO_PROBE_MS` | Inteiros positivos em milissegundos; cooldown no máximo 1 hora, sonda no máximo 1 minuto e não maior que o cooldown. Ajustar depois da medição P1d |
| API Preview isolado | `UPSTREAM_TEST_BASE` (se necessário ao ensaio) | Apenas eco protegido, proibido em Production e removido antes do release |
| Web Production | `VITE_API_BASE_URL` | **Ausente**; o cliente usa `/api/v1/*` relativo |
| Web Preview/Production | `API_ORIGIN` | Origem HTTPS pública **da API do mesmo ambiente**, sem caminho, query, fragmento ou credenciais. Variável de build usada só por `vercel.mjs` para gerar o rewrite; não recebe token e não entra no bundle JS. Configurar separadamente por ambiente e conferir a URL efetiva em cada deploy. |
| Web Preview/Production | `WEB_ORIGIN` (opcional) | Origem HTTPS exata do deploy web para rejeitar `API_ORIGIN` que apontaria ao próprio web. Se ausente, a configuração usa `VERCEL_URL` da Vercel quando disponível. |

Não imprimir valores no build, nos logs, no runbook ou no frontend. Variáveis do Marketplace não devem ser ligadas ao projeto web. Confirmar o nome real de cada env depois da prova P1; a tabela não exige que a implementação mantenha `CORS_ALLOWED_ORIGINS` com semântica de processo antigo.
Na [configuração de ambiente da Vercel](https://vercel.com/docs/environment-variables), selecionar os escopos Preview e Production no projeto API. A [Upstash fornece a URL e o token REST](https://upstash.com/docs/redis/howto/connect-with-upstash-redis) na aba de conexão do banco. A entrada da API falha ao inicializar se qualquer valor obrigatório de Redis, HMAC ou política Open-Meteo estiver ausente ou inválido; não os adicionar ao projeto web. Os tetos máximos aceitos pelo código correspondem a menos de 600/5.000/10.000/300.000 chamadas ponderadas por minuto/hora/dia/mês; são guardrails, não valores recomendados para Production. A política final deve usar folga comprovada contra a [tabela de preços](https://open-meteo.com/en/pricing) e os [termos](https://open-meteo.com/en/terms) em P1b.

### Cache Redis integrado localmente na P6

O adapter de cache está ligado às duas rotas da entrada Function. Ele deriva chaves opacas com HMAC-SHA-256 de `CACHE_HMAC_KEY`, mantém namespace e versão, valida os valores na leitura e gravação e aceita no máximo 24 KiB por entrada. A resposta Redis REST é limitada a 64 KiB. O TTL máximo é de 24 h para busca e 10 min para previsão; não há valor vencido nem erro em cache. A entrada exige o segredo, distinto de `RATE_LIMIT_HMAC_KEY`, sem valor no repositório ou no projeto web. O fluxo de desenvolvimento local mantém o cache em memória.

Misses concorrentes usam um lock Redis de 12 s com token, [`SET` com `NX`/`PX`](https://redis.io/docs/latest/commands/set/) e liberação condicional. Outras instâncias aguardam até 6,3 s em leituras espaçadas; depois podem carregar por conta própria. Cada chamada real ao provedor continuará exigindo a reserva da P3. Em P1b/P1c, medir a semântica e o custo do lock, das leituras repetidas e das escritas com TTL no Redis real antes de escolher a configuração final do Free.

### Limite por visitante implementado localmente na P5

A entrada Function exige um único IP válido em `x-vercel-forwarded-for` para rotas diferentes de `/health`; cabeçalho ausente ou ambíguo resulta em `503` seguro. O código ignora `x-forwarded-for` para identidade. A [Vercel documenta](https://vercel.com/docs/headers/request-headers) os cabeçalhos encaminhados, mas a confiabilidade no acesso direto e via rewrite precisa ser provada em P1d com pedidos falsificados. `/health` não consulta Redis.

O IP é normalizado (IPv6 por prefixo /64) e transformado em HMAC-SHA-256 com `RATE_LIMIT_HMAC_KEY` e minuto UTC; o IP bruto não entra em logs ou chaves Redis, e o digest aparece apenas em chaves opacas temporárias, nunca em logs. A mesma variável já prevista na tabela acima atende à P5, sem configuração adicional agora. O pré-limite por instância, antes de Redis, mantém no máximo 2.048 identidades de um minuto e aplica 60 pedidos gerais, 30 de busca e 15 de previsão. A capacidade cheia nega novos visitantes naquela instância até a próxima janela. O Redis aplica os mesmos tetos de modo atômico entre instâncias, com TTL até o fim do minuto; falha do Redis nega o pedido com `503`, limite excedido retorna `429`. O script usa [bloqueio por chave da Upstash](https://upstash.com/docs/redis/features/key-locking), cuja execução real ainda depende de P1b/P1c.

Esses contadores usam janelas fixas de minuto; medir rajadas na fronteira e o custo de comandos por pedido em P1c. A regra WAF antes da Function continua obrigatória na P7/P1c e deve cobrir tanto o domínio direto da API quanto o rewrite do web. Registrar na prova P1 apenas categorias e contagens, nunca IPs ou digests.

### Roteamento, cache e WAF da P7

No projeto web, deixar `VITE_API_BASE_URL` **sem definir** em Preview e Production. O cliente chama caminhos relativos `/api/v1/*`; o build rejeita um valor HTTP, loopback ou de origem diferente do próprio web. Um valor HTTPS da própria origem é aceito, mas desnecessário. `API_ORIGIN` é a URL do projeto API usada somente pela configuração do rewrite; verificar na configuração efetiva do Preview que ela corresponde à API Preview daquele deploy. O web não define fallback de SPA, de modo que `/api` e `/api/*` sempre passam pelo rewrite. Confirmar query, método, status, envelope de erro e 404 JSON em P1a.

Os cabeçalhos do web aplicam CSP com `connect-src 'self'`, HSTS, política de referer e `nosniff`. O atributo de estilo inline é permitido somente para a imagem de fundo escolhida pelo React; scripts inline não são permitidos. `/`, `index.html` e arquivos públicos sem hash revalidam. Somente arquivos em `/assets/` com hash Vite de oito ou mais caracteres usam `immutable`. API direta e respostas da Function definem `Cache-Control: private, no-store` e `Vercel-CDN-Cache-Control: no-store`; o rewrite web também define `Cache-Control: private, no-store` e `x-vercel-enable-rewrite-caching: 0`. A [mudança de 2026 no cache de rewrites externos](https://vercel.com/changelog/vercels-cdn-now-respects-cache-control-headers-from-external-origins-by-default) torna a medição do CDN em P1a obrigatória mesmo com esses cabeçalhos.

A [regra de rate limiting do WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) é configurada manualmente no painel **de cada projeto** antes da Function: uma condição de caminho começando por `/api` (também alcança `/api` sem barra final), chave IP, janela fixa inicial de 60 s, limite inicial de 60 pedidos e ação padrão `429`. São duas regras, uma no projeto web e outra no projeto API; Hobby permite uma regra de rate limit por projeto. O valor 60 é provisório, alinhado ao limite geral da aplicação; P1c mede rajadas, contadores regionais e custo antes de confirmar ou ajustar. Publicar a mudança no Firewall de ambos os projetos e registrar capturas sem IP nem segredo. No Preview protegido, enviar pedidos pela URL web e pela API direta até bloquear; verificar status `429` do WAF, ausência de invocação da Function e de comandos Redis nos bloqueios. Se o caminho reescrito não passar pelos dois controles como esperado, revisar a topologia em P0; não registrar apenas a existência das regras como prova de proteção.

## Sequência de Preview

1. Após implementação e gates locais P2–P9, o proprietário cria projetos privados/protegidos e Upstash Free em região próxima à Function, sem ativar upgrade automático. Registrar nomes, regiões e limites, sem token.
2. Implantar API em Preview com fixtures/eco protegidos. Conferir `/health`, erro JSON de query inválida, rotas e status, versões Node/npm, URLs e logs seguros.
3. Implantar web Preview ligado **àquela** API Preview. Conferir rewrite, origem do navegador, CORS/Origin recebido, assets, `Cache-Control` de sucesso/erro e ausência de segredo no JS compilado.
4. Provar Redis: `EVAL` atômico em quatro janelas, falha fechada, TTL de cache e HMAC, comportamento com duas instâncias e comandos por pedido aceito/rejeitado. Confirmar peso oficial de ambas consultas, discrepância termos/preços no limite mensal de 300.000 e orçamento com margem em cada janela.
5. Configurar a regra WAF nas rotas API e provar acesso direto e via rewrite, bloqueio antes da Function, contadores por região, consumo de pedidos permitidos e zero comando Redis nas rejeições. Medir pré-limite em memória, custo de comandos e testar alarme mensal. Medir manualmente a taxa de `429` externo a partir da Vercel e testar cooldown/reabertura do circuit breaker.
6. Repetir eco com canário/IP falso nas duas rotas e nos dois domínios. Desabilitar cache no ensaio ou contar hits no receptor para provar 1 saída real por execução; registrar apenas se algum valor sensível chegou.
7. Repetir suites, browser E2E, acessibilidade, performance, auditoria e scan de segredos na revisão implantada. Qualquer gate ausente ou falho fica pendente, nunca marcado verde.

## Falha, limites e rollback

- Se Redis falhar, expirar a cota gratuita ou negar reserva, novas chamadas Open-Meteo param. A API responde erro público seguro; `/health` continua a indicar somente que a Function responde. Investigar com contagens/categorias, sem dados de localização ou IP.
- Se a Open-Meteo responder `429` com reserva própria disponível, registrar apenas `upstream_rate_limited`, abrir o circuit breaker compartilhado e interromper novos misses até reabertura controlada. Acompanhar taxa e duração; não fazer retries em massa nem classificar como abuso do visitante.
- Se o teste revelar IP do visitante no eco da saída, interromper o caminho de release, não apontar a API real à Open-Meteo e revisar o adapter/topologia na P0.
- Ensaiar rollback do web e da API para deploys previamente verificados, com chaves/valores Redis versionados que as versões anterior e nova tolerem. Registrar IDs, ordem, comandos e smoke de ambas URLs no ensaio P11. Não alterar esquema/chave de modo irreversível antes do fim da janela de rollback.
- Publicação pública só após pacote de privacidade, direitos, termos, quota, CI, métricas, Preview e rollback revisto pelo proprietário em decisão separada.
