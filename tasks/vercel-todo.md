# Tarefas: Vercel + Upstash

**Estado:** P0 proposta para revisão; nenhum item de implementação está autorizado ou concluído. [Plano](vercel-plan.md), [spec da plataforma](../SPEC-backend-platform.md), [spec de entrega](../SPEC-production-delivery.md).

## Progresso

- [ ] P0 — Proprietário aprova specs, adendos, fronteiras e este plano para implementação.
- [ ] P1 — Prova isolada de dois projetos, Fastify Function, Preview/rewrite, Node/npm, Upstash, WAF, quatro limites Open-Meteo, taxa de `429` externo, custo de comandos e segurança de IP.
- [ ] P2 — Adapter serverless e configuração segura; rejeitar origem `http:` em Production em `env.ts`.
- [ ] P3 — Reserva ponderada atômica das quatro janelas, circuit breaker de `429` externo e saída Open-Meteo por allowlist.
- [ ] P4 — Cache Redis versionado, TTL e deduplicação entre instâncias.
- [ ] P5 — Pré-limite em memória e rate limit 60/30/15 compartilhado com HMAC de ~1 minuto.
- [ ] P6 — Integrar busca e previsão com paridade ao baseline local.
- [ ] P7 — Web Vite, rewrite, WAF obrigatório, validação de `VITE_API_BASE_URL`, CORS exato, headers e cache CDN verificados.
- [ ] Checkpoint A — API e web compilados, contratos, boundaries, cobertura e checks verdes.
- [ ] P8 — E2E com fixture e prova de ausência de IP nas duas rotas finais.
- [ ] P9 — Performance, CI, auditoria, Gitleaks e observabilidade segura.
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
| P7 | Browser usa somente origem web; `VITE_API_BASE_URL` inválida falha; rewrite preserva API; WAF cobre acesso direto e reescrito; CDN não alonga TTL | Testes de ausência/HTTP/loopback/origem divergente/HTTPS permitido, Browser Network, respostas Preview, bloqueios WAF sem comandos Redis e inspeção de assets/env |
| A | Todos os contratos e restrições de código ativos passam | `npm run check`, `npm run test:coverage`, `npm run check:boundaries`, builds |
| P8 | Fluxos principais e falhas passam; nenhuma chamada do navegador a terceiros; nenhuma rota entrega IP ao eco | `npm run test:e2e`, contagem real no eco e relatório sem IP bruto |
| P9 | LCP ≤ 2,5 s, CLS ≤ 0,1, axe/audit/Gitleaks/CI verdes | `npm run test:performance`, `npm run test:a11y`, audit, scan, URL de CI |
| B | Free e gates de segurança têm margem comprovada | Relatórios datados de CI, Vercel, Upstash e quota Open-Meteo |
| P10 | Aviso, direitos, termos, contato, runbook e orçamento publicados para revisão | Pacote de release com fontes, data, limites, alertas e documentos de direitos |
| P11 | Preview final e reversão web+API funcionam; dados Redis aceitam versão anterior | Smoke e rollback com comandos, IDs de deploy e resultados redigidos |
| C | Proprietário decide com todos os gates à vista | Aprovação ou recusa explícita; sem deploy público por inferência |

## Disciplina de execução

Cada fatia altera apenas os módulos aprovados, adiciona testes que provem o comportamento novo, passa os checks relevantes e registra o resultado antes da próxima. P1 é uma prova descartável, sem código de produção. `CONSTRAINTS.md` não é reduzido. Testes automatizados usam fixtures e nunca chamam Open-Meteo real. Falha de viabilidade interrompe a sequência e reabre P0.
