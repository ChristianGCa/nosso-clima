# Tarefas: Vercel + Upstash

**Estado:** P0 aprovada para implementação em 2026-10-04; desenvolvimento local vem antes da configuração manual da Vercel pelo proprietário. P1 e publicação pública permanecem pendentes. [Plano](vercel-plan.md), [spec da plataforma](../SPEC-backend-platform.md), [spec de entrega](../SPEC-production-delivery.md).

## Progresso

- [x] P0 — Proprietário aprova specs, adendos, fronteiras e este plano para implementação.
- [ ] P2 — Adapter serverless e configuração segura; rejeitar origem `http:` em Production em `env.ts`.
  - [x] P2a — CORS de Production exige origem HTTPS pública explícita; rejeita HTTP e loopback.
  - [ ] P2b — Entrada Fastify serverless e paridade HTTP com o baseline local.
- [ ] P3 — Reserva ponderada atômica das quatro janelas, circuit breaker de `429` externo e saída Open-Meteo por allowlist.
- [ ] P4 — Cache Redis versionado, TTL e deduplicação entre instâncias.
- [ ] P5 — Pré-limite em memória e rate limit 60/30/15 compartilhado com HMAC de ~1 minuto.
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

## Disciplina de execução

Cada fatia altera apenas os módulos aprovados, adiciona testes que provem o comportamento novo, passa os checks relevantes e registra o resultado antes da próxima. P1 valida a implementação final em Preview protegido; sua falha reabre P0 e bloqueia publicação. `CONSTRAINTS.md` não é reduzido. Testes automatizados usam fixtures e nunca chamam Open-Meteo real.
