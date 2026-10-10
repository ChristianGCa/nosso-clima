# Entrega Vercel + Upstash — estado e pendências

**Atualizado em 2026-10-10. Fonte única do progresso.** P0/P2–P9 implementadas localmente; P1 parcial; P10–P11 abertos. Preview protegido e funcional, com modo de eco retirado. Production não está validada para abertura pública. Branch de trabalho: `chore/vercel-p1`; obter a revisão atual com `git rev-parse HEAD`, sem confundi-la com a revisão hospedada.

Specs definem contratos e gates; `tasks/vercel-plan.md` define a sequência aprovada; `docs/deploy/vercel-upstash-runbook.md` contém procedimentos. As seis coletas datadas estão consolidadas em `docs/history/preview-evidence-2026-10.md`. Consultar somente a seção necessária: as instruções antigas de retomada desse histórico não são tarefas atuais.

## Concluído — reaproveitar as evidências

| Marco | Resultado registrado | Alcance e fonte |
|---|---|---|
| P0 e P2–P9 locais | Specs aprovadas, entrada Function, Redis, reserva, circuito, cache, HMAC, limites, rewrite, CI e ferramentas de teste implementados | Código/testes presentes; evidência local em `docs/history/vercel-local-evidence-2026-10-06.md`. Implementação concluída não significa gates atuais verdes |
| Preview funcional | Busca, seleção/previsão de sete dias e cache funcionando; CORS permitido após correção de escopo e redeploy | Coleta 2026-10-07; não recriar projetos nem repetir bootstrap |
| Revisão/CI e HTTP | CI de `ef9cda2` verde por relato; Previews `0c6d090` Ready/protegidos confirmados pela CLI. Web: 200/400/404 JSON, no-store e CDN MISS, inclusive sem Disable cache | Coleta 2026-10-09; não extrapolar a revisões posteriores. Matriz final ainda pendente |
| Quota de Preview | `quota_denied` diagnosticado; seis campos de custo/tetos conferidos em overrides Preview e reservas observadas após redeploy | Coletas 2026-10-08/10. Peso estimado 1,3 para previsão com 13 variáveis; política conservadora Preview aprovada, sem aprovar Production |
| Cache Redis | Busca/previsão: nove registros de Monitor por hit e 29 por miss; hit sem nova reserva. Previsão reutilizada antes de 10 min e renovada depois | Coleta WAF/Redis 2026-10-10. TTL busca 24 h gravado, expiração não ensaiada; registros não equivalem automaticamente a comandos mensais |
| WAF nos dois projetos | Regra publicada: `/api` OR prefixo `/api/`, 60 pedidos/60 s por IP, 429. Bloqueio e recuperação observados nos dois caminhos | Coleta WAF/Redis 2026-10-10; amostras isoladas sem execução registrada da Function nem atividade Redis, com controles. Não é auditoria de cobrança |
| Falha Redis e recuperação | Token inválido: health 200, rotas limitadas 503 na API e web; `visitor_limit_unavailable` correlacionado em busca inválida. Recuperação da busca confirmada pelo proprietário | Coleta consumo/falha 2026-10-10. URL inválida também ensaiada, segundo relato posterior. Sem contagem independente de saída; não conclui falhas após o limitador |
| Custo normal e planos | Free/Hobby exibidos; integração sem método de pagamento. Cenário aceito: 100 pessoas/dia, três buscas e uma previsão, 31 dias; todos misses +20% estimados em 431.520 registros | Coleta consumo/falha 2026-10-10. Projeção preliminar, não capacidade comprovada; pausas por cota aceitas, sem cobrança/upgrade |
| Rodada normal no eco | Oito perfis passaram: 24 respostas 200 e oito saídas; cache/deduplicação na amostra direta e reescrita; no-store/MISS | Coleta ferramentas/eco 2026-10-10. Ingresso alterou/bloqueou controles: privacidade parcial; instâncias, atomicidade e identidade não comprovadas |
| Retirada das fixtures | Quatro cadastros `UPSTREAM_TEST_BASE`/`UPSTREAM_TEST_TOKEN` removidos; API Preview redeployada. Health 200; validação 400 direta/rewrite; previsão real 200 com sete dias e sem marca de eco; proteção mantida | Última seção da coleta ferramentas/eco. `CACHE_HMAC_KEY` da branch mantida porque não havia fallback; Redis não foi alterado. Busca de smoke retornou zero resultados, sem provar seleção na UI |

## Regras de retomada

- Preservar URL/token Redis, integração, HMAC e coletas suficientes. Não pedir nova troca de URL/token ou repetir falha equivalente por padrão; a restauração anterior foi trabalhosa para o proprietário.
- Não reiniciar eco/túnel nem seguir “próximo passo” de evidência antiga automaticamente. `docs/deploy/preview-probe-guide.md` é ferramenta para uma pendência concreta, não a sequência atual obrigatória.
- O proprietário conduz painéis/deployments. Autorizações de edição CLI registradas em sessões antigas foram específicas; este pedido autoriza análise e organização documental, não publicação.
- Registrar resultados como observado, relato ou pendente. CI local, Ready, `/health` e ausência de achados do scanner não substituem os outros gates.

## Pendências bloqueantes — ordem para chegar à produção

1. **Pacote que pode avançar sem alterar Redis.**
   - [ ] Finalizar aviso de privacidade: confirmar retenção/região da Vercel, Upstash e Open-Meteo, transferências, finalidades e contato. O texto básico já existe em `apps/web/src/components/site-information.tsx`; revisar/completar, não recriar do zero.
   - [ ] Concluir direitos em `docs/deploy/image-rights.md`: origem Gemini/Claude e decisão de uso dos fundos já registradas; faltam revisão final, relação entre variantes/exportações e créditos aplicáveis. MIT cobre código, não automaticamente imagens/dados.
   - [ ] Confirmar termos/atribuição e situação do repositório: a UI já tem créditos e link GitHub; se continuar privado na publicação, esse link não ficará acessível a visitantes.
2. **Fechar P1 por lacuna concreta, reaproveitando o que existe.**
   - [ ] P1a — conferência de release: versões dos dois builds, revisão/pareamento, ambiente/rewrite e ausência de segredos no bundle. Agrupar os headers web/assets, CORS e caminhos HTTP ainda sem evidência com o smoke final do item 3; não criar outra rodada completa de Preview. Sucessos/erros no-store/MISS já registrados não são tarefas novas.
   - [ ] P1b — prioridade técnica: executar os scripts Lua reais de reserva e circuito com casos limitados de concorrência, negação, transição das quatro janelas e cooldown/reabertura. Os testes atuais simulam `eval`; contagem de pedidos da mesma chave não valida esses algoritmos. TTL, tamanho e falhas já têm cobertura local; a confirmação hospedada restante e a medida de tamanho exigidas pela spec continuam abertas até a decisão de simplificação abaixo. Preservar Redis funcional, sem nova troca de URL/token.
   - [ ] P1c — controle gratuito: confirmar plano/upgrade/cobrança e rotina de acompanhar consumo/indisponibilidade; conferir que as regras WAF já ensaiadas continuam publicadas na revisão final. A reconciliação mensal de `EVAL`/Lua e projeção adversarial continuam exigidas pelo plano vigente; há proposta abaixo para tratá-las como acompanhamento, sem promessa de capacidade contínua.
   - [ ] P1d — privacidade: completar saída sem IP/canário e anti-spoof nos caminhos direto/rewrite, nas duas rotas, com ingresso calibrado e contagem de saídas. Ausência de identidade já tem teste local; HTTP sem header enviado pelo cliente não prova ausência na Function, pois a plataforma acrescenta headers. Reaproveitar testes de 429/falha segura e fechar o Lua real do circuito em P1b; não duplicar esse ensaio nem provocar bloqueio da Open-Meteo.
3. **Preparar e verificar Production protegido.**
   - [ ] Aprovar política própria e configurar ambiente: últimos registros mostram seis campos gerais de créditos removidos de Production e erros antigos `application_environment`/500. O código exige oito valores explícitos de política fora de Preview. Conferir `NODE_ENV`/`HOST`, Redis, HMAC, CORS, rewrite e ausência das variáveis de eco; não copiar a política Preview por suposição.
   - [ ] Obter gates finais na revisão escolhida: `npm run check`, cobertura ≥80% em cada métrica/app, builds, E2E, axe, performance, audit, Gitleaks e CI em checkout limpo. Última tentativa E2E local não iniciou por download do Chromium; resultados verdes de 2026-10-07 não encerram a revisão atual.
   - [ ] Fazer smoke protegido e prova de privacidade nos caminhos finais; ensaiar rollback dos dois projetos para deployments existentes/verificados. O deployment antigo da API foi excluído; não usá-lo como destino. Preservar formatos Redis versionados.
   - [ ] Registrar decisão explícita de abertura pública após os gates; acompanhar 503, negações, 429 externo e consumo Free. Pausas aceitas não dispensam privacidade/publicação.

## Problema de interface a decidir no módulo correto

- [x] `apps/web/src/api/http.ts` classificava 429 como `rate_limited` somente com JSON `RATE_LIMITED`. Corrigido em 2026-10-10: qualquer 429 é `rate_limited` pelo status code, cobrindo WAF com HTML. Testes adicionados para 429 com HTML e JSON quebrado.

## Decisão aprovada em 2026-10-10 — simplificação de P1

O proprietário aprovou a análise de segurança e prontidão que classificou a postura como excelente e os TODOs P1b/P1c como exagerados para o escopo (consulta pública de clima, ~100 usuários/dia, Free Tier). `CONSTRAINTS.md`, privacidade, reserva obrigatória, falha fechada e proibição de cobrança permanecem integrais.

| Item | Decisão | Justificativa |
|---|---|---|
| P1a: build/headers/CORS/bundle | Agrupado ao release: `npm run check` + coverage + builds + audit + gitleaks na revisão final | Testes de configuração/CORS e evidências existentes cobrem; uma conferência agrupada elimina duplicação |
| P1b: Lua real/concorrência/24h | Postergado para acompanhamento | Upstash documenta atomicidade do EVAL (key-based locking); testes unitários cobrem lógica; Preview observou comportamento real. Overengineering para ~100 users/dia |
| P1b: tamanho bruto | Aceito | Código conta bytes decodificados e rejeita >65.536; testes aceitam limite/rejeitam excesso; previsão real retornou 200 |
| P1c: reconciliação mensal | Postergado para acompanhamento | Estimativa de 431k dentro de 500k; pausas aceitas; acompanhar painel da Upstash ocasionalmente |
| P1d: saída sem IP | Aceito pelo código | `open-meteo-transport.ts` reconstrói request do zero sem headers do caller; verificável por leitura |
| P1d: 429/WAF | Corrigido | `http.ts` agora classifica qualquer 429 como `rate_limited` pelo status code, independente do body |

## Auditoria documental de 2026-10-10

- Seis relatos em `docs/deploy/` tinham retomadas sucessivas, algumas superadas. Foram consolidados em um histórico, com aviso explícito; lista ativa e runbook perderam instruções de bootstrap/ensaios já cumpridos. Specs foram alinhadas às evidências recentes sem alterar critérios de aceite; nenhuma constraint foi enfraquecida.
- Gitleaks 8.30.1: histórico Git completo consultado, 127 commits, sem achados sob a exceção existente em `CONSTRAINTS.md`; arquivos destinados ao Git também sem achados. Binário conferido contra o pacote com checksum usado na CI. Nenhuma nova exceção/supressão.
- Scan da árvore local: dois achados somente em `.env.preview-probe`, ignorado e não rastreado. São credenciais locais do ensaio, não vazamento detectado na documentação. Tokens de automação não foram revogados na limpeza anterior; avaliar revogação ao encerrar seu uso. Esse arquivo informa modo de acesso 0777 neste volume; o resultado não comprova acesso restrito. Guardar credenciais em local privado com permissões efetivas, sem copiar valores ao Git ou reativar ensaios.
- Padrões selecionados nos Markdown não encontraram hosts operacionais Vercel/Upstash/túnel, JWTs, chaves privadas, UUIDs, IDs de infraestrutura ou digests de 64 caracteres. IPv4 encontrados eram exemplos locais/bind; o contato público já aprovado é dado pessoal intencional. Nomes de variáveis, versões, SHAs Git e exemplos públicos do contrato não são credenciais.
- Não houve nova coleta hospedada, mudança de runtime, Redis, deployment, dependências ou publicação nesta organização. Não foi feita nova conferência dos termos/painéis dos fornecedores; registros datados mantêm seu alcance.


## Verificação desta organização

- 28 documentos Markdown passaram a 23; seis relatos viraram um histórico. Conteúdo de cada relato comparado com a versão original: preservado, exceto apresentação de referências/níveis dos títulos. Nenhum hyperlink novo; destinos locais e âncoras restantes conferidos.
- Node 24.21.0 e npm 12.0.2: tipos, lint, formato, 535 testes API, 90 web, três testes de fronteiras e quatro de configuração de entrega passaram em `npm run check`. O teste de eco HTTP foi bloqueado pelo sandbox com EPERM no loopback; `npm run test:preview-tools` reexecutado com autorização fora do sandbox passou com 21 testes. Nenhum teste foi alterado/suprimido.
- `git diff --check` passou; somente Markdown foi alterado e `CONSTRAINTS.md` permaneceu intacto. Gitleaks do histórico e do snapshot dos arquivos destinados ao Git passou; o arquivo privado ignorado não foi incluído nesse snapshot, sem esconder os dois achados locais registrados acima.
- Cobertura, builds, browser E2E/axe, performance, auditoria de dependências e CI hospedada não foram reexecutados nesta mudança exclusivamente documental. Os gates de release continuam pendentes na revisão final; estas verificações não afirmam prontidão para produção.
