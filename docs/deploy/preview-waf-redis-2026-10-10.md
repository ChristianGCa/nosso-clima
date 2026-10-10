# Preview — Upstash e WAF em 2026-10-10

Evidência da conferência de infraestrutura e dos testes manuais que sucedem a [rodada de 2026-10-09](revision-review-2026-10-09.md). O progresso e o próximo trabalho permanecem na [lista ativa](../../tasks/vercel-todo.md). Este registro não conclui P1 nem autoriza publicação pública.

## Fonte e revisão

O proprietário operou os painéis Vercel/Upstash e o navegador, fornecendo capturas, resultados HTTP e relatos do Monitor. O agente analisou essas informações e, mediante autorização posterior, atualizou a documentação. Não houve alteração de código nem operação dos painéis pelo agente nesta rodada.

O checkout local estava em `chore/vercel-p1`, revisão `c7bdb23`, limpo antes desta atualização. A última revisão hospedada confirmada na evidência anterior é `0c6d090`; os SHAs dos deployments não foram reconferidos em 2026-10-10. A comparação local até `c7bdb23` não altera runtime, dependências, assets ou configuração versionada de deploy. Isso não comprova a revisão ou as variáveis efetivamente hospedadas nesta rodada; reconfirmá-las no release.

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

**Conclusão limitada:** houve ausência de comandos Redis observados nas chamadas bloqueadas pelo WAF no caminho web, com controles permitidos antes e depois. A fonte da atividade/ausência é a captura e o relato do proprietário. Não foi feita uma amostra equivalente com Monitor para bloqueios no domínio direto da API, nem uma correlação específica das cinco chamadas com as invocações da Function. As rajadas anteriores fornecem evidência complementar, sem substituir essas verificações.

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

A configuração WAF final está publicada em 60/60, segundo confirmação do proprietário. A [lista ativa](../../tasks/vercel-todo.md) separa os itens concluídos de plano/vínculo, bloqueio e Monitor das provas ainda necessárias: revisão hospedada final, invocações, Redis no acesso direto, consumo representativo/adversarial, upgrade automático, cota/TTL/falha fechada, identidade/saída, Production, privacidade, direitos e rollback. Nenhuma dessas pendências foi encerrada pelos resultados desta rodada.

Na atualização documental, `npm run check` passou novamente com 505 testes API e 90 web. Os destinos e âncoras dos 30 links locais dos três documentos envolvidos foram verificados, e a busca por padrões selecionados de dados operacionais no conteúdo novo não encontrou correspondências. `git diff --check` passou. Essa busca específica não substitui Gitleaks.
