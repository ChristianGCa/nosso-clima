# Retomada de P1a — revisão e acesso em 2026-10-09

Registro da conferência de revisão que sucede a [evidência de 2026-10-08](preview-progress-2026-10-08.md). O progresso vigente permanece na [lista ativa](../../tasks/vercel-todo.md); esta evidência não aprova publicação nem conclui P1a.

## Resultados observados

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

## Conferência HTTP pelo agente

Após confirmação do proprietário para a coleta, a CLI autenticada acessou `/api/rota-inexistente` nos dois Previews, duas vezes em cada caminho. Foram extraídos somente status, cabeçalhos permitidos e código público de erro, sem salvar respostas brutas no repositório.

| Caminho | Status nas duas chamadas | Content-Type | Cache-Control | x-vercel-cache | Resultado |
|---|---|---|---|---|---|
| API direta | 404 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | JSON `NOT_FOUND` |
| Web → rewrite | 302 | `text/plain` | `private, no-store` | `MISS` | Redirecionamento SSO Vercel; nenhuma resposta JSON da aplicação foi obtida |

O resultado direto confirma o envelope 404 e a política de cache observada nesse caminho. O 302 pelo web pertence ao acesso protegido via cliente CLI. A ferramenta de navegador não disponibilizou superfícies conectadas nesta sessão; a coleta posterior do proprietário está registrada abaixo. Não se inferiu defeito da aplicação, nem se alterou a proteção dos projetos para completar o teste.

## Conferência HTTP pelo proprietário no navegador

O proprietário esclareceu que todas as coletas iniciais de rota inexistente, busca inválida, previsão sem parâmetros e busca válida foram feitas com **Disable cache ativado**, inclusive as primeiras chamadas. Essas amostras registram status, corpos e cabeçalhos nesse modo. As coletas posteriores de busca pela interface, dos três erros e da previsão válida com a opção desmarcada estão identificadas separadamente abaixo.

### Rota inexistente

O proprietário forneceu a coleta de duas requisições GET a `/api/rota-inexistente` pelo Preview web, antes e depois de recarregar. O endereço real do Preview e o identificador da requisição foram omitidos deste registro.

| Chamada pelo web | Status | Content-Type | Cache-Control | x-vercel-cache | Código público |
|---|---|---|---|---|---|
| Primeira | 404 | Não informado | `private, no-store` | `MISS` | Não informado |
| Após recarregar | 404 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `NOT_FOUND` |

Nas duas chamadas, o web preservou o status 404 e a política `private, no-store`, com `MISS` observado. A repetição também confirmou JSON `NOT_FOUND`, sem fallback HTML da SPA. O Content-Type e o código do corpo da primeira chamada não foram fornecidos. A fonte é a coleta do proprietário, analisada pelo agente; busca/previsão e seus cabeçalhos ainda precisam de prova própria.

### Busca inválida

O proprietário forneceu duas requisições GET a `/api/v1/locations?query=a` pelo web, antes e depois de recarregar. O parâmetro é um exemplo inválido de teste; a coleta foi resumida sem endereço do Preview, identificadores de requisição ou respostas brutas.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Código público |
|---|---|---|---|---|---|
| Primeira | 400 | Não informado | `private, no-store` | `MISS` | `VALIDATION_ERROR` |
| Após recarregar | 400 | Não informado | `private, no-store` | `MISS` | `VALIDATION_ERROR` |

Ambos os corpos JSON informados contêm o erro público de validação esperado. O proprietário esclareceu que o `Cache-Control: no-cache` adicional está em **Request Headers**, enviado pelo navegador; a política informada em **Response Headers** continua `private, no-store`. O Content-Type não foi fornecido. Estes resultados comprovam o status, o envelope e os cabeçalhos observados da busca inválida.

### Previsão sem parâmetros

O proprietário forneceu duas requisições GET a `/api/v1/forecast` sem parâmetros pelo web, antes e depois de recarregar.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Código público |
|---|---|---|---|---|---|
| Primeira | 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |
| Após recarregar | 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |

As duas chamadas preservaram o status, o envelope público de validação e os cabeçalhos esperados pelo rewrite. Os dados são da coleta do proprietário; não incluem URL real, identificadores de requisição ou respostas brutas.

### Busca válida

O proprietário forneceu duas requisições GET de busca válida pelo web, com Preserve log e Disable cache ativados no DevTools. Termo pesquisado, nomes de localidades, coordenadas, identificadores dos resultados e endereço real foram omitidos deste registro.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Corpo resumido |
|---|---|---|---|---|---|
| Primeira | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `locations` com cinco resultados e `attribution` |
| Após recarregar | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `locations` com cinco resultados e `attribution` |

As duas amostras incluem atribuição Open-Meteo/GeoNames, CC BY 4.0 e indicação de dados adaptados. O `MISS` observado pertence ao CDN e não confirma nem nega hit Redis, expiração ou deduplicação.

Em uma coleta posterior pela interface, com **Disable cache desmarcado**, o proprietário informou GET de busca válida, status 200, `Content-Type: application/json; charset=utf-8`, `Cache-Control: private, no-store` e `x-vercel-cache: MISS`. Essa chamada complementa a verificação de sucesso em uso normal; o corpo não foi fornecido novamente.

### Respostas de erro com Disable cache desmarcado

O proprietário repetiu os três caminhos de erro, com Disable cache desmarcado e Preserve log ativado, fazendo uma requisição GET inicial e outra após recarregar em cada caminho.

| Caminho pelo web | Status primeira/repetição | Content-Type nas duas | Cache-Control da resposta nas duas | x-vercel-cache nas duas | Código público nas duas |
|---|---|---|---|---|---|
| `/api/rota-inexistente` | 404 / 404 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `NOT_FOUND` |
| `/api/v1/locations?query=a` | 400 / 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |
| `/api/v1/forecast` sem parâmetros | 400 / 400 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `VALIDATION_ERROR` |

As seis amostras preservam os status e envelopes esperados e informam JSON, `private, no-store` e `MISS`. A nova coleta também fornece os Content-Types que faltavam nas amostras iniciais de 404 e busca inválida. Os resultados são da coleta do proprietário; URLs reais, request IDs e corpos brutos foram omitidos. Esses resultados delimitam os caminhos de erro observados; erros de provedor, limite por visitante e falha Redis continuam sujeitos às provas próprias do plano.

### Previsão válida pela interface

O proprietário forneceu uma consulta após selecionar uma cidade nas sugestões e outra após clicar no logo para reabrir a interface com a cidade salva, seguindo o roteiro com Disable cache desmarcado. Foram omitidos endereço real, parâmetros de localização, fuso, datas, horário de consulta e valores meteorológicos.

| Chamada pelo web | Status | Content-Type | Cache-Control da resposta | x-vercel-cache | Corpo resumido |
|---|---|---|---|---|---|
| Após selecionar a cidade | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `current`, sete itens em `daily` e `attribution` |
| Após clicar no logo | 200 | `application/json; charset=utf-8` | `private, no-store` | `MISS` | `current`, sete itens em `daily` e `attribution` |

As duas amostras têm sete datas consecutivas, com o primeiro dia correspondente à data local das condições atuais, e atribuição Open-Meteo/CC BY 4.0 com indicação de adaptação. O `retrievedAtUtc` e o corpo permanecem iguais entre as chamadas. Isso é compatível com reutilização do cache da aplicação, mas a confirmação de hit Redis depende dos eventos correspondentes; expiração, deduplicação e reserva concorrente exigem as provas de P1b. O `MISS` observado continua sendo do CDN. A fonte desta coleta é o proprietário.

## Continuidade

Quality gates de `ef9cda2` foi confirmado pelo proprietário; os dois Previews em `0c6d090` foram informados pelo proprietário e confirmados pela CLI. Esta rodada de navegador concluiu a coleta de rota inexistente, busca inválida, previsão sem parâmetros e sucessos de busca/previsão pelo web com Disable cache desmarcado. Cada resultado acima é atribuído à revisão hospedada `0c6d090`; isso não conclui P1 inteiro. A comparação local permite continuar os ensaios no Preview existente, pois até `ef9cda2` mudaram somente documentação e CI. O motivo de não haver novos deployments não foi auditado; a evidência anterior de skip não comprova a causa atual.

O próximo checkpoint proposto é revisar, com confirmação do proprietário, o plano gratuito, a região e a vinculação da Upstash somente à API, sem extrair valores secretos. Em seguida, concluir a matriz direta da API e as provas de custo, TTL, concorrência e falha fechada de P1b. A sequência e os critérios continuam no plano e na lista ativa.

A [conferência de revisão e CI](vercel-upstash-runbook.md#conferência-de-revisão-e-ci) continua aplicável à revisão final de entrega. A CI verde de `ef9cda2` e os Previews de `0c6d090` são resultados distintos, com fontes registradas acima. Confirmar novamente pareamento, configuração e gates da revisão final em P11.

Os próximos gates são reserva/cache/custo real (P1b), WAF nos dois projetos e consumo gratuito (P1c), identidade/saída sem IP e falha externa (P1d), seguidos de Production, privacidade, direitos e rollback (P10–P11), conforme o plano aprovado. Ajustes de ambiente, regras, deployments e abertura pública aguardam confirmação do proprietário. A autorização desta retomada permite consultas de leitura e atualização documental.

## Conteúdo público

Este registro contém somente data, revisões Git, categorias e resultados resumidos. Credenciais, URLs de deployments/Redis, identificadores de infraestrutura, valores de ambiente e respostas brutas não foram copiados. As regras para evidências destinadas ao repositório público estão no [README](../../README.md#onde-documentar).

A revisão documental verificou os destinos dos links locais nos quatro documentos alterados e encontrou zero caminhos ausentes; `git diff --check` passou. Uma busca em 24 documentos Markdown por padrões selecionados de credenciais, chaves privadas, JWTs, IDs e hosts reais Vercel/Upstash não encontrou correspondências. O scan completo Gitleaks continua entre os gates de entrega.
