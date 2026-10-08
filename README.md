# NossoClima

Consulta meteorológica em português com busca de cidades, condições atuais e previsão de sete dias. Monorepo com React/Vite em `apps/web` e Fastify/Node em `apps/api`, usando dados da Open-Meteo.

**Estado em 2026-10-07 (ensaio até 2026-10-08 UTC):** P2–P9 estão implementadas localmente. API e web estão Ready em Preview; busca, previsão de sete dias, cache hit e CORS da origem web foram verificados pela CLI, e o proprietário confirmou o funcionamento no navegador. A [evidência de Preview](docs/deploy/preview-evidence-2026-10-07.md) registra a correção de `quota_denied`, os escopos e os deployments. P1 continua parcialmente aberta; não houve liberação pública nesta correção.

## Como continuar

1. Leia o [mapa de capacidades](CAPABILITY-MAP.md) e as [restrições](CONSTRAINTS.md).
2. Consulte a spec do módulo que será alterado na tabela abaixo.
3. Siga o [plano Vercel + Upstash](tasks/vercel-plan.md) e a [lista ativa de tarefas](tasks/vercel-todo.md). A próxima etapa completa as evidências de P1a/P1b no Preview existente antes de WAF, privacidade e publicação.

| Documento | Fonte para |
|---|---|
| [Backend Platform](SPEC-backend-platform.md) | Plataforma local, contratos a preservar e proposta serverless/Redis |
| [Location Search](SPEC-location-search.md) | Contrato de busca e alteração proposta de cache |
| [Weather Forecast](SPEC-weather-forecast.md) | Contrato de previsão, condição predominante e alteração proposta de cache |
| [Weather UI](SPEC-weather-ui.md) | Comportamento da interface e adaptação proposta de origem da API |
| [Production Delivery](SPEC-production-delivery.md) | Topologia Vercel, gates e critérios de publicação |
| [ADR 0001](docs/decisions/0001-vercel-upstash.md) | Motivos e alternativas da proposta Vercel + Upstash |
| [Pesquisa Vercel](docs/deploy/vercel-research-2026-10-04.md) | Fontes datadas e perguntas de viabilidade |
| [Runbook preliminar](docs/deploy/vercel-upstash-runbook.md) | Procedimentos a completar com evidência de Preview |

As specs definem requisitos; o plano organiza a execução; a lista de tarefas registra conclusão e evidência. Pesquisas, ideias e [documentos históricos](docs/history/README.md) não autorizam implementação. O baseline Node arquivado continua sendo referência do contrato local nos pontos explicitamente citados pela spec da plataforma. Uma proposta só substitui o contrato vigente após sua aprovação e implementação verificadas.

## Desenvolvimento local

Use Node `>=24.15.0 <25` e npm `12.0.2`, conforme `package.json`, e instale a partir da raiz:

```bash
npm ci
```

Confira `node --version` e `npm --version`. Se o npm padrão for outra versão, use
`npx --yes npm@12.0.2 ci` e `npx --yes npm@12.0.2 run check`, como na configuração Vercel.

Inicie a API e o web em terminais separados:

```bash
npm run dev --workspace @nosso-clima/api
npm run dev --workspace @nosso-clima/web
```

O Vite encaminha `/api` para `http://127.0.0.1:3000`. Veja os exemplos de configuração em [apps/api/.env.example](apps/api/.env.example) e [apps/web/.env.example](apps/web/.env.example), e as instruções do [web](apps/web/README.md).

## Verificação

| Comando existente | Finalidade |
|---|---|
| `npm run check` | Tipos, lint, formato, testes e fronteiras entre aplicações |
| `npm run test:coverage` | Cobertura mínima por aplicação |
| `npm run build --workspace @nosso-clima/api` | Build da API local |
| `npm run build --workspace @nosso-clima/web` | Build estático do web |
| `npm run test:a11y` | Acessibilidade e contraste em Chromium; requer navegador Playwright instalado |
| `npm run test:e2e` | Fluxos completos com navegador, handler default Vercel compilado e Redis/provedor simulados |
| `npm run test:performance` | LCP e CLS em Chromium móvel nos cenários neutro e cidade restaurada; grava `artifacts/performance.json` |
| `npm audit --audit-level=high` | Auditoria de dependências |

O [workflow de CI](.github/workflows/ci.yml) está configurado e o remoto `origin` existe. A execução hospedada deve ser conferida no GitHub para a revisão que será implantada; resultados locais não comprovam CI hospedada. Os scans Gitleaks históricos passaram com uma exceção restrita e aprovada, registrada no [runbook](docs/deploy/vercel-upstash-runbook.md#p9-gates-locais-e-sinais-operacionais--2026-10-05). Resultados históricos de testes não substituem a verificação da próxima mudança.
