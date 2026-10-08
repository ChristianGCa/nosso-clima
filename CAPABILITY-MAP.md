# Capability Map: NossoClima

**Estado em 2026-10-07 (ensaio até 2026-10-08 UTC):** os quatro módulos locais e P2–P9 estão implementados. A adaptação para **Vercel + Upstash** permanece o único plano ativo de deploy, autorizado em P0. API e web estão Ready em Preview; busca, previsão de sete dias, cache hit e CORS da origem web foram verificados pela CLI, com confirmação do proprietário no navegador. A [evidência](docs/deploy/preview-evidence-2026-10-07.md) registra a correção dos escopos que causavam `quota_denied`. P1 está parcialmente verificada; P10–P11 e a decisão de publicação seguem pendentes. Cloudflare e Render foram descartados.

## Estado por módulo

| Módulo | Implementado e aprovado localmente | Proposto para produção Vercel | Depende de |
|---|---|---|---|
| `backend-platform` | Fastify/Node, HTTP, erros, configuração, logs seguros, cache LRU, `SingleFlight`, executor limitado e rate limits locais | Entrada Function, Redis HTTPS, reserva agregada, circuit breaker e cache compartilhado ligados às rotas; HMAC temporário, pré-limite e limites compartilhados ligados à entrada Function, sujeitos à prova real em P1 | — |
| `location-search` | Geocodificação, validação, normalização, contrato de cidades e cache local de 24 h | Cache Redis de 24 h e saída com reserva integrados localmente; prova real em P1 | `backend-platform` |
| `weather-forecast` | Condições atuais, sete dias com condição predominante, validação, WMO e cache local de 10 min | Cache Redis de 10 min e saída com reserva integrados localmente; prova real em P1 | `backend-platform` |
| `weather-ui` | Busca acessível, seleção e última cidade local, condições atuais, sete dias, fundos, estados da interface e cliente `/api/v1/*` na origem web | Fluxo pelo rewrite confirmado em Preview pelo proprietário; matriz completa de headers/CDN e release continuam em P1 | `location-search`, `weather-forecast` |
| `production-delivery` | P7–P9 locais e smoke hospedado de API/web, CORS permitido e fluxo de busca/previsão/cache; P1 parcial | Completar P1a/P1b, WAF/CDN, identidade/saída, privacidade, direitos e rollback antes da publicação | Todos os módulos acima |

As specs de busca, previsão e UI descrevem os contratos locais vigentes e identificam as alterações propostas. A [spec da plataforma](SPEC-backend-platform.md) resume o estado local e define a migração; seu contrato local detalhado permanece referenciado no [baseline Node](docs/history/backend-platform-node-baseline-2026-09-23.md). Os itens concluídos dos módulos locais não comprovam a migração para Vercel.

## Grafo e ordem

```text
backend-platform
├── location-search ──┐
└── weather-forecast ─┼── weather-ui ── production-delivery
                      ┘
```

P0: aprovar specs e fronteiras → P2–P9: implementação e gates locais (concluídos) → P1: provar viabilidade em Preview configurado pelo proprietário → P10–P11: pacote de release e rollback → decisão de publicação. O [plano](tasks/vercel-plan.md) detalha a sequência; o progresso atual é registrado na [lista ativa](tasks/vercel-todo.md), com evidências antigas em `docs/history/`. P1 continua obrigatório antes de exposição pública.

## Regras de fronteira

- Testes ficam no módulo cujo comportamento verificam; E2E, performance, CI e rollback pertencem a `production-delivery`.
- HTTP, configuração, logs, erros comuns, cache, rate limits e concorrência pertencem a `backend-platform`. Na migração proposta, esse módulo também fornece Redis, reserva global em quatro janelas, circuit breaker, HMAC, pré-limite em memória e transporte externo seguro. A entrada serverless já exige reserva antes de chamadas Open-Meteo; a entrada de desenvolvimento local mantém o contrato anterior.
- URL, parâmetros, validação de cada provedor, contrato HTTP, mapeamento de dados e TTL de domínio pertencem a busca ou previsão. A proposta de persistência efêmera e seus critérios de ativação estão nas respectivas specs. Nenhum desses módulos implementa infraestrutura compartilhada própria.
- Responsividade, acessibilidade, seleção de cidade e ativos visuais pertencem a `weather-ui`; o web não importa runtime da API nem recebe segredo Redis.
- Dois projetos, rewrite, regra WAF e sua verificação em ambos os caminhos, origem/CORS final, privacidade, direitos de imagens e lançamento pertencem a `production-delivery`. Esse módulo coordena a migração sem absorver as responsabilidades de runtime da plataforma.
- Aprovação de implementação não equivale a autorização para publicar. `CONSTRAINTS.md` permanece bloqueante; mudanças de fronteira ou restrição exigem revisão explícita.
