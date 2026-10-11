# Entrega Vercel + Upstash — estado e pendências

**Atualizado em 2026-10-10. Fonte única do progresso.** Specs definem contratos e gates; `tasks/vercel-plan.md` define a sequência aprovada; `docs/deploy/vercel-upstash-runbook.md` contém procedimentos; `docs/history/preview-evidence-2026-10.md` guarda as coletas datadas (consultar só a seção necessária; seus “próximos passos” não são tarefas).

## Resumo

- **Local:** P0 e P2–P9 implementados. Todos os gates locais passaram em 2026-10-10 (detalhes abaixo), com navegador Chromium do Fedora em vez do fixado pelo Playwright.
- **Preview:** protegido e funcional com dados reais; eco retirado; Redis preservado.
- **Production:** não validada; política própria ainda não configurada.
- **Publicação:** bloqueada até fechar as pendências abaixo e a decisão separada do proprietário.
- **Git:** branch de trabalho `chore/vercel-p1`, sincronizada com o remoto em `e9ba52e`; Quality gates verde nessa revisão, conferido pela API pública do GitHub em 2026-10-10. Previews dos dois projetos nessa revisão e site funcionando, por relato. Obter a revisão atual com `git rev-parse HEAD`, sem confundi-la com a revisão hospedada.

| Etapa | Estado |
|---|---|
| P0 — specs e fronteiras | Aprovada em 2026-10-04 |
| P2–P9 — implementação local | Concluídas; reconferir gates na revisão final |
| P1a — topologia, build, headers | Parcial: evidências de Preview existentes; conferência agrupada no release |
| P1b — Redis e cota | Aceita no alcance registrado; provas extensas em acompanhamento; peso da previsão confirmado (1,3) |
| P1c — WAF e custo Free | Aceita no alcance registrado; reconferir regra/plano no release |
| P1d — identidade e saída | Saída sem IP aceita; anti-spoof da identidade pendente (verificador pronto, não executado) |
| P10 — privacidade, direitos, termos | Concluída: revisados e repositório público |
| P11 — smoke, rollback, decisão | Aberto |

## Pendências bloqueantes — ordem para chegar à produção

1. **Fechar P1d — identidade anti-spoof.**
   - [ ] Conferir que o Preview dos dois projetos usa a revisão enviada, gerar novos tokens de automação da proteção (os anteriores foram revogados) num arquivo privado fora do Git e executar `scripts/identity-probe.mjs` conforme o runbook. Registrar o resultado resumido e revogar os tokens ao final. Não alterar Redis nem reabrir a rodada de eco.
2. **Preparar Production protegido.**
   - [ ] Aprovar tetos/custos com margem e configurar os oito campos de política em Production. Proposta apresentada ao proprietário em 2026-10-10; valores efetivos ficam no painel, fora do Git. Os registros mostram campos de créditos removidos de Production e erros antigos `application_environment`/500; não copiar a política Preview.
   - [ ] Conferir em Production `NODE_ENV`/`HOST`, Redis, HMAC, CORS, rewrite e ausência das variáveis de eco.
3. **Release (P1a/P1c agrupados + P11).**
   - [ ] Gates finais na revisão escolhida: `npm run check`, cobertura ≥80% por métrica/app, builds, E2E, axe, performance, audit, Gitleaks e CI em checkout limpo. A CI de `e9ba52e` passou; repetir somente se a revisão final mudar.
   - [ ] Conferência agrupada de P1a: versões dos dois builds, pareamento, rewrite, ausência de segredos no bundle, headers web/assets, CORS e caminhos HTTP sem evidência.
   - [ ] P1c: plano Free/Hobby sem cobrança/upgrade, rotina de acompanhamento de consumo/indisponibilidade e regras WAF ainda publicadas.
   - [ ] Confirmar que busca e previsão ainda usam o transporte de saída revisado.
   - [ ] Smoke protegido nos caminhos finais e ensaio de rollback dos dois projetos para deployments existentes/verificados (o deployment antigo da API foi excluído; não usá-lo).
   - [ ] Decisão explícita do proprietário sobre a abertura pública.

## Pendências de manutenção (não bloqueiam)

- [ ] Branches locais antigas: `fix/vercel-review-consistency` e `vercel-preview` (remotos removidos) e `p1a-preview` (anterior à reescrita do histórico). Avaliar remoção pelo proprietário.
- Após a abertura, acompanhar: 503, negações de cota, 429 externo, consumo dos planos Free, expiração de busca em 24 h, concorrência/atomicidade hospedadas e reconciliação mensal (postergados pela decisão abaixo).

## Concluído — reaproveitar as evidências

| Marco | Resultado registrado | Alcance e fonte |
|---|---|---|
| P0 e P2–P9 locais | Entrada Function, Redis, reserva, circuito, cache, HMAC, limites, rewrite, CI e ferramentas de teste | Código/testes; `docs/history/vercel-local-evidence-2026-10-06.md` |
| Gates locais 2026-10-10 | `npm run check` (535 API, 92 web, 3 fronteiras, 4 entrega, 25 ferramentas); cobertura API 94,95/91,99/94,78/97,97 e web 96,59/89,65/96,15/98,95 (statements/branches/functions/lines); builds; audit zero; Gitleaks sem achados; E2E (cinco testes), axe/contraste e performance (LCP ≈1,07 s, CLS 0) | Node 24.21.0, npm 12.0.2, Chromium Fedora 154 via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (download do Chromium fixado expirou). Não substitui CI nem vale para outra revisão |
| Preview funcional | Busca, seleção/previsão de sete dias e cache; CORS correto após ajuste de escopo | Coleta 2026-10-07; não recriar projetos nem repetir bootstrap |
| Revisão/CI e HTTP | CI de `ef9cda2` verde por relato; Previews `0c6d090` Ready/protegidos. Web: 200/400/404 JSON, no-store e CDN MISS | Coleta 2026-10-09; não extrapolar a revisões posteriores |
| Quota de Preview | `quota_denied` diagnosticado; custos/tetos conferidos em overrides Preview; reservas observadas | Coletas 2026-10-08/10; política Preview aprovada, Production não |
| Cache Redis | Nove registros de Monitor por hit e 29 por miss; hit sem nova reserva; previsão renovada após 10 min | Coleta WAF/Redis 2026-10-10; expiração de 24 h da busca não ensaiada |
| WAF nos dois projetos | `/api` OR prefixo `/api/`, 60 pedidos/60 s por IP, 429; bloqueio e recuperação nos dois caminhos | Coleta WAF/Redis 2026-10-10; não é auditoria de cobrança |
| Falha Redis e recuperação | Token inválido: health 200, rotas 503 na API e web; recuperação confirmada | Coleta 2026-10-10; URL inválida ensaiada por relato. Não alterar Redis de novo por padrão |
| Custo normal | Free/Hobby, sem método de pagamento. Cenário: 100 pessoas/dia, três buscas e uma previsão, 31 dias ≈ 431.520 registros (+20%) | Projeção preliminar, não capacidade comprovada |
| Rodada normal no eco | Oito perfis, 24 respostas 200, oito saídas, sem sentinelas; no-store/MISS | Ingresso alterou/bloqueou controles: privacidade parcial |
| Retirada das fixtures | Variáveis de eco removidas; API Preview redeployada; previsão real 200; proteção mantida | `CACHE_HMAC_KEY` da branch mantida; Redis intacto |
| Cliente web e 429 | Qualquer 429 vira `rate_limited` pelo status, inclusive HTML do WAF | `apps/web/src/api/http.ts`, commit `e0021b4`, com testes |
| Privacidade e ativos | Aviso atualizado; Function em `iad1` e plano Hobby pela CLI; Redis na Virgínia do Norte e backup diário desativado por relato; direitos dos fundos/logo revisados | `docs/history/preview-evidence-2026-10.md` e `docs/deploy/image-rights.md`. Reconfirmar se configuração/plano mudar |
| Peso Open-Meteo | Busca: uma chamada, peso 1,0. Previsão: 13 variáveis (5 atuais, 1 horária, 7 diárias), 7 dias, 1 local → 1,3 | Regra de contagem fracionária da página oficial *Open-Meteo Pricing*, consultada em 2026-10-10 (>10 variáveis e >2 semanas multiplicam), e parâmetros em `open-meteo-forecast.ts`. Limites gratuitos: 600/min, 5.000/h, 10.000/dia, 300.000/mês (mensal ainda não aplicado pelo provedor) |
| Revisão sincronizada e credenciais do eco | `chore/vercel-p1` enviada; Quality gates `success` em `e9ba52e`. Tokens de `.env.preview-probe` revogados e arquivo excluído pelo proprietário | CI conferida pela API pública do GitHub; revogação por relato; arquivo ausente conferido localmente |
| Repositório público | Link “Repositório no GitHub” da interface responde 200 sem autenticação | Conferido em 2026-10-10 |
| Verificador de identidade | `scripts/identity-probe.mjs` e quatro testes; procedimento no runbook | Preparado em 2026-10-10; execução hospedada pendente |

## Decisão aprovada em 2026-10-10 — simplificação de P1

Para o escopo informado (consulta pública de clima, cerca de 100 usuários/dia, Free Tier), a validação hospedada extensa de Lua/concorrência e a reconciliação mensal exata passam a acompanhamento. Permanecem: reserva atômica em quatro janelas, testes locais, WAF, privacidade, falha fechada, política Production e `CONSTRAINTS.md`. A projeção preliminar não vira garantia de capacidade.

| Item | Decisão | Justificativa |
|---|---|---|
| P1a: build/headers/CORS/bundle | Agrupado ao release | Testes de configuração/CORS e evidências existentes cobrem; uma conferência final evita duplicação |
| P1b: Lua real/concorrência/24 h | Acompanhamento | EVAL atômico documentado pela Upstash; testes locais e reservas observadas em Preview. Não afirmar prova hospedada |
| P1b: tamanho bruto | Aceito | Código rejeita corpo >65.536 bytes decodificados; testes de fronteira |
| P1c: reconciliação mensal | Acompanhamento | Estimativa dentro de 500 mil; pausas por cota aceitas |
| P1d: saída sem IP | Aceito | `open-meteo-transport.ts` reconstrói a requisição sem headers do visitante; amostra parcial de eco. Reavaliar só se transporte/topologia mudar |
| P1d: 429/WAF no cliente | Corrigido | Ver “Cliente web e 429” |

## Regras de retomada

- Preservar URL/token Redis, integração, HMAC e coletas suficientes. Não pedir nova troca de URL/token nem repetir falha equivalente; a restauração anterior foi trabalhosa para o proprietário.
- Não reiniciar eco/túnel nem seguir “próximo passo” de evidência antiga. `docs/deploy/preview-probe-guide.md` serve apenas a uma lacuna concreta.
- O proprietário conduz painéis e deployments; consultas à Vercel pela CLI foram autorizadas somente para leitura. Trabalho documental não autoriza publicação.
- Registrar resultados como observado, relato ou pendente. CI local, Ready, `/health` e scanner limpo não substituem os outros gates.
