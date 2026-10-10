# ADR 0001 — Vercel em dois projetos com Upstash Redis

- **Estado:** aprovado para implementação pelo proprietário em 2026-10-04. A decisão de publicação pública permanece pendente.
- **Decisores:** proprietário do NossoClima.
- **Refs:** [pesquisa](../deploy/vercel-research-2026-10-04.md), [spec da plataforma](../../SPEC-backend-platform.md), [spec de entrega](../../SPEC-production-delivery.md), [plano](../../tasks/vercel-plan.md).

## Contexto

No momento da decisão P0, o NossoClima já tinha web Vite e API Fastify/Node, com cache e limites num único processo, não compartilhados entre Functions. A Open-Meteo tem limites por IP de saída, com risco documentado em hospedagem compartilhada, e o proprietário exige que ela nunca receba o IP do visitante. A alternativa Cloudflare foi **descartada**, sem aprovação para implementação. O ensaio informal anterior à P0 não tinha resultado reproduzível; coletas posteriores estão em `docs/history/preview-evidence-2026-10.md`, sem ampliar retroativamente a evidência da P0.

## Decisão aprovada

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

## Alinhamento com os contratos ativos — 2026-10-08

A decisão de dois projetos, Redis, reserva e WAF permanece. A implementação já passou pelo smoke em Preview, foi integrada à `main` e continua em `chore/vercel-p1`, conforme o andamento (`docs/history/preview-evidence-2026-10.md`); isso não conclui P1 nem autoriza publicação. O cache local citado no contexto é o baseline de desenvolvimento, não a infraestrutura única da entrada Vercel atual.

As referências originais a alarme mensal devem ser lidas junto de [Production Delivery](../../SPEC-production-delivery.md): acompanhar consumo e indisponibilidade no Free, usar alertas onde disponíveis e registrar um procedimento manual; o alarme de orçamento do plano pago por uso não é gate. Essa nota alinha a terminologia aos requisitos ativos já existentes, sem habilitar cobrança nem retirar o controle de custo.

Os documentos versionados usam placeholders e resultados anonimizados; dados reais de infraestrutura ficam no painel do proprietário. O diagnóstico usa as categorias de log existentes. A proposta de incluir janela, custo e saldo foi cancelada pelo proprietário antes de implementação.

## Alinhamento com a simplificação de P1 — 2026-10-10

O proprietário aprovou transferir a prova hospedada extensa de Lua, concorrência e expiração após 24 h, bem como a reconciliação mensal exata e a projeção adversarial, para acompanhamento após a abertura. A reserva atômica em quatro janelas, a falha fechada, o WAF, a política própria de Production e os limites de `CONSTRAINTS.md` continuam exigidos. Testes locais e amostras de Preview sustentam o escopo registrado, sem comprovar atomicidade entre instâncias nem garantir capacidade contínua no Free.

A saída sem IP do visitante foi aceita pela revisão do transporte que constrói a requisição Open-Meteo sem headers recebidos e pela amostra parcial de eco em Preview. O ingresso bloqueou ou alterou alguns controles; a amostra não é prova hospedada completa. Um novo eco depende de mudança relevante no transporte ou na topologia. A verificação contra falsificação do header de identidade nos caminhos direto e reescrito continua pendente e separada da privacidade da saída.

Esta seção atualiza os gates da decisão original. O progresso e as pendências vigentes ficam somente em `tasks/vercel-todo.md`.
