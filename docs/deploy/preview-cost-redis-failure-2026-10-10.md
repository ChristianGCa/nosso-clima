# Preview — consumo e falha Redis em 2026-10-10

Continuação da evidência `preview-waf-redis-2026-10-10.md`. O progresso vigente fica em `tasks/vercel-todo.md`; este registro não conclui P1 nem aprova publicação.

## Fonte e alcance

O proprietário operou Vercel, Upstash e navegador, fornecendo capturas, respostas HTTP e mensagens selecionadas da Function. O agente analisou os resultados e o código, consultou documentação oficial e preparou esta atualização documental. O checkout começou limpo em `chore/vercel-p1`, revisão local `1235d44`.

O SHA, as versões de build e o pareamento dos deployments posteriores à alteração do token não foram reconfirmados pelo agente. As respostas foram fornecidas pelo proprietário nos aliases de Preview da branch; não atribuir automaticamente os novos ensaios ao SHA dos deployments conferidos anteriormente. Não houve nova consulta CLI aos projetos, operação de painel pelo agente, alteração de runtime ou publicação.

## Plano e consumo exibidos

| Conferência nas capturas | Resultado | Alcance |
|---|---|---|
| Upstash / Vercel | Free / Hobby | Planos exibidos durante a coleta |
| Região | Primária AWS `us-east-1`, sem região adicional listada em Manage Regions | Configuração exibida, sem inferir réplicas pelo selo Global |
| Comandos | 4.577 leituras e 3.915 escritas: 8.492 de 500.000/mês, cerca de 1,7% | Snapshot; período exato do contador não obtido |
| Banda / armazenamento / custo | 2 MB / 15 KB / US$ 0 | Valores exibidos, sem projeção de banda ou armazenamento |
| Integração na Vercel | Banco Free e Available; nenhum método de pagamento configurado para a integração | Nenhuma opção de upgrade automático apareceu nas telas fornecidas; ausência de pagamento não é auditoria de todas as políticas de cobrança |

Na tentativa de medir uma busca inválida isolada, o baseline era de 4.578 leituras e 3.915 escritas. Os contadores ficaram iguais após o 400 e nas capturas posteriores, inclusive depois da espera sugerida. A comparação mensal foi inconclusiva; não comprova custo zero nem identifica o prazo de atualização desses contadores.

O Monitor ativo do mesmo banco mostrou a chamada com 400 e seis registros: um `EVAL`, um `TIME`, dois `GET` e dois `SET`, correspondentes ao limitador compartilhado. Isso confirma o caminho até o banco observado, sem estabelecer isoladamente a unidade aplicada ao contador mensal.

## Dimensionamento preliminar aceito

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

## Ensaio de token inválido e recuperação

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

## Continuidade

O proprietário pediu verificações agrupadas e documentação sem novos links, pois os projetos hospedados podem ser excluídos; as preferências persistentes estão em `AGENTS.md`. Preparar o mecanismo de eco controlado e os ensaios de concorrência antes de pedir outra rodada nos painéis. O transporte atual reconstrói a saída sem headers do visitante, mas isso não substitui a prova hospedada de IP/canário; o mecanismo de eco não está implementado na entrada atual.

Permanecem a reconciliação de consumo e o cenário adversarial, os demais caminhos de falha/TTL/contenção, a amostra bruta de previsão de até 64 KiB, headers/CDN, identidade/saída, Production, privacidade, direitos, gates finais e rollback. Não presumir autorização pública ou gate concluído a partir da aceitação de pausas.

## Verificação desta atualização documental

Com Node 24.21.0 e npm 12.0.2, `npm run check` passou: tipos, lint, formato, 505 testes API, 90 web, três testes de fronteiras e quatro de configuração de entrega. Os cálculos foram conferidos; as seis referências novas por nome de arquivo têm destino existente. A revisão do conteúdo adicionado encontrou zero novos links e zero correspondências nos padrões selecionados de URLs operacionais, IPv4, UUID, digest hexadecimal de 64 caracteres, chave privada e JWT. Essa busca específica não substitui Gitleaks. O diff foi revisado; não houve alteração de código, dependências ou constraints.

Cobertura, builds, navegador, performance, auditoria de dependências, Gitleaks e CI hospedada não foram reexecutados nesta atualização exclusivamente documental; seus resultados anteriores não são apresentados como novos gates.
