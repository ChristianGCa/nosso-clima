# Plano de implementação: Vercel + Upstash — 2026-10-04

**Estado:** único plano ativo de deploy, proposto para revisão do proprietário. O escopo foi confirmado para documentação; P0, código e publicação ainda não estão aprovados. Cloudflare foi descartada. Fonte: `CAPABILITY-MAP.md`, `CONSTRAINTS.md`, `SPEC-backend-platform.md`, `SPEC-production-delivery.md` e as duas specs de provedor.

## Resultado e sequência

Dois projetos Vercel no mesmo repositório: web Vite e API Fastify/Node 24, com `/api/*` reescrito pelo web para a API. Upstash Redis por HTTPS compartilha cache com TTL, contadores HMAC temporários e uma reserva atômica da cota ponderada Open-Meteo. Apenas planos gratuitos; falta de cota/Redis bloqueia nova consulta externa. Nenhum IP do visitante chega à Open-Meteo. Publicação pública requer autorização separada após evidência e rollback.

```text
P0 aprovar specs/fronteiras
  ↓
P1 provar topologia, custo, Redis, WAF, `429` externo e privacidade em Preview isolado
  ↓
P2 entrada Fastify serverless + configuração segura
  ↓
P3 reserva em quatro janelas + circuit breaker + saída Open-Meteo por allowlist
  ↓
P4 cache Redis + deduplicação ── P5 limite HMAC temporário
  ↓                              ↓
P6 integrar busca e previsão preservando os contratos
  ↓
P7 web, rewrite e cabeçalhos → checkpoint A
  ↓
P8 E2E e prova de IP → P9 performance, CI e segurança → checkpoint B
  ↓
P10 privacidade, direitos, orçamento e runbook
  ↓
P11 Preview protegido, smoke e rollback → checkpoint C → decisão de publicação
```

P4 e P5 podem ser desenvolvidos em fatias independentes depois de P3, com integração em `buildApp()` revisada em P6. Cada fatia deve primeiro criar testes comportamentais para a lógica alterada, implementar apenas o necessário e rodar os checks relevantes. Não criar duas versões de produção permanentes; `server.ts` local fica como entrada de desenvolvimento enquanto a Function se torna a entrada de deploy.

## P0 — Revisão de contrato

Revisar mapa de capacidades, specs P0, adendo proposto de busca/previsão, decisões de privacidade e limites gratuitos. Registrar aprovação explícita para **implementação**, data e eventuais ajustes. O requisito de IP zero, TTLs, 60/30/15, cota agregada e todos os limiares de `CONSTRAINTS.md` não são flexibilizados para aprovar o projeto. Escopo de documentação confirmado não equivale a aprovação P0.

## P1 — Prova de viabilidade isolada

Usar Preview protegido e configuração descartável. Demonstrar Node 24/npm 12, `npm ci`, build independente por projeto, entrada Fastify, roteamento direto e via rewrite, pareamento entre previews, 404 JSON para API desconhecida, CORS/Origin e headers efetivos. Validar HTTPS Upstash, segredo por ambiente, região, script atômico, lock/TTL, timeout/falha, comandos cobrados por pedido aceito e rejeitado e estimativa sob tráfego adversarial; confirmar limites dos planos gratuitos. Verificar o peso exato de geocodificação e previsão no calculador Open-Meteo, esclarecer a diferença entre termos e tabela de preços (300.000/mês) e calcular margem nas quatro janelas. Medir a taxa real de `429` externo a partir da Vercel, separada de limites próprios, e testar o circuit breaker. Provar regra WAF no Hobby antes da Function, inclusive API direta e rewrite, contadores por região, pedidos permitidos e rejeição sem gasto Redis; medir pré-limite em memória e configurar alarme de consumo mensal de comandos com canal testado. Reproduzir o teste anti-spoof de IP recebido pela API e o de saída ao eco sem dados pessoais. Não usar Open-Meteo em testes automatizados; a medição externa deve ser manual, limitada e registrada. Se o caminho real incluir IP do visitante, a proteção de custo falhar, a taxa de `429` for incompatível com a disponibilidade aceitável ou a quota não for demonstrável, voltar à P0 para redesenho antes de código de produção.

## P2–P3 — Plataforma obrigatória

P2 introduz o adapter Vercel que reutiliza `buildApp()`, separa lifecycle local e serverless, valida env sem exibir valores e mantém health, erros, request IDs e logs seguros. Corrigir `env.ts` para rejeitar origem `http:` em Production, com teste de ausência, HTTP, loopback e HTTPS permitido. P3 cria um único caminho de saída com hosts fixos e cabeçalhos por allowlist, e reserva Redis **antes** de cada fetch real. Testar quatro janelas sob concorrência e transição, negação sem incremento parcial, créditos ponderados, falha/timeout Redis, timeout Open-Meteo após reserva e zero retry implícito. Classificar `429` externo, abrir circuit breaker compartilhado com cooldown finito e reabertura controlada; negar misses antes de nova reserva enquanto aberto. Nenhum endpoint deve poder contornar a reserva.

## P4–P6 — Cache, limites e contratos

P4 adiciona cache Upstash versionado com chaves opacas e TTL 24 h/10 min, valores normalizados e nenhuma resposta vencida. Testar hits entre instâncias, expiração exata, vazio válido, falha não cacheada e duplicação concorrente; medir custo dos locks e garantir reserva por chamada real caso o lock falhe. P5 aplica pré-limite em memória antes do Redis, HMAC temporário do IP confiável da Vercel e limites compartilhados 60/30/15, sem analytics ou armazenamento bruto; testar spoof, ausência de header, concorrência, TTL, estado limitado e falha fechada. P6 liga busca e previsão à plataforma mantendo parâmetros, três casas decimais, sete dias, créditos, shapes, erros e cache TTL; comparar com fixtures e baseline Node. Testes reais de integração usam o mesmo adapter que será implantado, com transporte externo simulado.

## P7–P9 — Entrega e gates

P7 configura dois projetos, rewrite, regra WAF obrigatória nas rotas API, paths relativos, CORS exato, segurança web e política explícita do CDN. Validar `VITE_API_BASE_URL`: em Production deve estar ausente ou ser da própria origem HTTPS; rejeitar HTTP, loopback e origem divergente. Testar ambos os domínios, Preview e resposta em cache/erro; procurar URLs/segredos no build estático. Checkpoint A exige contratos de API e roteamento, `npm run check`, builds, cobertura e boundaries verdes.

P8 implementa `npm run test:e2e` com navegador real, artefatos de web e API final e provedor em fixture. Cobrir fluxo neutro, cidade salva, busca, previsão, sete dias, falhas, 429/503, teclado, créditos e nenhuma requisição externa do navegador. Repetir teste de IP nas duas rotas finais e contar chamadas reais recebidas pelo eco, incluindo domínio direto da API e rewrite. P9 implementa `npm run test:performance` nos limiares atuais, CI em checkout limpo, `gitleaks --redact`, auditoria e telemetria sem dados pessoais. Checkpoint B exige cada gate medido e aprovado; sem Git remote, CI hospedada fica pendente e B não passa.

## P10–P11 — Pacote de release

P10 registra termos Open-Meteo vigentes, peso e tetos internos de minuto/hora/dia/mês com margem, taxa de `429` externo, custo Upstash/Vercel Free, região e retenção, aviso de privacidade, direitos dos dez fundos/logo, licença MIT, URL real, variáveis por ambiente (nomes apenas), alarmes e procedimento de falha. P11 faz Preview protegido e ensaio de rollback dos **dois** projetos e dos formatos Redis versionados, com smoke e evidência datada. Checkpoint C entrega pacote para decisão **separada** do proprietário sobre publicação pública.

## Verificação e riscos a acompanhar

| Risco | Prova exigida |
|---|---|
| Escala de Functions rompe cache/rate limit local | Hits e limites compartilhados entre instâncias, com cota agregada independente |
| Janelas fixas deixam escapar rajada na fronteira | Testes com tempo falso e concorrência nas janelas móveis |
| Reserva local não vê uso do IP compartilhado | Taxa real de `429` externo por rota na Vercel; classificação própria e circuit breaker |
| Redis Free esgota por abuso ou locks | WAF antes da Function, pré-limite em memória, modelo de comandos por pedido, ensaio e alarme mensal; bloqueio de outbound em falha |
| Rewrite ou CDN servem payload incorreto/vencido | Requests reais em Preview e inspeção de `Cache-Control` em sucesso/erro |
| IP do visitante atravessa adapter/infra | Canário e IP falsificado em ambas as rotas, por ambos os domínios, com contagem no eco |
| Domínio API direto contorna política web | Mesma validação, limites e quota no backend público |
| Builds incompatíveis com npm 12/Node 24 | Registro de versões e instalação limpa por projeto, sem enfraquecer `engines` |
| Mudança de contrato ou dado pessoal no Redis/log | Testes de paridade, TTL, chaves opacas e inspeção de logs/privacy |

## Dependências externas abertas

Ainda não há Git remote nem projetos Vercel/Upstash configurados neste checkout. P1 exige acesso do proprietário à conta e aprovação P0. Região, URLs, valores de quota interna, peso Open-Meteo e configuração definitiva de Preview são resultados mensuráveis de P1/P10, não números inventados neste plano. Ver [pesquisa datada](../docs/deploy/vercel-research-2026-10-04.md).
