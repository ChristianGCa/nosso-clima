# Runbook: Vercel + Upstash

Procedimentos para uma necessidade concreta ou revisão final. Estado e pendências somente em `tasks/vercel-todo.md`; critérios em `SPEC-production-delivery.md`, `SPEC-backend-platform.md` e `CONSTRAINTS.md`. Resultados antigos estão em `docs/history/preview-evidence-2026-10.md`, incluindo o bootstrap e gates locais retirados deste runbook.

**Retomada:** Preview funcional/protegido, eco removido e Redis recuperado. Não recriar projetos, reinstalar integração, alterar URL/token nem repetir os ensaios suficientes. O proprietário conduz ajustes e deployments; delegações antigas de CLI foram específicas. Manter proteção e planos gratuitos.

## Topologia e build

| Projeto | Root | Entrada/saída | Configuração autoral |
|---|---|---|---|
| API | `apps/api` | `app.ts`: handler default, import Fastify, readiness e encaminhamento HTTP; `server.ts` é desenvolvimento local | `apps/api/vercel.json` |
| Web | `apps/web` | Vite estático, `dist`; `/api` e `/api/*` encaminhados à API do mesmo ambiente, sem fallback HTML | `apps/web/vercel.mjs` |

Usar Node 24 e npm 12.0.2, lockfile único da raiz, builds independentes e acesso aos arquivos fora do Root Directory. Os comandos de instalação estão versionados; não criar lockfiles por aplicação. Conferir versões nos dois builds. A CLI web também precisa de `API_ORIGIN` no ambiente local ao compilar `vercel.mjs`, além do build remoto. O exemplo de comando preservado na coleta de 2026-10-07 usa placeholders.

`VITE_API_BASE_URL` deve ficar ausente; o navegador usa `/api/v1/*` relativo. `API_ORIGIN` deve apontar à API pareada do mesmo ambiente, nunca Preview → Production. Conferir destino do alias depois de redeploy; URLs individuais ficam presas ao deployment. Overrides de branch não acompanham automaticamente merges. Uma edição de variável só passa a valer em novos deployments.

## Variáveis — somente nomes e regras

| Escopo | Nome | Regra |
|---|---|---|
| API | `NODE_ENV`, `HOST` | Production explícito: `production` e bind em todas as interfaces; Preview aplica padrões na entrada quando ausentes |
| API | `UPSTASH_REDIS_REST_URL` | Endpoint REST HTTPS raiz, sem credenciais embutidas, caminho adicional, query ou fragmento |
| API | `UPSTASH_REDIS_REST_TOKEN` | Token REST padrão com escrita, somente server-side; token somente leitura não atende cache/limites/reserva |
| API | `RATE_LIMIT_HMAC_KEY`, `CACHE_HMAC_KEY` | Dois segredos distintos, cada um com 32 bytes/64 caracteres hexadecimais; manter somente na API e fora do Git/logs |
| API | `CORS_ALLOWED_ORIGINS` | Origem web exata do ambiente; conferir override e comportamento pelo rewrite |
| API | `OPEN_METEO_MINUTE_CREDITS`, `OPEN_METEO_HOUR_CREDITS`, `OPEN_METEO_DAY_CREDITS`, `OPEN_METEO_MONTH_CREDITS` | Quatro tetos de créditos inteiros positivos; política Production explícita aprovada com margem |
| API | `OPEN_METEO_GEOCODING_CREDITS`, `OPEN_METEO_FORECAST_CREDITS` | Custo ponderado de cada consulta, ≥1.000 e ≤cada teto; 1.000 créditos = uma unidade de chamada, não dinheiro |
| API | `OPEN_METEO_429_COOLDOWN_MS`, `OPEN_METEO_PROBE_MS` | Tempos positivos; probe ≤cooldown. Production exige os dois valores explícitos |
| Web | `API_ORIGIN` | Origem HTTPS da API pareada, usada na configuração de build do rewrite; não inserir token nem publicar seu valor no relato |
| Web | `WEB_ORIGIN` | Opcional: origem exata para impedir rewrite ao próprio web; configuração usa `VERCEL_URL` quando disponível |
| Web | `VITE_API_BASE_URL` | Ausente em Preview/Production; nenhuma variável secreta em `VITE_*` |
| API Preview isolado | `UPSTREAM_TEST_BASE`, `UPSTREAM_TEST_TOKEN` | Somente ensaio concreto com eco; configuração parcial/inválida ou fora de Preview impede inicialização. Remover antes do release |

Mapeamento da integração: `KV_REST_API_URL` corresponde ao endpoint REST e `KV_REST_API_TOKEN` ao token padrão. `KV_URL`/`REDIS_URL` usam protocolo Redis e não se tornam REST trocando o esquema. Colar valores no painel sem as aspas do exemplo `.env`; conferir nomes/escopos sem extrair valores. Não ligar a integração ao web.

Preview tem padrões provisórios de 1.000 para os seis custos/tetos e 60.000/10.000 ms para circuito quando ausentes; esses padrões não são política de operação. Fora de Preview, os oito campos são obrigatórios. Os limites máximos aceitos pelo código são guardrails, não recomendações de Production. Os últimos registros mostram custos/tetos gerais removidos de Production; builds Ready não comprovam inicialização válida.

## Revisão, CI e pareamento

1. Consultar checkout/branch/SHA; conferir Actions → Quality gates da revisão escolhida no GitHub autenticado. Registrar data, revisão e resultado resumido. Referência remota local não comprova sincronização atual nem CI.
2. Nos dois projetos Vercel, conferir ambiente, branch, SHA, roots, Node/npm, proteção e destino efetivo do rewrite. Metadados Ready não comprovam runtime nem resposta HTTP. Não desproteger para conseguir acesso.
3. Reaproveitar evidências cuja implementação/configuração ainda corresponda à revisão escolhida. Registrar diferenças materiais; uma mudança só documental não exige repetir automaticamente os ensaios, mas a revisão final precisa de gates/pareamento próprios.
4. Conferir health diretamente na API; erros/sucessos API e rewrite; HTML/assets web; CORS permitido, ausente e divergente. Não inferir sucesso pelo health: ele não acessa Redis/provedor.

## Diagnóstico agrupado de falhas

| Evento/etapa | Interpretação | Conferência |
|---|---|---|
| `application_environment` | Configuração da aplicação inválida na inicialização | Ambiente, `NODE_ENV`/`HOST`, origem CORS e campos validados em `env.ts`; não presumir pane Redis |
| `serverless_credentials` ou nome de credencial | Endpoint/token/HMAC inválidos | Nomes, formatos e escopos em `serverless-credentials.ts`, sem imprimir valores |
| `provider_policy` | Custos/tetos/tempos ausentes ou inválidos | Oito campos, formato e relações em `provider-policy.ts`; Production não recebe defaults Preview |
| `visitor_identity_unavailable` | Sinal de identidade ausente/ambíguo | Caminho direto/rewrite e `x-vercel-forwarded-for`; não aceitar header arbitrário do cliente |
| `visitor_limit_unavailable` | Primeiro limitador compartilhado falhou | Estado da integração e autenticação Redis; 503 ocorre antes da validação/handlers |
| `quota_denied` | Reserva interna negada antes do fetch | Tetos/custos e janelas móveis: minuto, hora, 24 h e 31 dias; hits não reservam |
| `upstream_rate_limited` | Provedor retornou 429 | Circuit breaker e logs categorizados; distinto do limite de visitante |
| `rate_limit_rejected` | Limite local/compartilhado da API | Campo `source`; limite compartilhado envolve Redis |
| 429 com evento da regra WAF | Bloqueio anterior à Function | Contagens/intervalo da regra e ausência de Function/Redis com controles |

Consultar detalhes completos da invocação, não somente primeira linha da listagem. Redeploy e limpeza de cache climático não zeram reservas. Não limpar Redis nem ampliar política para obter um teste verde. Usar as categorias existentes; proposta de novos logs de janela/custo/saldo foi cancelada pelo proprietário.

Toolbar/CSP, SSO e manifesto não demonstram falha de quota. Redirect/401/403 de proteção não é resposta da aplicação. O cliente web classifica 429 pelo status HTTP mesmo quando o WAF retorna HTML ou JSON inválido.

## Cache, TTL, reserva e consumo

- Cache Redis autoritativo: busca até 24 h, previsão até 10 min, chaves opacas com HMAC, namespace/versão, entradas normalizadas ≤24 KiB, sem erro/vencido; resposta REST Redis ≤64 KiB. O corpo bruto do provedor também tem limite de 64 KiB, aceito pela revisão do transporte e testes de fronteira; a amostra hospedada não mediu esse tamanho.
- Lock de miss: 12 s com token e liberação condicional; outras instâncias aguardam até 6,3 s. Cada saída real exige reserva, mesmo se deduplicação falhar. Quatro concorrentes da mesma chave não provam múltiplas instâncias nem atomicidade de reservas distintas.
- Medir miss/hit/renovação sem limpar chaves: comparar igualdade/mudança de timestamp, nova reserva e comandos categorizados. Hit não estende TTL. A previsão já foi renovada após o prazo; expiração da busca permanece pendente.
- Hits/misses medidos no Monitor tiveram nove/29 registros. A estimativa preliminar de 431.520 comandos para o cenário informado não é uma garantia: `EVAL`, comandos internos, validação/negações, falhas, contenção, manutenção e abuso podem aumentar o consumo. A decisão de 2026-10-10 postergou a reconciliação mensal exata para acompanhamento. Conferir o painel Free durante a operação e aceitar pausa por cota; WAF por IP e quota Open-Meteo não estabelecem teto mensal agregado de comandos Redis.
- Confirmar plano/limites/região e procedimento de conferência do Free, sem upgrade automático. Usar alertas gratuitos onde disponíveis; alarme de orçamento pago não é requisito. Pausas por cota são aceitáveis, sem dispensar gates.

## WAF e headers

Regra nos **dois projetos**: path equals `/api` OR starts with `/api/`, IP Address, Fixed Window 60 s, limite 60, resposta 429. Conferir publicação efetiva em Review Changes. Reaproveitar ensaios já documentados; reconfirmar na revisão final. Ajustes temporários de limite precisam de escopo/restauração definidos pelo proprietário.

Para uma coleta necessária, usar rajada finita de busca inválida autorizada, evitando Open-Meteo. Separar chamadas permitidas, controles e amostra bloqueada. Monitor ativo/sem filtro precisa de controle positivo antes/depois; silêncio isolado não prova consumo zero. Correlacionar horários, contagens WAF e execução da Function. Se a janela renovar ou houver chamadas permitidas misturadas, registrar contaminação; não repetir por padrão. Não exportar argumentos Redis, chaves ou logs brutos.

API: `Cache-Control: private, no-store`; Function define `Vercel-CDN-Cache-Control: no-store`, consumido pela Vercel. Rewrite também define no-store e desabilita caching de rewrite. CDN MISS não prova hit/miss Redis. Web aplica CSP com `connect-src 'self'`, HSTS, referrer policy e nosniff; HTML/arquivos sem hash revalidam, somente assets Vite com hash recebem immutable. Verificar comportamento efetivo restante, sem relaxar headers/proteção.

## Privacidade e testes complementares

O transporte reconstrói GET/URL/opções pela allowlist dos dois hosts Open-Meteo, proíbe redirects e não copia headers do visitante. A identidade usa somente um IP válido de `x-vercel-forwarded-for`, HMAC temporário, normalização IPv6 /64 e TTL até o fim do minuto; ausência/ambiguidade nega com 503. Pré-limite em memória e Redis impõem 60/30/15; confiar na sobrescrita do header exige prova hospedada.

Para fechar somente a confiança contra falsificação da identidade em Preview protegido, usar `scripts/identity-probe.mjs` após conferir os dois deployments pareados e uma janela de minuto sem outras chamadas. Preparar fora do Git `PROBE_API_ORIGIN`, `PROBE_WEB_ORIGIN`, `PROBE_API_BYPASS`, `PROBE_WEB_BYPASS` e `IDENTITY_PROBE_CONFIRM=protected-preview`; os dois tokens autorizam os ingressos protegidos, e o bootstrap do web usa cookie somente em memória. Executar `node --env-file=<arquivo-privado> scripts/identity-probe.mjs` perto do início de um minuto. O probe envia até 47 consultas **inválidas**, sem saída Open-Meteo: 31 buscas diretas e 16 previsões pelo rewrite, com um IP sintético diferente em cada `x-vercel-forwarded-for`/`x-forwarded-for`. A resposta esperada é 30/15 erros JSON 400 seguidos por um 429 JSON da aplicação em cada caminho, com `private, no-store`. A regra WAF de 60 por projeto não deve disparar nesse volume isolado. O script interrompe se o minuto virar, uma resposta intermediária divergir ou a proteção bloquear; `inconclusive` ou `no_app_limit` **não** provam confiança. Mesmo um resultado positivo não demonstra atribuição correta de visitantes distintos nem equivalência de IP entre direto e rewrite; essas observações dependem de sinais da plataforma sem publicar IP. Registrar apenas revisão, data, caminho, resultado resumido e se houve tráfego concorrente, sem IP, headers, tokens, URLs ou digests. A documentação Vercel "Request headers" descreve `x-vercel-forwarded-for` como equivalente a `x-forwarded-for`; a observação hospedada continua necessária para esta topologia. Não repetir automaticamente se a janela estiver contaminada ou houver 429 do WAF.

A consulta de 2026-10-10 pela CLI autenticada confirmou `serverlessFunctionRegion=iad1` no projeto API, plano Hobby e um deployment Production Ready. `apps/api/vercel.json` não define override de região. A região corresponde a Washington, D.C., EUA; o `sandbox.region` do resumo CLI é outro campo e não foi usado para essa conclusão. A documentação de Runtime Logs da Vercel fixa uma hora de retenção no Hobby; esse prazo não cobre todos os registros da plataforma. Para encontrar a região no painel: **Settings → Functions → Function Regions**. O proprietário informou base Upstash na Virgínia do Norte, **Backups → Daily Backup** desativado e nenhuma retenção de logs ajustada por ele. Isso não exclui eventuais cópias internas do fornecedor; o aviso descreve os TTLs do aplicativo sem inventar prazo geral. Reconfirmar apenas se configuração, plano ou topologia mudarem; na revisão final, conferir que a interface mantém finalidade, transferência internacional, contato e o caminho de saída sem IP de visitante. Registrar somente região geográfica, opção/prazo constatado e data, sem valores operacionais.

Usar `docs/deploy/preview-probe-guide.md` apenas para a lacuna que exige nova coleta. A rodada normal já passou; Quick Tunnel bloqueou/modificou controles, deixando a amostra hospedada de privacidade parcial. A decisão do proprietário de 2026-10-10 aceita a saída sem IP pela revisão do transporte, apoiada pelas amostras existentes. Na revisão final, conferir que busca e previsão ainda usam esse transporte e que não há outro caminho para Open-Meteo. Não repetir o eco por padrão; mudança relevante no transporte/topologia exige reavaliação. A confiança no header de identidade permanece uma verificação separada nos caminhos direto e rewrite. Não publicar IP/canário/digest.

O teste de token inválido e recuperação já está no histórico. Não alterar Redis novamente por padrão. Falhas após o limitador, contagem independente de saída, reserva sob contenção e 429/circuit breaker são provas distintas; planejar fixtures/escopo antes de pedir uma rodada. Não provocar 429 da Open-Meteo real.

## Release, operação e rollback

1. Reaproveitar a revisão de privacidade, fundos/logo e termos/créditos no alcance registrado. Confirmar peso da previsão, custo Free e política Production antes da abertura; reconferir região e retenção apenas se a configuração ou o plano mudar. O proprietário pretende tornar o repositório público; confirmar acesso anônimo ao link da interface no release.
2. Conferir configuração Production, sem eco/segredos no web; executar gates finais locais/CI da revisão escolhida e smoke protegido. Confirmar que a revisão final mantém o transporte de saída aceito e registrar a prova separada de confiança da identidade. Gate ausente/falho continua aberto.
3. Ensaiar reversão de API e web para deployments existentes/verificados, com ordem e smoke dos dois caminhos. IDs/URLs/comandos com valores reais ficam no painel/registro privado; no Git, usar placeholders/resultados resumidos. Preservar formatos Redis; deployment API excluído não é destino de rollback.
4. Obter decisão explícita do proprietário para abertura pública. Após abertura, acompanhar categorias 503/negação, `upstream_rate_limited` versus limites próprios, cache hit/miss e consumo dos planos Free sem dados pessoais.

Se Redis/cota falhar, bloquear novas saídas e retornar erro seguro; health só indica que o processo responde. Se o eco revelar IP do visitante, interromper release e revisar transporte/topologia. Sem cobrança, retries em massa, supressões ou flexibilização de `CONSTRAINTS.md`.
