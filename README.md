# NossoClima

Consulta meteorológica em português com busca de cidades, condições atuais e previsão de sete dias. Monorepo com React/Vite em `apps/web` e Fastify/Node em `apps/api`, usando dados da Open-Meteo.

**Estado em 2026-10-04:** o fluxo local está implementado e aprovado, incluindo restauração da última cidade e condição diária predominante. A migração para dois projetos Vercel com Upstash Redis foi aprovada para implementação em P0. P2–P5 estão implementadas localmente; a integração P6 e a verificação em Preview permanecem pendentes.

## Como continuar

1. Leia o [mapa de capacidades](CAPABILITY-MAP.md) e as [restrições](CONSTRAINTS.md).
2. Consulte a spec do módulo que será alterado na tabela abaixo.
3. Siga o [plano Vercel + Upstash](tasks/vercel-plan.md) e registre o progresso na [lista ativa de tarefas](tasks/vercel-todo.md). O próximo incremento é P6, integração do cache compartilhado às rotas; P1 será verificada no Preview configurado pelo proprietário antes da publicação.

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
| `npm audit --audit-level=high` | Auditoria de dependências |

E2E (`test:e2e`), performance (`test:performance`), Gitleaks e CI hospedada são entregas pendentes do plano de produção. Resultados históricos de testes não substituem a verificação da próxima mudança.
