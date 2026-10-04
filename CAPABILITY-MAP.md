# Capability Map: NossoClima

**Estado em 2026-10-04:** a implementação local Node/Fastify e web está completa. **Vercel + Upstash é a única proposta ativa de deploy. Cloudflare foi descartada.** A topologia abaixo é proposta P0 para aprovação antes de implementação; nenhum módulo de produção Vercel está concluído por este mapa.

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `backend-platform` | Entrada Fastify em Vercel Function, HTTP e erros comuns, identidade HMAC temporária e rate limits, Redis HTTPS para cache e reserva agregada Open-Meteo em quatro janelas, circuit breaker do provedor, pré-limite em memória, concorrência, saída sem IP do visitante, configuração e logs seguros | — |
| `location-search` | URL fixa de geocodificação, validação, normalização e contrato de cidades; política de cache de 24 h consumindo infraestrutura compartilhada | `backend-platform` |
| `weather-forecast` | URL fixa de previsão, validação, normalização, WMO e contrato de sete dias; política de cache de 10 min consumindo infraestrutura compartilhada | `backend-platform` |
| `weather-ui` | Busca acessível, seleção e última cidade local, condições atuais, sete dias, fundos e estados de interface; cliente usa `/api/v1/*` relativo | `location-search`, `weather-forecast` |
| `production-delivery` | Dois projetos Vercel no mesmo repositório, rewrite web → API, regra WAF, segurança de assets, E2E, performance, CI, privacidade, direitos, Preview e rollback | `backend-platform`, `location-search`, `weather-forecast`, `weather-ui` |

## Grafo e ordem

```text
backend-platform
├── location-search ──┐
└── weather-forecast ─┼── weather-ui ── production-delivery
                      ┘
```

P0: aprovar specs e fronteiras → P1: provar Vercel/Redis/custo/privacidade em Preview → plataforma compartilhada → adaptação independente de busca e previsão → roteamento web/entrega → E2E e gates → release protegido e rollback → decisão separada de publicação. Busca e previsão podem avançar em paralelo somente depois da plataforma de cota estar funcional. A API já existente continua servindo como referência até um corte verificado.

## Regras de fronteira

- Testes ficam no módulo cujo comportamento verificam; E2E, performance, CI e rollback pertencem a `production-delivery`.
- Configuração, rate limit HMAC, pré-limite em memória, cache Redis, reserva global em quatro janelas, circuit breaker, transporte externo seguro, concorrência, logs e erros comuns pertencem a `backend-platform`. Nenhum módulo pode chamar Open-Meteo sem passar pela reserva obrigatória.
- URL, parâmetros, limite e validação de cada provedor, shape HTTP, mapeamento de dados e TTL de domínio pertencem ao respectivo módulo de busca ou previsão. A persistência efêmera proposta está explicitada nas duas specs e depende de aprovação P0.
- Responsividade, acessibilidade, seleção de cidade e ativos visuais pertencem a `weather-ui`; o web não importa runtime da API nem recebe segredo Redis.
- Dois projetos, rewrite, regra WAF e sua verificação em ambos os caminhos, origem/CORS final, privacidade, direito de imagens e lançamento pertencem a `production-delivery`. Aprovação de implementação não equivale a autorização para publicar.
- `CONSTRAINTS.md` permanece inalterado e bloqueante; qualquer mudança de fronteira ou restrição exige nova revisão explícita.
