# Entrega Vercel + Upstash — lista ativa

**Estado em 2026-10-08:** P0/P2–P9 locais concluídas e correções integradas à `main`. `chore/vercel-p1` é a branch ativa. API/web funcionam em Preview; ambos os projetos tiveram `All Deployments` confirmado pela CLI. Amostras de 503 foram classificadas como `quota_denied`; o proprietário ampliou os tetos de testes e relatou melhora. A [evidência inicial](../docs/deploy/preview-evidence-2026-10-07.md) e o [andamento atual](../docs/deploy/preview-progress-2026-10-08.md) são anonimizados. P1 e revisão do runtime Production continuam parciais; publicação depende de decisão separada. Ver [spec](../SPEC-production-delivery.md), [plano](vercel-plan.md) e [runbook](../docs/deploy/vercel-upstash-runbook.md).

## Concluído localmente

- [x] P0 — Topologia, fronteiras e implementação aprovadas; publicação pública não aprovada.
- [x] P2–P6 — API serverless, reserva agregada, cache e limites compartilhados integrados e testados com serviços simulados.
- [x] P7–P9 — Configuração dos projetos, E2E, acessibilidade, performance, CI e scans implementados e testados localmente.
- [x] Correções incorporadas à `main`; validação continuada em `chore/vercel-p1`. Branches antigas removidas no GitHub pelo proprietário.

As [evidências históricas](../docs/history/vercel-local-evidence-2026-10-06.md) preservam os resultados por fatia; seus hashes são anteriores à reescrita do histórico Git. Reexecutar os gates na revisão que for implantada.

## 1. Preview existente — P1a parcial

- [x] Dois projetos do mesmo monorepo Ready em Preview: API (`apps/api`) e web (`apps/web`); resultados documentados de forma anonimizada e identificadores consultáveis no painel Vercel.
- [x] API direta responde `/health` 200, consulta inválida 400 JSON e rota desconhecida 404 JSON; proprietário também testou o caminho pelo frontend.
- [x] Criar o web Preview pela CLI com `API_ORIGIN` local e `--build-env`, usando o alias de branch da API; `VITE_API_BASE_URL` ausente na listagem do web. Confirmar que o frontend alcança a API e exibe o fluxo de busca/previsão, segundo teste do proprietário.
- [x] Corrigir os escopos Preview dos tetos Open-Meteo e de `API_ORIGIN`; definir overrides de URL da branch; redeployar a API e confirmar CORS permitido para a origem web atual.
- [x] Pareamento confirmado dos dois Previews em `0c6d090`, repositório privado no vínculo Git e Node `24.21.0`/npm `12.0.2` com `npm ci --include=dev` nos logs dos dois builds. Proprietário confirmou **Quality gates** verde dessa revisão, com warning Node 20; ver [verificação adicional](../docs/deploy/preview-progress-2026-10-08.md#verificação-adicional-de-p1a-e-ci).
- [ ] Enviar a atualização das actions para Node 24 e conferir a nova CI hospedada; a CI verde de `0c6d090` não comprova commits posteriores.
- [x] Confirmar proteção `All Deployments` nos dois projetos pela CLI, em 2026-10-08.
- [ ] Completar configuração efetiva da Upstash: plano gratuito, região e vinculação somente à API. Os dois deployments Vercel confirmam Hobby e a Function usa `iad1`; nomes de credenciais Redis aparecem apenas no projeto API.
- [ ] Completar a matriz de headers/cache em sucesso e erro para busca/previsão e no rewrite com sessão autorizada. API direta: health 200, validação 400 repetida e 404 JSON com `private, no-store`/`MISS`. HTML, manifesto, assets com hash e segurança web passaram. Proprietário confirmou JSON `NOT_FOUND` pelo web; status/headers desse caminho ainda faltam.
- [x] CORS direto: alias web permitido recebe origem exata; origem ausente/divergente não recebe permissão. JS entregue sem nomes de segredos Redis/HMAC ou hosts conhecidos de infraestrutura encontrados; projeto web lista somente `API_ORIGIN`.

## 2. Viabilidade antes de acesso público — P1b–P1d

- [x] P1b, smoke limitado: busca e previsão retornaram 200; repetição da previsão retornou 200 com `cache_hit` Redis confirmado. O bloqueio anterior por `quota_denied` foi diagnosticado e resolvido pela correção dos escopos e redeploy.
- [x] Diagnosticar novas amostras de 503 intermitentes: duas de previsão e uma de busca com `quota_denied`, no mesmo Preview que também atende hits/misses 200. Proprietário ampliou os tetos de teste e relatou melhora; janela exata e valores Secret não foram auditados.
- [ ] Confirmar nos termos/calculador da Open-Meteo o custo das consultas atuais e, com amostra de previsão, o limite de resposta de 64 KiB; definir tetos conservadores de minuto, hora, dia e mês. Provar no Redis real reserva atômica, cache/TTL e falha fechada; estimar o limite mensal de comandos Upstash com amostras representativas e margem para tráfego adversarial. Não pressupor dois bancos Free simultâneos.
- [ ] Conferir os números efetivos de créditos cadastrados com o proprietário: os valores gerais são Secret e não foram extraídos pela CLI. A proposta de testes da conversa não comprova a política final nem os valores de Production.
- [ ] Configurar o rate limit do WAF em **ambos** os projetos. Consulta da configuração ativa retornou `Config not found` nos dois; proprietário confirmou que ainda não criou as regras. Verificar API direta e rewrite, bloqueio antes da Function/Redis e limites da conta Hobby. Manter o plano Free sem upgrade automático e acompanhar o consumo no painel; não exigir alarme de orçamento indisponível no Free.
- [ ] Com eco controlado e sem cache, provar nas duas rotas e nos dois domínios que IP/canário do visitante não chegam ao destino; testar falsificação e ausência de identidade confiável. Testar `429` externo e reabertura do circuit breaker com fixture, registrar incidentes reais se ocorrerem e monitorá-los após a abertura, sem provocar bloqueio do provedor como gate.

## 3. Pacote de publicação — P10–P11

- [ ] Concluir aviso de privacidade, direitos dos fundos/logo, termos e atribuição da Open-Meteo, limites de custo, região/retenção e variáveis de Production. Não colocar segredos no Git, no web ou no runbook.
- [ ] Revisar a inicialização e as variáveis do runtime Production: logs fornecidos apresentam `application_environment` e 500, apesar de builds Ready. Não confundir esses deployments com o Preview funcional.
- [ ] Na revisão final, obter CI, cobertura, E2E, axe, performance, audit, Gitleaks e builds verdes; fazer smoke protegido de API e web e ensaiar a reversão dos **dois** projetos para deployments de Preview conhecidos. Preservar formatos Redis versionados. Compatibilidade com uma versão pública anterior só será exigida quando ela existir.
- [ ] Registrar o resultado e a decisão explícita do proprietário antes de retirar a proteção pública. Depois da abertura, acompanhar erros, `429` externo, negações de cota e consumo dos planos Free.

## Evidência e decisão

Registrar no [runbook](../docs/deploy/vercel-upstash-runbook.md) apenas revisão, data, procedimentos com placeholders, resultados observados e pendências; URLs reais, IDs, contas, valores Secret e logs brutos ficam fora do Git. Vincular a evidência anonimizada ao concluir cada marco. O proprietário executa os ajustes de ambiente/deployments atuais; consultas do agente são de leitura. A sugestão de ampliar os logs com janela, custo e saldo foi cancelada antes de implementação. Um gate falho impede a abertura pública e exige correção e nova verificação. `CONSTRAINTS.md` continua integralmente aplicável.
