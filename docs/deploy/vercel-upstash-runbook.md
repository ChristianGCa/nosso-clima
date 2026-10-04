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

Para concluir P1a ainda são necessários `npm ci` com npm 12 em ambos os projetos e Preview protegido que comprove diretórios raiz, detecção da entrada Fastify, versão efetiva, API direta, rewrite pareado, 404 JSON, CORS/Origin e headers/cache. A [documentação atual de monorepos](https://vercel.com/docs/monorepos), [Fastify](https://vercel.com/docs/frameworks/backend/fastify), [rewrites](https://vercel.com/docs/routing/rewrites) e [Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) orienta a configuração, mas não substitui a medição no projeto real.

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

`npm run test:e2e`, `npm run test:performance` e Gitleaks são gates planejados, ainda não implementados/configurados. Registrar as versões reais usadas no build da Vercel em P1. Uma execução local bem-sucedida não prova o comportamento de Functions, CDN ou Redis.

## Projetos e ambientes propostos

| Projeto | Root Directory | Resultado esperado | Configuração a validar em P1 |
|---|---|---|---|
| Web | `apps/web` | Vite estático; `/api/*` reescrito à API | Instalação com workspaces/lockfile da raiz, rewrite pareado em Preview/Production, SPA fallback que não capture `/api/*`, headers/CSP/cache |
| API | `apps/api` | Fastify em Node 24 Vercel Function | Entrada sem `listen`, instalação com workspaces/lockfile da raiz, `/api/v1/*` e `/health`, CORS/Origin e domínio direto público |

A [Vercel documenta projetos por diretório](https://vercel.com/docs/monorepos) e [rewrites](https://vercel.com/docs/routing/rewrites). O formato definitivo de configuração e a associação automática entre Preview web e Preview API precisam ser comprovados antes de fixá-los aqui. Não apontar um build Preview para API Production por acidente.

### Variáveis: somente nomes, nunca valores

| Escopo | Variável | Regra |
|---|---|---|
| API Preview/Production | `UPSTASH_REDIS_REST_URL` | URL `https:` criada pela integração Upstash; conferir ambiente e região |
| API Preview/Production | `UPSTASH_REDIS_REST_TOKEN` | Segredo apenas server-side, distinto por ambiente quando possível |
| API Preview/Production | `RATE_LIMIT_HMAC_KEY` (nome proposto) | Segredo para digest temporário do IP; validar comprimento/rotação em P1 |
| API Preview/Production | `CORS_ALLOWED_ORIGINS` ou substituto específico de Vercel | Somente origem web exata; resolver Preview pareado em P1 |
| API Preview isolado | `UPSTREAM_TEST_BASE` (se necessário ao ensaio) | Apenas eco protegido, proibido em Production e removido antes do release |
| Web Production | `VITE_API_BASE_URL` | **Ausente**; o cliente usa `/api/v1/*` relativo |

Não imprimir valores no build, nos logs, no runbook ou no frontend. Variáveis do Marketplace não devem ser ligadas ao projeto web. Confirmar o nome real de cada env depois da prova P1; a tabela não exige que a implementação mantenha `CORS_ALLOWED_ORIGINS` com semântica de processo antigo.

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
