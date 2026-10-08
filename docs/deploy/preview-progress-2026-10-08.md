# Andamento de P1 — 2026-10-08

Registro anonimizado da continuidade do [ensaio anterior](preview-evidence-2026-10-07.md). URLs reais, IDs, identificadores de conta, credenciais e logs brutos ficam fora dos documentos versionados. A consulta à CLI nesta etapa foi de leitura; o proprietário executa os ajustes de ambiente e os deployments.

## Git, proteção e pareamento

- O trabalho da branch anterior foi integrado à `main`, com remoção das branches anteriores no GitHub. O checkout confirmou `main` e `chore/vercel-p1` na revisão `0c6d090`; cópias locais de branches antigas podem continuar existindo.
- `chore/vercel-p1` é a branch ativa para concluir P1. Cada tarefa segue em uma branch temporária, incorporada e encerrada após revisão e CI; não manter várias linhas permanentes de deploy.
- A CLI confirmou `main` como branch de Production, roots `apps/api` e `apps/web` e proteção `All Deployments` nos dois projetos. Isso fecha a verificação de escopo de autenticação, não os gates de WAF ou privacidade.
- O merge disparou builds Production com status Ready. Os logs fornecidos também mostraram falhas de inicialização `application_environment` em Production. Ready comprova o build; o runtime Production e suas variáveis ainda precisam de revisão antes da liberação pública.
- O primeiro push da branch nova não criou Previews. Ela apontava para o mesmo commit da `main`, e `Skip deployment` estava ativo nos dois projetos; a documentação Vercel descreve o skip de monorepos sem alterações. Foi orientada a criação manual a partir da referência completa da branch.
- Previews e aliases de branch foram consultados pela CLI. Um redeploy web Ready usou a referência Git `main`, enquanto o alias da branch de P1 ainda apontava para um Preview anterior. Conferir ambiente **e** referência Git antes de concluir que o redeploy aplicou um override de branch.
- O proprietário ajustou as variáveis e confirmou o fluxo na nova branch. O pareamento final dos SHAs de API e web, versões efetivas dos dois builds e CI hospedada continuam pendentes de evidência completa.

## Variáveis e operação manual

`API_ORIGIN` no web aponta para a API Preview da mesma branch. `CORS_ALLOWED_ORIGINS` na API contém a origem exata do web usada pelo navegador. Preferir os aliases de branch verificados; a URL individual com hash permanece vinculada a um deployment. Os endpoints HTTPS da Open-Meteo já são fixos no código: não existe variável obrigatória para configurar seu link.

Overrides específicos da branch antiga não são transferidos por merge ou criação de outra branch. Antes de um novo Preview, conferir os targets gerais e os overrides de `chore/vercel-p1`; variáveis alteradas exigem novo deployment. No caminho pela CLI, manter `API_ORIGIN` também no ambiente local para compilar `vercel.mjs`, como no runbook.

O proprietário solicitou executar pessoalmente os ajustes no painel. O agente auxilia com revisão de código/documentos e consultas de leitura, sem editar ambientes ou publicar deployments nesta continuação sem nova instrução explícita.

## Créditos e falhas intermitentes

Crédito é uma escala interna de orçamento: **1.000 créditos representam uma unidade de chamada de peso 1**, sem relação com dinheiro. Busca, previsão e diferentes instâncias compartilham as quatro janelas da reserva. Deployments que usam a mesma base Redis e o mesmo namespace também compartilham esse consumo.

Na proposta inicial de testes, busca reservava 1.000 créditos e previsão 2.000. Um teto de 10.000 créditos comportava dez buscas novas, cinco previsões novas ou três ciclos completos de busca + previsão, com 1.000 créditos restantes. A digitação pode produzir buscas adicionais após o debounce. Esse orçamento não era um limite de 10.000 requisições HTTP.

| Pedido | Reserva Open-Meteo |
|---|---|
| Hit em cache ainda válido | Nenhuma nova reserva nem fetch do provedor |
| Entrada inválida | Nenhuma reserva nem fetch do provedor |
| Miss com saldo em todas as janelas | Reserva ponderada antes do fetch |
| Miss sem saldo em alguma janela | `503 SERVICE_UNAVAILABLE`, sem fetch |

O rate limit por visitante é outra proteção: conta pedidos recebidos e pode retornar 429. O esgotamento do orçamento agregado retorna 503, preservando o contrato HTTP aprovado.

A implementação da reserva usa janelas móveis de 60 segundos, uma hora, 24 horas e 31 dias. O saldo se libera conforme reservas antigas saem das janelas; não necessariamente na virada do minuto ou mês do calendário. Reservas consumidas permanecem após falhas externas. Um redeploy, branch nova ou limpeza de cache climático não zera a contabilidade.

Os logs fornecidos mostraram hits 200, misses 200 e períodos de misses 503 no mesmo deployment Preview. A CLI confirmou `quota_denied` em duas falhas de previsão e uma de busca. Não se afirmou que todo 503 tinha essa causa nem qual janela específica negou a reserva, pois os logs atuais não expõem essa informação. O padrão e os tetos iniciais eram compatíveis com pressão nas janelas curtas.

Foi proposta uma ampliação conservadora dos tetos apenas para a branch Preview. O proprietário informou que atualizou os valores e que o funcionamento melhorou. Os valores Secret não foram extraídos, portanto o relato não substitui a conferência dos números efetivos, do peso no calculador e do consumo Redis; a política Production não foi aprovada por esse teste.

## Logs existentes e decisão sobre instrumentação

O diagnóstico continua usando os eventos atuais:

- `geocoding_upstream_failed` / `forecast_upstream_failed` e `failureKind`;
- `cache_hit`, `cache_miss`, `request_completed`;
- categorias limitadas de Redis, circuito e rate limit.

`failureKind: quota_denied` indica bloqueio interno, não um 429 recebido da Open-Meteo. O campo de cache do CDN no export Vercel não representa o cache Redis. Os detalhes agrupados da requisição podem conter mensagens além do primeiro `cache_miss` exibido na listagem.

O proprietário decidiu **não acrescentar janela, custo solicitado ou saldo aos logs** nesta etapa. A sugestão foi cancelada antes de qualquer mudança de runtime. Logs, envelopes públicos, quotas e limiares de qualidade permanecem iguais. Não registrar buscas, coordenadas, IPs, digests HMAC, URLs completas ou valores de ambiente.

Os avisos CSP da Toolbar e do manifesto redirecionado ao SSO pertencem aos recursos do Preview e não explicam os 503 classificados como `quota_denied`. Não foi relaxada a CSP nem a proteção de deployment. A desativação da Toolbar no painel pode ser considerada pelo proprietário; não foi comprovada nesta revisão.

## Provas ainda abertas

Completar P1a com SHAs, CI, versões, headers/CDN, CORS negativo e bundle; P1b com valores efetivos, calculador, amostra limitada, TTL, contenção e falha fechada; P1c com WAF e custo Free; P1d com eco/anti-spoof e circuit breaker. Revisar também a inicialização Production, privacidade, direitos e rollback em P10–P11 antes de uma decisão de exposição pública.

Fontes de procedimento: [Git](https://vercel.com/docs/git), [skip em monorepos](https://vercel.com/docs/monorepos#skipping-unaffected-projects), [URLs geradas](https://vercel.com/docs/deployments/generated-urls), [proteção](https://vercel.com/docs/deployment-protection), [preços/pesos Open-Meteo](https://open-meteo.com/en/pricing) e [termos](https://open-meteo.com/en/terms). O progresso vigente está na [lista ativa](../../tasks/vercel-todo.md).
