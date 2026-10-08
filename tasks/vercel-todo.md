# Entrega Vercel + Upstash — lista ativa

**Estado em 2026-10-07 (ensaio até 2026-10-08 UTC):** P0 e P2–P9 estão concluídas **localmente**. API e web estão Ready em Preview; busca, previsão de sete dias, cache hit e CORS permitido foram verificados pela CLI, e o proprietário confirmou o funcionamento no navegador. P1 está parcialmente verificada; CI hospedada e provas restantes continuam abertas. A [evidência do ensaio](../docs/deploy/preview-evidence-2026-10-07.md) registra configuração e resultados sem URLs reais nem IDs de infraestrutura; esses dados permanecem no painel Vercel. Publicação depende de decisão separada. Ver [spec](../SPEC-production-delivery.md), [plano](vercel-plan.md) e [runbook](../docs/deploy/vercel-upstash-runbook.md).

## Concluído localmente

- [x] P0 — Topologia, fronteiras e implementação aprovadas; publicação pública não aprovada.
- [x] P2–P6 — API serverless, reserva agregada, cache e limites compartilhados integrados e testados com serviços simulados.
- [x] P7–P9 — Configuração dos projetos, E2E, acessibilidade, performance, CI e scans implementados e testados localmente.

As [evidências históricas](../docs/history/vercel-local-evidence-2026-10-06.md) preservam os resultados por fatia; seus hashes são anteriores à reescrita do histórico Git. Reexecutar os gates na revisão que for implantada.

## 1. Preview existente — P1a parcial

- [x] Dois projetos do mesmo monorepo Ready em Preview: API (`apps/api`) e web (`apps/web`); resultados documentados de forma anonimizada e identificadores consultáveis no painel Vercel.
- [x] API direta responde `/health` 200, consulta inválida 400 JSON e rota desconhecida 404 JSON; proprietário também testou o caminho pelo frontend.
- [x] Criar o web Preview pela CLI com `API_ORIGIN` local e `--build-env`, usando o alias de branch da API; `VITE_API_BASE_URL` ausente na listagem do web. Confirmar que o frontend alcança a API e exibe o fluxo de busca/previsão, segundo teste do proprietário.
- [x] Corrigir os escopos Preview dos tetos Open-Meteo e de `API_ORIGIN`; definir overrides de URL da branch; redeployar a API e confirmar CORS permitido para a origem web atual.
- [ ] Conferir pareamento dos SHAs hospedados, visibilidade privada do GitHub, CI verde da revisão e versões efetivas Node 24/npm 12 e instalação pelo lockfile da raiz nos dois builds.
- [ ] Confirmar proteção de **todos** os deployments e configuração efetiva dos planos gratuitos, região e vinculação Upstash somente à API.
- [ ] Completar a matriz de headers/CSP, assets e cache/CDN em sucesso e erro, API direta e rewrite, incluindo repetição sem `HIT` e 404 sem fallback SPA. O cache `private, no-store` foi observado na consulta inválida direta.
- [ ] Testar CORS com origem ausente/divergente e inspecionar o bundle sem segredos. O teste positivo da origem permitida já passou.

## 2. Viabilidade antes de acesso público — P1b–P1d

- [x] P1b, smoke limitado: busca e previsão retornaram 200; repetição da previsão retornou 200 com `cache_hit` Redis confirmado. O bloqueio anterior por `quota_denied` foi diagnosticado e resolvido pela correção dos escopos e redeploy.
- [ ] Confirmar nos termos/calculador da Open-Meteo o custo das consultas atuais e, com amostra de previsão, o limite de resposta de 64 KiB; definir tetos conservadores de minuto, hora, dia e mês. Provar no Redis real reserva atômica, cache/TTL e falha fechada; estimar o limite mensal de comandos Upstash com amostras representativas e margem para tráfego adversarial. Não pressupor dois bancos Free simultâneos.
- [ ] Conferir os números efetivos de créditos cadastrados com o proprietário: os valores gerais são Secret e não foram extraídos pela CLI. A proposta de testes da conversa não comprova a política final nem os valores de Production.
- [ ] Configurar o rate limit do WAF em **ambos** os projetos. Verificar API direta e rewrite, bloqueio antes da Function/Redis e limites da conta Hobby. Manter o plano Free sem upgrade automático e acompanhar o consumo no painel; não exigir alarme de orçamento indisponível no Free.
- [ ] Com eco controlado e sem cache, provar nas duas rotas e nos dois domínios que IP/canário do visitante não chegam ao destino; testar falsificação e ausência de identidade confiável. Testar `429` externo e reabertura do circuit breaker com fixture, registrar incidentes reais se ocorrerem e monitorá-los após a abertura, sem provocar bloqueio do provedor como gate.

## 3. Pacote de publicação — P10–P11

- [ ] Concluir aviso de privacidade, direitos dos fundos/logo, termos e atribuição da Open-Meteo, limites de custo, região/retenção e variáveis de Production. Não colocar segredos no Git, no web ou no runbook.
- [ ] Na revisão final, obter CI, cobertura, E2E, axe, performance, audit, Gitleaks e builds verdes; fazer smoke protegido de API e web e ensaiar a reversão dos **dois** projetos para deployments de Preview conhecidos. Preservar formatos Redis versionados. Compatibilidade com uma versão pública anterior só será exigida quando ela existir.
- [ ] Registrar o resultado e a decisão explícita do proprietário antes de retirar a proteção pública. Depois da abertura, acompanhar erros, `429` externo, negações de cota e consumo dos planos Free.

## Evidência e decisão

Registrar no [runbook](../docs/deploy/vercel-upstash-runbook.md) apenas revisão, data, configuração sem segredos, resultados observados e pendências; vincular aqui o registro ao concluir cada marco. Um gate falho impede a abertura pública e requer correção e nova verificação. `CONSTRAINTS.md` continua integralmente aplicável.
