# Plano de implementação: Vercel + Upstash — 2026-10-04

Plano aprovado em P0, em 2026-10-04. As specs de cada módulo e `CONSTRAINTS.md` continuam vigentes; progresso, branch de validação e pendências são registrados somente na [lista ativa](vercel-todo.md). A publicação exige decisão separada.

## Resultado e sequência

Dois projetos Vercel no mesmo repositório: web Vite e API Fastify/Node 24, com `/api/*` reescrito pelo web para a API. Upstash Redis por HTTPS compartilha cache com TTL, contadores HMAC temporários e uma reserva atômica da cota ponderada Open-Meteo. Apenas planos gratuitos; falta de cota/Redis bloqueia nova consulta externa. Nenhum IP do visitante chega à Open-Meteo. Publicação pública requer autorização separada após evidência e rollback.

```text
P0 aprovar specs/fronteiras e execução local primeiro
  ↓
P2 entrada Fastify serverless + configuração segura
  ↓
P3 reserva em quatro janelas + circuit breaker + saída Open-Meteo por allowlist
  ↓
P4 cache Redis + deduplicação ── P5 limite HMAC temporário
  ↓                              ↓
P6 integrar busca e previsão preservando os contratos
  ↓
P7 web, rewrite e cabeçalhos
  ↓
P8 E2E local → P9 performance, CI e segurança locais
  ↓
P1 configuração manual e prova em Preview protegido: topologia, Redis,
   WAF, custo, IP e cache; simular `429` externo
  ↓
P10 privacidade, direitos, orçamento e runbook
  ↓
P11 smoke e rollback dos dois projetos → decisão de publicação
```

P4 e P5 podem ser desenvolvidos em fatias independentes depois de P3, com integração em `buildApp()` revisada em P6. Cada fatia deve primeiro criar testes comportamentais para a lógica alterada, implementar apenas o necessário e rodar os checks relevantes. Não criar duas versões de produção permanentes; `server.ts` local fica como entrada de desenvolvimento enquanto a Function se torna a entrada de deploy. Antes de P1, dependências externas são simuladas e a entrada de produção deve falhar fechada sem configuração completa. Resultados locais não comprovam comportamento da Vercel ou Upstash.

## P0 — Revisão de contrato

Revisar mapa de capacidades, specs P0, adendo proposto de busca/previsão, decisões de privacidade e limites gratuitos. Registrar aprovação explícita para **implementação**, data e eventuais ajustes. O requisito de IP zero, TTLs, 60/30/15, cota agregada e todos os limiares de `CONSTRAINTS.md` não são flexibilizados para aprovar o projeto. Escopo de documentação confirmado não equivale a aprovação P0.

## P1 — Prova de viabilidade isolada

Depois da implementação e verificação local P2–P9, o proprietário configura dois projetos e a Upstash no próprio ambiente. P1 usa a implementação final em Preview protegido, com fixtures e dados descartáveis, para provar os mecanismos reais antes de qualquer exposição pública. A evidência local de P2–P9 não conclui P1; falha de viabilidade exige revisar P0 e corrigir a implementação antes do release.

| Fatia | Prova a executar | Evidência para concluir |
|---|---|---|
| P1a — Topologia e build | Dois projetos, Node 24/npm 12, `npm ci`, builds independentes, diretórios raiz, entrada Fastify, API direta e rewrite; Preview web pareado à API Preview; 404 JSON para `/api` desconhecida, CORS/Origin e headers/cache efetivos | Configuração sem segredos, versões, URLs e respostas observadas; demonstração de que Preview não usa API Production nem retorna HTML da SPA para erro de API |
| P1b — Redis e cota do provedor | HTTPS, segredos por ambiente, script atômico nas quatro janelas, cache/TTL, contenção e falha; confirmar peso das consultas atuais e uma amostra de previsão dentro de 64 KiB | Testes da implementação final em Preview, fontes datadas e tetos internos por minuto/hora/dia/mês; nenhuma chamada externa sem reserva |
| P1c — Proteção e custo Free | Regra WAF Hobby antes da Function na API direta e no rewrite; amostras representativas de comandos Upstash e estimativa normal/adversarial; acompanhar o consumo no painel Free sem upgrade automático | Limites gratuitos confirmados, bloqueios sem invocação da Function nem comando Redis e estimativa mensal com margem; orçamento/alarme do plano pago por uso não é gate do Free |
| P1d — Identidade, saída e falha externa | Anti-spoof do IP recebido pela Function nos dois caminhos; saída ao eco sem IP/canário do visitante; `429` externo e circuit breaker testados com fixture | Relatório de presença/ausência sem IP bruto e ensaio do circuit breaker/falha fechada; registrar `429` real se ocorrer, sem provocá-lo como gate |

P1b inclui o custo da consulta de previsão com `hourly.weather_code`; P1c usa amostras representativas dos mecanismos medidos em P1b; P1d usa a topologia de P1a. Testes automatizados usam fixtures e nunca Open-Meteo real; medições externas são manuais, limitadas e registradas. Não pressupor dois bancos Upstash Free simultâneos. Se o caminho incluir IP do visitante, a proteção de custo falhar ou a quota não for demonstrável, voltar à P0 para redesenho antes de publicação.

Registrar configurações e resultados no [runbook](../docs/deploy/vercel-upstash-runbook.md), com data e versão testada, e vincular a evidência na [lista ativa](vercel-todo.md). Diferenças entre hipóteses locais e parâmetros medidos exigem correção e novos testes antes do release; a prova de IP ocorre nas duas rotas finais em P1/P11.

## P2–P3 — Plataforma obrigatória (`backend-platform`)

P2 introduz o adapter Vercel que reutiliza `buildApp()`, separa lifecycle local e serverless, valida env sem exibir valores e mantém health, erros, request IDs e logs seguros. Corrigir `env.ts` para rejeitar origem `http:` em Production, com teste de ausência, HTTP, loopback e HTTPS permitido. P3 cria um único caminho de saída com hosts fixos e cabeçalhos por allowlist, e reserva Redis **antes** de cada fetch real. Testar quatro janelas sob concorrência e transição, negação sem incremento parcial, créditos ponderados, falha/timeout Redis, timeout Open-Meteo após reserva e zero retry implícito. Classificar `429` externo, abrir circuit breaker compartilhado com cooldown finito e reabertura controlada; negar misses antes de nova reserva enquanto aberto. Nenhum endpoint deve poder contornar a reserva.

## P4–P6 — Cache, limites e contratos

P4 e P5 pertencem a `backend-platform`; P6 integra os consumidores `location-search` e `weather-forecast` aos contratos dessa plataforma.

P4 adiciona cache Upstash versionado com chaves opacas e TTL 24 h/10 min, valores normalizados e nenhuma resposta vencida. Testar hits entre instâncias, expiração exata, vazio válido, falha não cacheada e duplicação concorrente; medir custo dos locks e garantir reserva por chamada real caso o lock falhe. P5 aplica pré-limite em memória antes do Redis, HMAC temporário do IP confiável da Vercel e limites compartilhados 60/30/15, sem analytics ou armazenamento bruto; testar spoof, ausência de header, concorrência, TTL, estado limitado e falha fechada. P6 liga busca e previsão à plataforma mantendo parâmetros, três casas decimais, sete dias, créditos, shapes, erros e cache TTL; comparar com fixtures e baseline Node. Testes reais de integração usam o mesmo adapter que será implantado, com transporte externo simulado.

## P7–P9 — Entrega e gates

`production-delivery` coordena estas etapas; a validação do cliente em P7 pertence a `weather-ui`.

P7 versiona a configuração proposta dos dois projetos, rewrite, regra WAF obrigatória nas rotas API, paths relativos, CORS exato, segurança web e política explícita do CDN. Validar `VITE_API_BASE_URL`: em Production deve estar ausente ou ser da própria origem HTTPS; rejeitar HTTP, loopback e origem divergente. Inspecionar URLs/segredos no build estático. Os contratos, checks, builds e cobertura passaram localmente; a verificação dos dois domínios, Preview e resposta em cache/erro ocorre em P1.

P8 implementa `npm run test:e2e` com navegador real, artefatos de web e API final e provedor em fixture. Cobrir fluxo neutro, cidade salva, busca, previsão, sete dias, falhas, 429/503, teclado, créditos e nenhuma requisição externa do navegador. O teste de IP real nas duas rotas finais e a contagem de chamadas recebidas pelo eco ocorrem em P1d, incluindo domínio direto da API e rewrite. P9 implementa `npm run test:performance` nos limiares atuais, configuração de CI para checkout limpo, `gitleaks --redact`, auditoria e telemetria sem dados pessoais. CI hospedada, custo Free e comportamento real continuam pendentes até a revisão final em P1/P10; o remoto GitHub existe, e a execução hospedada da revisão final precisa ser conferida.

## P10–P11 — Pacote de release

P10 registra termos Open-Meteo vigentes, peso e tetos internos de minuto/hora/dia/mês com margem, custo Upstash/Vercel Free, região e retenção, aviso de privacidade, direitos dos dez fundos/logo, licença MIT, URL real, variáveis por ambiente (nomes apenas), monitoramento disponível no plano e procedimento de falha. P11 faz smoke protegido e ensaio de rollback dos **dois** projetos para deployments de Preview conhecidos, preservando formatos Redis versionados. A revisão final entrega o pacote para decisão **separada** do proprietário sobre publicação pública; compatibilidade com versão pública anterior só se aplica depois do primeiro lançamento.

## Verificação e riscos a acompanhar

| Risco | Prova exigida |
|---|---|
| Escala de Functions rompe cache/rate limit local | Hits e limites compartilhados entre instâncias, com cota agregada independente |
| Janelas fixas deixam escapar rajada na fronteira | Testes com tempo falso e concorrência nas janelas móveis |
| Reserva local não vê uso do IP compartilhado | Classificação de `429` externo, circuit breaker testado com fixture e monitoramento de ocorrências reais após abertura |
| Redis Free esgota por abuso ou locks | WAF antes da Function, pré-limite em memória, estimativa conservadora de comandos, conferência do painel Free e bloqueio de outbound em falha |
| Rewrite ou CDN servem payload incorreto/vencido | Requests reais em Preview e inspeção de `Cache-Control` em sucesso/erro |
| IP do visitante atravessa adapter/infra | Canário e IP falsificado em ambas as rotas, por ambos os domínios, com contagem no eco |
| Domínio API direto contorna política web | Mesma validação, limites e quota no backend público |
| Builds incompatíveis com npm 12/Node 24 | Registro de versões e instalação limpa por projeto, sem enfraquecer `engines` |
| Mudança de contrato ou dado pessoal no Redis/log | Testes de paridade, TTL, chaves opacas e inspeção de logs/privacy |

## Dependências externas

O proprietário coordena a configuração e os deployments; a lista ativa registra as pendências e o alcance da assistência do agente. A [pesquisa datada](../docs/deploy/vercel-research-2026-10-04.md) preserva as hipóteses de viabilidade, que precisam de prova na revisão implantada.
