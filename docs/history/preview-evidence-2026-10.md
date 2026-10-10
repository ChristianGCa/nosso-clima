# Histórico de Preview — outubro de 2026

Consolidado em 2026-10-10 a partir de seis relatos datados e das verificações locais antigas do runbook. Os resultados, fontes, limitações e correções foram preservados. Os nomes dos arquivos de origem abaixo identificam registros encerrados; seus caminhos antigos foram retirados da árvore atual.

**Este arquivo é evidência histórica, não uma lista de execução.** “Próximo passo”, “Continuidade” e instruções de painel dentro das coletas descrevem aquela sessão e podem ter sido superados por relatos posteriores. Para retomar, ler `tasks/vercel-todo.md`; não recriar projetos, reiniciar eco/túnel, trocar credenciais Redis nem repetir rodadas apenas porque um relato antigo manda fazê-lo.

A coleta mais recente registra retirada das variáveis de eco, redeploy somente da API Preview, respostas reais de previsão e proteção mantida. Falha de token Redis, recuperação e rodada normal de eco já foram registradas. A amostra hospedada de privacidade continua parcial; a decisão posterior sobre evidência suficiente para a saída sem IP está abaixo. Identidade confiável, configuração Production e demais gates seguem na lista ativa.

## Revisão da evidência de saída sem IP — 2026-10-10

O proprietário já havia aceitado a saída sem IP pela inspeção de `apps/api/src/infrastructure/open-meteo-transport.ts`, registrada na lista ativa. A revisão desta data confirmou que busca e previsão constroem URLs novas com somente parâmetros climáticos e chamam o mesmo transporte pela entrada Vercel. Ele aceita apenas dois destinos HTTPS da Open-Meteo e reconstrói as opções do `fetch` sem cabeçalhos da requisição recebida. O IP de entrada é usado separadamente para o limitador em `serverless-rate-limit.ts`; esse valor não é passado aos clientes Open-Meteo.

A coleta anterior observou oito saídas ao eco sem sentinelas de IP/canário, mas o Quick Tunnel bloqueou ou alterou parte dos controles. Ela continua evidência hospedada parcial, não prova isolada de todos os cabeçalhos nem da configuração Production. A decisão aprovada usa a revisão do caminho de saída, apoiada por essa coleta, e exige reconferir o mesmo caminho na revisão final. Alteração relevante do transporte ou da topologia reabre a avaliação. A confiança contra falsificação do header de identidade é uma pendência distinta. Nenhum novo deploy, chamada hospedada, alteração Redis ou teste foi feito nesta revisão documental.

## Índice das coletas

- 2026-10-07: bootstrap, escopos de créditos, rewrite e CORS.
- 2026-10-08: continuidade, quota e revisão do ambiente.
- 2026-10-09: revisão/CI e matriz HTTP no navegador.
- 2026-10-10: WAF, TTL de previsão, custos e falha Redis.
- 2026-10-10: ferramentas de eco, rodada normal e retirada das fixtures.
- 2026-10-04 a 2026-10-07: verificações locais antigas retiradas do runbook operacional.


## Registro de origem: preview-evidence-2026-10-07.md

## Evidência de Preview — 2026-10-07

Ensaio realizado em 2026-10-07, horário de Brasília; parte dos registros corresponde a 2026-10-08 em UTC. O proprietário autorizou a consulta e a edição pela CLI da Vercel e confirmou **“funcionou”** no navegador após a correção. Este registro comprova o fluxo testado em Preview; P1 e a publicação permanecem parcialmente pendentes.

### Projetos e deployments

Os endereços reais, IDs de deployments e identificadores de conta ficam no painel da Vercel. Este registro usa somente os papéis das aplicações e os resultados do ensaio, conforme a preferência do proprietário de não incluir dados operacionais identificáveis nos documentos versionados.

Branch de configuração: `fix/vercel-review-consistency`. Revisão local usada na sessão: `e7eb7b8`; o pareamento dos SHAs efetivamente hospedados ainda deve ser conferido nos dois projetos.

| Componente | Root Directory | Estado final |
|---|---|---|
| Web | `apps/web` | Preview, Ready |
| API | `apps/api` | Preview, Ready |

O alias de branch da API acompanha seus redeploys; o frontend usa esse endereço em `API_ORIGIN`. Para o web criado pela CLI, foi observada a URL individual; nenhum alias estável de branch web foi confirmado. Ao recriar o frontend, sua origem permitida precisa acompanhar a URL efetivamente usada. Confira os valores reais no painel, sem copiá-los para este documento.

A região efetiva da API deve ser consultada no painel da Vercel. A CLI usada foi 62.2.0, executada com Node 24.21.0. Isso não substitui a conferência de Node/npm efetivos nos builds hospedados de cada app. O primeiro build web de `main` foi criado como Production e falhou com `Invalid API_ORIGIN`; não contou como Preview aprovado.

### Causas identificadas

1. **URLs de deployment mudavam:** a URL individual com hash aponta para uma revisão; o alias de branch da API mantém o endereço ao mudar o deployment. O web passa a usar esse alias em `API_ORIGIN`.
2. **Falha local da CLI:** `vercel.mjs` lê `process.env.API_ORIGIN` durante a compilação local anterior ao upload. A variável só no painel não resolveu essa etapa. Definir a variável no terminal fez `vercel deploy --dry` passar; o deploy web subsequente usou também `--build-env`.
3. **503 em busca/previsão:** os detalhes completos de uma requisição mostraram `forecast_upstream_failed` com `failureKind: quota_denied`; uma requisição posterior mostrou `geocoding_upstream_failed` com a mesma causa. Os oito campos `OPEN_METEO_*` estavam inicialmente apenas em Production. Preview usava padrões de 1.000 créditos por consulta e por janela, compartilhados entre busca e previsão. Hits Redis retornavam 200; novos misses eram bloqueados antes do fetch do provedor.
4. **Edição parcial dos escopos:** custos e tempos já tinham sido habilitados em Preview pelo proprietário, mas os quatro tetos continuavam apenas em Production. Um redeploy anterior não resolveu porque ainda faltavam esses escopos.
5. **CORS:** após a correção da cota, uma consulta inválida retornou 400, mas não permitiu a origem do frontend atual. Um override de Preview para a branch corrigiu a origem; o teste final confirmou a permissão.

`/health` responde sem consultar Redis ou Open-Meteo. Seu 200 inicial provou a inicialização da API, não o fluxo completo. Os erros `application_environment` de deployments Production antigos foram tratados como evidência separada dos 503 de Preview.

### Configuração aplicada

| Projeto | Variáveis | Resultado |
|---|---|---|
| API | `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Preview acrescentado aos targets existentes, mantendo Production, valores e tipo Secret |
| API | `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS`, `OPEN_METEO_429_COOLDOWN_MS`, `OPEN_METEO_PROBE_MS` | Já incluíam Preview após a edição do proprietário; escopos conferidos |
| Web | `API_ORIGIN` geral | Preview acrescentado, preservando o valor existente e Production |
| Web | `API_ORIGIN` específico de `fix/vercel-review-consistency` | Override Preview definido com o alias estável da API |
| API | `CORS_ALLOWED_ORIGINS` específico de `fix/vercel-review-consistency` | Override Preview definido com a origem exata do web atual |

Os valores gerais classificados como Secret não eram legíveis pela CLI. Foram corrigidos os targets sem extrair ou substituir esses valores. Os números propostos para testes na conversa não foram apresentados como valores efetivos verificados; essa conferência permanece pendente. Nenhuma credencial Redis/HMAC foi exposta ou alterada, nenhum contador Redis foi apagado e nenhum redeploy Production foi executado nesta correção.

Os dois overrides de URL são exclusivos de Preview e da branch indicada. Os parâmetros gerais de Production não foram redefinidos como política de lançamento.

### Procedimento reproduzível pela CLI

Na raiz do repositório, com a branch de Preview selecionada e as variáveis cadastradas no projeto web:

```bash
## Substitua o exemplo pela origem de branch da API Preview indicada no painel.
export API_ORIGIN='https://api-preview.example.com'

vercel deploy \
  --project '<projeto-web>' \
  --scope '<time-vercel>' \
  --target preview \
  --build-env API_ORIGIN="$API_ORIGIN"
```

O `export` atende à compilação local; `--build-env` fornece o mesmo endereço ao build remoto. Use `--dry` para conferir essa compilação sem upload/deployment. O comando cria um Preview, mesmo com `main` configurada como branch de Production. Os dois projetos precisam usar a revisão escolhida para o ensaio.

A CLI gera arquivos em `.vercel/`, inclusive dentro de `apps/web`. Essa pasta foi acrescentada ao `.gitignore` após um `format:check` alcançar um `vercel.json` gerado sem newline final. Esses artefatos locais podem conter metadados ou variáveis de ambiente baixadas; ficam fora do Git e dos checks que respeitam o ignore. A configuração autoral `apps/web/vercel.mjs` permanece versionada e verificada.

Depois de mudar variáveis da API, redeployar **um deployment API Preview** com `--target preview`. Confirmar com `vercel inspect` que o alias usado pelo web aponta para o novo deployment. O web existente não precisou de novo deploy após a correção da API.

### Resultados observados

As consultas reais de busca/previsão foram limitadas e executadas manualmente pela CLI; não se alterou a política de testes automatizados offline.

| Verificação | Evidência |
|---|---|
| `/health` na API | 200 e `status: ok` |
| Consulta de busca inválida | 400, `VALIDATION_ERROR`; cache `private, no-store` |
| Rota API desconhecida | 404, `NOT_FOUND`, observado pelo proprietário e nos logs fornecidos |
| Busca válida após correção dos escopos | 200; cinco resultados, sem registrar texto pesquisado ou coordenadas neste documento |
| Previsão válida | 200; condições atuais e sete dias |
| Repetição da previsão | 200; evento `cache_hit` e `request_completed` com status 200 no deployment intermediário da API |
| CORS após o override e segundo redeploy API | Consulta inválida com 400, `VALIDATION_ERROR`, origem web permitida e `Cache-Control: private, no-store` |
| Navegador → web → API | Proprietário confirmou o funcionamento depois da correção final |

O cache hit veio da aplicação/Redis. O campo `cache: MISS` do export Vercel pertence ao CDN e não contradiz esse evento. O ensaio não mediu expiração real, deduplicação entre instâncias nem atomicidade sob contenção.

### Pendências e próximo passo

- Concluir P1a: pareamento de revisões, versões dos dois builds, CI hospedada, escopo efetivo de autenticação, cabeçalhos web/asset/CDN em sucesso e erro, CORS com origem ausente/divergente e ausência de segredos no bundle.
- Concluir P1b: confirmar peso no calculador e valores efetivos dos créditos, medir o tamanho da amostra de previsão, provar TTL/expiração, reserva concorrente em quatro janelas, falha fechada e consumo de comandos Redis.
- P1c: configurar/verificar WAF na API direta e no rewrite, consumo gratuito e bloqueio anterior à Function/Redis.
- P1d: eco sem IP/canário e teste de falsificação nas duas rotas e nos dois caminhos; circuit breaker com fixture.
- P10–P11: região/retenção, direitos, termos, política Production, gates finais e rollback dos dois projetos; decisão separada sobre exposição pública.

Os avisos CSP da Toolbar (`vercel.live`) e do manifesto redirecionado ao SSO Vercel são distintos do `quota_denied`. Nenhuma CSP ou proteção de deployment foi relaxada. A Toolbar pode ser desativada no painel do projeto web em Settings → General → Vercel Toolbar → Preview → Off; sua desativação não foi executada nem comprovada neste ensaio.

Fontes de procedimento: URLs geradas (fonte citada na coleta original), CLI deploy (fonte citada na coleta original), logs agrupados por requisição (fonte citada na coleta original) e Toolbar (fonte citada na coleta original). O progresso vigente está em vercel-todo.md (`tasks/vercel-todo.md`).


## Registro de origem: preview-progress-2026-10-08.md

## Andamento de P1 — 2026-10-08

Registro anonimizado da continuidade do ensaio anterior (`docs/history/preview-evidence-2026-10.md`). URLs reais, IDs, identificadores de conta, credenciais e logs brutos ficam fora dos documentos versionados. A consulta à CLI nesta etapa foi de leitura; o proprietário executa os ajustes de ambiente e os deployments.

### Git, proteção e pareamento

- O trabalho da branch anterior foi integrado à `main`, com remoção das branches anteriores no GitHub. O checkout confirmou `main` e `chore/vercel-p1` na revisão `0c6d090`; cópias locais de branches antigas podem continuar existindo.
- `chore/vercel-p1` é a branch ativa para concluir P1. Cada tarefa segue em uma branch temporária, incorporada e encerrada após revisão e CI; não manter várias linhas permanentes de deploy.
- A CLI confirmou `main` como branch de Production, roots `apps/api` e `apps/web` e proteção `All Deployments` nos dois projetos. Isso fecha a verificação de escopo de autenticação, não os gates de WAF ou privacidade.
- O merge disparou builds Production com status Ready. Os logs fornecidos também mostraram falhas de inicialização `application_environment` em Production. Ready comprova o build; o runtime Production e suas variáveis ainda precisam de revisão antes da liberação pública.
- O primeiro push da branch nova não criou Previews. Ela apontava para o mesmo commit da `main`, e `Skip deployment` estava ativo nos dois projetos; a documentação Vercel descreve o skip de monorepos sem alterações. Foi orientada a criação manual a partir da referência completa da branch.
- Previews e aliases de branch foram consultados pela CLI. Um redeploy web Ready usou a referência Git `main`, enquanto o alias da branch de P1 ainda apontava para um Preview anterior. Conferir ambiente **e** referência Git antes de concluir que o redeploy aplicou um override de branch.
- O proprietário ajustou as variáveis e confirmou o fluxo na nova branch. O pareamento final dos SHAs de API e web, versões efetivas dos dois builds e CI hospedada continuam pendentes de evidência completa.

### Variáveis e operação manual

`API_ORIGIN` no web aponta para a API Preview da mesma branch. `CORS_ALLOWED_ORIGINS` na API contém a origem exata do web usada pelo navegador. Preferir os aliases de branch verificados; a URL individual com hash permanece vinculada a um deployment. Os endpoints HTTPS da Open-Meteo já são fixos no código: não existe variável obrigatória para configurar seu link.

Overrides específicos da branch antiga não são transferidos por merge ou criação de outra branch. Antes de um novo Preview, conferir os targets gerais e os overrides de `chore/vercel-p1`; variáveis alteradas exigem novo deployment. No caminho pela CLI, manter `API_ORIGIN` também no ambiente local para compilar `vercel.mjs`, como no runbook.

O proprietário solicitou executar pessoalmente os ajustes no painel. O agente auxilia com revisão de código/documentos e consultas de leitura, sem editar ambientes ou publicar deployments nesta continuação sem nova instrução explícita.

### Créditos e falhas intermitentes

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

### Logs existentes e decisão sobre instrumentação

O diagnóstico continua usando os eventos atuais:

- `geocoding_upstream_failed` / `forecast_upstream_failed` e `failureKind`;
- `cache_hit`, `cache_miss`, `request_completed`;
- categorias limitadas de Redis, circuito e rate limit.

`failureKind: quota_denied` indica bloqueio interno, não um 429 recebido da Open-Meteo. O campo de cache do CDN no export Vercel não representa o cache Redis. Os detalhes agrupados da requisição podem conter mensagens além do primeiro `cache_miss` exibido na listagem.

O proprietário decidiu **não acrescentar janela, custo solicitado ou saldo aos logs** nesta etapa. A sugestão foi cancelada antes de qualquer mudança de runtime. Logs, envelopes públicos, quotas e limiares de qualidade permanecem iguais. Não registrar buscas, coordenadas, IPs, digests HMAC, URLs completas ou valores de ambiente.

Os avisos CSP da Toolbar e do manifesto redirecionado ao SSO pertencem aos recursos do Preview e não explicam os 503 classificados como `quota_denied`. Não foi relaxada a CSP nem a proteção de deployment. A desativação da Toolbar no painel pode ser considerada pelo proprietário; não foi comprovada nesta revisão.

### Provas ainda abertas

Completar P1a com SHAs, CI, versões, headers/CDN, CORS negativo e bundle; P1b com valores efetivos, calculador, amostra limitada, TTL, contenção e falha fechada; P1c com WAF e custo Free; P1d com eco/anti-spoof e circuit breaker. Revisar também a inicialização Production, privacidade, direitos e rollback em P10–P11 antes de uma decisão de exposição pública.

Fontes de procedimento: Git (fonte citada na coleta original), skip em monorepos (fonte citada na coleta original), URLs geradas (fonte citada na coleta original), proteção (fonte citada na coleta original), preços/pesos Open-Meteo (fonte citada na coleta original) e termos (fonte citada na coleta original). O progresso vigente está na lista ativa (`tasks/vercel-todo.md`).

### Verificação adicional de P1a e CI

Consultas autenticadas em 2026-10-08 confirmaram os dois Previews Ready da branch `chore/vercel-p1` na mesma revisão `0c6d090cb39a0ea51ba30bcf84760d9cc803f254`. Os projetos têm roots `apps/api` e `apps/web`, frameworks Fastify/Vite, plano Hobby e proteção `All Deployments`. O vínculo Git registra o repositório como privado. Os logs dos dois builds confirmam Node `24.21.0`, npm `12.0.2`, instalação com `npm ci --include=dev` e build concluído. A Function API está na região Vercel `iad1`; isso não confirma região, plano ou retenção da Upstash.

O proprietário confirmou que a execução **Quality gates** dessa revisão está verde, com warning de Node 20 deprecado. Esse resultado é relato do proprietário; o agente não acessou a execução privada do GitHub. O workflow local foi atualizado para `checkout@v5`, `setup-node@v5` e `upload-artifact@v6`, cujos manifests oficiais declaram runtime Node 24. Node da aplicação, permissões e todos os gates foram preservados. A atualização ainda precisa de CI hospedada depois de ser enviada ao GitHub. Fontes: checkout (fonte citada na coleta original), setup-node (fonte citada na coleta original) e upload-artifact (fonte citada na coleta original).

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

A CLI `vercel curl` (fonte citada na coleta original) acessou API direta e arquivos web usando seu mecanismo de proteção por projeto. No caminho reescrito, esse cliente recebeu 302 para `/sso-api`; o resultado não foi tratado como resposta da aplicação nem como prova de erro do fluxo autenticado. O JSON fornecido pelo proprietário confirma o rewrite no navegador. A matriz de sucesso/erro e cache/CDN pelo web continua pendente de captura com sessão autorizada para os dois projetos. O cabeçalho `Vercel-CDN-Cache-Control` não apareceu nas respostas públicas diretas; isso não demonstra ausência na saída da Function, conforme a documentação de cache (fonte citada na coleta original), a Vercel consome esse cabeçalho antes de enviar a resposta ao cliente. `Cache-Control` e o estado do CDN observados estão na tabela.

A leitura de `/v1/security/firewall/config/active` retornou **Config not found** nos dois projetos. O proprietário confirmou que ainda não configurou as regras WAF. P1c continua aberta: criar e publicar uma regra por projeto conforme o runbook (`docs/deploy/vercel-upstash-runbook.md`, seção roteamento-cache-e-waf-da-p7), depois provar bloqueio antes da Function/Redis nos caminhos direto e reescrito. Não foi feita nova consulta válida ao provedor nem alterada variável de ambiente nesta verificação.

Os gates locais desta fatia passaram com npm 12: `npm run check` (505 testes API e 90 web), `npm run test:coverage` e `npm audit --audit-level=high` (zero vulnerabilidades). O YAML foi validado e a comparação estrutural confirmou mudança apenas nas três referências de actions. Esses resultados não substituem a nova execução hospedada nem as provas abertas de P1b–P1d.


## Registro de origem: revision-review-2026-10-09.md

## Retomada de P1a — revisão e acesso em 2026-10-09

Registro da conferência de revisão que sucede a evidência de 2026-10-08 (`docs/history/preview-evidence-2026-10.md`). O progresso vigente permanece na lista ativa (`tasks/vercel-todo.md`); esta evidência não aprova publicação nem conclui P1a.

### Resultados observados

| Conferência | Resultado | Alcance |
|---|---|---|
| Checkout | Branch `chore/vercel-p1`, revisão `ef9cda2`, sem alterações antes desta atualização documental | Estado local no início da retomada |
| Sincronização registrada | HEAD e `origin/chore/vercel-p1` em `ef9cda2`; reflog registra `fetch origin: fast-forward` em 2026-10-09 | A referência local recebeu os commits do remoto nessa sincronização; não houve nova consulta Git remota nesta retomada |
| Atualização das actions | Commit `8ee1b56`, presente em `ef9cda2`, altera checkout/setup-node/upload-artifact para as versões registradas na evidência anterior | Configuração versionada conferida; confirmação da CI pelo proprietário registrada abaixo |
| CI no GitHub | Consulta sem autenticação retornou 404; nenhuma execução foi obtida | Não permite concluir ausência de execução nem sucesso/falha da CI no repositório privado |
| CI informada pelo proprietário | Em resposta à pergunta específica sobre Quality gates de `ef9cda2`, o proprietário confirmou que está verde | Confirmação por relato do proprietário; o agente não inspecionou a execução |
| Consulta inicial à API Vercel | Consulta autenticada de projetos retornou 403 | Esta tentativa não obteve metadados; a consulta posterior pela CLI está registrada abaixo |
| Revisões Preview informadas pelo proprietário | API e web da branch `chore/vercel-p1` em `0c6d090` | Confirmação por relato do proprietário; os dois projetos continuam na revisão já ensaiada |
| Consulta posterior pela CLI Vercel | API e web Ready, ambiente Preview, branch `chore/vercel-p1`, SHA `0c6d090`, roots `apps/api` e `apps/web`; proteção `All Deployments` nos dois projetos | Metadados atuais confirmados por leitura do agente; não comprova o destino efetivo do rewrite, versões dos builds ou WAF |
| Comparação local de revisões | `git diff --stat 0c6d090..ef9cda2` mostra alterações apenas em documentação Markdown e `.github/workflows/ci.yml` | Código, dependências, assets e configuração de deploy versionados permanecem iguais entre os dois commits; valores do painel não foram conferidos |

As evidências hospedadas anteriores continuam válidas para o que foi observado na revisão `0c6d090`. A referência local sincronizada em `ef9cda2` não amplia esse alcance. Não foram reexecutadas suites de testes, builds ou scans Gitleaks nesta retomada; resultados históricos não foram tratados como novos resultados. O agente consultou somente a rota inexistente; as buscas e previsões válidas foram coletadas manualmente pelo proprietário, sem medir quantas chamadas chegaram à Open-Meteo.

### Conferência HTTP pelo agente

Após confirmação do proprietário para a coleta, a CLI autenticada acessou `/api/rota-inexistente` nos dois Previews, duas vezes em cada caminho. Foram extraídos somente status, cabeçalhos permitidos e código público de erro, sem salvar respostas brutas no repositório.

| Caminho | Status nas duas chamadas | Content-Type | Cache-Control | x-vercel-cache | Resultado |
|---|---|---|---|---|---|
| API direta | 404 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | JSON `NOT_FOUND` |
| Web → rewrite | 302 | `text/plain` | `private, no-store` | `MISS` | Redirecionamento SSO Vercel; nenhuma resposta JSON da aplicação foi obtida |

O resultado direto confirma o envelope 404 e a política de cache observada nesse caminho. O 302 pelo web pertence ao acesso protegido via cliente CLI. A ferramenta de navegador não disponibilizou superfícies conectadas nesta sessão; a coleta posterior do proprietário está registrada abaixo. Não se inferiu defeito da aplicação, nem se alterou a proteção dos projetos para completar o teste.

### Conferência HTTP pelo proprietário no navegador

O proprietário esclareceu que todas as coletas iniciais de rota inexistente, busca inválida, previsão sem parâmetros e busca válida foram feitas com **Disable cache ativado**, inclusive as primeiras chamadas. Essas amostras registram status, corpos e cabeçalhos nesse modo. As coletas posteriores de busca pela interface, dos três erros e da previsão válida com a opção desmarcada estão identificadas separadamente abaixo.

#### Rota inexistente

O proprietário forneceu a coleta de duas requisições GET a `/api/rota-inexistente` pelo Preview web, antes e depois de recarregar. O endereço real do Preview e o identificador da requisição foram omitidos deste registro.

| Chamada pelo web | Status | Content-Type | Cache-Control | x-vercel-cache | Código público |
|---|---|---|---|---|---|
| Primeira | 404 | Não informado | `private, no-store` | `MISS` | Não informado |
| Após recarregar | 404 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `NOT_FOUND` |

Nas duas chamadas, o web preservou o status 404 e a política `private, no-store`, com `MISS` observado. A repetição também confirmou JSON `NOT_FOUND`, sem fallback HTML da SPA. O Content-Type e o código do corpo da primeira chamada não foram fornecidos. A fonte é a coleta do proprietário, analisada pelo agente; busca/previsão e seus cabeçalhos ainda precisam de prova própria.

#### Busca inválida

O proprietário forneceu duas requisições GET a `/api/v1/locations?query=a` pelo web, antes e depois de recarregar. O parâmetro é um exemplo inválido de teste; a coleta foi resumida sem endereço do Preview, identificadores de requisição ou respostas brutas.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Código público |
|---|---|---|---|---|---|
| Primeira | 400 | Não informado | `private, no-store` | `MISS` | `VALIDATION_ERROR` |
| Após recarregar | 400 | Não informado | `private, no-store` | `MISS` | `VALIDATION_ERROR` |

Ambos os corpos JSON informados contêm o erro público de validação esperado. O proprietário esclareceu que o `Cache-Control: no-cache` adicional está em **Request Headers**, enviado pelo navegador; a política informada em **Response Headers** continua `private, no-store`. O Content-Type não foi fornecido. Estes resultados comprovam o status, o envelope e os cabeçalhos observados da busca inválida.

#### Previsão sem parâmetros

O proprietário forneceu duas requisições GET a `/api/v1/forecast` sem parâmetros pelo web, antes e depois de recarregar.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Código público |
|---|---|---|---|---|---|
| Primeira | 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |
| Após recarregar | 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |

As duas chamadas preservaram o status, o envelope público de validação e os cabeçalhos esperados pelo rewrite. Os dados são da coleta do proprietário; não incluem URL real, identificadores de requisição ou respostas brutas.

#### Busca válida

O proprietário forneceu duas requisições GET de busca válida pelo web, com Preserve log e Disable cache ativados no DevTools. Termo pesquisado, nomes de localidades, coordenadas, identificadores dos resultados e endereço real foram omitidos deste registro.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Corpo resumido |
|---|---|---|---|---|---|
| Primeira | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `locations` com cinco resultados e `attribution` |
| Após recarregar | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `locations` com cinco resultados e `attribution` |

As duas amostras incluem atribuição Open-Meteo/GeoNames, CC BY 4.0 e indicação de dados adaptados. O `MISS` observado pertence ao CDN e não confirma nem nega hit Redis, expiração ou deduplicação.

Em uma coleta posterior pela interface, com **Disable cache desmarcado**, o proprietário informou GET de busca válida, status 200, `Content-Type: application/json; charset=utf-8`, `Cache-Control: private, no-store` e `x-vercel-cache: MISS`. Essa chamada complementa a verificação de sucesso em uso normal; o corpo não foi fornecido novamente.

#### Respostas de erro com Disable cache desmarcado

O proprietário repetiu os três caminhos de erro, com Disable cache desmarcado e Preserve log ativado, fazendo uma requisição GET inicial e outra após recarregar em cada caminho.

| Caminho pelo web | Status primeira/repetição | Content-Type nas duas | Cache-Control da resposta nas duas | x-vercel-cache nas duas | Código público nas duas |
|---|---|---|---|---|---|
| `/api/rota-inexistente` | 404 / 404 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `NOT_FOUND` |
| `/api/v1/locations?query=a` | 400 / 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |
| `/api/v1/forecast` sem parâmetros | 400 / 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |

As seis amostras preservam os status e envelopes esperados e informam JSON, `private, no-store` e `MISS`. A nova coleta também fornece os Content-Types que faltavam nas amostras iniciais de 404 e busca inválida. Os resultados são da coleta do proprietário; URLs reais, request IDs e corpos brutos foram omitidos. Esses resultados delimitam os caminhos de erro observados; erros de provedor, limite por visitante e falha Redis continuam sujeitos às provas próprias do plano.

#### Previsão válida pela interface

O proprietário forneceu uma consulta após selecionar uma cidade nas sugestões e outra após clicar no logo para reabrir a interface com a cidade salva, seguindo o roteiro com Disable cache desmarcado. Foram omitidos endereço real, parâmetros de localização, fuso, datas, horário de consulta e valores meteorológicos.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Corpo resumido |
|---|---|---|---|---|---|
| Após selecionar a cidade | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `current`, sete itens em `daily` e `attribution` |
| Após clicar no logo | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `current`, sete itens em `daily` e `attribution` |

As duas amostras têm sete datas consecutivas, com o primeiro dia correspondente à data local das condições atuais, e atribuição Open-Meteo/CC BY 4.0 com indicação de adaptação. O `retrievedAtUtc` e o corpo permanecem iguais entre as chamadas. Isso é compatível com reutilização do cache da aplicação, mas a confirmação de hit Redis depende dos eventos correspondentes; expiração, deduplicação e reserva concorrente exigem as provas de P1b. O `MISS` observado continua sendo do CDN. A fonte desta coleta é o proprietário.

### Continuidade

Quality gates de `ef9cda2` foi confirmado pelo proprietário; os dois Previews em `0c6d090` foram informados pelo proprietário e confirmados pela CLI. Esta rodada de navegador concluiu a coleta de rota inexistente, busca inválida, previsão sem parâmetros e sucessos de busca/previsão pelo web com Disable cache desmarcado. Cada resultado acima é atribuído à revisão hospedada `0c6d090`; isso não conclui P1 inteiro. A comparação local permite continuar os ensaios no Preview existente, pois até `ef9cda2` mudaram somente documentação e CI. O motivo de não haver novos deployments não foi auditado; a evidência anterior de skip não comprova a causa atual.

O próximo checkpoint proposto é revisar, com confirmação do proprietário, o plano gratuito, a região e a vinculação da Upstash somente à API, sem extrair valores secretos. Em seguida, concluir a matriz direta da API e as provas de custo, TTL, concorrência e falha fechada de P1b. A sequência e os critérios continuam no plano e na lista ativa.

A conferência de revisão e CI (`docs/deploy/vercel-upstash-runbook.md`, seção conferência-de-revisão-e-ci) continua aplicável à revisão final de entrega. A CI verde de `ef9cda2` e os Previews de `0c6d090` são resultados distintos, com fontes registradas acima. Confirmar novamente pareamento, configuração e gates da revisão final em P11.

Os próximos gates são reserva/cache/custo real (P1b), WAF nos dois projetos e consumo gratuito (P1c), identidade/saída sem IP e falha externa (P1d), seguidos de Production, privacidade, direitos e rollback (P10–P11), conforme o plano aprovado. Ajustes de ambiente, regras, deployments e abertura pública aguardam confirmação do proprietário. A autorização desta retomada permite consultas de leitura e atualização documental.

### Conteúdo público

Este registro contém somente data, revisões Git, categorias e resultados resumidos. Credenciais, URLs de deployments/Redis, identificadores de infraestrutura, valores de ambiente e respostas brutas não foram copiados. As regras para evidências destinadas ao repositório público estão no README (`README.md`, seção onde-documentar).

A revisão documental verificou os destinos dos links locais nos quatro documentos alterados e encontrou zero caminhos ausentes; `git diff --check` passou. Uma busca em 24 documentos Markdown por padrões selecionados de credenciais, chaves privadas, JWTs, IDs e hosts reais Vercel/Upstash não encontrou correspondências. O scan completo Gitleaks continua entre os gates de entrega.


## Registro de origem: preview-waf-redis-2026-10-10.md

## Preview — Upstash e WAF em 2026-10-10

Evidência da conferência de infraestrutura e dos testes manuais que sucedem a rodada de 2026-10-09 (`docs/history/preview-evidence-2026-10.md`). O progresso e o próximo trabalho permanecem na lista ativa (`tasks/vercel-todo.md`). Este registro não conclui P1 nem autoriza publicação pública.

### Fonte e revisão

O proprietário operou os painéis Vercel/Upstash e o navegador, fornecendo capturas, resultados HTTP e relatos do Monitor. O agente analisou essas informações, consultou a CLI Vercel em modo somente leitura com autorização e atualizou a documentação quando solicitado. Não houve alteração de código nem operação dos painéis pelo agente nesta rodada.

O checkout local estava em `chore/vercel-p1`, revisão `c7bdb23`, antes do primeiro registro, commitado em `a09efe8`. A continuação documental começou com árvore limpa nesse último commit. A CLI reconfirmou API e web Ready em `0c6d090`, na mesma branch, depois do redeploy da API pelo proprietário. O novo Preview da API foi criado em 2026-10-10 às 16:40:19.628 UTC, após o cadastro das variáveis; o web permanecia no Preview criado em 2026-10-08. Roots `apps/api`/`apps/web`, frameworks Fastify/Vite, runtime configurado Node `24.x` e proteção All Deployments dos dois projetos foram reconfirmados. Isso não é uma nova execução de CI ou uma reconferência das versões exatas dos builds. A comparação local até `a09efe8` não altera runtime, dependências, assets ou configuração versionada de deploy; reconferir a revisão final no release.

Somente resumos anonimizados foram transcritos. Capturas, CSVs e exports de logs não foram incorporados ao repositório. URLs reais, nomes e IDs de recursos/conta, IPs, digests, chaves Redis, identificadores de requisição, consultas reais e coordenadas foram omitidos.

### Upstash e vínculo de Preview

| Conferência no painel | Resultado observado | Alcance |
|---|---|---|
| Plano Upstash | Free Tier | Plano exibido durante a coleta |
| Provedor e região exibida | AWS, Virgínia do Norte, `us-east-1` | Região exibida; o selo Global não comprova regiões adicionais de réplica |
| Connected Projects na Vercel | Somente API, escopo Preview | O seletor expandido não listou o web; vínculo Production não foi verificado |
| Plano Vercel | Hobby nos dois projetos | Identificação exibida nos painéis fornecidos |
| Consumo Upstash | Limite exibido de 500 mil comandos/mês; custo exibido de US$ 0 nas capturas | Snapshot de consumo, não projeção mensal ou confirmação de upgrade automático desativado |

Essa conferência conclui a identificação de plano, região exibida e vínculo da Upstash em Preview. Retenção dos fornecedores, réplicas, configuração Production e orçamento continuam sujeitos aos gates existentes.

### Configuração final do WAF

O proprietário criou e publicou uma regra `api-rate-limit` em cada projeto, API e web. As capturas iniciais mostravam zero regras personalizadas; as posteriores mostraram a regra habilitada e a confirmação de aplicação das mudanças.

| Campo | Configuração nos dois projetos |
|---|---|
| Condição | Request Path Equals `/api` **OR** Request Path Starts with `/api/` |
| Estratégia | Fixed Window |
| Janela e limite | 60 segundos, 60 requisições |
| Chave | Somente IP Address; JA4 Digest desmarcado |
| Ação | Too Many Requests (429) |

Durante a medição, somente o web recebeu limites temporários de 1 requisição/600 segundos e depois 1 requisição/60 segundos. Ao final, o proprietário forneceu a configuração restaurada para 60/60 e confirmou que estava publicada. Não foi relatada alteração temporária da regra da API; sua última configuração fornecida era 60/60 publicada. Publicar mudanças do Firewall não foi tratado como autorização para remover a proteção dos deployments.

### Rajadas de busca inválida nos dois caminhos

Antes das rajadas, `GET /api/v1/locations?query=a` retornou 400 com JSON `VALIDATION_ERROR` tanto pelo web/rewrite como pela API direta. O parâmetro é um exemplo inválido de teste; essas consultas não demandam chamada à Open-Meteo.

O proprietário executou uma rajada limitada de 65 chamadas em cada origem. Os resultados do Console, do filtro `api-rate-limit` no Firewall e dos logs fornecidos foram:

| Caminho | 400 no navegador | 429 no navegador | Bloqueios WAF | Registros da Function na rajada |
|---|---:|---:|---:|---|
| Web → rewrite | 30 | 35 | 5 | 30 com 400; 30 com `rate_limit_rejected`, `source: shared`, `scope: location-search` e 429 |
| API direta | 30 | 35 | 5 | 30 com 400; 30 com o mesmo evento de limite compartilhado e 429 |

Na API direta, o filtro da regra passou de nenhum evento para cinco bloqueios. No web, cinco bloqueios apareceram após atualização do painel. Após um minuto sem consultas, uma nova busca inválida em cada origem voltou a responder 400 `VALIDATION_ERROR`.

Os 60 registros da Function por rajada, somados aos cinco bloqueios WAF, são coerentes com as 65 chamadas. Essa correlação sustenta bloqueio antes da aplicação, mas não é uma auditoria independente de invocações ou cobrança: a conclusão depende da completude do export e da atribuição temporal. Não se classificaram todos os 35 retornos 429 como WAF; os 30 registrados pelo limitador compartilhado envolveram a API/Redis.

### Monitor Redis e controles

As primeiras tentativas de medir comandos pelo total mensal não isolaram as chamadas bloqueadas:

| Snapshot do ensaio | Reads | Writes | Resultado |
|---|---:|---:|---|
| Duas leituras iniciais, separadas por dois minutos | 3.523 | 3.074 | Totais estáveis antes da primeira amostra |
| Após cinco chamadas, com um 400 e quatro 429 | 3.526 | 3.077 | Houve uma chamada permitida; não comprova consumo zero dos bloqueios |
| Após outra amostra e recargas do web | 3.541 | 3.091 | Intervalo com atividade adicional e nove novos eventos WAF; sem atribuição exclusiva ao script |

Uma tentativa de identificar WAF pela frase HTML `This site is rate limited` foi insuficiente: a navegação retornou HTML 429, enquanto chamadas por `fetch` retornaram 429 `text/plain; charset=utf-8`. Ausência da frase não identifica um 429 como erro da API. Totais mensais ou um Monitor silencioso, isoladamente, também não demonstram ausência de comandos.

O proprietário abriu o Monitor com busca vazia e All Commands. Uma tentativa inicial de controle ainda usava o domínio web e foi bloqueada pelo WAF. Depois, acessos à API direta produziram duas execuções visíveis do limitador, com `EVAL`, `TIME`, `GET` e `SET`, validando que o Monitor recebia atividade. Esses comandos visíveis não foram convertidos em uma contagem de comandos faturáveis.

Com a captura retomada antes do teste, a amostra de cinco chamadas de busca inválida pelo web retornou somente 429 em texto simples, sem novos comandos observados. O proprietário esclareceu que o Monitor pausava após inatividade: o indicador Resume da captura apareceu depois do ensaio, não demonstrava pausa durante as chamadas. Um controle posterior na API direta voltou a produzir comandos.

Em seguida, com o web limitado a 1/60, o proprietário observou a mesma separação na previsão: consulta permitida com 200 e comandos Redis; tentativas seguintes com 429 sem comandos; nova consulta após liberar a janela com 200 e atividade Redis. A captura da consulta permitida também mostrou operações de cache, lock, circuito, reserva e gravação. Isso evidencia execução desses mecanismos, não prova isoladamente atomicidade sob contenção, expiração exata ou custo do miss.

**Conclusão inicial:** ausência de comandos Redis observados nos bloqueios pelo web, com controles antes/depois. Naquele ponto faltavam a amostra direta e a correlação específica com a Function; a continuação abaixo acrescentou essas evidências.

### Amostras isoladas e correlação com a Function

O proprietário repetiu o ensaio com limite WAF de 60/60: preparação de 60 buscas inválidas, leitura completa das respostas, espera de cinco segundos e amostra de cinco chamadas. Os horários abaixo são UTC; os painéis fornecidos exibiam UTC−3. Não misturar os comandos da preparação com a amostra bloqueada.

| Caminho | Intervalo da amostra em 2026-10-10 | Resultado e correlação |
|---|---|---|
| Web → rewrite | Fim às 15:43:00.917 UTC | Cinco 429. Os registros de busca fornecidos pertenciam à preparação, por volta de 15:42:53–55; nenhum registro de busca foi apresentado no intervalo da amostra. Controles posteriores `/health` 200 entre 15:47 e 15:48 confirmaram continuidade dos logs. Complementa os controles Redis anteriores do web. |
| API direta | 15:55:54.171–15:55:54.222 UTC | Cinco 429 em texto simples. Monitor registrou somente a preparação, de 15:55:47.683 a 15:55:49.070, sem comandos observados na amostra. Logs de busca também pertenciam à preparação; `/health` posterior retornou 200, com registro às 15:55:54.23. Controles anteriores de busca inválida retornaram 400 e produziram comandos no Monitor. |

O cabeçalho de um export indicava um intervalo antigo, embora suas linhas Live tivessem timestamps posteriores. A correlação usou os timestamps das linhas e do Console. `request_completed` acompanha o fim da execução; o horário da requisição na listagem pode ser anterior. Uma linha com duas mensagens podia agrupar `rate_limit_rejected` e `request_completed` da mesma requisição.

**Conclusão observacional:** as amostras sustentam bloqueio WAF antes da aplicação nos dois caminhos, sem execução da Function registrada para as chamadas amostradas e sem comandos Redis observados nas capturas com controles. Isso não é auditoria independente de cobrança ou garantia para todos os tráfegos, regiões e deployments. Reconfirmar no release; projeção mensal e acompanhamento do plano permanecem pendentes.

### Política Preview e variáveis efetivas

O agente leu os adapters de busca (`apps/api/src/locations/open-meteo-geocoding.ts`), previsão (`apps/api/src/forecast/open-meteo-forecast.ts`) e a política de créditos (`apps/api/src/config/provider-policy.ts`). A busca faz uma chamada HTTP por miss. A previsão solicita uma localização, sete dias, cinco variáveis atuais, uma horária e sete diárias, sem seleção explícita de múltiplos modelos.

A página oficial de preços (fonte citada na coleta original) usa contagem fracionária. Aplicando a fórmula do calculador oficial (fonte citada na coleta original) a 13 variáveis, sete dias, um modelo e uma localização, o peso estimado é 1,3 chamada. É uma estimativa baseada nesses parâmetros, não uma leitura de faturamento do provedor. O proprietário aprovou uma reserva conservadora acima desse peso e quatro tetos provisórios exclusivos do Preview; as fontes foram consultadas em 2026-10-10. Os termos (fonte citada na coleta original) e a política de Production continuam sujeitos à revisão de release.

| Campos | Cadastro e conferência |
|---|---|
| `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS` | Overrides exclusivos de Preview, branch `chore/vercel-p1`, cadastrados como Sensitive pelo proprietário; custos conferidos nos argumentos das reservas de busca/previsão |
| `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Mesmo escopo; quatro tetos conferidos nos argumentos de ambas as reservas |

A CLI confirmou presença, nomes, tipo Sensitive e escopo da branch, mas não revelou valores. Os seis números efetivos foram depois comparados com a proposta aprovada usando os argumentos dos scripts no Monitor; todos corresponderam. Os valores de ambiente e argumentos brutos permanecem fora do Git, conforme a regra de documentação pública do projeto. Essa conferência não altera cooldown/probe nem prova comportamento do circuito aberto.

O proprietário excluiu os seis campos gerais anteriores, que abrangiam Production/Preview. A consulta somente leitura do escopo Production confirmou ausência dos seis nomes. Não restaurar automaticamente os tetos de Preview em Production: definir e aprovar sua própria política antes do release. Redis/HMAC continuavam vinculados a Preview nas capturas. O proprietário redeployou a API, excluiu o deployment antigo e confirmou o fluxo web funcional. O deployment excluído não pode ser presumido como destino disponível de rollback; selecionar e verificar destinos dos dois projetos em P11.

### Perfis de cache e renovação da previsão

O proprietário forneceu os trechos do Monitor e status HTTP para consultas reais limitadas pelo web/rewrite. Cada consulta abaixo retornou 200. Os registros contam tanto `EVAL` como os comandos internos Lua visíveis; ainda não são unidades faturáveis confirmadas.

| Amostra em UTC−3 | Observação | Registros visíveis |
|---|---|---:|
| Busca nova às 13:52:19 e outra às 13:53:04 | Miss, lock, circuito, reserva, gravação com TTL de 24 h e liberação do lock, em cada busca | 29 por busca |
| Repetição da última busca às 13:59:23 | Limitador e leitura `EVAL`/`PTTL`/`GET` da mesma chave; sem nova reserva, lock ou gravação | 9 |
| Busca às 14:02:05 | Hit da mesma busca, separado da previsão seguinte | 9 |
| Previsão às 14:02:09–10 | Miss, lock, circuito, reserva e gravação com TTL de 10 min; liberação do lock | 29 |
| Mesma previsão às 14:05:27 | Recarga da página, antes do prazo: limitador e leitura da mesma chave; sem reserva, lock ou gravação | 9 |
| Mesma previsão às 14:15:32–33 | Após o prazo: cache indisponível, novo lock, reserva, gravação com TTL de 10 min e liberação | 29 |

O hit tem seis registros do limitador e três da leitura. O miss observado tem oito `EVAL`, dois `TIME`, cinco `GET`, quatro `SET`, dois `PTTL`, um `ZREVRANGE`, quatro `ZREVRANGEBYSCORE`, um `ZRANGEBYSCORE`, um `ZADD` e um `DEL`. Nenhum dos misses fornecidos mostrou contenção, limpeza de eventos antigos da cota ou recuperação de circuito aberto; esses caminhos podem ter consumo diferente.

Na previsão, a gravação inicial ocorreu às 14:02:10; o hit às 14:05:27 não regravou nem prorrogou o TTL. Às 14:15:32, a leitura do script terminou após `PTTL`, sem `GET` do valor, e iniciou um novo carregamento. A nova gravação trouxe `retrievedAtUtc` posterior ao inicial. Isso confirma o ciclo miss → hit antes do prazo → miss/renovação depois do prazo, sem medir o instante exato da expiração. A igualdade de `retrievedAtUtc` no hit intermediário não foi informada. O hit veio de **recarregar a página**, não de clicar no logo; a requisição de previsão e sua leitura Redis confirmam a validade da amostra.

Os dados gravados incluíam condições atuais, sete dias e atribuição. O corpo normalizado no cache não substitui a medição do corpo bruto da Open-Meteo para o gate de 64 KiB. A expiração de 24 h da busca, contenção real, reserva atômica sob concorrência e falha fechada continuam pendentes.

### Comportamento da interface e diagnóstico

- Reabrir o web com cidade salva inicia uma consulta de previsão; a preferência salva é a cidade, não um histórico de previsões. No ensaio 1/60, essa consulta podia consumir a única requisição permitida e bloquear a tentativa manual seguinte.
- Favicon, assets e scripts auxiliares são requisições distintas da busca/previsão. Sua presença no Network, inclusive respostas 200/304, não comprova acesso da API ao Redis. Registrar o caminho e o papel do recurso ao diagnosticar, sem URLs operacionais.
- O proprietário observou a mensagem genérica de falha de previsão diante do 429 do WAF. A leitura local de http.ts (`apps/web/src/api/http.ts`) confirma que `rate_limited` depende do JSON com `RATE_LIMITED`; texto simples/HTML 429 cai em `request_failed`. A interface (`apps/web/src/components/forecast-state.tsx`) então apresenta a falha genérica. A avaliação de um tratamento específico pertence a `weather-ui` e exige revisão de seu contrato antes de implementação; nenhum ajuste foi feito nesta rodada.

### Gates locais na análise inicial desta conversa

Executados na revisão local `c7bdb23`, antes da atualização documental:

| Gate | Resultado |
|---|---|
| `npm run check` | Tipos, lint, formato, fronteiras e entrega passaram; 505 testes API e 90 web |
| `npm run test:coverage` | API: 94,93% statements, 91,93% branches, 94,71% functions, 97,93% lines; web: 96,88%, 89,84%, 97,43%, 98,94%, respectivamente |
| `npm run build --workspaces` | Builds API e web passaram |
| `npm audit --audit-level=high` | Zero vulnerabilidades |
| Acessibilidade, E2E e performance | Sem nova conclusão: acessibilidade bloqueada primeiro pela conexão local do sandbox e depois pela ausência de Chromium; download autorizado falhou por timeout. A sequência não chegou a executar E2E/performance |
| Gitleaks e CI hospedada | Não reexecutados nesta análise; confirmação anterior de CI permanece atribuída à revisão e à fonte registradas em 2026-10-09 |

### Alcance do handoff

A configuração WAF final está publicada em 60/60, segundo confirmação do proprietário. A continuação acrescentou a correlação dos bloqueios nos dois caminhos, a amostra direta do Monitor, a reconferência dos Previews, os seis campos efetivos de política e os perfis de hit/miss com renovação da previsão. P1 permanece parcial; a lista ativa (`tasks/vercel-todo.md`, seção retomada-na-próxima-sessão) define o ponto de retomada: conferir a unidade de contabilização da Upstash antes de projetar consumo normal/adversarial e viabilidade mensal. Não converter automaticamente 9/29 registros do Monitor em comandos faturados.

Na primeira atualização documental (`a09efe8`), `npm run check` passou novamente com 505 testes API e 90 web, e os 30 links locais foram verificados. Na continuação documental, `npm run check` voltou a passar com os mesmos 595 testes; os destinos e âncoras dos 44 links locais dos três documentos foram conferidos, a revisão do diff e `git diff --check` passaram, e a busca por padrões selecionados de dados operacionais no conteúdo novo não encontrou correspondências. Essa busca específica não substitui Gitleaks. Nenhum novo resultado de cobertura, navegador, audit, Gitleaks ou CI hospedada foi produzido nesta atualização exclusivamente documental. Alterações deixadas no checkout para revisão e commit separado.


## Registro de origem: preview-cost-redis-failure-2026-10-10.md

## Preview — consumo e falha Redis em 2026-10-10

Continuação da evidência `preview-waf-redis-2026-10-10.md`. O progresso vigente fica em `tasks/vercel-todo.md`; este registro não conclui P1 nem aprova publicação.

### Fonte e alcance

O proprietário operou Vercel, Upstash e navegador, fornecendo capturas, respostas HTTP e mensagens selecionadas da Function. O agente analisou os resultados e o código, consultou documentação oficial e preparou esta atualização documental. O checkout começou limpo em `chore/vercel-p1`, revisão local `1235d44`.

O SHA, as versões de build e o pareamento dos deployments posteriores à alteração do token não foram reconfirmados pelo agente. As respostas foram fornecidas pelo proprietário nos aliases de Preview da branch; não atribuir automaticamente os novos ensaios ao SHA dos deployments conferidos anteriormente. Não houve nova consulta CLI aos projetos, operação de painel pelo agente, alteração de runtime ou publicação.

### Plano e consumo exibidos

| Conferência nas capturas | Resultado | Alcance |
|---|---|---|
| Upstash / Vercel | Free / Hobby | Planos exibidos durante a coleta |
| Região | Primária AWS `us-east-1`, sem região adicional listada em Manage Regions | Configuração exibida, sem inferir réplicas pelo selo Global |
| Comandos | 4.577 leituras e 3.915 escritas: 8.492 de 500.000/mês, cerca de 1,7% | Snapshot; período exato do contador não obtido |
| Banda / armazenamento / custo | 2 MB / 15 KB / US$ 0 | Valores exibidos, sem projeção de banda ou armazenamento |
| Integração na Vercel | Banco Free e Available; nenhum método de pagamento configurado para a integração | Nenhuma opção de upgrade automático apareceu nas telas fornecidas; ausência de pagamento não é auditoria de todas as políticas de cobrança |

Na tentativa de medir uma busca inválida isolada, o baseline era de 4.578 leituras e 3.915 escritas. Os contadores ficaram iguais após o 400 e nas capturas posteriores, inclusive depois da espera sugerida. A comparação mensal foi inconclusiva; não comprova custo zero nem identifica o prazo de atualização desses contadores.

O Monitor ativo do mesmo banco mostrou a chamada com 400 e seis registros: um `EVAL`, um `TIME`, dois `GET` e dois `SET`, correspondentes ao limitador compartilhado. Isso confirma o caminho até o banco observado, sem estabelecer isoladamente a unidade aplicada ao contador mensal.

### Dimensionamento preliminar aceito

Consulta oficial em 2026-10-10: Upstash Documentation, página Costs do SDK Rate Limit, apresenta exemplos que contam `EVAL` e comandos internos, com fator adicional para regiões de leitura. A página REST API distingue token padrão de token somente leitura. A documentação Metrics and Charts informa atualização de dez segundos para determinados gráficos, mas não estabelece esse prazo para o contador mensal observado. Essas fontes não substituem a reconciliação dos scripts próprios com as métricas da conta.

O cenário proposto e aceito pelo proprietário é de 100 pessoas/dia, três buscas e uma previsão por pessoa, durante 31 dias: 12.400 pedidos/mês. Usando provisoriamente os perfis anteriores de nove registros por hit e 29 por miss, sem contenção, limpeza de reservas antigas ou recuperação de circuito:

| Hipótese | Comandos estimados/mês |
|---|---:|
| Todos hits | 111.600 |
| Metade hits, metade misses | 235.600 |
| Todos misses | 359.600 |
| Todos misses, mais 20% de margem hipotética | 431.520 |

O cenário cabe nominalmente em 500.000, mas os 20% não são garantia de capacidade. Tráfego adicional, negações, falhas, contenção, manutenção e abuso precisam entrar no dimensionamento final. WAF por IP não fornece teto mensal agregado de Redis, e a reserva Open-Meteo limita a saída ao provedor, não todos os comandos Redis.

O proprietário aceitou esse cenário e indisponibilidade temporária por cota. Mantêm-se os planos gratuitos, a falha fechada e os demais gates; P1c permanece parcial. Não houve aprovação de uma política Production nem alteração de tetos nesta rodada.

### Ensaio de token inválido e recuperação

O proprietário informou que `UPSTASH_REDIS_REST_TOKEN` estava somente em Preview. Ao tentar criar um override, o painel apontou nome já existente; ele substituiu o valor da variável existente por um token fictício. O alcance de branch não foi auditado: não documentar a alteração como override exclusivo de `chore/vercel-p1`.

| Coleta durante a falha | Resultado fornecido |
|---|---|
| API direta, `/health` | 200, `status: ok`; sem I/O Redis nessa rota |
| API direta, busca inválida | 503 JSON `SERVICE_UNAVAILABLE`; uma requisição teve `visitor_limit_unavailable` e `request_completed` correlacionados |
| API direta, busca válida / previsão válida | 503 nas duas rotas; JSON `SERVICE_UNAVAILABLE` fornecido para previsão |
| Web/rewrite, busca válida / previsão válida | 503 nas duas rotas; JSON `SERVICE_UNAVAILABLE` fornecido para previsão |

A mensagem causadora apareceu nos detalhes da invocação, além do resumo `request_completed` da listagem. A análise local confirma que o limitador consulta Redis em `onRequest`, antes da validação e dos handlers que acessam o provedor. Os resultados são compatíveis com bloqueio por falha de autenticação Redis; não houve contagem independente de saída recebida pela Open-Meteo ou eco.

Headers de cache/CDN e eventos causadores específicos das quatro consultas válidas não foram fornecidos. Não extrapolar esse ensaio para atomicidade sob contenção, falha de Redis após o limitador, timeout, esgotamento real do Free ou cota agregada.

Na restauração, foi orientado copiar o token padrão de `KV_REST_API_TOKEN` para `UPSTASH_REDIS_REST_TOKEN`, sem aspas no campo Vercel, mantendo o escopo Preview e criando outro deployment. `KV_REST_API_URL` corresponde à URL REST HTTPS exigida pela API; `KV_URL` e `REDIS_URL` são conexões pelo protocolo Redis e não devem ser convertidas apenas trocando o esquema. O token somente leitura não atende às escritas de limites, reservas e cache.

O proprietário confirmou que ajustou a variável e voltou a pesquisar cidades com sucesso. Essa recuperação é relato do proprietário; não foram fornecidos novos status individuais de health/validação, SHA ou logs do deployment recuperado. A rodada foi encerrada sem exigir repetição de coletas equivalentes.

### Continuidade

O proprietário pediu verificações agrupadas e documentação sem novos links, pois os projetos hospedados podem ser excluídos; as preferências persistentes estão em `AGENTS.md`. Preparar o mecanismo de eco controlado e os ensaios de concorrência antes de pedir outra rodada nos painéis. O transporte atual reconstrói a saída sem headers do visitante, mas isso não substitui a prova hospedada de IP/canário; o mecanismo de eco não está implementado na entrada atual.

Permanecem a reconciliação de consumo e o cenário adversarial, os demais caminhos de falha/TTL/contenção, a amostra bruta de previsão de até 64 KiB, headers/CDN, identidade/saída, Production, privacidade, direitos, gates finais e rollback. Não presumir autorização pública ou gate concluído a partir da aceitação de pausas.

### Verificação desta atualização documental

Com Node 24.21.0 e npm 12.0.2, `npm run check` passou: tipos, lint, formato, 505 testes API, 90 web, três testes de fronteiras e quatro de configuração de entrega. Os cálculos foram conferidos; as seis referências novas por nome de arquivo têm destino existente. A revisão do conteúdo adicionado encontrou zero novos links e zero correspondências nos padrões selecionados de URLs operacionais, IPv4, UUID, digest hexadecimal de 64 caracteres, chave privada e JWT. Essa busca específica não substitui Gitleaks. O diff foi revisado; não houve alteração de código, dependências ou constraints.

Cobertura, builds, navegador, performance, auditoria de dependências, Gitleaks e CI hospedada não foram reexecutados nesta atualização exclusivamente documental; seus resultados anteriores não são apresentados como novos gates.


## Registro de origem: preview-probe-preparation-2026-10-10.md

## Preparação local de eco e ensaios agrupados — 2026-10-10

Continuação na branch `chore/vercel-p1`, checkout inicialmente limpo, base `40d674e`. A implementação executa o mecanismo de teste de Preview já autorizado nas specs. Este registro não conclui P1 nem autoriza publicação; não houve alteração de variáveis/painéis, deployment, túnel público ou chamadas Open-Meteo nesta rodada.

### Resultado preparado

- API: destino HTTPS de teste com token, permitido somente em Preview, depois da allowlist, circuito e reserva. Configuração parcial/inválida ou presente em Production impede inicialização com erro seguro. A marca de modo de eco permite ao executor interromper antes de consultas válidas ao deployment errado.
- Receptor: fixtures compatíveis com os adapters, HTTP loopback protegido, contagens limitadas, indicadores de IP/canário, calibração de sete headers e controles de 429, excesso de tamanho e timeout. Sem retenção de requests, consulta, header bruto ou credencial nas respostas/logs. Comparação de IPv6 equivalente e IPv4 mapeado incluída.
- Executor: perfis frios/repetidos e quatro chamadas concorrentes por chave nos dois caminhos, ou perfil 503 com zero chamadas ao eco. Confere JSON, cache/no-store, CDN MISS e deltas do receptor, separando tokens de proteção por projeto e interrompendo redirects. O resumo omite dados operacionais e mantém atomicidade, confiança de identidade e múltiplas instâncias como não comprovadas.
- Guia: `docs/deploy/preview-probe-guide.md` organiza preparação, coleta, cenários complementares e restauração. O proprietário informou que não dispõe de entrada HTTPS para o eco. Foi definida a opção temporária Quick Tunnel, disponível no `cloudflared` 2026.9.3 já instalado; nenhum túnel foi iniciado. A reescrita de headers pela Cloudflare limita a prova de privacidade, e a calibração impede tratá-la como completa.

### Verificação local

Node 24.21.0 e npm 12.0.2, usando o npm disponível no cache local. O launcher do npm desse cache não resolve corretamente sua instalação quando invocado diretamente pelo PATH; foi usado um wrapper temporário fora do repositório para executar o CLI exato. Nenhuma dependência ou lockfile mudou.

| Gate | Resultado observado |
|---|---|
| `npm run check` | Passou: tipos, lint, formato, 535 testes API, 90 web, três testes de fronteiras, quatro de configuração web e 15 das ferramentas de Preview |
| `npm run test:coverage` | Passou: API 94,95% statements, 91,99% branches, 94,78% functions e 97,97% lines; web 96,88%, 89,84%, 97,43% e 98,94%, respectivamente |
| Builds API/web e entrada Function | Passaram; entrada também compilada pelo comando E2E |
| `npm audit --audit-level=high` | Zero vulnerabilidades |
| Gitleaks 8.30.1 | Arquivo baixado com checksum da CI validado; zero achados no diretório atual e nos 120 commits do histórico consultado |
| Diff/documentação | Diff sem erros de whitespace; documentação adicionada sem hyperlinks novos ou URLs operacionais |
| `npm run test:e2e` | Pendente: não iniciou Chromium porque a revisão exigida pelo Playwright não está instalada; instalação completa e somente headless shell falharam por timeout do download, mesmo fora do sandbox |

O sandbox bloqueou o teste HTTP de loopback, que passou fora dele. A auditoria/download do scanner também precisaram de acesso de rede autorizado. Esses bloqueios não foram contornados com alterações de testes, versões, constraints ou supressões. O browser antigo existente não foi substituído pela revisão esperada nem usado para alegar sucesso do gate.

Axe, performance e CI hospedada não foram reexecutados. A interface não foi alterada. A indisponibilidade de instalação do Chromium mantém E2E pendente; o comando canônico deve passar antes de merge/release. Não inferir resultado atual a partir de evidências antigas.

### Próxima execução

Preparar o arquivo local privado e a entrada HTTPS conforme o guia, configurar/deployar o Preview isolado pelo proprietário e coletar uma rodada agrupada. Registrar apenas resultados anonimizados e o alcance da calibração. Continuam as provas hospedadas de contenção/reserva, headers de identidade confiáveis, ausência de IP nos caminhos finais, custo Free, demais falhas/TTL e corpo bruto real, além de Production, direitos, privacidade final e rollback.

### Diagnóstico posterior do executor — 2026-10-10

O proprietário iniciou o receptor/túnel e forneceu relatório autenticado 200, modo normal e contagens zeradas. Após a interrupção genérica do probe, o agente validou somente a sintaxe da configuração local, sem imprimir valores, e fez coletas de leitura limitadas ao eco e a entradas inválidas. Nenhuma consulta meteorológica válida foi enviada. A calibração conjunta retornou 403. Na coleta individual, relatório, canário e os outros seis controles retornaram 200; `cf-connecting-ip` retornou 403 da Cloudflare. A correção testa os controles separadamente, registra status por header e mantém a privacidade parcial quando um controle é bloqueado; o baseline autenticado continua obrigatório.

Com a calibração corrigida, o preflight da API direta retornou 401. A conferência local de presença encontrou `PROBE_API_BYPASS` e `PROBE_WEB_BYPASS` ausentes, sem ler/exibir seus valores. O próximo passo do proprietário é criar segredos de Protection Bypass for Automation nos respectivos projetos e guardá-los somente no arquivo privado do executor, mantendo Deployment Protection. Fonte oficial conferida: Vercel Docs, Protection Bypass for Automation. O fluxo de aplicação/rewrite ainda não foi coletado nesta continuação.

`npm run check` passou com 535 testes API, 90 web e 20 das ferramentas de Preview, além de tipos, lint, formato e fronteiras. O scan direto do diretório detectou a credencial esperada no arquivo privado `.env.preview-probe`; o arquivo está ignorado e não versionado. Um snapshot dos arquivos rastreados e novos não ignorados, incluindo as mudanças desta correção, passou Gitleaks sem achados. Não foi adicionada supressão ou exceção; configurações privadas e relatório redigido ficaram fora do Git. Os gates de release, inclusive E2E pendente, permanecem.

#### Autorização do rewrite protegido

Após a correção do executor, `npm run check` passou com 535 testes API, 90 web e 21 das ferramentas de Preview. A execução hospedada do executor foi limitada aos dois preflights inválidos, que passaram; a rotina de diagnóstico recusou todas as consultas válidas. O proprietário pode executar a rodada completa com o arquivo privado já configurado.

Após o proprietário corrigir a configuração de eco e cadastrar os tokens de automação, o preflight direto passou e o rewrite retornou 401. A coleta independente do agente encontrou HTML web 200 com documento da aplicação e busca inválida reescrita 401: o token web autorizava o ingresso, mas não o destino API. Com o bootstrap oficial de cookie do web, foram observados redirect 307 com cookie, HTML 200 e busca inválida pelo rewrite 400 com marca de eco. Nenhum cookie/valor de token, URL ou identificador foi impresso/versionado; nenhum pedido meteorológico válido foi enviado. O executor passou a aplicar esse fluxo em memória, com isolamento de headers/cookie e interrupção quando o bootstrap falha. Fonte: Vercel Docs, Protection Bypass for Automation. Nenhuma configuração de projeto/proteção foi alterada pelo agente.

### Rodada normal fornecida pelo proprietário

O proprietário executou o executor e forneceu o resumo completo com `ok: true`, `scenario: normal`. O checkout local está em `79fd0c4`; SHA/pareamento dos deployments e eventos Redis não foram reconfirmados nesta rodada, e o resultado não é automaticamente atribuído a esse SHA hospedado. Não houve repetição de chamadas pelo agente.

| Caminho | Serviço | Fria e repetição | Quatro concorrentes da mesma chave | Saídas recebidas em cada perfil |
|---|---|---|---|---|
| API direta | Busca | 200 / 200 | Quatro 200 | Uma |
| API direta | Previsão | 200 / 200 | Quatro 200 | Uma |
| Web/rewrite | Busca | 200 / 200 | Quatro 200 | Uma |
| Web/rewrite | Previsão | 200 / 200 | Quatro 200 | Uma |

Os oito perfis passaram, somando 24 respostas válidas e oito chamadas recebidas pelo eco. Em cada perfil, todas as respostas tinham `private, no-store` e CDN MISS, e a contagem confirmou reutilização após a primeira chamada e deduplicação na amostra concorrente. Não inferir cache entre instâncias, TTL completo, consumo mensal ou reserva atômica a partir dessa amostra.

A calibração preservou o canário e os controles `x-forwarded-for`, `x-vercel-forwarded-for`, `forwarded` e `true-client-ip`; esses controles retornaram 200. `cf-connecting-ip` retornou 403; `cf-connecting-ipv6` e `x-real-ip` retornaram 200 sem preservar o controle. Nenhuma sentinela configurada foi observada nas chamadas ao eco, mas a conclusão permanece `partial_ingress_blocks_controls`, pois o ingresso bloqueia/modifica campos. `multipleInstances`, `atomicQuota` e `identityTrust` continuam `not_proven`, conforme o próprio resultado.

A rodada normal encerra a coleta desses oito perfis e não deve ser repetida sem divergência concreta. O próximo ensaio é falha fechada com 503 e zero chamadas novas no eco, preservando o cadastro original da credencial Redis. Circuit breaker/429 em fixture, reserva sob contenção real e as demais pendências de P1 continuam separados. Não executar `fail_closed` apenas mudando o cenário local enquanto a API está saudável, nem atribuir a ele a primeira chamada que induz 429 externo, pois essa chamada efetivamente chega ao eco.

### Correção da sequência após o pedido do proprietário

O proprietário relatou que já havia testado URL inválida e que a recuperação da configuração Redis foi trabalhosa. Informou não lembrar a mensagem do novo bloqueio da URL e pediu não mexer nessa configuração agora. O agente havia proposto outra falha para acrescentar contagem de saída no eco; essa proposta não foi executada/comprovada e saiu da sequência ativa. Preservar URL/token e resultados anteriores; não pedir novamente a mensagem esquecida nem repetir ensaios equivalentes por padrão.

O registro anterior comprova as respostas 503 observadas durante token inválido e a recuperação relatada; a informação adicional sobre URL inválida é relato do proprietário, sem novos artefatos nesta continuação. Nenhuma contagem independente de saída foi acrescentada a esses ensaios. Isso mantém explícito o alcance da evidência, sem invalidar o trabalho já realizado ou declarar um gate adicional concluído. A rodada normal com eco está concluída no alcance acima. Próximo trabalho: consolidar as pendências de privacidade, direitos e pacote de release que não exigem novas alterações Redis; publicação pública continua sujeita aos gates vigentes.

### Retirada do modo de ensaio e Preview funcional restaurado

O proprietário pediu a limpeza do Preview e autorizou explicitamente o agente a executá-la via CLI nesta operação, como exceção à preferência de conduzir painéis/deployments pessoalmente. A consulta de metadados confirmou API e web Ready em Preview. A API tinha cadastros de `UPSTREAM_TEST_BASE` e `UPSTREAM_TEST_TOKEN` em Preview geral e na branch `chore/vercel-p1`; os quatro cadastros foram removidos, com ausência reconfirmada antes do redeploy. Nenhum valor ou identificador operacional foi publicado.

A única `CACHE_HMAC_KEY` encontrada para esse Preview era específica da branch, sem fallback geral disponível na consulta. Ela foi mantida para evitar falha de inicialização. `RATE_LIMIT_HMAC_KEY`, URL/token Redis, política de créditos, CORS, configuração web e Production permaneceram sem alteração. O agente redeployou somente a API para o target Preview; o resultado ficou Ready e preservou o alias usado pelo web. Não foi alterada a proteção nem promovido um deployment público.

Verificação de restauração agrupada: API `/health` 200 com `status: ok`; busca inválida direta e pelo rewrite 400 `VALIDATION_ERROR`; ausência de `x-nosso-clima-preview-upstream` nos três caminhos. Foram feitas no máximo duas consultas meteorológicas normais: uma busca composta devolveu 200 com zero resultados, e uma previsão usando a localização pública de exemplo do contrato devolveu 200, condições atuais e sete dias. As datas atuais corresponderam ao dia local verificado, sem dados da fixture antiga nem marca de eco. A busca vazia não é registrada como seleção de cidade bem-sucedida nem prova de UI em navegador.

Após a restauração, health API e HTML web sem autenticação responderam 302, compatíveis com a proteção mantida. A checagem não publicou URLs, consultas, coordenadas, cookies, tokens, IPs ou dados meteorológicos. Nenhuma configuração Redis foi alterada, nenhuma reserva foi zerada e nenhum novo ensaio de falha foi executado. Echo/túnel não são necessários para usar o Preview restaurado. Ferramentas/evidências locais permanecem para rastreabilidade; segredos de automação não foram revogados nesta autorização limitada à retirada das variáveis de eco e ao redeploy da API. Os gates de publicação continuam pendentes.


## Verificações locais antigas do runbook

### P1a: preparação local em 2026-10-04

Revisão de base: `a8c22f0`, com alterações locais anteriores ainda não commitadas. Esta preparação não conclui P1a, pois não houve Preview.

| Verificação | Resultado local |
|---|---|
| `node --version` | `v24.21.0` |
| `npm --version` | `11.19.0`; npm 12 exigido ainda não foi verificado |
| `vercel --version` | CLI `62.2.0` |
| `vercel whoami` | `Logged out`; nenhum projeto foi criado ou implantado |
| `git remote -v` | Nenhum remote configurado neste checkout |
| `npm run check` | Passou: TypeScript, Biome, 369 testes da API, 73 do web e fronteiras |
| `npm run build --workspace @nosso-clima/api` | Passou |
| `npm run build --workspace @nosso-clima/web` | Passou |

O `npm ci` local com npm 12.0.2 foi comprovado depois em P9 (`docs/deploy/vercel-upstash-runbook.md`, seção p9-gates-locais-e-sinais-operacionais--2026-10-05). Para concluir P1a ainda são necessários instalação e builds **em cada projeto Vercel** com npm 12, além de Preview protegido que comprove diretórios raiz, entrada Fastify, versão efetiva, API direta, rewrite pareado, 404 JSON, CORS/Origin e headers/cache. A documentação atual de monorepos (fonte citada na coleta original), Fastify (fonte citada na coleta original), rewrites (fonte citada na coleta original) e Node (fonte citada na coleta original) orienta a configuração, mas não substitui a medição no projeto real.



### P9: gates locais e sinais operacionais — 2026-10-05

Revisão de base `ab9c97d` com alterações de P9 ainda locais. O perfil `artifacts/performance.json` é gerado por `npm run test:performance`, ignorado no Git e publicado como artefato pela CI. O teste usa o web compilado, Chromium móvel 360×800 @2x, CPU 4× mais lenta, latência de 150 ms, download de 200.000 bytes/s, forecast em fixture e uma carga fria por cenário. Mede LCP e CLS com `PerformanceObserver`. Preview e condições reais de rede seguem para P1.

| Gate | Resultado local |
|---|---|
| `npm ci` com npm 12.0.2 | Passou a partir do lockfile, sem alteração do lockfile; `npm run check` repetido com essa instalação passou |
| `npm run check` | Passou: 495 testes da API, 90 do web, tipos, Biome e fronteiras |
| `npm run test:coverage` | API 94,89%/91,23%/94,69%/97,91%; web 96,88%/89,84%/97,43%/98,94% (statements/branches/functions/lines) |
| `npm run test:a11y` | Passou em neutro, estados interativos, dez imagens e desktop; contraste mínimo acima de 4,5:1 para texto comum |
| `npm run test:e2e` | Passou: 5 testes com Function local e provedor simulado |
| `npm run test:performance` | Neutro: LCP 1.000 ms, CLS 0,000; cidade restaurada: LCP 1.008 ms, CLS 0,000. Antes da reserva de altura no carregamento, CLS restaurado era 0,399 |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| Gitleaks 8.30.1 `dir --redact --no-banner` | Conteúdo atual sem achados |
| Gitleaks 8.30.1 `detect --redact --no-banner` sem intervalo | Passou: 85 commits verificados; a exceção aprovada cobre somente o fingerprint histórico do teste de porta explícita no commit `2c49d94` |

O workflow ci.yml (`.github/workflows/ci.yml`) usa checkout completo, Node 24.21.0, npm 12.0.2, `npm ci`, checks, cobertura, auditoria, acessibilidade, E2E, performance e Gitleaks 8.30.1 com SHA-256 verificado. O scan examina a árvore atual e todo o histórico Git. A exceção de fingerprint único foi aprovada pelo proprietário em 2026-10-05, registrada em CONSTRAINTS.md (`CONSTRAINTS.md`) com responsável e expiração em 2026-12-31. Esse registro era anterior à configuração do remoto GitHub. Na retomada, conferir a execução hospedada da revisão escolhida, sem inferir seu resultado dos gates locais.

Os logs da API usam `requestId` gerado pelo servidor e molde da rota. Para operação, contar `request_completed` por status e duração, `cache_hit`/`cache_miss`, `rate_limit_rejected` por origem local/compartilhada, `visitor_limit_unavailable`, `redis_unavailable`, `provider_access_rejected` por `reason` (`quota_denied`, `circuit_open`, `redis_unavailable`, `upstream_rate_limited`) e `geocoding_upstream_failed`/`forecast_upstream_failed` por categoria. Esses campos não contêm IP, digest, texto de busca, coordenadas, fuso, URL ou mensagem arbitrária. Em P1c, conferir no painel o consumo WAF/Upstash e registrar a forma de detectar cota esgotada. O orçamento/alarme customizado da Upstash não é exigido no Free, pois a página de preços (fonte citada na coleta original) o oferece no plano pago por uso. Após a abertura, distinguir `upstream_rate_limited` de `rate_limit_rejected` e usar eventos de 503/negação de cota para investigar indisponibilidade.



### Preparação local em 2026-10-07

O proprietário confirmou nesta data que o sistema com o handler atual funciona na Vercel, que o repositório está no GitHub e que excluiu o deploy. A investigação do histórico encontrou:

- `688191a`: exportava diretamente a instância Fastify.
- `7783a6f`: substituiu o export por `listen(3000)`, mas ainda não importava `fastify` diretamente na entrada.
- `a043857`: incluiu o import direto e o handler default que aguarda `ready()` e emite `request`, formato confirmado pelo proprietário.

O erro de detecção `No entrypoint found which imports fastify` estava relacionado ao import da entrada, não demonstra que todo uso de `listen` falhe na Vercel. O builder oficial Fastify (fonte citada na coleta original) detecta `from`, `require` ou `import` seguido de `fastify`; o runtime Node (fonte citada na coleta original) aceita uma função default ou um servidor capturado por `listen`. Assim, o handler funcional foi preservado. O import agora é `import 'fastify'`, reconhecido pela expressão de detecção e preservado no JavaScript, sem binding sem uso e sem supressão de lint. A spec foi alinhada ao contrato confirmado; `server.ts` continua sendo a entrada de desenvolvimento local.

O E2E agora compila e importa `apps/api/app.ts`, chama o handler em HTTP e simula apenas os serviços externos. Testes unitários verificam espera por readiness, concorrência na mesma instância e falha de inicialização. A cobertura inclui `app.ts`. A configuração de build local não substitui provas hospedadas de WAF/CDN, origem confiável, orçamento, região, retenção e rollback dos dois projetos. O aviso da interface foi atualizado com o tratamento implementado; confirmar a configuração do novo deploy antes da publicação.

#### Verificação das correções

Em 2026-10-07, com Node 24.21.0 e npm 12.0.2, passaram `npm run check` (505 testes API e 90 web), `npm run test:coverage`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:performance`, builds e `npm audit --audit-level=high` (zero vulnerabilidades). O handler em `app.ts` aparece no relatório de cobertura com todas as statements e sua função executadas. O E2E verifica o import Fastify preservado no JavaScript contra a expressão de detecção do builder e testa `/health`, 404 JSON e os fluxos pelo handler real. O exemplo web copiado como `.env` foi carregado com `loadEnv` em modo production: `VITE_API_BASE_URL` permanece ausente e permite caminhos relativos. Performance local: LCP 992 ms e CLS 0 nos cenários neutro e cidade restaurada; zero violações axe críticas/graves e contraste acima do mínimo nos dez fundos em mobile e desktop.

O npm 12.0.2 foi executado a partir da instalação disponível no cache local, com seu binário no PATH dos checks; o npm padrão do sistema continua em 11.19.0. As instruções do README mostram como usar a versão fixada sem depender do npm padrão. Não houve novo deploy, execução de CI hospedada ou scan Gitleaks nesta revisão; os resultados históricos de segurança não foram apresentados como novos resultados. Regiões e retenção efetivas da hospedagem, evidências de direitos ainda abertas no inventário e ensaio de rollback continuam na lista de retomada.

## Aviso de privacidade e ativos visuais — 2026-10-10

Esta revisão preparou o texto público e fechou o inventário de origem no alcance informado, sem mexer em Redis, ambientes, proteção ou deployments. O proprietário informou que a base Upstash está na Virgínia do Norte, Estados Unidos, que não ajustou retenção de logs e que não sabe consultar a região da Function Vercel. A coleta anterior havia exibido a região primária da base e uma Function Preview em região dos Estados Unidos; não comprova a região atual de Production. A interface agora explica que a Vercel recebe IP, a API deriva identificador temporário para limite, registros ativos de busca/previsão têm TTL de 24 horas/10 minutos, a Open-Meteo recebe somente a conexão do servidor e o processamento pode ocorrer fora do Brasil. Prazos gerais de logs ou backups dos fornecedores não foram inventados. A consulta CLI posterior e a resposta sobre backups Upstash estão registradas abaixo.

Fontes oficiais consultadas nesta data por título: *Vercel Privacy Notice*, *Vercel Runtime Logs*, *Configuring Functions Region*, *Upstash Redis Getting Started*, *Upstash Backup and Restore*, *Open-Meteo Terms*, *Google Terms of Service* e *Anthropic Consumer Terms*. A retenção de uma hora dos Runtime Logs Hobby não é prazo geral de retenção de dados pessoais. Os termos da Open-Meteo indicam até 90 dias para logs do serviço gratuito que podem incluir coordenadas. A análise do transporte de saída e a limitação da rodada de eco permanecem registradas na seção de ensaio existente; esta atualização não afirma uma nova medição hospedada.

Após o pedido do proprietário para conferir pela CLI Vercel, a consulta autenticada em 2026-10-10 encontrou os projetos web e API. O endpoint de projeto da API devolveu `serverlessFunctionRegion=iad1`; `apps/api/vercel.json` não contém override de região. A lista de deployments mostrou um Production Ready da API, e a inspeção confirmou o target e estado, mas não expôs um campo próprio de região do deployment. Portanto, Washington, D.C., EUA, é a **configuração atual da Function**, apoiada pela ausência de override, sem alegar uma medição de execução nessa região. A equipe está no plano Hobby. Segundo *Vercel Runtime Logs*, esse plano retém Runtime Logs por uma hora; isso não define prazo universal para todos os registros da Vercel. A CLI não trouxe configuração de backups da Upstash. O proprietário informou que a base está na Virgínia do Norte, não ajustou retenção de logs e, em resposta posterior nesta data, que **Backups → Daily Backup** está desativado; atribuiu isso à disponibilidade do recurso somente no plano pago. Esta última informação é relato do painel, não verificação independente da CLI. Não equivale a ausência de eventuais cópias internas do fornecedor. Foram mostrados somente nomes de projeto, região, plano, estado e campos relevantes; nenhum ID/URL operacional, token, variável ou log bruto foi incluído neste registro.

O proprietário declarou que pediu ao Gemini uma paisagem urbana e variações para os climas, e ao Claude ideias de logo para NossoClima; escolheu a opção preferida e não possui registros extras de exportação. Confirmou que o site não terá qualquer monetização. A inspeção visual anterior dos dez fundos e logo não detectou marca/pessoa/texto de terceiro visível. Na comparação atual, seis pares de logo/ícones fornecidos e distribuídos são cópias exatas por bytes; os cinco pares diurnos mantêm a derivação por reencodificação já registrada, e os noturnos têm composição compatível, mas diferença de arquivo/tonalidade sem cadeia de edição comprovada. O inventário registra essa limitação, os termos e os créditos já visíveis na interface. A licença MIT segue restrita ao código. Nenhum arquivo de imagem ou marca foi alterado.

O trabalho desta seção alterou `apps/web/src/components/site-information.tsx`, `docs/deploy/image-rights.md`, o runbook e a lista ativa. Não executou testes, builds, CI nem deploy; os gates da revisão final continuam pendentes. `git diff --check` e comparação exata dos seis pares de marca/ícones passaram. Nenhum URL operacional, ID de projeto, IP ou log bruto foi acrescentado.

## Alinhamento documental e acesso ao repositório — 2026-10-10

A revisão de `README.md`, lista ativa, plano, mapa de capacidades, specs, runbook e ADR encontrou duas divergências de andamento: privacidade/direitos ainda descritos como pendentes após a revisão registrada acima, e provas extensas de Lua/concorrência/24 h mais reconciliação mensal exata ainda tratadas como gates, apesar da simplificação aprovada na lista ativa. Os documentos vigentes foram alinhados: manter a implementação da reserva atômica em quatro janelas, falha fechada, WAF, política Production e critérios de `CONSTRAINTS.md`; acompanhar os ensaios hospedados extensos e a reconciliação depois da abertura, sem afirmar que foram comprovados. A saída sem IP segue aceita pelo transporte revisado e amostra parcial; identidade anti-spoof e revisão final do caminho de saída continuam abertas. A pesquisa datada de 2026-10-04 e as seções históricas anteriores não substituem a lista ativa.

O link “Repositório no GitHub” da interface respondeu 404 em consulta pública sem autenticação nesta data. O proprietário informou que tornará o repositório público. O link foi mantido, e a lista ativa passou a exigir a conferência anônima antes da abertura do site. Nenhum endereço do repositório ou identificador de infraestrutura foi registrado aqui. Esta revisão foi documental; não houve mudança de código, configuração, Redis ou deployment, nem nova coleta hospedada ou execução de testes.

## Verificador isolado de identidade e gates locais — 2026-10-10

Na base `b475d10`, a lacuna P1d foi comparada com `serverless-rate-limit.ts`, `visitor-identity.ts`, testes de integração e o probe anterior. Os testes existentes rejeitavam header ausente/ambíguo e ignoravam `x-forwarded-for` quando a identidade Vercel existia; o probe anterior enviava um header falsificado, mas deixava `identityTrust: not_proven`. A documentação oficial *Vercel Request headers*, consultada nesta data, descreve `x-vercel-forwarded-for` como equivalente a `x-forwarded-for`, que a plataforma sobrescreve em sua borda padrão. Essa descrição não prova sozinha o comportamento dos dois caminhos do projeto.

Foi adicionado `scripts/identity-probe.mjs` com quatro testes e procedimento no runbook. Em Preview protegido pareado, o verificador exige confirmação explícita e os dois tokens de automação, obtém o cookie do web sem persisti-lo, e usa no máximo 47 pedidos de validação inválida: 31 buscas diretas e 16 previsões via rewrite. Cada pedido troca o IP sintético nos dois headers de encaminhamento. Um resultado positivo requer 30/15 respostas 400 seguidas de 429 JSON `RATE_LIMITED` da aplicação, sempre `private, no-store`, dentro do mesmo minuto. Respostas de WAF/proteção, janelas contaminadas e ausência do limite não são aceitas como prova. O verificador não mede se visitantes distintos mantêm identidades distintas ou se o IP da pessoa é idêntico nos dois caminhos. Nenhuma execução hospedada foi feita; não houve alteração Redis, deploy, saída Open-Meteo ou nova amostra de eco.

Verificação local com Node 24.21.0 e npm 12.0.2: `npm run check` passou com 535 testes API, 92 web, três fronteiras, quatro configurações de entrega e 25 testes das ferramentas de Preview. O listener do receptor foi negado pelo sandbox (`EPERM` em loopback); o mesmo gate passou fora dele. `npm run test:coverage` passou: API 94,95% statements, 91,99% branches, 94,78% functions e 97,97% lines; web 96,59%, 89,65%, 96,15% e 98,95%. Builds independentes passaram. `npm audit --audit-level=high` retornou zero vulnerabilidades após a consulta fora do sandbox. Gitleaks 8.30.1, conferido pelo checksum fixado na CI, não achou segredos em 130 commits nem no snapshot dos arquivos destinados ao Git, incluindo os novos arquivos e excluindo os privados ignorados. `git diff --check` passou.

O Chromium exigido pelo Playwright (revisão v1243) não estava no cache local. `playwright install chromium` e a tentativa específica do headless shell com timeout maior expiraram no download, inclusive fora do sandbox. E2E, axe e performance **não foram executados** nesta fatia; o Chrome do sistema tem outra versão e não foi usado para substituir o navegador da CI. CI em checkout limpo e revisão hospedada final permanecem pendentes. Busca e previsão continuam chamando `createReservedOpenMeteoFetch`, que envolve o transporte `createOpenMeteoTransport` com destinos fixos e opções reconstruídas; o transporte não mudou desde a revisão aceita de P1d. Este registro distingue verificação do código de prova hospedada de identidade.
