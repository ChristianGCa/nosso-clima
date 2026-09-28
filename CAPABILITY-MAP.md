# Capability Map: Nosso Clima

| Module id | Responsabilidade | Depende de |
|---|---|---|
| `backend-platform` | Aplicação Fastify, configuração, CORS, erros padronizados, cache LRU, rate limit, controles compartilhados de chamadas externas, logs estruturados e endpoint de saúde | — |
| `location-search` | Consultar a geocodificação da Open-Meteo, validar a resposta, aplicar cache e retornar cidades normalizadas | `backend-platform` |
| `weather-forecast` | Consultar condições atuais e previsão de sete dias, validar e normalizar os dados, aplicar cache e mapear códigos WMO | `backend-platform` |
| `weather-ui` | Busca acessível, seleção e lembrança local da última cidade, condições atuais, cartões dos sete dias, fundos climáticos e estados de interface | `location-search`, `weather-forecast` |
| `production-delivery` | Testes ponta a ponta, configuração de produção, builds independentes e documentação de deploy | `location-search`, `weather-forecast`, `weather-ui` |

## Dependency Graph

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
