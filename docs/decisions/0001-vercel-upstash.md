# ADR 0001 — Vercel em dois projetos com Upstash Redis

- **Estado:** aprovado para implementação pelo proprietário em 2026-10-04. A decisão de publicação pública permanece pendente.
- **Decisores:** proprietário do NossoClima.
- **Refs:** [pesquisa](../deploy/vercel-research-2026-10-04.md), [spec da plataforma](../../SPEC-backend-platform.md), [spec de entrega](../../SPEC-production-delivery.md), [plano](../../tasks/vercel-plan.md).

## Contexto

O NossoClima já tem web Vite e API Fastify/Node. O cache e os limites atuais vivem num único processo, portanto múltiplas Functions não os compartilham. A Open-Meteo tem limites por IP de saída, com risco documentado em hospedagem compartilhada, e o proprietário exige que ela nunca receba o IP do visitante. A alternativa Cloudflare foi **descartada**, sem aprovação para implementação. Não há script, log ou resultado reproduzível do ensaio anterior de Preview neste pacote; ele não integra a evidência da P0.

## Decisão proposta

Usar **dois projetos Vercel no mesmo repositório**: estáticos em `apps/web`, Function Fastify em `apps/api`, com `/api/*` reescrito do domínio web ao domínio da API. Usar **Upstash Redis via HTTPS** do Marketplace, somente em planos gratuitos, para cache de busca de até 24 h, cache de previsão de até 10 min, contadores de rate limit por HMAC de IP com vida aproximada de 1 min e reserva atômica da cota ponderada Open-Meteo nas janelas de minuto, hora, dia e mês. Exigir regra WAF antes da Function, pré-limite em memória e alarme mensal de comandos. O Redis fica acessível apenas à API; IP bruto não é armazenado. Uma chamada Open-Meteo só ocorre após reserva; em falha/cota esgotada, a API não faz nova chamada externa. `429` externo abre circuit breaker compartilhado e impede novo miss durante cooldown. O navegador usa caminho de API relativo, sem credencial nem fetch direto aos fornecedores.

Ambas as rotas reais precisam de teste com eco e canário em Preview e caminho final. A publicação requer pacote de evidência e autorização separada. A aprovação P0 autoriza implementar as etapas do plano, sujeita aos seus gates, sem autorizar publicação pública.

## Alternativas consideradas

| Alternativa | Motivo da decisão |
|---|---|
| Worker único Cloudflare | Descartado pelo proprietário; não faz parte do plano de deploy. |
| Vercel em projeto único | Possível, mas o proprietário escolheu dois projetos para preservar as fronteiras atuais do monorepo e dos builds. |
| Redis Cloud | Possível no Marketplace, mas o proprietário escolheu Upstash por HTTPS e integração REST para Functions. |
| Apenas cache local/processual | Não fornece cache ou cota agregada entre instâncias serverless. |
| Somente rate limit por visitante | Não limita consumo conjunto de consultas distintas ou rajadas entre instâncias; a reserva agregada é obrigatória. |

## Consequências e controles

- Dois deploys precisam ser pareados e revertidos de modo compatível. A URL da API é pública; CORS não a torna privada.
- Redis passa a guardar resultados de localização por TTL e digest HMAC temporário. Isso exige alteração aprovada das specs de busca/previsão e aviso de privacidade que cite Upstash, Vercel, Open-Meteo e retenções reais.
- A reserva ponderada deve ser única para geocodificação e previsão, segura sob concorrência e quatro janelas móveis. A tabela de preços Open-Meteo inclui 300.000/mês, embora a seção de uso não comercial dos termos cite apenas minuto/hora/dia; P1 esclarecerá a discrepância. Peso e tetos internos permanecem pendentes de cálculo oficial e ensaio P1; a reserva própria não garante capacidade de um IP de saída compartilhado.
- Planos gratuitos podem interromper o serviço. Não há upgrade automático nem cobrança aceita. Dimensionamento inclui comandos de Redis, invocações, banda, armazenamento e pedidos WAF sob abuso. P1 mede comandos por pedido, eficácia do WAF em ambos os caminhos, alarme mensal e taxa de `429` externo; se a proteção não for viável, a P0 é reaberta.
- CDN/rewrite podem alterar caching e headers; Preview deve demonstrar a política real. O teste de ausência de IP é específico ao código e ao caminho final.
- Todos os limiares de `CONSTRAINTS.md` continuam ativos. A P0 foi aprovada para implementação em 2026-10-04; cada gate posterior conserva seu próprio critério de aceite.
