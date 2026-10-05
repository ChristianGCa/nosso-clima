# Tarefas: Vercel + Upstash

**Estado:** P0 aprovada para implementação em 2026-10-04; desenvolvimento local vem antes da configuração manual da Vercel pelo proprietário. P1 e publicação pública permanecem pendentes. [Plano](vercel-plan.md), [spec da plataforma](../SPEC-backend-platform.md), [spec de entrega](../SPEC-production-delivery.md).

## Progresso

- [x] P0 — Proprietário aprova specs, adendos, fronteiras e este plano para implementação.
- [x] P2 — Adapter serverless e configuração segura; rejeitar origem `http:` em Production em `env.ts`.
  - [x] P2a — CORS de Production exige origem HTTPS pública explícita; rejeita HTTP e loopback.
  - [x] P2b — Entrada Fastify serverless e paridade HTTP com o baseline local.
  - [x] P2c — Validar Redis HTTPS, token e chave HMAC na entrada serverless.
- [x] P3 — Reserva ponderada atômica das quatro janelas, circuit breaker de `429` externo e saída Open-Meteo por allowlist (integração local; pesos/tetos e Redis reais ainda dependem de P1b).
  - [x] P3a — Transporte REST `EVAL` HTTPS com timeout, resposta limitada e falha fechada.
  - [x] P3b — Reserva ponderada atômica genérica das quatro janelas móveis; tetos e pesos reais seguem para P1b.
  - [x] P3c — Circuit breaker compartilhado e transporte Open-Meteo por allowlist, prontos para integração.
  - [x] P3d — Ligar as duas rotas à reserva antes de cada `fetch` real.
- [x] P4 — Cache Redis versionado, TTL e deduplicação entre instâncias (infraestrutura local; integração nas rotas em P6 e prova real em P1b).
- [x] P5 — Pré-limite em memória e rate limit 60/30/15 compartilhado com HMAC de ~1 minuto (implementação/testes locais; cabeçalho e custo reais em P1c/P1d).
- [ ] P6 — Integrar busca e previsão com paridade ao baseline local.
- [ ] P7 — Web Vite, configuração de rewrite/WAF, validação de `VITE_API_BASE_URL`, CORS exato e políticas de headers/cache implementadas localmente.
- [ ] Checkpoint A — API e web compilados, contratos, boundaries, cobertura e checks verdes.
- [ ] P8 — E2E local com fixture e proteção contra saída de dados sensíveis; prova real de IP fica em P1d.
- [ ] P9 — Performance, configuração de CI, auditoria, Gitleaks e observabilidade segura verificadas localmente; execução hospedada fica em P1/Checkpoint B.
- [ ] P1a — Provar dois projetos, Fastify Function, Preview/rewrite, versões, builds, origens e cache/headers.
- [ ] P1b — Provar Redis/cota atômica e confirmar peso e tamanho da consulta horária de 2026-10-04; calcular margens nas quatro janelas.
- [ ] P1c — Provar WAF nos dois caminhos, pré-limite, consumo por pedido e alarme mensal no Free.
- [ ] P1d — Provar identidade/saída sem IP, medir `429` externo e ensaiar circuit breaker na implementação final.
- [ ] P1 — Consolidar P1a–P1d e concluir a viabilidade integrada antes da publicação.
- [ ] Checkpoint B — Gates locais/hospedados e custo Free medidos.
- [ ] P10 — Privacidade, direitos, termos, quota interna, orçamento e runbook completos.
- [ ] P11 — Preview protegido, smoke e rollback dos dois projetos com formatos Redis compatíveis.
- [ ] Checkpoint C — Pacote final revisto; proprietário decide separadamente sobre publicação.

## Evidência mínima por fatia

| Fatia | Aceite observável | Verificação |
|---|---|---|
| P0 | Aprovação datada da proposta Vercel, incluindo armazenamento temporário e HMAC | Registro da decisão nas specs; nenhuma mudança de runtime antes disso |
| P1 | Build de ambos projetos; rewrite e API direta funcionam; script Redis é atômico em quatro janelas; WAF barra antes do Redis; `429` externo, custo/versões e IP verificados | Preview protegido, saídas de versão, logs redigidos, cálculo de comandos, taxa de `429`, configuração do alarme e relatório de eco |
| P2 | Function reutiliza Fastify sem `listen`; health e erros iguais ao baseline; CORS Production aceita só origem HTTPS explícita | Integração HTTP do adapter, testes de HTTP/loopback/HTTPS e `npm run check --workspace @nosso-clima/api` |
| P3 | Nenhum fetch externo sem reserva; concorrência não ultrapassa quatro tetos; `429` externo abre circuito; Redis falho bloqueia | Testes de janelas, contenção, breaker, timeout e falha; inspeção de todos os call sites de `fetch` |
| P4 | Hits compartilhados; TTL exato; nada vencido/erro em cache; chaves opacas | Testes com tempo falso, duas instâncias e Redis de teste |
| P5 | 60/30/15 por digest, anti-spoof e TTL; sem IP bruto armazenado | Testes de API direta/rewrite, concorrência e inspeção de chaves/logs |
| P6 | Ambas rotas mantêm request/response, erros, créditos e `retrievedAtUtc` | Comparação de fixtures e testes HTTP completos |
| P7 | Browser usa somente origem web; `VITE_API_BASE_URL` inválida falha; configurações de rewrite, WAF, headers e cache estão versionadas | Testes de ausência/HTTP/loopback/origem divergente/HTTPS permitido, inspeção local de assets/env e configuração; comportamento real de rewrite/WAF/CDN em P1 |
| A | Todos os contratos e restrições de código ativos passam | `npm run check`, `npm run test:coverage`, `npm run check:boundaries`, builds |
| P8 | Fluxos principais e falhas passam; nenhuma chamada do navegador a terceiros nos testes locais | `npm run test:e2e`; contagem real no eco e relatório sem IP bruto em P1d |
| P9 | Ferramentas e configuração de CI prontas; LCP ≤ 2,5 s, CLS ≤ 0,1, axe/audit/Gitleaks locais verdes | `npm run test:performance`, `npm run test:a11y`, audit e scan locais; CI hospedada validada no Checkpoint B |
| B | Free e gates de segurança têm margem comprovada | Relatórios datados de CI, Vercel, Upstash e quota Open-Meteo |
| P10 | Aviso, direitos, termos, contato, runbook e orçamento publicados para revisão | Pacote de release com fontes, data, limites, alertas e documentos de direitos |
| P11 | Preview final e reversão web+API funcionam; dados Redis aceitam versão anterior | Smoke e rollback com comandos, IDs de deploy e resultados redigidos |
| C | Proprietário decide com todos os gates à vista | Aprovação ou recusa explícita; sem deploy público por inferência |

## Registro de evidência

Ao concluir um item, anexar aqui data, revisão testada, comandos/resultados e link para o relatório ou seção do runbook. P0 registra a aprovação de implementação e seu escopo; as specs e a ADR devem refletir esse estado. Não duplicar caixas de progresso em `tasks/todo.md` ou nos arquivos históricos. Testes locais P2–P9 e resultados reais de P1 têm evidências separadas.

- **P0, 2026-10-04:** o proprietário pediu nesta conversa para começar a implementação de `production-delivery`, usar as skills adequadas e avançar uma parte por vez. A aprovação cobre o plano Vercel + Upstash P1–P11 e as fronteiras descritas nas specs vinculadas. Não autoriza publicação pública; os gates P1 e `CONSTRAINTS.md` continuam bloqueantes.
- **P1a, preparação local em 2026-10-04:** checks e builds passaram na revisão `a8c22f0` com alterações locais; versões, ausência de remote e sessão Vercel desconectada estão no [runbook](../docs/deploy/vercel-upstash-runbook.md#p1a-preparação-local-em-2026-10-04). Preview e npm 12 ainda não foram provados; P1a permanece aberta.
- **Ordem revista em 2026-10-04:** o proprietário não disponibilizará a CLI Vercel e configurará GitHub/Vercel manualmente após a implementação local. P2–P9 podem avançar com testes determinísticos; P1 e os gates hospedados continuam obrigatórios antes da publicação. Nenhum resultado local será registrado como prova de Preview.
- **P2a, 2026-10-04:** testes novos falharam antes da correção para HTTP e três origens de loopback. Depois, `npm run check` passou (373 testes da API, 73 do web), `npm run test:coverage --workspace @nosso-clima/api` passou (statements 94,81%, branches 91,26%, functions 95,45%, lines 97,82%), `npm run build --workspace @nosso-clima/api` passou e `npm audit --audit-level=high` encontrou 0 vulnerabilidades. P2 permanece aberta até P2b.
- **P2b, 2026-10-04:** `apps/api/app.ts` exporta a instância Fastify sem `listen` ou sinais; seleção da entrada raiz foi confirmada pelo detector local `@vercel/fastify` 62.2.0. Integração testa health, erro de validação, configuração inválida e bloqueio das duas rotas externas enquanto não há reserva P3. `npm run check --workspace @nosso-clima/api` passou (376 testes), cobertura da API 94,87%/91,32%/95,51%/97,84% (statements/branches/functions/lines), `npm run check:boundaries` passou e `npm audit --audit-level=high` encontrou 0 vulnerabilidades. Detecção local não substitui prova da Function no Preview P1a; P2 continua aberta até P2c.
- **P2c, 2026-10-04:** testes de integração falharam para 11 configurações Redis/HMAC ausentes ou inválidas antes da validação, e passaram depois. A entrada exige URL Redis HTTPS raiz, token não vazio e chave HMAC hexadecimal de 32 bytes; o erro exposto permanece genérico. `npm run check --workspace @nosso-clima/api` passou (387 testes), `npm run check:boundaries` passou e `npm run test:coverage --workspace @nosso-clima/api` passou (94,96%/91,68%/95,54%/97,89% em statements/branches/functions/lines). O runbook contém nomes/formatos para configuração manual futura; nenhum segredo foi criado ou salvo. P2 local concluída; Function real ainda depende de P1a em Preview.
- **P3a, 2026-10-04:** transporte REST implementado a partir do comando JSON documentado pela Upstash, sem dependência nova. Testes falharam antes da implementação; depois cobrem formato `EVAL`, token no cabeçalho, HTTPS, resposta errada/grande e pane de rede. `npm run check --workspace @nosso-clima/api` passou (394 testes), cobertura 95,04%/91,58%/94,61%/98,02% e `npm run check:boundaries` passou. Ainda não há chamada Redis no caminho de produção: P3b–P3d e prova real de P1b estão pendentes.
- **P3b, 2026-10-04:** `EVAL` usa hora do Redis e dois nomes versionados de chave para registrar totais ponderados cumulativos; verifica quatro janelas móveis numa operação e só grava após todas permitirem. A janela mensal local é de 31 dias, conservadora para meses civis. O script remove eventos antigos em lote, sem expiração que apagaria reservas recentes. O módulo exige tetos positivos explícitos e trata resultado Redis inesperado como pane. Testes TypeScript falharam antes da implementação; `luac -p` e simulação Lua local passaram para limite por minuto, hora, mês, fronteira exata, negação sem gravação e limpeza. `npm run check --workspace @nosso-clima/api` passou (402 testes), cobertura 95,12%/91,77%/94,70%/98,05% e `npm run check:boundaries` passou. A semântica `EVAL`, custo de comandos, contenção real, peso da previsão e tetos numéricos finais continuam para P1b.
- **P3c, 2026-10-04:** circuit breaker Redis por serviço com cooldown e uma sonda após expiração; uma sonda antiga não fecha circuito reaberto. Scripts passaram em simulação Lua local. A allowlist de saída aceita somente as URLs HTTPS de geocodificação e previsão e reconstrói opções de `fetch` sem cabeçalhos do visitante. Testes falharam antes dos módulos; depois `npm run check --workspace @nosso-clima/api` passou (417 testes), cobertura 95,19%/91,79%/94,91%/98,12% e `npm run check:boundaries` passou. Ainda falta ligar reserva, breaker e transporte às duas rotas em P3d e medir cooldown real em P1d.
- **P3d, 2026-10-04:** a entrada serverless agora verifica o circuito e reserva créditos ponderados antes de cada chamada real de ambas as rotas, com falha segura para Redis indisponível, cota negada e `429` externo. A política exige oito variáveis explícitas, documentadas no [runbook](../docs/deploy/vercel-upstash-runbook.md#variáveis-somente-nomes-nunca-valores); valores finais continuam para P1b/P1d. Testes novos falharam antes da implementação da integração e do descarte do corpo em `429`; depois `npm run check --workspace @nosso-clima/api` passou (447 testes), cobertura 94,80%/91,84%/94,53%/97,78% (statements/branches/functions/lines), `npm run check:boundaries`, `git diff --check` e `npm audit --audit-level=high` passaram (0 vulnerabilidades). P3 está concluída localmente; Redis/cache/rate limit compartilhados de P4–P5 e provas hospedadas de P1 seguem pendentes.
- **P4, 2026-10-04:** cache Redis genérico criado com HMAC-SHA-256 sobre a chave canônica, namespace/versão, TTL máximo de 24 h para busca e 10 min para previsão, leitura que rejeita expiração ou valor inválido, e limite de 24 KiB por entrada. `getOrLoad` usa lock Redis com token, prazo de 12 s, liberação condicional e espera finita; após a espera, um carregamento próprio continua sujeito à reserva obrigatória da P3 quando ligado ao serviço em P6. Testes entre duas instâncias cobrem hit, vazio válido, expiração exata, falha não cacheada, lock substituído, fallback e pane Redis. Os quatro scripts passaram em `luac -p`; a fixture normalizada de previsão mede 2.386 bytes. `npm run check` passou (457 testes API e 73 web), cobertura da API 94,33%/91,31%/93,87%/97,64% (statements/branches/functions/lines), `git diff --check` passou e `npm audit --audit-level=high` encontrou 0 vulnerabilidades. A integração nas rotas e a validação de seus valores são P6; semântica/custo Redis e contenção reais seguem para P1b/P1c.
- **P5, 2026-10-04:** a entrada Function exige `x-vercel-forwarded-for` com um IP único e gera HMAC por minuto (IPv6 agrupado por /64); ausência/ambiguidade falha fechada. Pré-limite local com estado máximo de 2.048 visitantes precede um script Redis atômico com 60 pedidos gerais, 30 buscas e 15 previsões por minuto, TTL até a virada; `429` em limite e `503` em pane Redis. `/health` não consulta Redis. Testes cobrem falsificação de `x-forwarded-for`, ausência, duas instâncias, concorrência, fronteira de minuto, TTL, capacidade e falha fechada. `npm run check` passou (482 testes API e 73 web), `npm run check --workspace @nosso-clima/api` repetiu os 482 testes e build; cobertura da API 94,67%/90,96%/94,47%/97,85% (statements/branches/functions/lines), `luac -p`/`git diff --check` passaram e `npm audit --audit-level=high` encontrou 0 vulnerabilidades. Cabeçalho confiável, script/lock e custo reais, rajadas na fronteira e WAF permanecem como provas P1b–P1d antes da publicação.

## Disciplina de execução

Cada fatia altera apenas os módulos aprovados, adiciona testes que provem o comportamento novo, passa os checks relevantes e registra o resultado antes da próxima. P1 valida a implementação final em Preview protegido; sua falha reabre P0 e bloqueia publicação. `CONSTRAINTS.md` não é reduzido. Testes automatizados usam fixtures e nunca chamam Open-Meteo real.
