# Histórico resumido

O estado de execução está na [lista ativa](../../tasks/vercel-todo.md). Este registro preserva decisões encerradas; não autoriza novas implementações nem publicação. Relatos datados podem conter próximos passos já superados: consultar a lista ativa antes de agir.

## Marcos preservados

| Data | Decisão ou verificação registrada |
|---|---|
| 2026-09-23 | Plataforma Node/Fastify e correções aprovadas pelo proprietário; busca concluída e aprovada no checkpoint L-B. Plano de previsão W1–W7 aprovado com os adendos de validação e fixtures. |
| 2026-09-24 | Previsão aprovada no checkpoint W-C. Plano U1–U10 e fluxo local da interface aprovados no checkpoint U-C. |
| 2026-09-28 | Aprovado salvar apenas a última cidade escolhida e consultar uma previsão nova ao retornar; primeira visita permanece neutra. |
| 2026-10-01 | Corrigidas validação de data/fuso da previsão e apresentação de erros HTTP; contraste verificado nos dez fundos. |
| 2026-10-03 | Gates locais executados passaram, mas publicação permaneceu bloqueada. A proposta Worker Cloudflare não demonstrava a exigência de nunca enviar o IP do visitante à Open-Meteo. |
| 2026-10-04 | Cloudflare descartada; P0 Vercel + Upstash aprovada para implementação, com publicação sujeita a decisão separada. Condição diária passou a ser predominante entre códigos horários, preservando o contrato HTTP; cartões e contraste revistos. Peso da consulta horária continua como prova de P1b. |
| 2026-10-10 | Simplificação de P1 aprovada pelo proprietário (provas hospedadas extensas passam a acompanhamento); política Production aprovada; identidade anti-spoof aceita em Preview. |
| 2026-10-12 | Smoke protegido, ensaio de rollback e conferência agrupada de release concluídos; abertura pública decidida pelo proprietário. Correções de CORS, rótulos de cidades e resultados incompletos de busca publicadas no mesmo dia. |

A ideia inicial priorizava leitura rápida, unidades °C/km/h/mm, busca explícita e cinco condições visuais em dia/noite. Não previa contas, geolocalização automática, mapas, alertas, comparação de cidades ou previsão horária na interface. A hipótese de compreensão em menos de dez segundos e o teste de apresentação de chuva com cinco pessoas não tinham validação registrada. A hipótese de evitar Redis foi substituída pela [ADR 0001](../decisions/0001-vercel-upstash.md); requisitos vigentes estão nas specs.

## Evidências mantidas

- [Auditoria de 2026-10-03](release-audit-2026-10-03.md): resultados e limitações daquele checkout, incluindo falhas de instalação e recuperação. Recomendações Cloudflare estão superadas.
- [Implementação Vercel até 2026-10-06](vercel-local-evidence-2026-10-06.md): resultados locais de P0/P2–P9; hashes anteriores à reescrita do histórico.
- [Contraste](../quality/contrast-2026-10-04.md): método e medidas de outubro.
- `docs/history/preview-evidence-2026-10.md`: seis relatos de 2026-10-07 a 2026-10-10, consolidados na organização de 2026-10-10. Preserva bootstrap, matriz HTTP/CI, WAF, cache/TTL, consumo, falha Redis/recuperação, ferramentas de eco e restauração final do Preview; também reúne as verificações locais antigas do runbook e as notas de sessão retiradas da lista ativa na reorganização de 2026-10-10. Os resultados mantêm a fonte e as limitações originais.

O [baseline Node](../architecture/backend-local-baseline.md) foi movido para arquitetura porque ainda é referenciado pela spec da plataforma como contrato local. Seus requisitos foram preservados.

## Recuperar documentos encerrados

Na revisão documental de 2026-10-08, os planos/tarefas locais extensos, a ideia inicial e o planejamento Cloudflare foram retirados da árvore atual. Seus detalhes estão no commit anterior à consolidação, `d3a2fdca11be10f46f54d0d207cf87c8fe73577d`:

```bash
git show d3a2fdca11be10f46f54d0d207cf87c8fe73577d:docs/history/local-implementation-plan-2026-10-04.md
git show d3a2fdca11be10f46f54d0d207cf87c8fe73577d:docs/history/local-implementation-tasks-2026-10-04.md
git show d3a2fdca11be10f46f54d0d207cf87c8fe73577d:docs/history/production-delivery-pre-p0-2026-10-03.md
git show d3a2fdca11be10f46f54d0d207cf87c8fe73577d:docs/history/cloudflare-research-2026-10-01.md
git show d3a2fdca11be10f46f54d0d207cf87c8fe73577d:docs/ideas/nosso-clima.md
```

Os atalhos `tasks/plan.md` e `tasks/todo.md` foram removidos; use os arquivos Vercel ativos. As instruções de `apps/web/README.md` foram incorporadas ao README principal, às specs e aos documentos de evidência já existentes. A matriz anterior de contraste permanece recuperável no mesmo commit em `docs/quality/contrast-2026-10-01.md`.

Os seis arquivos datados retirados de `docs/deploy/` em 2026-10-10 aparecem como títulos de origem no histórico consolidado. Para recuperar sua apresentação anterior, usar `git show afc52be:docs/deploy/<nome-do-arquivo>`. As referências internas foram convertidas para nomes/caminhos; fontes externas preservam o título, sem criar novos hyperlinks.
