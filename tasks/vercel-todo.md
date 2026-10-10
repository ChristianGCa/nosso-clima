# Entrega Vercel + Upstash — lista ativa

**Estado em 2026-10-09:** P0/P2–P9 locais concluídas e correções integradas à `main`; a validação continua em `chore/vercel-p1`. O proprietário confirmou **Quality gates verde de `ef9cda2`**. A CLI confirmou ambos os Previews Ready em `0c6d090`, proteção `All Deployments` e 404 JSON na API direta. A [rodada de navegador](../docs/deploy/revision-review-2026-10-09.md) coletou 404, validações 400 e sucessos 200 de busca/previsão pelo web com Disable cache desmarcado; todas as respostas informadas têm JSON, `private, no-store` e `MISS`. A previsão preservou `retrievedAtUtc` após reabrir com a cidade salva. A comparação local entre as revisões altera apenas documentação e CI. A matriz completa, P1 e revisão do runtime Production continuam parciais; publicação depende de decisão separada. Ver [spec](../SPEC-production-delivery.md), [plano](vercel-plan.md) e [runbook](../docs/deploy/vercel-upstash-runbook.md).

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
- [x] Atualização das actions para Node 24 presente em `8ee1b56`, ancestral de `ef9cda2`; HEAD e referência local `origin/chore/vercel-p1` coincidem após fetch registrado no reflog em 2026-10-09. Isso confirma o recebimento dos commits na consulta registrada, sem comprovar CI ou deployment.
- [x] **Quality gates** verde para `ef9cda2` no GitHub, confirmado pelo proprietário em 2026-10-09. O agente não leu a execução privada; a fonte e a limitação estão na evidência da retomada.
- [x] Identificar a revisão dos dois Previews atuais: API e web Ready em `0c6d090`, informados pelo proprietário e confirmados pela CLI em 2026-10-09. A comparação local até `ef9cda2` altera somente Markdown e workflow de CI. Continuar a matriz P1a em `0c6d090`, atribuindo resultados a esse SHA; conferir novamente CI e deployments da revisão final em P11.
- [x] Confirmar proteção `All Deployments` nos dois projetos pela CLI, em 2026-10-08 e novamente em 2026-10-09.
- [ ] Completar configuração efetiva da Upstash: plano gratuito, região e vinculação somente à API. Os dois deployments Vercel confirmam Hobby e a Function usa `iad1`; nomes de credenciais Redis aparecem apenas no projeto API.
- [x] Coletar 404 pelo web em navegador autorizado: proprietário informou GET, 404, `private, no-store` e `MISS` na primeira chamada e após recarregar; a repetição também informa `application/json; charset=utf-8` e JSON `NOT_FOUND`. Endereço real e request ID foram omitidos da evidência.
- [x] Coletar busca inválida pelo web: proprietário informou GET com `query=a`, 400 JSON `VALIDATION_ERROR`, `private, no-store` na resposta e `MISS` nas duas chamadas. Esclareceu que `no-cache` pertence à requisição do navegador. Content-Type não informado; dados operacionais omitidos da evidência.
- [x] Coletar previsão sem parâmetros pelo web: proprietário informou GET, 400 JSON `VALIDATION_ERROR`, `application/json; charset=utf-8`, `private, no-store` e `MISS` na primeira chamada e após recarregar. Dados operacionais omitidos da evidência.
- [x] Coletar busca válida pelo web: proprietário informou 200, `application/json; charset=utf-8`, `private, no-store`, `MISS`, cinco resultados e atribuição nas duas chamadas. Depois esclareceu que todas as coletas iniciais de navegador usaram Disable cache, incluindo 404 e validações. Termo e dados das localidades foram omitidos da evidência.
- [x] Coletar busca válida pela interface com Disable cache desmarcado: proprietário informou GET, 200, `application/json; charset=utf-8`, `private, no-store` e `MISS`; corpo não fornecido novamente.
- [x] Recoletar os três erros com Disable cache desmarcado: proprietário informou primeira chamada e repetição para rota inexistente (404 `NOT_FOUND`), busca inválida e previsão sem parâmetros (400 `VALIDATION_ERROR`). Todas as seis respostas têm `application/json; charset=utf-8`, `private, no-store` e `MISS`; a coleta complementa os Content-Types antes ausentes.
- [x] Coletar previsão válida pelo web após selecionar cidade e reabrir pelo logo: proprietário informou 200, `application/json; charset=utf-8`, `private, no-store` e `MISS` nas duas chamadas, com condições atuais, sete dias e atribuição. Corpo e `retrievedAtUtc` iguais; isso é compatível com cache da aplicação, sem comprovar isoladamente hit Redis ou expiração. Dados meteorológicos e localização omitidos da evidência.
- [ ] Completar a matriz de headers/cache em sucesso e erro para busca/previsão e no rewrite com sessão autorizada. API direta: health 200, validação 400 repetida e 404 JSON com `private, no-store`/`MISS` na evidência anterior; 404 repetido foi reconfirmado em 2026-10-09. HTML, manifesto, assets com hash e segurança web passaram anteriormente. Sucessos de busca/previsão e os três erros pelo web têm coleta com Disable cache desmarcado. A matriz completa, inclusive sucesso pela API direta e demais falhas previstas no plano, continua pendente.
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
