# Rodada agrupada P1 — eco protegido

Preparação de 2026-10-10. Este guia executa parte das pendências de `tasks/vercel-todo.md`; não constitui evidência hospedada nem autorização de publicação. O proprietário conduz configurações e deployments. Manter todos os valores operacionais fora do Git.

**Uso após a rodada já concluída:** oito perfis normais passaram e o modo de eco foi retirado do Preview. Não iniciar este roteiro por padrão nem trocar URL/token Redis para repetir o teste de falha já documentado. Consultar a lista ativa e definir uma lacuna concreta antes de montar outro ensaio; o Quick Tunnel usado não fechou a prova de privacidade.

## Preparar uma vez

1. Usar uma branch/override de Preview isolado e conferir proteção dos dois projetos. Preservar o cadastro original de `CACHE_HMAC_KEY` sem editar seu valor: variáveis Sensitive não são legíveis após criação. Se a chave original é geral de Preview, criar outro cadastro com o mesmo nome, um novo segredo e escopo somente na branch do ensaio. Ao encerrar, remover apenas esse override para voltar à chave geral; não é necessário conhecer o segredo original. Se já existir uma chave específica na mesma branch, não sobrescrevê-la: escolher outra branch isolada e conferir o pareamento e todas as variáveis necessárias, inclusive a política provisória aprovada. Fixtures também passam pelos caches normais; não misturá-las com dados reais. A cota e os circuitos continuam compartilhados conforme o namespace existente; não apagar suas chaves para obter aprovação.
2. Gerar um token temporário com `openssl rand -hex 32` e um canário sintético diferente. Salvar valores em um arquivo local `.env.preview-probe`, ignorado pelo Git e com acesso restrito. Não colar valores em mensagens, evidências, comandos versionados ou capturas. `UPSTREAM_TEST_TOKEN` deve ser sensível na API, exclusivo desse ensaio e nunca cadastrado no web.
3. No arquivo privado, configurar `UPSTREAM_TEST_TOKEN`, `PROBE_CANARY`, `PROBE_VISITOR_IPS` (IPv4/IPv6 públicos da máquina que executará o probe, conhecidos pelo proprietário; somente em memória no receptor), `PROBE_ECHO_PORT` (opcional, padrão 8787), `PROBE_CONFIRM_PREVIEW=isolated-fixtures` e `PROBE_SCENARIO=normal`. O IP de documentação usado para falsificação é observado automaticamente. Não descobrir IP de visitantes reais nem usar consultas de produção.
4. Iniciar o receptor na raiz:

```bash
node --env-file=.env.preview-probe scripts/preview-echo.mjs
```

Ele escuta apenas loopback. Exige token em todas as rotas, não imprime requisições e devolve fixtures, não dados atuais. O total de chamadas ao provedor simulado é limitado a 200 por processo. Relatórios e calibração não gastam essa contagem. Encerrar o processo descarta contagens e indicadores.

## Entrada HTTPS temporária

O `cloudflared` 2026.9.3 já estava instalado na máquina analisada. Para testes, o Quick Tunnel permite uma origem HTTPS temporária sem conta ou domínio. Em outro terminal, usar:

```bash
cloudflared tunnel --config /dev/null --no-autoupdate --protocol http2 --url http://127.0.0.1:8787
```

Não habilitar debug, export de requests ou logs com headers/query. A saída de inicialização contém a origem temporária e identificadores operacionais: mantê-la fora do Git. Não usar autenticação interativa por email, pois a Function não executa login de navegador; o token do receptor protege os dados e controles. O hostname muda ao reiniciar o túnel e não tem garantia de disponibilidade. A topologia pública continua Vercel + Upstash; o túnel não será parte do produto.

O túnel termina TLS na Cloudflare e pode sobrescrever/remover headers de IP. A calibração verifica sete headers com um IP sintético e um canário. Se algum header não for preservado, o relatório usa `partial_ingress_overwrites_headers`: a rodada ainda pode medir cache, chamadas e falha fechada, mas não fecha a prova completa de privacidade. Para essa conclusão, usar um receptor HTTPS controlado com ingresso calibrado que preserve os campos avaliados. Não atribuir ausência de um valor removido pelo proxy à segurança da API.

A calibração primeiro confirma acesso autenticado e canário sem headers de IP, depois testa cada header individualmente. O `Forwarded` usa sintaxe `for=`, e o controle de `cf-connecting-ipv6` usa IPv6 sintético. Um 403 exclusivamente no controle de um header fica registrado em `calibration.statuses`, com indicador falso e `partial_ingress_blocks_controls`; não invalida as outras amostras nem conclui privacidade. Falha na chamada inicial sem headers de IP continua interrompendo o ensaio. Em 2026-10-10, a coleta do agente confirmou 200 no relatório e nos demais controles individuais, mas 403 no controle `cf-connecting-ip`, sem consultas meteorológicas ou alteração de painel.

Fontes oficiais consultadas em 2026-10-10: Cloudflare Docs, Quick Tunnels; Cloudflare Fundamentals, Cloudflare HTTP headers; Node.js v24.21.0, HTTP. São referências por título, sem novos hyperlinks.

## Parear Preview e executar

1. No projeto API, apenas no override isolado de Preview, definir `UPSTREAM_TEST_BASE` com a origem HTTPS temporária e `UPSTREAM_TEST_TOKEN` com o token do receptor. Conferir Redis/HMAC, orçamento provisório já aprovado e origem CORS, sem copiar valores para a documentação. Redeployar a API; parear o web à mesma revisão/ambiente e manter a proteção.
2. Completar no arquivo privado `PROBE_API_ORIGIN` e `PROBE_WEB_ORIGIN` com as origens correspondentes, `PROBE_REPORT_ORIGIN` com a origem loopback do receptor e `PROBE_INGRESS_ORIGIN` com a origem HTTPS usada em `UPSTREAM_TEST_BASE`. Os destinos públicos exigem HTTPS raiz. Se necessário, usar `PROBE_API_BYPASS` e `PROBE_WEB_BYPASS` para os respectivos tokens de automação da proteção Vercel, exclusivamente no arquivo privado. O executor não envia esses tokens ao eco e não segue redirects. Um 302/401 não é resultado da aplicação: resolver o acesso autorizado, mantendo a proteção.
3. Reservar uma janela de minuto sem uso da UI. A rodada normal faz 26 pedidos à API: duas entradas inválidas e, em cada caminho/serviço, uma consulta fria com repetição e quatro chamadas concorrentes da mesma chave. São até oito chamadas ao eco sem falhas. Repetições de rodada compartilham os limites por visitante; não executá-las no mesmo minuto se isso exceder os tetos.
4. Deixar o Monitor Redis aberto uma vez para a rodada inteira e executar:

```bash
node --env-file=.env.preview-probe scripts/preview-probe.mjs
```

O executor primeiro calibra o ingresso e verifica a marca `x-nosso-clima-preview-upstream: echo-v1` em entradas inválidas dos dois caminhos. Sem essa marca, interrompe antes das consultas válidas. Queries sintéticas únicas e coordenadas de teste reduzem reutilização de caches anteriores. Em sucesso, cada perfil deve produzir uma chamada recebida pelo eco, 200 JSON, `private, no-store` e CDN `MISS`. Uma divergência encerra a rodada com amostras resumidas; não interpretar erro genérico de acesso como falha da aplicação.

O resumo não contém URLs, IPs, tokens, queries, coordenadas ou request IDs. `ok` significa que as amostras do perfil passaram, não que P1 está concluída. `multipleInstances`, `atomicQuota` e `identityTrust` ficam `not_proven`: quatro chamadas concorrentes não comprovam distribuição entre Functions, atomicidade sob contenção real nem impossibilidade de falsificar o header de identidade.

Nos dois projetos protegidos, o web e a API exigem autorizações distintas. O executor usa o token do web uma vez no HTML, com `x-vercel-set-bypass-cookie: true`, lê o cookie do redirect sem segui-lo e o mantém somente em memória, restrito à origem web. Nas rotas reescritas, envia esse cookie para autorizar o ingresso web e o token da API em `x-vercel-protection-bypass` para autorizar o destino. O token do web não pode substituir o da API no rewrite. Cookie e tokens não entram no resumo, no eco ou nos requests diretos da API. Falha ao obter o cookie interrompe antes das consultas válidas; não desabilitar Deployment Protection para fazer o teste passar.

Interrupções informam somente código fixo, etapa, caminho, status HTTP e nome de variável quando aplicável. `protected_access` indica redirect/401/403 no caminho de Preview e exige conferir o acesso autorizado; `fixture_marker_missing` exige conferir a revisão/configuração do eco. Erros desconhecidos não exibem mensagem bruta. Reiniciar somente o processo de eco após alterações em `preview-echo.mjs`, mantendo o túnel aberto para preservar a origem temporária.

## Falha fechada e demais controles

Decisão do proprietário nesta continuação de 2026-10-10: preservar a configuração Redis e não retomar alterações de URL/token agora. Ele informou que já havia ensaiado URL inválida e que a restauração foi trabalhosa. O ensaio documentado de token inválido e sua recuperação continuam válidos no alcance registrado em `docs/history/preview-evidence-2026-10.md`. Reaproveitar essas evidências; a falta de contagem independente de saída nesse ensaio permanece explicitada e não autoriza uma repetição automática da rodada. Nenhum gate ou constraint foi dispensado.

Após a rodada normal, esperar a próxima janela de visitante. O perfil `PROBE_SCENARIO=fail_closed` exige 503 nas consultas válidas e zero chamadas novas no eco. Usá-lo durante uma falha Redis ou negação de cota planejada pelo proprietário, mantendo o receptor em modo normal. Registrar qual falha foi induzida e o alcance: falha no limitador não comprova falha após a reserva.

A proposta de nova falha de conexão por URL inválida foi retirada da sequência ativa após esse pedido. O perfil fail_closed continua disponível para uma falha efetivamente existente ou um ensaio futuro definido pelo proprietário, com escopo e restauração concretos; não alterá-lo para obter um resultado verde com a API saudável. Prosseguir agora apenas com trabalho independente de alterações Redis.

O receptor também aceita POST autenticado em `/__probe/config`, corpo JSON com somente `mode`: `normal`, `rate_limited`, `oversized` ou `timeout`. Os controles não zeram contagens nem indicadores de vazamento. Para 429/circuit breaker, usar uma chave fria, comparar a contagem antes/depois, confirmar 503 seguro, uma saída no primeiro pedido e nenhuma no próximo miss do mesmo serviço. Retornar o eco a normal, respeitar o cooldown efetivo e confirmar uma saída controlada na reabertura. O probe agrupado normal não roda nesses modos.

Para contenção de reserva, preparar no Preview isolado um teto aprovado que comporte apenas parte de poucos misses distintos simultâneos; conferir as quatro janelas no Monitor e o número de chamadas recebidas, sem zerar reservas ou provocar bloqueio Open-Meteo. Associar a coleta aos eventos e aos deployments executados. Um teste com teto folgado e deduplicação da mesma chave não substitui esse ensaio.

O modo oversized testa a rejeição do limite de leitura, e timeout testa o estado indisponível. O tamanho da fixture não mede o corpo real da Open-Meteo: a amostra bruta real de até 64 KiB, expiração de busca, demais falhas/TTL e reconciliação de consumo continuam pendentes. Quantidade de linhas do Monitor não é automaticamente quantidade de comandos mensais faturáveis.

## Encerrar e registrar

Restaurar o Preview funcional: remover `UPSTREAM_TEST_BASE` e `UPSTREAM_TEST_TOKEN` do escopo de ensaio e somente o override temporário de `CACHE_HMAC_KEY`, preservando a variável original. Restaurar qualquer política temporária, redeployar a API e conferir o pareamento do web. Confirmar ausência da marca de eco. Não promover o deployment de fixtures nem copiar as variáveis de teste para Production. Encerrar eco/túnel e invalidar token e bypass temporários quando aplicável.

Registrar somente revisão, data, perfil, status, contagens e indicadores anonimizados na lista ativa/evidência. Não salvar logs do túnel/Monitor, arquivos privados ou respostas brutas no repositório. Concluir cada gate apenas com as provas que realmente o cobrem. Production, privacidade final, direitos, custo Free, gates finais e rollback permanecem na sequência vigente.
