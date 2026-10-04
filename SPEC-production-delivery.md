# Spec: Production Delivery — dois projetos Vercel (P0)

- **Estado:** P0 aprovada para implementação pelo proprietário em 2026-10-04; publicação pública depende de decisão separada.
- **Módulo:** `production-delivery`; depende de `backend-platform`, `location-search`, `weather-forecast`, `weather-ui`.
- **Histórico:** [plano original Node](docs/history/production-delivery-pre-p0-2026-10-03.md). A alternativa Cloudflare foi descartada.
- **Pesquisa:** [viabilidade e fontes oficiais](docs/deploy/vercel-research-2026-10-04.md).
- **Execução:** [plano P0–P11](tasks/vercel-plan.md) e [lista ativa de tarefas/evidências](tasks/vercel-todo.md).

## Estado e alcance

Este módulo ainda não foi implementado. O fluxo local está concluído; os critérios abaixo dizem respeito à entrega Vercel + Upstash. `production-delivery` coordena os gates e a implantação, enquanto os requisitos de runtime compartilhado são definidos em [Backend Platform](SPEC-backend-platform.md). Por orientação do proprietário em 2026-10-04, P2–P9 são implementados e testados localmente primeiro. Depois ele configura a Vercel e executa P1 em Preview protegido com a implementação final. Evidência local não conclui P1 nem autoriza publicação.

## Resultado pretendido

Publicar o NossoClima não comercial usando somente planos gratuitos: um projeto Vercel para `apps/web` (Vite estático) e outro para `apps/api` (Fastify em Node 24 Vercel Function), no mesmo repositório. O domínio do web encaminha `/api/*` ao projeto da API, de modo que o navegador continua no mesmo domínio. Upstash Redis do Vercel Marketplace, via HTTPS, mantém cache compartilhado e a cota agregada obrigatória da Open-Meteo. O nome/URL gratuito deve conter `nosso-clima` se houver disponibilidade; nenhum domínio comprado é necessário. O tráfego estimado de cerca de 100 pessoas/dia não é garantia nem limite de capacidade.

O proprietário exige que a Open-Meteo não receba o IP do visitante, escolheu apenas planos gratuitos e autorizou resultados temporários na Upstash (busca até 24 h, previsão até 10 min, sem IP) e HMAC derivado de IP por aproximadamente 1 min para rate limit. Uma falha ou cota esgotada pode tornar a consulta indisponível; a API não faz chamada externa sem reserva. Não há artefatos verificáveis do ensaio de Preview anterior neste pacote; ele não serve como evidência de aprovação.

## Viabilidade P1 antes de publicação pública

- Provar com a implementação final em Preview protegido os dois [projetos de monorepo](https://vercel.com/docs/monorepos), o [adapter Fastify](https://vercel.com/docs/frameworks/backend/fastify), [Node 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), npm 12/lockfile, diretórios raiz e [rewrite](https://vercel.com/docs/routing/rewrites). Registrar a configuração efetiva, URLs, versões, status das rotas e comportamento de Preview pareado com backend correto. Não fixar no bundle web a URL de Preview da API.
- Criar Upstash pela integração do Marketplace em conta do proprietário somente depois da aprovação P0. Verificar variáveis do projeto API por ambiente, endpoint `https:`, segredo não exposto no web, região, custo por comando, latência, TTL, scripts e reserva sob contenção real. Nenhuma instância de teste deve exceder as cotas gratuitas.
- Confirmar na [documentação da Vercel sobre IP](https://vercel.com/docs/headers/request-headers) e por requisições com IP falsificado o sinal recebido pela Function via domínio API direto e rewrite web. Resolver a derivação HMAC e o caso de header ausente sem confiar em um cabeçalho fornecido pelo visitante.
- Verificar que os headers e o cache do CDN/rewrite não servem erro ou dados além dos TTLs; cache compartilhado Redis continua autoritativo. Testar `Cache-Control` de sucesso/erro e o comportamento real do [CDN](https://vercel.com/docs/caching/cdn-cache). A [mudança de cache em rewrites anunciada em 2026](https://vercel.com/changelog/vercels-cdn-now-respects-cache-control-headers-from-external-origins-by-default) exige medição, não suposição.
- Confirmar o peso real da consulta de previsão agora composta por `hourly.weather_code`, variáveis atuais e agregados diários no [calculador Open-Meteo](https://open-meteo.com/en/pricing/) e resolver a discrepância entre os [termos](https://open-meteo.com/en/terms/) (minuto/hora/dia na seção de uso não comercial) e a tabela de preços (também 300.000/mês). Até lá, reservar nas quatro janelas. Medir comandos Upstash para hits, misses, locks, rate limit, reservas e rejeições; estimar tráfego normal e adversarial. Medir taxa de `429` da Open-Meteo a partir da Vercel, separada de `429` da própria API, e testar circuit breaker. Falha na prova de custo, privacidade, atomicidade, disponibilidade aceitável ou pareamento Preview retorna à P0 para revisão.
- Configurar e testar a regra obrigatória de WAF rate limiting nas rotas API antes da Function, tanto no domínio direto como no rewrite. Confirmar na conta Hobby a regra disponível, chave, janela, contadores por região, consumo de requisições permitidas e que bloqueios não gastam Redis. Medir o pré-limitador em memória e o custo por requisição aceita/rejeitada; configurar alarme de comandos mensais antes de avançar.

## Entrega e roteamento

- Manter builds independentes de `apps/web` e `apps/api` com `npm ci`, checks e lockfile únicos. O web de Production usa URL relativa `/api/v1/*` e rejeita `VITE_API_BASE_URL` de outra origem. O rewrite preserva query, método, status e o envelope da API; caminhos desconhecidos sob `/api` não caem no HTML da SPA.
- A API permanece acessível no domínio do seu projeto. Aplicar validação, rate limits, cota, logs seguros e política de origem também ali; CORS não impede pedidos fora de navegador e não substitui quota. Usar somente origem web exata para CORS onde necessário e comprovar como `Origin` chega pelo rewrite em Preview e Production. Não assumir que o domínio API é privado.
- Enviar cabeçalhos de segurança no web (CSP com `connect-src 'self'`, HSTS, referrer policy, proteção de tipos) após validar links externos legítimos. Somente assets Vite com hash recebem cache longo `immutable`; HTML e arquivos sem hash revalidam. Rotas API usam política de cache explícita testada; erros e dados além do TTL não podem ser armazenados pelo CDN.
- Não usar `UPSTREAM_TEST_BASE` em Production. Ferramentas de eco e `/api/whoami` só existem em Preview isolado e são removidas/desativadas antes do release. Nenhuma variável secreta entra em `VITE_*` ou em build web. Guardar segredo Upstash e HMAC no projeto API, por ambiente, com rotação e acesso mínimo.

## Qualidade, privacidade e direitos

- Criar `npm run test:e2e` com navegador real, web compilado, Function/adapter final e respostas determinísticas do provedor. Cobrir primeira visita sem cidade, cidade salva, busca/seleção, sete dias, zero resultados, falhas e recuperação, teclado, créditos, 429/503 e proteção contra resposta atrasada de cidade anterior. Assertar que nenhum fetch do navegador contata diretamente Open-Meteo ou Upstash.
- Criar `npm run test:performance` para LCP móvel ≤ 2,5 s e CLS ≤ 0,1 nos cenários neutro e com cidade restaurada; registrar perfil. Rodar `npm run check`, cobertura de pelo menos 80% para linhas, branches, funções e statements em cada app, limites arquiteturais, axe, build, `npm audit --audit-level=high` e `gitleaks detect --redact --no-banner` nos gates existentes. CI hospedada passa em checkout limpo; não há Git remote neste checkout, portanto CI hospedada ainda não pode ser alegada.
- Repetir teste de ausência de IP e canário de cabeçalho em **ambas** as rotas finais contra eco controlado, com resposta sem cache e contagem de chamadas reais. Testar entrada direta da API, rewrite web, Preview e ambiente final protegido. Documentar só resultado, data, rota e presença/ausência, sem publicar IP bruto. Confirmar que bibliotecas/infra não adicionam `Forwarded`, `CF-Connecting-IP` ou outros cabeçalhos com IP do visitante ao destino. Falha bloqueia release e exige redesenho.
- Publicar aviso de privacidade revisado: Vercel recebe IP do acesso e sua retenção deve ser confirmada; API calcula HMAC temporário; Upstash armazena resultados de busca e previsão sob TTL; Open-Meteo recebe texto de busca ou coordenadas/fuso, mas nunca o IP do visitante; navegador guarda uma cidade até substituição/limpeza; informar finalidade, região/transferências, retenção e contato `ChristianGCa` / `christiangca.dev@gmail.com`. Confirmar informações dos fornecedores no release. Sem texto de busca, coordenadas, IP bruto ou digest em logs de aplicação.
- Concluir revisão de direitos dos dez WebP, variantes e logo em `docs/deploy/image-rights.md`; licença MIT cobre código, não imagens ou dados. Não mostrar link de repositório inexistente. Confirmar ausência de monetização, termos vigentes e atribuição Open-Meteo na interface antes da publicação.

## Operação e rollback

- Definir alarmes/observabilidade sem dados pessoais para `429` externo versus limite próprio, circuit breaker, 503, negações de cota, comandos mensais Upstash, consumo WAF/Vercel, falha Open-Meteo e cache hit/miss. Confirmar notificações e comportamento ao limite do plano gratuito; não habilitar cobrança ou upgrade automático. Registrar região, project IDs, nomes de variáveis (não valores), versão, URL web/API, quotas internas de minuto/hora/dia/mês e período de retenção no runbook.
- Ensaiar deploy protegido de Preview, smoke de `/health`, validação inválida sem provider, busca/previsão com fixture e, após termos/cota/privacy revisados, no máximo chamadas reais manuais limitadas. Reverter os **dois** projetos para versões compatíveis, mantendo chaves Redis e formato de valor versionados durante o rollback; testar que um frontend antigo continua falando com API antiga/compatível. Registrar comandos e resultados, sem alegar rollback testado antes do ensaio.
- Exposição pública depende de revisão do pacote final pelo proprietário em decisão separada. A autorização de implementação de 2026-10-04 permite executar o plano P1–P11, respeitando os gates de viabilidade; não aprova publicação pública.

## Critérios de aceite

- [ ] P1 prova topologia, versões, roteamento, Redis, WAF, taxa real de `429` externo, limites gratuitos e comportamento de cache/CDN.
- [ ] API mantém contratos e controles entre múltiplas instâncias; reserva ponderada é atômica e bloqueia fetch quando Upstash falha.
- [ ] Browser E2E, performance, acessibilidade, segurança, cobertura, CI e builds passam sem enfraquecer `CONSTRAINTS.md`.
- [ ] IP/canário não chegam à Open-Meteo nos caminhos finais testados; privacy, direitos, orçamento e termos têm evidência datada.
- [ ] Deploy protegido e rollback dos dois projetos passam; o proprietário toma decisão separada sobre publicação pública.
