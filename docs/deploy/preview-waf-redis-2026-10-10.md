# Preview — Upstash e WAF em 2026-10-10

Evidência da conferência de infraestrutura e dos testes manuais que sucedem a [rodada de 2026-10-09](revision-review-2026-10-09.md). O progresso e o próximo trabalho permanecem na [lista ativa](../../tasks/vercel-todo.md). Este registro não conclui P1 nem autoriza publicação pública.

## Fonte e revisão

O proprietário operou os painéis Vercel/Upstash e o navegador, fornecendo capturas, resultados HTTP e relatos do Monitor. O agente analisou essas informações, consultou a CLI Vercel em modo somente leitura com autorização e atualizou a documentação quando solicitado. Não houve alteração de código nem operação dos painéis pelo agente nesta rodada.

O checkout local estava em `chore/vercel-p1`, revisão `c7bdb23`, antes do primeiro registro, commitado em `a09efe8`. A continuação documental começou com árvore limpa nesse último commit. A CLI reconfirmou API e web Ready em `0c6d090`, na mesma branch, depois do redeploy da API pelo proprietário. O novo Preview da API foi criado em 2026-10-10 às 16:40:19.628 UTC, após o cadastro das variáveis; o web permanecia no Preview criado em 2026-10-08. Roots `apps/api`/`apps/web`, frameworks Fastify/Vite, runtime configurado Node `24.x` e proteção All Deployments dos dois projetos foram reconfirmados. Isso não é uma nova execução de CI ou uma reconferência das versões exatas dos builds. A comparação local até `a09efe8` não altera runtime, dependências, assets ou configuração versionada de deploy; reconferir a revisão final no release.

Somente resumos anonimizados foram transcritos. Capturas, CSVs e exports de logs não foram incorporados ao repositório. URLs reais, nomes e IDs de recursos/conta, IPs, digests, chaves Redis, identificadores de requisição, consultas reais e coordenadas foram omitidos.

## Upstash e vínculo de Preview

| Conferência no painel | Resultado observado | Alcance |
|---|---|---|
| Plano Upstash | Free Tier | Plano exibido durante a coleta |
| Provedor e região exibida | AWS, Virgínia do Norte, `us-east-1` | Região exibida; o selo Global não comprova regiões adicionais de réplica |
| Connected Projects na Vercel | Somente API, escopo Preview | O seletor expandido não listou o web; vínculo Production não foi verificado |
| Plano Vercel | Hobby nos dois projetos | Identificação exibida nos painéis fornecidos |
| Consumo Upstash | Limite exibido de 500 mil comandos/mês; custo exibido de US$ 0 nas capturas | Snapshot de consumo, não projeção mensal ou confirmação de upgrade automático desativado |

Essa conferência conclui a identificação de plano, região exibida e vínculo da Upstash em Preview. Retenção dos fornecedores, réplicas, configuração Production e orçamento continuam sujeitos aos gates existentes.

## Configuração final do WAF

O proprietário criou e publicou uma regra `api-rate-limit` em cada projeto, API e web. As capturas iniciais mostravam zero regras personalizadas; as posteriores mostraram a regra habilitada e a confirmação de aplicação das mudanças.

| Campo | Configuração nos dois projetos |
|---|---|
| Condição | Request Path Equals `/api` **OR** Request Path Starts with `/api/` |
| Estratégia | Fixed Window |
| Janela e limite | 60 segundos, 60 requisições |
| Chave | Somente IP Address; JA4 Digest desmarcado |
| Ação | Too Many Requests (429) |

Durante a medição, somente o web recebeu limites temporários de 1 requisição/600 segundos e depois 1 requisição/60 segundos. Ao final, o proprietário forneceu a configuração restaurada para 60/60 e confirmou que estava publicada. Não foi relatada alteração temporária da regra da API; sua última configuração fornecida era 60/60 publicada. Publicar mudanças do Firewall não foi tratado como autorização para remover a proteção dos deployments.

## Rajadas de busca inválida nos dois caminhos

Antes das rajadas, `GET /api/v1/locations?query=a` retornou 400 com JSON `VALIDATION_ERROR` tanto pelo web/rewrite como pela API direta. O parâmetro é um exemplo inválido de teste; essas consultas não demandam chamada à Open-Meteo.

O proprietário executou uma rajada limitada de 65 chamadas em cada origem. Os resultados do Console, do filtro `api-rate-limit` no Firewall e dos logs fornecidos foram:

| Caminho | 400 no navegador | 429 no navegador | Bloqueios WAF | Registros da Function na rajada |
|---|---:|---:|---:|---|
| Web → rewrite | 30 | 35 | 5 | 30 com 400; 30 com `rate_limit_rejected`, `source: shared`, `scope: location-search` e 429 |
| API direta | 30 | 35 | 5 | 30 com 400; 30 com o mesmo evento de limite compartilhado e 429 |

Na API direta, o filtro da regra passou de nenhum evento para cinco bloqueios. No web, cinco bloqueios apareceram após atualização do painel. Após um minuto sem consultas, uma nova busca inválida em cada origem voltou a responder 400 `VALIDATION_ERROR`.

Os 60 registros da Function por rajada, somados aos cinco bloqueios WAF, são coerentes com as 65 chamadas. Essa correlação sustenta bloqueio antes da aplicação, mas não é uma auditoria independente de invocações ou cobrança: a conclusão depende da completude do export e da atribuição temporal. Não se classificaram todos os 35 retornos 429 como WAF; os 30 registrados pelo limitador compartilhado envolveram a API/Redis.

## Monitor Redis e controles

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

## Amostras isoladas e correlação com a Function

O proprietário repetiu o ensaio com limite WAF de 60/60: preparação de 60 buscas inválidas, leitura completa das respostas, espera de cinco segundos e amostra de cinco chamadas. Os horários abaixo são UTC; os painéis fornecidos exibiam UTC−3. Não misturar os comandos da preparação com a amostra bloqueada.

| Caminho | Intervalo da amostra em 2026-10-10 | Resultado e correlação |
|---|---|---|
| Web → rewrite | Fim às 15:43:00.917 UTC | Cinco 429. Os registros de busca fornecidos pertenciam à preparação, por volta de 15:42:53–55; nenhum registro de busca foi apresentado no intervalo da amostra. Controles posteriores `/health` 200 entre 15:47 e 15:48 confirmaram continuidade dos logs. Complementa os controles Redis anteriores do web. |
| API direta | 15:55:54.171–15:55:54.222 UTC | Cinco 429 em texto simples. Monitor registrou somente a preparação, de 15:55:47.683 a 15:55:49.070, sem comandos observados na amostra. Logs de busca também pertenciam à preparação; `/health` posterior retornou 200, com registro às 15:55:54.23. Controles anteriores de busca inválida retornaram 400 e produziram comandos no Monitor. |

O cabeçalho de um export indicava um intervalo antigo, embora suas linhas Live tivessem timestamps posteriores. A correlação usou os timestamps das linhas e do Console. `request_completed` acompanha o fim da execução; o horário da requisição na listagem pode ser anterior. Uma linha com duas mensagens podia agrupar `rate_limit_rejected` e `request_completed` da mesma requisição.

**Conclusão observacional:** as amostras sustentam bloqueio WAF antes da aplicação nos dois caminhos, sem execução da Function registrada para as chamadas amostradas e sem comandos Redis observados nas capturas com controles. Isso não é auditoria independente de cobrança ou garantia para todos os tráfegos, regiões e deployments. Reconfirmar no release; projeção mensal e acompanhamento do plano permanecem pendentes.

## Política Preview e variáveis efetivas

O agente leu os adapters de [busca](../../apps/api/src/locations/open-meteo-geocoding.ts), [previsão](../../apps/api/src/forecast/open-meteo-forecast.ts) e a [política de créditos](../../apps/api/src/config/provider-policy.ts). A busca faz uma chamada HTTP por miss. A previsão solicita uma localização, sete dias, cinco variáveis atuais, uma horária e sete diárias, sem seleção explícita de múltiplos modelos.

A [página oficial de preços](https://open-meteo.com/en/pricing) usa contagem fracionária. Aplicando a [fórmula do calculador oficial](https://github.com/open-meteo/open-meteo-website/blob/main/src/routes/en/pricing/%2Bpage.svelte) a 13 variáveis, sete dias, um modelo e uma localização, o peso estimado é 1,3 chamada. É uma estimativa baseada nesses parâmetros, não uma leitura de faturamento do provedor. O proprietário aprovou uma reserva conservadora acima desse peso e quatro tetos provisórios exclusivos do Preview; as fontes foram consultadas em 2026-10-10. Os [termos](https://open-meteo.com/en/terms) e a política de Production continuam sujeitos à revisão de release.

| Campos | Cadastro e conferência |
|---|---|
| `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS` | Overrides exclusivos de Preview, branch `chore/vercel-p1`, cadastrados como Sensitive pelo proprietário; custos conferidos nos argumentos das reservas de busca/previsão |
| `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Mesmo escopo; quatro tetos conferidos nos argumentos de ambas as reservas |

A CLI confirmou presença, nomes, tipo Sensitive e escopo da branch, mas não revelou valores. Os seis números efetivos foram depois comparados com a proposta aprovada usando os argumentos dos scripts no Monitor; todos corresponderam. Os valores de ambiente e argumentos brutos permanecem fora do Git, conforme a regra de documentação pública do projeto. Essa conferência não altera cooldown/probe nem prova comportamento do circuito aberto.

O proprietário excluiu os seis campos gerais anteriores, que abrangiam Production/Preview. A consulta somente leitura do escopo Production confirmou ausência dos seis nomes. Não restaurar automaticamente os tetos de Preview em Production: definir e aprovar sua própria política antes do release. Redis/HMAC continuavam vinculados a Preview nas capturas. O proprietário redeployou a API, excluiu o deployment antigo e confirmou o fluxo web funcional. O deployment excluído não pode ser presumido como destino disponível de rollback; selecionar e verificar destinos dos dois projetos em P11.

## Perfis de cache e renovação da previsão

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

## Comportamento da interface e diagnóstico

- Reabrir o web com cidade salva inicia uma consulta de previsão; a preferência salva é a cidade, não um histórico de previsões. No ensaio 1/60, essa consulta podia consumir a única requisição permitida e bloquear a tentativa manual seguinte.
- Favicon, assets e scripts auxiliares são requisições distintas da busca/previsão. Sua presença no Network, inclusive respostas 200/304, não comprova acesso da API ao Redis. Registrar o caminho e o papel do recurso ao diagnosticar, sem URLs operacionais.
- O proprietário observou a mensagem genérica de falha de previsão diante do 429 do WAF. A leitura local de [http.ts](../../apps/web/src/api/http.ts) confirma que `rate_limited` depende do JSON com `RATE_LIMITED`; texto simples/HTML 429 cai em `request_failed`. A [interface](../../apps/web/src/components/forecast-state.tsx) então apresenta a falha genérica. A avaliação de um tratamento específico pertence a `weather-ui` e exige revisão de seu contrato antes de implementação; nenhum ajuste foi feito nesta rodada.

## Gates locais na análise inicial desta conversa

Executados na revisão local `c7bdb23`, antes da atualização documental:

| Gate | Resultado |
|---|---|
| `npm run check` | Tipos, lint, formato, fronteiras e entrega passaram; 505 testes API e 90 web |
| `npm run test:coverage` | API: 94,93% statements, 91,93% branches, 94,71% functions, 97,93% lines; web: 96,88%, 89,84%, 97,43%, 98,94%, respectivamente |
| `npm run build --workspaces` | Builds API e web passaram |
| `npm audit --audit-level=high` | Zero vulnerabilidades |
| Acessibilidade, E2E e performance | Sem nova conclusão: acessibilidade bloqueada primeiro pela conexão local do sandbox e depois pela ausência de Chromium; download autorizado falhou por timeout. A sequência não chegou a executar E2E/performance |
| Gitleaks e CI hospedada | Não reexecutados nesta análise; confirmação anterior de CI permanece atribuída à revisão e à fonte registradas em 2026-10-09 |

## Alcance do handoff

A configuração WAF final está publicada em 60/60, segundo confirmação do proprietário. A continuação acrescentou a correlação dos bloqueios nos dois caminhos, a amostra direta do Monitor, a reconferência dos Previews, os seis campos efetivos de política e os perfis de hit/miss com renovação da previsão. P1 permanece parcial; a [lista ativa](../../tasks/vercel-todo.md#retomada-na-próxima-sessão) define o ponto de retomada: conferir a unidade de contabilização da Upstash antes de projetar consumo normal/adversarial e viabilidade mensal. Não converter automaticamente 9/29 registros do Monitor em comandos faturados.

Na primeira atualização documental (`a09efe8`), `npm run check` passou novamente com 505 testes API e 90 web, e os 30 links locais foram verificados. Na continuação documental, `npm run check` voltou a passar com os mesmos 595 testes; os destinos e âncoras dos 44 links locais dos três documentos foram conferidos, a revisão do diff e `git diff --check` passaram, e a busca por padrões selecionados de dados operacionais no conteúdo novo não encontrou correspondências. Essa busca específica não substitui Gitleaks. Nenhum novo resultado de cobertura, navegador, audit, Gitleaks ou CI hospedada foi produzido nesta atualização exclusivamente documental. Alterações deixadas no checkout para revisão e commit separado.
