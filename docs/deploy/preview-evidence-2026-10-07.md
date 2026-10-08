# Evidência de Preview — 2026-10-07

Ensaio realizado em 2026-10-07, horário de Brasília; parte dos registros corresponde a 2026-10-08 em UTC. O proprietário autorizou a consulta e a edição pela CLI da Vercel e confirmou **“funcionou”** no navegador após a correção. Este registro comprova o fluxo testado em Preview; P1 e a publicação permanecem parcialmente pendentes.

## Projetos e deployments

Os endereços reais, IDs de deployments e identificadores de conta ficam no painel da Vercel. Este registro usa somente os papéis das aplicações e os resultados do ensaio, conforme a preferência do proprietário de não incluir dados operacionais identificáveis nos documentos versionados.

Branch de configuração: `fix/vercel-review-consistency`. Revisão local usada na sessão: `e7eb7b8`; o pareamento dos SHAs efetivamente hospedados ainda deve ser conferido nos dois projetos.

| Componente | Root Directory | Estado final |
|---|---|---|
| Web | `apps/web` | Preview, Ready |
| API | `apps/api` | Preview, Ready |

O alias de branch da API acompanha seus redeploys; o frontend usa esse endereço em `API_ORIGIN`. Para o web criado pela CLI, foi observada a URL individual; nenhum alias estável de branch web foi confirmado. Ao recriar o frontend, sua origem permitida precisa acompanhar a URL efetivamente usada. Confira os valores reais no painel, sem copiá-los para este documento.

A região efetiva da API deve ser consultada no painel da Vercel. A CLI usada foi 62.2.0, executada com Node 24.21.0. Isso não substitui a conferência de Node/npm efetivos nos builds hospedados de cada app. O primeiro build web de `main` foi criado como Production e falhou com `Invalid API_ORIGIN`; não contou como Preview aprovado.

## Causas identificadas

1. **URLs de deployment mudavam:** a URL individual com hash aponta para uma revisão; o alias de branch da API mantém o endereço ao mudar o deployment. O web passa a usar esse alias em `API_ORIGIN`.
2. **Falha local da CLI:** `vercel.mjs` lê `process.env.API_ORIGIN` durante a compilação local anterior ao upload. A variável só no painel não resolveu essa etapa. Definir a variável no terminal fez `vercel deploy --dry` passar; o deploy web subsequente usou também `--build-env`.
3. **503 em busca/previsão:** os detalhes completos de uma requisição mostraram `forecast_upstream_failed` com `failureKind: quota_denied`; uma requisição posterior mostrou `geocoding_upstream_failed` com a mesma causa. Os oito campos `OPEN_METEO_*` estavam inicialmente apenas em Production. Preview usava padrões de 1.000 créditos por consulta e por janela, compartilhados entre busca e previsão. Hits Redis retornavam 200; novos misses eram bloqueados antes do fetch do provedor.
4. **Edição parcial dos escopos:** custos e tempos já tinham sido habilitados em Preview pelo proprietário, mas os quatro tetos continuavam apenas em Production. Um redeploy anterior não resolveu porque ainda faltavam esses escopos.
5. **CORS:** após a correção da cota, uma consulta inválida retornou 400, mas não permitiu a origem do frontend atual. Um override de Preview para a branch corrigiu a origem; o teste final confirmou a permissão.

`/health` responde sem consultar Redis ou Open-Meteo. Seu 200 inicial provou a inicialização da API, não o fluxo completo. Os erros `application_environment` de deployments Production antigos foram tratados como evidência separada dos 503 de Preview.

## Configuração aplicada

| Projeto | Variáveis | Resultado |
|---|---|---|
| API | `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Preview acrescentado aos targets existentes, mantendo Production, valores e tipo Secret |
| API | `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS`, `OPEN_METEO_429_COOLDOWN_MS`, `OPEN_METEO_PROBE_MS` | Já incluíam Preview após a edição do proprietário; escopos conferidos |
| Web | `API_ORIGIN` geral | Preview acrescentado, preservando o valor existente e Production |
| Web | `API_ORIGIN` específico de `fix/vercel-review-consistency` | Override Preview definido com o alias estável da API |
| API | `CORS_ALLOWED_ORIGINS` específico de `fix/vercel-review-consistency` | Override Preview definido com a origem exata do web atual |

Os valores gerais classificados como Secret não eram legíveis pela CLI. Foram corrigidos os targets sem extrair ou substituir esses valores. Os números propostos para testes na conversa não foram apresentados como valores efetivos verificados; essa conferência permanece pendente. Nenhuma credencial Redis/HMAC foi exposta ou alterada, nenhum contador Redis foi apagado e nenhum redeploy Production foi executado nesta correção.

Os dois overrides de URL são exclusivos de Preview e da branch indicada. Os parâmetros gerais de Production não foram redefinidos como política de lançamento.

## Procedimento reproduzível pela CLI

Na raiz do repositório, com a branch de Preview selecionada e as variáveis cadastradas no projeto web:

```bash
# Substitua o exemplo pela origem de branch da API Preview indicada no painel.
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

## Resultados observados

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

## Pendências e próximo passo

- Concluir P1a: pareamento de revisões, versões dos dois builds, CI hospedada, escopo efetivo de autenticação, cabeçalhos web/asset/CDN em sucesso e erro, CORS com origem ausente/divergente e ausência de segredos no bundle.
- Concluir P1b: confirmar peso no calculador e valores efetivos dos créditos, medir o tamanho da amostra de previsão, provar TTL/expiração, reserva concorrente em quatro janelas, falha fechada e consumo de comandos Redis.
- P1c: configurar/verificar WAF na API direta e no rewrite, consumo gratuito e bloqueio anterior à Function/Redis.
- P1d: eco sem IP/canário e teste de falsificação nas duas rotas e nos dois caminhos; circuit breaker com fixture.
- P10–P11: região/retenção, direitos, termos, política Production, gates finais e rollback dos dois projetos; decisão separada sobre exposição pública.

Os avisos CSP da Toolbar (`vercel.live`) e do manifesto redirecionado ao SSO Vercel são distintos do `quota_denied`. Nenhuma CSP ou proteção de deployment foi relaxada. A Toolbar pode ser desativada no painel do projeto web em Settings → General → Vercel Toolbar → Preview → Off; sua desativação não foi executada nem comprovada neste ensaio.

Fontes de procedimento: [URLs geradas](https://vercel.com/docs/deployments/generated-urls), [CLI deploy](https://vercel.com/docs/cli/deploy), [logs agrupados por requisição](https://vercel.com/docs/logs/runtime) e [Toolbar](https://vercel.com/docs/vercel-toolbar/managing-toolbar). O progresso vigente está em [vercel-todo.md](../../tasks/vercel-todo.md).
