# Pesquisa de migração: Cloudflare Free

Data da consulta: 2026-10-01. Este documento é insumo para o plano, não autorização de implementação ou publicação. A [auditoria de 2026-10-03](release-audit-2026-10-03.md) registra as decisões posteriores e o requisito de uma URL gratuita com `nosso-clima`; ela prevalece onde as premissas de topologia divergirem. Revalidar preços, limites e termos na execução e na liberação.

## Premissas informadas pelo proprietário

Em 2026-10-01, o proprietário confirmou uso **não comercial** e estimou cerca de **100 usuários por dia**, distribuídos em horários aleatórios, fazendo algumas consultas ao site. Isso permite avaliar inicialmente a API gratuita da Open-Meteo, mas não fixa quantidade de chamadas por visita nem pico por minuto. Uma conta ilustrativa de cinco tentativas externas por usuário, sem qualquer acerto de cache, daria 500 tentativas por dia antes da ponderação da previsão; não é medição nem teto. A reserva agregada continua necessária porque tráfego inesperado, repetição de consultas e misses em Workers podem superar a estimativa.

O proprietário informou que os dez fundos foram gerados no Gemini e que o logo foi gerado com IA. A origem relatada e a comparação entre arquivos estão em `docs/deploy/image-rights.md`; a revisão de permissão de publicação ainda não foi concluída.

## Arquitetura candidata

- **Frontend:** Cloudflare Pages com o build estático de `apps/web`. Isso preserva a implantação independente e o `VITE_API_BASE_URL` HTTPS já previsto. O plano Free de Pages permite 500 builds mensais; arquivos estáticos têm limite de 20.000 por projeto e 25 MiB por arquivo. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- **API:** um Cloudflare Worker separado, com handler `fetch(Request, env, ctx)` e os mesmos caminhos, códigos, envelopes de erro e respostas atuais. Reaproveitar validação, normalização e transporte Open-Meteo; não iniciar `server.ts` nem presumir processo Node persistente. Workers suportam parte das APIs Node, mas isso não prova que Fastify e seus plugins atendam ao orçamento de CPU Free. Medir uma prova pequena antes de escolher entre adaptar Fastify e criar uma camada HTTP Fetch nativa. [Fetch handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/), [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- **Cota agregada:** Cloudflare D1 guarda somente contadores de consumo por janelas de minuto, hora e dia; uma reserva atômica e conservadora deve anteceder cada chamada real à Open-Meteo. Geocoding e forecast usam o mesmo orçamento. Em falha do D1, negar trabalho externo com o erro público `SERVICE_UNAVAILABLE`. Testar concorrência, virada de janela, erros e compatibilidade de SQL em workerd antes de assumir esta estratégia. D1 Free inclui 5 milhões de linhas lidas e 100 mil escritas por dia; também tem limite de 50 consultas por invocação Free. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- **Controles locais:** cache LRU, `SingleFlight` e executor podem continuar apenas como otimizações oportunistas dentro de uma instância do Worker. Nenhum deles garante coordenação entre instâncias ou localidades. Evitar KV para contagem por requisição: o plano Free permite apenas 1.000 escritas por dia, e KV não é a escolha para reserva atômica de quota. Evitar persistir termos de busca, coordenadas e respostas de previsão para manter a regra de privacidade existente. [KV limits](https://developers.cloudflare.com/kv/platform/limits/), [Workers Cache locality](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- **Rate limit por visitante:** avaliar três bindings da Rate Limiting API para 60/30/15 por minuto. Eles aplicam limites por localidade da Cloudflare, não globais; portanto a semântica e possivelmente os cabeçalhos de rate limit da especificação atual exigem emenda explícita. A cota D1 é o controle agregado do provedor. [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## Limites relevantes e implicações

| Serviço | Free em 2026-10-01 | Implicação |
|---|---:|---|
| Workers | 100.000 invocações/dia, 10 ms de CPU/invocação, 128 MB, 50 subrequests externos/invocação | Medir CPU real nos dois caminhos; rede aguardada não consome o mesmo orçamento de CPU. Escolher falha fechada ao esgotar invocações. [Fonte](https://developers.cloudflare.com/workers/platform/limits/) |
| Pages | 500 builds/mês; até 20.000 arquivos, 25 MiB por arquivo | Conferir tamanho e quantidade de artefatos antes do deploy. [Fonte](https://developers.cloudflare.com/pages/platform/limits/) |
| D1 | 5 milhões de linhas lidas/dia; 100.000 escritas/dia | Uma escrita por chamada externa reservada cabe no teto nominal do provedor, mas medir a consulta real e deixar margem. [Fonte](https://developers.cloudflare.com/d1/platform/pricing/) |
| Open-Meteo Free | Uso não comercial; menos de 600 chamadas/minuto, 5.000/hora e 10.000/dia | O menor teto governa o desenho; definir orçamento abaixo dele após conferir o custo efetivo das variáveis. [Termos](https://open-meteo.com/en/terms/), [preços e contabilização](https://open-meteo.com/en/pricing/) |

O forecast atual pede 5 variáveis atuais e 8 diárias para 7 dias; o custo efetivo precisa ser confirmado na calculadora/documentação da Open-Meteo. Reservar conservadoramente o custo máximo verificado, inclusive quando a tentativa termina em timeout ou erro de rede. O limite precisa considerar buscas, seleção, retornos automáticos e misses após reinicialização. Um `429` da Cloudflare ou um `1027` ao esgotar Workers Free não pode ser tratado como garantia de proteção da cota Open-Meteo.

## Conflitos com especificações vigentes

1. `SPEC-backend-platform.md` estabelece um processo Node persistente, cache e limites por IP locais ao processo. Worker não oferece essa topologia.
2. `SPEC-production-delivery.md` exige iniciar a API Node separadamente, testar `buildApp({ fetchImpl })`, configurar `HOST`/`PORT`/`TRUST_PROXY` e ensaiar rollback dessa topologia. A execução Worker, os bindings, os testes em workerd e os limites da borda precisam ser especificados antes da mudança de código.
3. O contrato HTTP, as integrações de `location-search` e `weather-forecast`, os limites de entrada, os créditos, os logs sem dados privados e todas as restrições de `CONSTRAINTS.md` permanecem requisitos. Qualquer alteração no comportamento observável ou no endpoint do provedor exige revisão do módulo dono.

O próximo trabalho é propor e obter aprovação de emendas a essas duas especificações, preservando o mapa de responsabilidades. `tasks/plan.md` e `tasks/todo.md` registram a ordem proposta; nenhum item de implementação está aprovado por este levantamento.
