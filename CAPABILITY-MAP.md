# Capability Map: NossoClima

| Module id | Responsabilidade | Depende de |
|---|---|---|
| `backend-platform` | Handler Fetch do Worker, configuração de bindings, erros padronizados, rate limit na borda, reserva agregada D1, cache LRU local ao isolate, controles de chamadas externas, logs seguros e saúde | — |
| `location-search` | Consultar a geocodificação da Open-Meteo, validar a resposta, aplicar cache e retornar cidades normalizadas | `backend-platform` |
| `weather-forecast` | Consultar condições atuais e previsão de sete dias, validar e normalizar os dados, aplicar cache e mapear códigos WMO | `backend-platform` |
| `weather-ui` | Busca acessível, seleção e lembrança local da última cidade, condições atuais, cartões dos sete dias, fundos climáticos e estados de interface | `location-search`, `weather-forecast` |
| `production-delivery` | Artefato único Worker com assets, cabeçalhos do site, testes ponta a ponta, performance, CI, privacidade, direitos e rollback | `location-search`, `weather-forecast`, `weather-ui` |

## Dependency Graph

As responsabilidades de Worker acima pertencem à proposta P0 de 2026-10-03, agora **bloqueada** pela exigência de que a Open-Meteo nunca receba o IP do visitante. O código Node atual continua sendo a implementação existente. O mapa deve ser ajustado de novo após a escolha de uma topologia que cumpra essa exigência.

```text
backend-platform
├── location-search ──┐
└── weather-forecast ─┼── weather-ui ── production-delivery
                      ┘
```

## Build Order

1. `backend-platform`
2. `location-search` and `weather-forecast`, which may proceed in parallel
3. `weather-ui`
4. `production-delivery`

## Boundary Rules

- Tests belong to the module whose behavior they verify.
- Shared cache, rate limiting, outbound concurrency controls, logging, configuration and error behavior belong to `backend-platform`.
- Each Open-Meteo integration belongs to the module that consumes it.
- HTTP contracts belong to their provider specs: `location-search` and `weather-forecast`.
- Responsive behavior, accessibility and background selection belong to `weather-ui`.
- Production delivery starts only after the local user flow is functional.
