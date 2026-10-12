# Entrega Vercel + Upstash — estado e pendências

**Atualizado em 2026-10-12. Fonte única do progresso.** Specs definem contratos e gates; `tasks/vercel-plan.md` define a sequência aprovada; `docs/deploy/vercel-upstash-runbook.md` contém procedimentos; `docs/history/preview-evidence-2026-10.md` guarda as coletas datadas (consultar só a seção necessária; seus “próximos passos” não são tarefas).

## Resumo

- **Local:** P0 e P2–P9 implementados. Todos os gates locais passaram em 2026-10-10 (detalhes abaixo), com navegador Chromium do Fedora em vez do fixado pelo Playwright.
- **Preview:** protegido e funcional com dados reais; eco retirado; Redis preservado.
- **Production:** pública desde 2026-10-12. Ativa em `8194c92` nos dois projetos, com smoke público aprovado (incluindo a busca “Belém”) e CI verde; destino de rollback em `7ed53e2`, anterior à correção da busca. O proprietário mantém só esses dois deployments Production em cada projeto e exclui os novos gerados por commits só de documentação.
- **Publicação:** aberta em 2026-10-12 por decisão do proprietário. Proteção “Standard” (domínios de Production públicos; Previews e URLs de deployment protegidos); smoke público aprovado.
- **Git:** trabalho integrado à `main` pelos PRs #2 a #6, com CI verde em todos. **Todo commit na `main` gera deployments Production**, mesmo quando só a documentação muda. Obter a revisão atual com `git rev-parse HEAD`, sem confundi-la com a revisão hospedada.

| Etapa | Estado |
|---|---|
| P0 — specs e fronteiras | Aprovada em 2026-10-04 |
| P2–P9 — implementação local | Concluídas; reconferir gates na revisão final |
| P1a — topologia, build, headers | Concluída: conferência agrupada em Production (2026-10-12) |
| P1b — Redis e cota | Aceita no alcance registrado; provas extensas em acompanhamento; peso da previsão confirmado (1,3) |
| P1c — WAF e custo Free | Concluída: plano Hobby sem pagamento e WAF ativa reconferidos em 2026-10-12 |
| P1d — identidade e saída | Concluída: saída sem IP aceita; identidade resistiu à falsificação nos dois caminhos em Preview |
| P10 — privacidade, direitos, termos | Concluída: revisados e repositório público |
| P11 — smoke, rollback, decisão | Concluída: smoke protegido, rollback ensaiado, abertura e smoke público em 2026-10-12 |

## Pendências bloqueantes — ordem para chegar à produção

1. **Preparar Production protegido.**
   - [x] Política Production aprovada pelo proprietário em 2026-10-10 (tetos bem abaixo dos limites gratuitos, porque o IP de saída da Vercel é compartilhado) e cadastrada; valores efetivos ficam no painel, fora do Git.
   - [x] Variáveis de Production conferidas pela CLI em 2026-10-10, somente nomes/escopos: API com `NODE_ENV`, `HOST`, `UPSTASH_REDIS_REST_URL`/`TOKEN` (copiados do endpoint REST da integração), duas chaves HMAC, CORS e oito campos de política; web com `API_ORIGIN`. CORS/`API_ORIGIN` separados entre Preview e Production; sem variáveis de eco. Domínios de Production renomeados pelo proprietário; os antigos redirecionam. Preview e Production compartilham a base Upstash Free e, portanto, a reserva de cota.
   - [x] `chore/vercel-p1` integrada a `main` pelo PR #2 (merge `1e49054`). Quality gates `success` na `main` e no PR (`b2412ac`), conferidos pela API pública do GitHub. API e web Production Ready em `1e49054`, protegidos; smoke ainda não executado.
   - [x] Destino de rollback definido em 2026-10-12: o proprietário reimplantou os dois projetos e excluiu os deployments sem configuração confiável. Cada projeto mantém dois deployments Production Ready em `1e49054` com a mesma configuração; o par anterior (de 2026-10-10) é o destino de rollback. Atualizado após o merge do PR #3: ativo `64c84ec` (12/10 12:08) nos dois projetos; destino de rollback em `1e49054`, API de 12/10 11:27 e web de 10/10 22:58, ambos ativos em algum momento do ensaio. Os demais deployments Production foram excluídos pelo proprietário. Após o merge do PR #4, o estado atual está no resumo acima.
2. **Release (P1a/P1c agrupados + P11).**
   - [x] Gates finais na revisão hospedada `1e49054`: check-run `verify` da CI em `success` (checkout limpo, Chromium fixado; `npm run check`, cobertura, audit, axe, E2E, performance e Gitleaks), conferido pela API pública do GitHub em 2026-10-12. Builds Vercel dos dois projetos concluídos. Repetir somente se a revisão hospedada mudar.
   - [x] Conferência agrupada de P1a em 2026-10-12: Node 24.21.0/npm 12.0.2 nos dois builds de `1e49054`; rewrite do web aponta para a API Production; bundle sem nomes ou valores de credenciais nem domínio da API; headers de HTML, assets e arquivos estáticos; CORS e caminhos HTTP do smoke.
   - [x] P1c em 2026-10-12: conta e time em Hobby, sem trial, sem método de pagamento e sem bloqueio; regra WAF ativa nos dois projetos (`/api` OU prefixo `/api/`, 60/60 s por IP, janela fixa). A rotina de acompanhamento após a abertura está no runbook (Release, item 4).
   - [x] Transporte de saída confirmado em 2026-10-12: busca e previsão passam por `createReservedOpenMeteoFetch` → `createOpenMeteoTransport`; nenhuma mudança em `apps/api/src` desde a revisão aceita; o eco só é aceito em Preview e o header de eco não aparece em Production.
   - [x] Smoke protegido e ensaio de rollback dos dois projetos em 2026-10-12: atual → par anterior → atual, com smoke da API pela CLI e do web no navegador em cada estado. Detalhes em `docs/history/preview-evidence-2026-10.md`, seção “Smoke e rollback de Production — 2026-10-12”.
   - [x] Abertura pública em 2026-10-12: o proprietário trocou a proteção dos dois projetos de “All Deployments” para a que libera somente os domínios de Production. Smoke anônimo aprovado; detalhes no histórico, seção “Abertura pública e smoke anônimo — 2026-10-12”.

## Pendências de manutenção (não bloqueiam)

- [ ] Branches: as locais foram removidas em 2026-10-12, inclusive `p1a-preview`, cujas duas correções foram restauradas na `main`. No GitHub restam `chore/vercel-p1`, `docs/release-p11`, `fix/restore-p1a-hardening` e `fix/geocoding-skip-incomplete-candidates`, todas incorporadas; a remoção fica a cargo do proprietário.
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
| Busca com resultado incompleto (“Belém”) | Em 2026-10-12, a busca “Belém” retornava 503 em `7ed53e2` e `e6bede3`: um dos dez resultados da Open-Meteo (Belém da Palestina) vinha sem `country`, e a spec recusava a resposta inteira. Com aprovação do proprietário, um resultado aceito com campo inválido passa a ser descartado; a resposta continua recusada se os inválidos não forem minoria estrita ou se a estrutura for inválida. A resposta real normalizada voltou cinco resultados, com Belém (Pará) primeiro. Local: `npm run check` (548 API, 103 web), cobertura API 94,93/91,95/94,8/97,9, builds, audit zero, axe, E2E e performance (LCP ≈1,02 s, CLS 0) | `SPEC-location-search.md`, validação externa; `open-meteo-geocoding.ts` e testes. Chromium Fedora 154; Gitleaks fica para a CI |
| Correções restauradas da `p1a-preview` | Pedido do proprietário em 2026-10-12. Em Production, a API recusa CORS com IP literal (privado, link-local, público ou IPv6), além de HTTP e loopback. O web valida nome, país e região das cidades: sem espaços nas pontas, no máximo 256 code points, sem C0 ou DEL e região não vazia ou `null`. Um 503 com corpo que não é JSON válido passa a ser indisponibilidade temporária. Local: `npm run check` (539 API, 103 web), cobertura API 94,95/92/94,78/97,97 e web 96,91/90/97,61/99,04, builds, audit zero, axe, E2E e performance (LCP ≈1,05 s, CLS 0) | Chromium Fedora 154; Gitleaks ausente localmente, fica para a CI. Adendos em `SPEC-backend-platform.md` e `SPEC-weather-ui.md`; origem: dois commits de 2026-10-06 da branch local `p1a-preview`, anterior à reescrita do histórico e nunca publicada |
| Diálogo de informações do site | Pedido do proprietário em 2026-10-10: privacidade, projeto e licenças em diálogo modal com fundo desfocado e botão Fechar; botão evidente na tela neutra (primeiro acesso, sem nova chave local) e opção discreta no rodapé. Local: `npm run check` (535 API, 95 web), cobertura web 96,25/89,45/96,42/99, builds, E2E (cinco), axe com o diálogo aberto em mobile/desktop, performance (LCP ≈1,0 s, CLS 0) e audit zero | Chromium Fedora 154; Gitleaks ausente localmente, fica para a CI. Adendo em `SPEC-weather-ui.md` |
| Identidade anti-spoof (P1d) | `{"ok":true,"apiDirect":"rate_limited","webRewrite":"rate_limited"}`: com IP sintético diferente em cada pedido, a aplicação limitou após 30 buscas diretas e 15 previsões pelo rewrite | Preview protegido em `e9ba52e`, verificador de `6aa0144`, 2026-10-10. Uma primeira execução foi inconclusiva por instrução de horário errada (minuto virou). Não prova atribuição de visitantes distintos nem igualdade do IP entre caminhos |

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
