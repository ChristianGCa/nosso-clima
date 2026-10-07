# Entrega Vercel + Upstash — lista ativa

**Estado em 2026-10-07:** P0 e P2–P9 estão concluídas **localmente**. O remoto `origin` aponta para `ChristianGCa/nosso-clima`. O proprietário confirmou que a entrada atual funcionou na Vercel e que excluiu o deploy. O relato de funcionamento não substitui as evidências completas de P1; CI hospedada e gates restantes precisam ser conferidos para a revisão da retomada. A publicação depende de decisão separada do proprietário. Ver [spec de entrega](../SPEC-production-delivery.md), [plano](vercel-plan.md) e [runbook](../docs/deploy/vercel-upstash-runbook.md).

## Concluído localmente

- [x] P0 — Topologia, fronteiras e implementação aprovadas; publicação pública não aprovada.
- [x] P2–P6 — API serverless, reserva agregada, cache e limites compartilhados integrados e testados com serviços simulados.
- [x] P7–P9 — Configuração dos projetos, E2E, acessibilidade, performance, CI e scans implementados e testados localmente.

As [evidências históricas](../docs/history/vercel-local-evidence-2026-10-06.md) preservam os resultados por fatia; seus hashes são anteriores à reescrita do histórico Git. Reexecutar os gates na revisão que for implantada.

## 1. Retomada do Preview protegido — P1a

- [ ] Usar o repositório GitHub existente, confirmar sua visibilidade privada, obter CI verde da revisão escolhida e importar o mesmo monorepo em dois projetos Vercel: `apps/api` e `apps/web`, com acesso ao lockfile da raiz, Node 24/npm 12 e autenticação em **todos** os deployments antes dos testes.
- [ ] Conectar uma Upstash Free somente à API Preview; configurar URL/token REST, duas chaves HMAC distintas e CORS. Implantar a API com os padrões provisórios de Preview, sem consulta válida à Open-Meteo; verificar `/health`, erro de validação e 404 JSON.
- [ ] Apontar `API_ORIGIN` do web Preview para a API Preview da mesma revisão, manter `VITE_API_BASE_URL` ausente e ajustar o CORS da API à origem web. Verificar API direta/rewrite, cabeçalhos e cache de sucesso/erro, sem segredo no bundle e sem HTML da SPA nas rotas `/api` desconhecidas.

## 2. Viabilidade antes de acesso público — P1b–P1d

- [ ] Confirmar nos termos/calculador da Open-Meteo o custo das consultas atuais e, com amostra de previsão, o limite de resposta de 64 KiB; definir tetos conservadores de minuto, hora, dia e mês. Provar no Redis real reserva atômica, cache/TTL e falha fechada; estimar o limite mensal de comandos Upstash com amostras representativas e margem para tráfego adversarial. Não pressupor dois bancos Free simultâneos.
- [ ] Configurar o rate limit do WAF em **ambos** os projetos. Verificar API direta e rewrite, bloqueio antes da Function/Redis e limites da conta Hobby. Manter o plano Free sem upgrade automático e acompanhar o consumo no painel; não exigir alarme de orçamento indisponível no Free.
- [ ] Com eco controlado e sem cache, provar nas duas rotas e nos dois domínios que IP/canário do visitante não chegam ao destino; testar falsificação e ausência de identidade confiável. Testar `429` externo e reabertura do circuit breaker com fixture, registrar incidentes reais se ocorrerem e monitorá-los após a abertura, sem provocar bloqueio do provedor como gate.

## 3. Pacote de publicação — P10–P11

- [ ] Concluir aviso de privacidade, direitos dos fundos/logo, termos e atribuição da Open-Meteo, limites de custo, região/retenção e variáveis de Production. Não colocar segredos no Git, no web ou no runbook.
- [ ] Na revisão final, obter CI, cobertura, E2E, axe, performance, audit, Gitleaks e builds verdes; fazer smoke protegido de API e web e ensaiar a reversão dos **dois** projetos para deployments de Preview conhecidos. Preservar formatos Redis versionados. Compatibilidade com uma versão pública anterior só será exigida quando ela existir.
- [ ] Registrar o resultado e a decisão explícita do proprietário antes de retirar a proteção pública. Depois da abertura, acompanhar erros, `429` externo, negações de cota e consumo dos planos Free.

## Evidência e decisão

Registrar no [runbook](../docs/deploy/vercel-upstash-runbook.md) apenas revisão, data, configuração sem segredos, resultados observados e pendências; vincular aqui o registro ao concluir cada marco. Um gate falho impede a abertura pública e requer correção e nova verificação. `CONSTRAINTS.md` continua integralmente aplicável.
