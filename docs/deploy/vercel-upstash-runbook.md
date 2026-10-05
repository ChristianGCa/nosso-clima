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
| API Preview/Production | `NODE_ENV` / `HOST` | `production` / `0.0.0.0`; `HOST` é exigido pelo parser compartilhado, embora a Function não chame `listen` |
| API Preview/Production | `UPSTASH_REDIS_REST_URL` | URL raiz `https:` da Upstash, sem credenciais, caminho adicional, query ou fragmento; conferir ambiente e região |
| API Preview/Production | `UPSTASH_REDIS_REST_TOKEN` | Token REST secreto apenas server-side, distinto por ambiente quando possível |
| API Preview/Production | `RATE_LIMIT_HMAC_KEY` | 32 bytes aleatórios codificados em 64 caracteres hexadecimais, gerados separadamente para cada ambiente com `openssl rand -hex 32`; guardar como variável sensível |
| API Preview/Production | `CORS_ALLOWED_ORIGINS` ou substituto específico de Vercel | Somente origem web exata; resolver Preview pareado em P1 |
| API Preview/Production | `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Quatro tetos inteiros positivos de créditos ponderados; 1.000 créditos representam uma chamada de peso 1. Devem ficar abaixo dos limites oficiais e incluir a margem confirmada em P1b |
| API Preview/Production | `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS` | Custo inteiro de cada consulta, no mínimo 1.000 créditos e não maior que nenhum teto. O peso real da previsão depende da calculadora/prova P1b |
| API Preview/Production | `OPEN_METEO_429_COOLDOWN_MS`, `OPEN_METEO_PROBE_MS` | Inteiros positivos em milissegundos; cooldown no máximo 1 hora, sonda no máximo 1 minuto e não maior que o cooldown. Ajustar depois da medição P1d |
| API Preview isolado | `UPSTREAM_TEST_BASE` (se necessário ao ensaio) | Apenas eco protegido, proibido em Production e removido antes do release |
| Web Production | `VITE_API_BASE_URL` | **Ausente**; o cliente usa `/api/v1/*` relativo |

Não imprimir valores no build, nos logs, no runbook ou no frontend. Variáveis do Marketplace não devem ser ligadas ao projeto web. Confirmar o nome real de cada env depois da prova P1; a tabela não exige que a implementação mantenha `CORS_ALLOWED_ORIGINS` com semântica de processo antigo.
Na [configuração de ambiente da Vercel](https://vercel.com/docs/environment-variables), selecionar os escopos Preview e Production no projeto API. A [Upstash fornece a URL e o token REST](https://upstash.com/docs/redis/howto/connect-with-upstash-redis) na aba de conexão do banco. A entrada da API falha ao inicializar se qualquer valor obrigatório de Redis, HMAC ou política Open-Meteo estiver ausente ou inválido; não os adicionar ao projeto web. Os tetos máximos aceitos pelo código correspondem a menos de 600/5.000/10.000/300.000 chamadas ponderadas por minuto/hora/dia/mês; são guardrails, não valores recomendados para Production. A política final deve usar folga comprovada contra a [tabela de preços](https://open-meteo.com/en/pricing) e os [termos](https://open-meteo.com/en/terms) em P1b.

### Cache Redis local preparado na P4

O adapter de cache ainda será ligado às duas rotas na P6. Ele deriva chaves opacas com HMAC-SHA-256 de um segredo da API, mantém namespace e versão, valida os valores na leitura e gravação e aceita no máximo 24 KiB por entrada. A resposta Redis REST é limitada a 64 KiB. O TTL máximo é de 24 h para busca e 10 min para previsão; não há valor vencido nem erro em cache. O segredo de derivação será definido e validado como configuração obrigatória na integração P6, sem valor no repositório ou no projeto web.

Misses concorrentes usam um lock Redis de 12 s com token, [`SET` com `NX`/`PX`](https://redis.io/docs/latest/commands/set/) e liberação condicional. Outras instâncias aguardam até 6,3 s em leituras espaçadas; depois podem carregar por conta própria. Cada chamada real ao provedor continuará exigindo a reserva da P3. Em P1b/P1c, medir a semântica e o custo do lock, das leituras repetidas e das escritas com TTL no Redis real antes de escolher a configuração final do Free.

### Limite por visitante implementado localmente na P5

A entrada Function exige um único IP válido em `x-vercel-forwarded-for` para rotas diferentes de `/health`; cabeçalho ausente ou ambíguo resulta em `503` seguro. O código ignora `x-forwarded-for` para identidade. A [Vercel documenta](https://vercel.com/docs/headers/request-headers) os cabeçalhos encaminhados, mas a confiabilidade no acesso direto e via rewrite precisa ser provada em P1d com pedidos falsificados. `/health` não consulta Redis.

O IP é normalizado (IPv6 por prefixo /64) e transformado em HMAC-SHA-256 com `RATE_LIMIT_HMAC_KEY` e minuto UTC; o IP bruto não entra em logs ou chaves Redis, e o digest aparece apenas em chaves opacas temporárias, nunca em logs. A mesma variável já prevista na tabela acima atende à P5, sem configuração adicional agora. O pré-limite por instância, antes de Redis, mantém no máximo 2.048 identidades de um minuto e aplica 60 pedidos gerais, 30 de busca e 15 de previsão. A capacidade cheia nega novos visitantes naquela instância até a próxima janela. O Redis aplica os mesmos tetos de modo atômico entre instâncias, com TTL até o fim do minuto; falha do Redis nega o pedido com `503`, limite excedido retorna `429`. O script usa [bloqueio por chave da Upstash](https://upstash.com/docs/redis/features/key-locking), cuja execução real ainda depende de P1b/P1c.

Esses contadores usam janelas fixas de minuto; medir rajadas na fronteira e o custo de comandos por pedido em P1c. A regra WAF antes da Function continua obrigatória na P7/P1c e deve cobrir tanto o domínio direto da API quanto o rewrite do web. Registrar na prova P1 apenas categorias e contagens, nunca IPs ou digests.

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
