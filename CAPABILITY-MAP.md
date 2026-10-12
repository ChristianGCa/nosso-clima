# Capability Map: NossoClima

Os módulos estão implementados e publicados em Production desde 2026-10-12, com Vercel + Upstash. A [lista ativa](tasks/vercel-todo.md) concentra progresso, evidências e acompanhamento. Este mapa define responsabilidades e dependências.

## Estado por módulo

| Módulo | Implementado e aprovado localmente | Implementação Vercel e prova hospedada | Depende de |
|---|---|---|---|
| `backend-platform` | Fastify/Node, HTTP, erros, configuração, logs seguros, cache LRU, `SingleFlight`, executor limitado e rate limits locais | Function, Redis HTTPS, reserva agregada, circuit breaker, cache, HMAC e limites compartilhados integrados; fluxos reais observados em Preview e Production; identidade anti-spoof aprovada em Preview e política Production cadastrada | — |
| `location-search` | Geocodificação, validação, normalização, contrato de cidades e cache local de 24 h | Cache Redis e reserva observados em Preview; expiração hospedada após 24 h e concorrência entre instâncias em acompanhamento | `backend-platform` |
| `weather-forecast` | Condições atuais, sete dias com condição predominante, validação, WMO e cache local de 10 min | Previsão, cache Redis, renovação após TTL e reserva observados em Preview; peso oficial (1,3) confirmado e política Production cadastrada | `backend-platform` |
| `weather-ui` | Busca acessível, seleção e última cidade local, condições atuais, sete dias, fundos, estados da interface e cliente `/api/v1/*` na origem web | Fluxo pelo rewrite confirmado em Preview e Production; headers de HTML, assets e API conferidos no release | `location-search`, `weather-forecast` |
| `production-delivery` | P7–P9 locais e smoke hospedado de API/web, CORS permitido e fluxo de busca/previsão/cache; saída sem IP aceita por revisão do transporte e amostra parcial de Preview; aviso de privacidade e direitos revisados; P1, P10 e P11 concluídas no alcance aprovado | Smoke protegido, rollback ensaiado e abertura pública em 2026-10-12; seguem em acompanhamento consumo, 503/negações, expiração de 24 h e concorrência hospedada | Todos os módulos acima |

As specs de busca, previsão e UI descrevem os contratos vigentes. A [spec da plataforma](SPEC-backend-platform.md) resume o estado local e define a migração implementada; seu contrato local detalhado permanece referenciado no [baseline Node](docs/architecture/backend-local-baseline.md). Implementação local e provas hospedadas têm alcances distintos; resultados e lacunas ficam somente em `tasks/vercel-todo.md`, com detalhes no histórico.

## Grafo e ordem

```text
backend-platform
├── location-search ──┐
└── weather-forecast ─┼── weather-ui ── production-delivery
                      ┘
```

P0: aprovar specs e fronteiras → P2–P9: implementação e gates locais (concluídos) → P1: provar viabilidade em Preview configurado pelo proprietário → P10–P11: pacote de release e rollback → decisão de publicação. O [plano](tasks/vercel-plan.md) detalha a sequência; o progresso atual é registrado na [lista ativa](tasks/vercel-todo.md), com evidências antigas em `docs/history/`. Todas as etapas foram concluídas, e a publicação ocorreu em 2026-10-12.

## Regras de fronteira

- Testes ficam no módulo cujo comportamento verificam; E2E, performance, CI e rollback pertencem a `production-delivery`.
- HTTP, configuração, logs, erros comuns, cache, rate limits e concorrência pertencem a `backend-platform`. Na migração proposta, esse módulo também fornece Redis, reserva global em quatro janelas, circuit breaker, HMAC, pré-limite em memória e transporte externo seguro. A entrada serverless já exige reserva antes de chamadas Open-Meteo; a entrada de desenvolvimento local mantém o contrato anterior.
- URL, parâmetros, validação de cada provedor, contrato HTTP, mapeamento de dados e TTL de domínio pertencem a busca ou previsão. A proposta de persistência efêmera e seus critérios de ativação estão nas respectivas specs. Nenhum desses módulos implementa infraestrutura compartilhada própria.
- Responsividade, acessibilidade, seleção de cidade e ativos visuais pertencem a `weather-ui`; o web não importa runtime da API nem recebe segredo Redis.
- Dois projetos, rewrite, regra WAF e sua verificação em ambos os caminhos, origem/CORS final, privacidade, direitos de imagens e lançamento pertencem a `production-delivery`. Esse módulo coordena a migração sem absorver as responsabilidades de runtime da plataforma.
- Aprovação de implementação não equivale a autorização para publicar. `CONSTRAINTS.md` permanece bloqueante; mudanças de fronteira ou restrição exigem revisão explícita.
