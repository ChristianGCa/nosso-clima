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

## Verificação adicional de P1a e CI

Consultas autenticadas em 2026-10-08 confirmaram os dois Previews Ready da branch `chore/vercel-p1` na mesma revisão `0c6d090cb39a0ea51ba30bcf84760d9cc803f254`. Os projetos têm roots `apps/api` e `apps/web`, frameworks Fastify/Vite, plano Hobby e proteção `All Deployments`. O vínculo Git registra o repositório como privado. Os logs dos dois builds confirmam Node `24.21.0`, npm `12.0.2`, instalação com `npm ci --include=dev` e build concluído. A Function API está na região Vercel `iad1`; isso não confirma região, plano ou retenção da Upstash.

O proprietário confirmou que a execução **Quality gates** dessa revisão está verde, com warning de Node 20 deprecado. Esse resultado é relato do proprietário; o agente não acessou a execução privada do GitHub. O workflow local foi atualizado para `checkout@v5`, `setup-node@v5` e `upload-artifact@v6`, cujos manifests oficiais declaram runtime Node 24. Node da aplicação, permissões e todos os gates foram preservados. A atualização ainda precisa de CI hospedada depois de ser enviada ao GitHub. Fontes: [checkout](https://raw.githubusercontent.com/actions/checkout/v5/action.yml), [setup-node](https://raw.githubusercontent.com/actions/setup-node/v5/action.yml) e [upload-artifact](https://raw.githubusercontent.com/actions/upload-artifact/v6/action.yml).

| Caminho testado | Resultado observado |
|---|---|
| API direta, `/health` | 200 JSON, `status: ok`, `Cache-Control: private, no-store`, `x-vercel-cache: MISS` |
| API direta, busca inválida e repetição | 400 JSON `VALIDATION_ERROR`, `private, no-store`, `MISS` nas duas respostas |
| API direta, rota desconhecida | 404 JSON `NOT_FOUND`, `private, no-store`, `MISS` |
| API direta, CORS | Alias web de branch recebe a origem exata permitida; origem ausente/divergente não recebe `Access-Control-Allow-Origin`; `Vary: Origin` presente |
| Web, HTML e manifesto | 200; `public, max-age=0, must-revalidate` |
| Web, JS e CSS com hash | 200; `public, max-age=31536000, immutable` |
| Web, segurança | CSP com `connect-src 'self'`, HSTS, `Referrer-Policy`, `nosniff` e `X-Frame-Options: DENY` presentes |
| Web, bundle entregue | Sem nomes dos segredos Redis/HMAC, hosts conhecidos da API ou URL Upstash encontrados no JS inspecionado; somente `API_ORIGIN` consta nos nomes de env do projeto web |
| Web, rota desconhecida no navegador do proprietário | JSON `NOT_FOUND` confirmado; status e cabeçalhos dessa resposta não foram coletados |

A [CLI `vercel curl`](https://vercel.com/docs/cli/curl) acessou API direta e arquivos web usando seu mecanismo de proteção por projeto. No caminho reescrito, esse cliente recebeu 302 para `/sso-api`; o resultado não foi tratado como resposta da aplicação nem como prova de erro do fluxo autenticado. O JSON fornecido pelo proprietário confirma o rewrite no navegador. A matriz de sucesso/erro e cache/CDN pelo web continua pendente de captura com sessão autorizada para os dois projetos. O cabeçalho `Vercel-CDN-Cache-Control` não apareceu nas respostas públicas diretas; isso não demonstra ausência na saída da Function, conforme a [documentação de cache](https://vercel.com/docs/caching/cache-control-headers), a Vercel consome esse cabeçalho antes de enviar a resposta ao cliente. `Cache-Control` e o estado do CDN observados estão na tabela.

A leitura de `/v1/security/firewall/config/active` retornou **Config not found** nos dois projetos. O proprietário confirmou que ainda não configurou as regras WAF. P1c continua aberta: criar e publicar uma regra por projeto conforme o [runbook](vercel-upstash-runbook.md#roteamento-cache-e-waf-da-p7), depois provar bloqueio antes da Function/Redis nos caminhos direto e reescrito. Não foi feita nova consulta válida ao provedor nem alterada variável de ambiente nesta verificação.

Os gates locais desta fatia passaram com npm 12: `npm run check` (505 testes API e 90 web), `npm run test:coverage` e `npm audit --audit-level=high` (zero vulnerabilidades). O YAML foi validado e a comparação estrutural confirmou mudança apenas nas três referências de actions. Esses resultados não substituem a nova execução hospedada nem as provas abertas de P1b–P1d.
