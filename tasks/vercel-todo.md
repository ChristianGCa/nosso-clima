# Entrega Vercel + Upstash — estado e pendências

**Atualizado em 2026-11-03. Fonte única do progresso.** Specs definem contratos e gates; `tasks/vercel-plan.md` define a sequência aprovada; `docs/deploy/vercel-upstash-runbook.md` contém procedimentos; `docs/history/preview-evidence-2026-10.md` guarda as coletas datadas (consultar só a seção necessária; seus “próximos passos” não são tarefas).

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

## Medição de audiência e headers — requisitos aprovados em 2026-11-03

Pedido do proprietário: saber a origem dos acessos e os dispositivos, em conformidade com a LGPD. Decisões tomadas: respeitar Global Privacy Control e Do Not Track; incluir `Permissions-Policy` e `Cross-Origin-Opener-Policy`. Requisitos em `SPEC-weather-ui.md` e `SPEC-production-delivery.md` (seções de 2026-11-03); motivo e teste de balanceamento em `docs/decisions/0002-vercel-web-analytics.md`; procedimento no runbook (Release, item 5).

- [x] Pesquisa normativa, conferência do código e da documentação do Web Analytics; specs, ADR e runbook escritos (2026-11-03, branch `feat/web-analytics`).
- [x] Correção de todas as vulnerabilidades (2026-11-03, a pedido do proprietário, em commit próprio na branch `feat/web-analytics`). O `npm audit` da `main` acusava 8 vulnerabilidades: 2 altas, 5 moderadas e 1 baixa.
  - Diretas: `vite` 8.3.5, `vitest`/`@vitest/coverage-v8` 5.0.3 e `fastify` 5.12.7 (runtime da API).
  - Indiretas: `undici` 8.12.3, `fast-uri` 3.1.9/4.2.3 e `ip-address` 10.7.5.
  - Foram escolhidas as versões corrigidas com pelo menos uma semana de publicação.
  - Resultado: `npm audit` sem nenhuma vulnerabilidade. Gates locais verdes: `npm run check` (548 API, 103 web), cobertura API 94,93/91,95/94,8/97,9 e web 96,91/90/97,61/99,04, builds, axe e contraste, E2E (cinco), performance (LCP ≈0,96 s, CLS 0).
  - Ambiente: Node 24.18.0, npm 12.0.2, Chromium fixado pelo Playwright. Gitleaks ausente localmente; fica para a CI.
  - O merge gera um deployment novo da API; fazer smoke de busca e previsão depois dele.
- [x] Autorização de implementação dada pelo proprietário em 2026-11-03.
- [x] Implementação local (2026-11-03):
  - `apps/web/src/analytics.ts` com `@vercel/analytics` 2.0.1 (versão exata, MIT, sem dependências), `mode: 'production'` só em build de produção, recusa por GPC/DNT e `beforeSend` que reduz a URL a origem + caminho;
  - texto do aviso em `site-information.tsx`;
  - `Permissions-Policy` e `Cross-Origin-Opener-Policy` em `vercel.mjs`, com a CSP inalterada;
  - testes unitários do módulo, do aviso e da configuração, e um cenário E2E novo (script só na própria origem, sem cookies nem armazenamento, e nenhuma carga com GPC ou DNT).
  - O bundle contém a URL do script de depuração do pacote, que só é usada em modo de desenvolvimento e nunca é ativada pelo módulo; o E2E confirma zero requisições a terceiros.
- [x] Gates locais verdes: `npm run check` (548 API, 112 web), cobertura web 97,03/90,41/97,75/99,07, builds, `npm audit` sem vulnerabilidades, axe e contraste, E2E (seis), performance (LCP ≈0,95 s, CLS 0). Node 24.18.0, npm 12.0.2, Chromium do Playwright; Gitleaks fica para a CI.
- [x] Push, CI verde e merge pelo PR #11 (2026-11-03), conduzidos pelo proprietário. Por relato dele, o site funcionou depois do deploy, incluindo o deployment novo da API com `fastify` 5.12.7.
- [x] Web Analytics ativado pelo proprietário **somente no projeto web**, seguido de redeploy do web (2026-11-03).
  - A ativação ocorreu depois do merge, não antes como previa a ordem. Não houve coleta sem aviso, porque o aviso novo já estava publicado.
  - Lição registrada no runbook: o script responde 200 mesmo antes da ativação.
- [x] Conferência em Production (2026-11-03). Observado por requisições de leitura, sem gerar visita:
  - `Permissions-Policy` e `Cross-Origin-Opener-Policy` presentes;
  - `/_vercel/insights/script.js` responde 200 na própria origem;
  - o bundle publicado carrega o script em modo produção e verifica GPC;
  - o script da Vercel envia para `/_vercel/insights/view` e ignora navegadores automatizados.

  Por relato do proprietário: o painel registrou a visita feita fora do Brave, e o acesso pelo Brave não foi contado, como esperado com GPC e Shields.
- [x] Conferência complementar no DevTools (2026-11-03), feita pelo proprietário com capturas revisadas nesta sessão.
  - Chromium com perfil limpo:
    - `script.js` e `view` (POST 200) somente na origem do web, com payload `o` reduzido a `/`, sem query, cidade ou coordenadas;
    - fora da origem, só URIs `data:` dos ícones embutidos, nenhuma requisição de rede a terceiros;
    - headers de segurança presentes e nenhuma violação de CSP no console;
    - nenhum cookie; Local storage somente com `nosso-clima:last-location:v1` após escolher a cidade; Session storage e IndexedDB vazios;
    - links externos do diálogo funcionando com o COOP.
  - Firefox em janela privada, sem bloqueador: `navigator.globalPrivacyControl === true`, nenhuma requisição `insights` e nenhum `<script>` de medição no DOM. A recusa por GPC fica comprovada em Production, separada do bloqueio dos Shields do Brave.

## Previsão por hora — requisitos aprovados em 2026-11-03

Pedido do proprietário: mostrar temperatura e chuva por hora nos sete dias, em colunas; revisado no mesmo dia para incluir ícone de condição por hora e abrir as horas dentro de cada cartão. Requisitos nas seções de 2026-11-03 de `SPEC-weather-forecast.md`, `SPEC-weather-ui.md` e `SPEC-production-delivery.md`.

- [x] Análise de viabilidade e revisão de segurança, privacidade e licença (2026-11-03).
  - **Medições:** resposta real da Open-Meteo com 6.724 bytes, para limite de 65.536. Contrato no pior caso com 5.541 bytes, para limite de 24.576 do valor Redis.
  - **Custo:** 1,5 chamada por previsão.
  - **Documentação oficial da Open-Meteo:** a chuva horária é a soma da hora anterior; o fuso usa deslocamento fixo e ignora horário de verão.
  - **Termos e licença:** relidos, sem restrição nova.
- [x] Emendas das três specs aprovadas pelo proprietário (2026-11-03), incluindo as decisões: hora ausente como “—”/“Indisponível” sem derrubar a previsão; hoje a partir da hora atual; seção própria abaixo dos cartões; recomendação de fixture real nova.
- [x] Implementação autorizada pelo proprietário (2026-11-03).
- [x] Implementação local (2026-11-03, branch `feat/previsao-horaria`):
  - API: três variáveis horárias, validação com `null` preservado, colunas `daily[].hourly`, chave de cache `weather-forecast:v2` e limite do valor Redis exportado para o teste de pior caso;
  - fixture real `open-meteo-forecast-hourly.json` (São Paulo, 2026-11-03), com procedência registrada; extensão sintética ampliada;
  - web: validação tudo-ou-nada, seção “Previsão por hora” com `<fieldset>` de dias, tabela rolável e nota da chuva;
  - testes de fronteira, componente e fluxo; axe com um dia completo em 360 px e foco por Tab na região; cenário E2E de troca de dia; performance com a seção renderizada.
- [x] Exceção aprovada em `CONSTRAINTS.md` (2026-11-03, validade 2027-02-01): um `biome-ignore` de `noNoninteractiveTabindex` na região rolável. O proprietário escolheu manter a tabela rolável em vez de uma grade sem rolagem.
- [x] Gates locais verdes (2026-11-03):
  - `npm run check`: 571 testes na API e 128 no web, em cerca de 10 s;
  - cobertura: API 95,29/92,5/94,89/98,02 e web 97,03/90,59/98,07/99,14;
  - builds e `npm audit` sem vulnerabilidades;
  - axe e contraste nos dez fundos, com a seção visível;
  - E2E (seis testes);
  - performance: LCP ≈0,95 s na tela neutra e ≈1,04 s com cidade restaurada, CLS 0.

  Ambiente: Chromium fixado pelo Playwright. Gitleaks fica para a CI. Revisão visual em 360 e 1280 px sem rolagem horizontal da página.
- [x] Revisão da interface pedida pelo proprietário (2026-11-03, mesma branch), com as decisões tomadas por ele:
  - ícone de condição por hora com variante noturna; `is_day` por hora incluído, e o custo sobe para 1,6 chamada;
  - termômetro e gota no lugar dos rótulos das linhas;
  - botão “Ver por hora” dentro de cada cartão, em vez de uma seção separada com escolha de dia;
  - nota visível sobre a chuva removida.
- [x] Implementação da revisão (2026-11-03):
  - API: `conditionCategory` e `isDay` em `daily[].hourly`; fixture real recapturada com `is_day` (7.081 bytes); pior caso de 8.379 bytes;
  - web: painel no cartão com `aria-expanded`/`aria-controls`, `aria-label` com o dia e termômetro derivado do Meteocons, registrado em `third-party-licenses.txt`;
  - duas correções de layout encontradas na revisão visual: a região rolável passou a `position: relative`, porque os rótulos ocultos das células distantes escapavam do recorte, e a coluna única do celular passou a `minmax(0, 1fr)`.
- [x] Gates locais verdes após a revisão (2026-11-03):
  - `npm run check`: 579 testes na API e 133 no web, em cerca de 11 s;
  - cobertura: API 95,32/92,44/94,93/98,03 e web 97,56/91,64/98,14/99,15;
  - builds e `npm audit` sem vulnerabilidades;
  - axe e contraste nos dez fundos, com painel aberto em 360 px;
  - E2E (seis testes);
  - performance: LCP ≈0,96 s e ≈1,04 s, CLS 0.

  Revisão visual em 360 e 1280 px sem rolagem horizontal da página.
- [x] Ajustes visuais pedidos pelo proprietário e aprovados por ele (2026-11-03, mesma branch; emenda em `SPEC-weather-ui.md`):
  - unidade embaixo do número nas células;
  - botão com cantos de 0,45rem, como os demais, e cores discretas;
  - HOJE com as 24 horas, a hora atual destacada e rolagem até ela ao abrir. Mudança só no web: a API já entregava as 24 horas, e custo, cache e contrato não mudam;
  - depois da conferência visual do proprietário: o cabeçalho da hora atual passou a uma linha só (“Agora”), que tirava o espaço extra; abrir um painel passou a crescer só aquele cartão, com os vizinhos na altura de fechados; e a barra de rolagem da tabela ficou fina e discreta.
- [x] Gates locais verdes após os ajustes (2026-11-03):
  - `npm run check`: 579 testes na API e 137 no web, em cerca de 11 s;
  - cobertura: API 95,32/92,44/94,93/98,03 e web 97,73/92,17/98,26/99,21;
  - builds e `npm audit` sem vulnerabilidades;
  - axe e contraste nos dez fundos, com o HOJE aberto em 360 px; axe com o HOJE aberto em 1280 px, com os outros seis cartões na altura de fechados;
  - E2E (seis testes);
  - performance: LCP ≈0,94 s e ≈1,04 s, CLS 0.

  Revisão visual em 360 e 1280 px sem rolagem horizontal da página.
- [x] Aviso temporário da novidade (2026-11-03, aprovado pelo proprietário na opção sem armazenamento; requisitos em `SPEC-weather-ui.md`, seção “Aviso temporário da novidade”). Fica acima dos cartões até 2026-11-10, 23h59 de Brasília, e “Fechar” vale só para a página aberta. Gates locais verdes: `npm run check` (579 API, 140 web), cobertura web 97,77/92,32/98,33/99,23, builds, `npm audit` sem vulnerabilidades, axe e contraste nos dez fundos com o aviso visível, E2E (seis), performance com o aviso (LCP ≈0,95 s e ≈1,05 s, CLS 0).
- [ ] No merge: se a publicação passar de 2026-11-03, ajustar `HOURLY_NOTICE_ENDS_AT` para uma semana após a publicação, junto com a data fixa do axe e da performance.
- [ ] Após o prazo do aviso: remover `hourly-notice.tsx`, a ligação no `App`, os estilos e os testes, e marcar a seção do spec como encerrada.
- [ ] Antes do merge: `OPEN_METEO_FORECAST_CREDITS` = 1.600 em Preview e Production (proprietário; ainda não alterado em 2026-11-03).
- [ ] PR com CI verde, merge, smoke nos dois projetos e atualização do `README.md` e do `CAPABILITY-MAP.md`, conforme `SPEC-production-delivery.md`.

## Pendências de manutenção (não bloqueiam)

- [ ] LGPD — transferência internacional (abrange também a medição de audiência aprovada em 2026-11-03): aviso atualizado em 2026-10-12 (branch `fix/lgpd-privacy-notice`) com base legal, transferência, direitos do titular, ANPD e incidentes; `Referrer-Policy` do web passou a `no-referrer`; procedimento de incidente no runbook. Os DPAs públicos de Vercel e Upstash pesquisados não mostram as cláusulas-padrão da ANPD (Res. CD/ANPD nº 19/2024). Decisão do proprietário: aceitar e manter a transparência no aviso, ou mover a Function para São Paulo e a base Upstash para a região de São Paulo (reduz, mas não elimina, a transferência, porque os fornecedores são estrangeiros). Conferir também se o apelido `ChristianGCa` basta como identificação do controlador (art. 9º, III) ou se o nome civil deve constar.
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
| Layout antes da divulgação | Pedido do proprietário em 2026-10-12: logo centralizado no cabeçalho até 540 px; tela neutra em duas colunas no desktop (aviso de dados à direita), empilhada no celular. Local: `npm run check` do web (103 testes), lint/format da raiz, axe/contraste em mobile/desktop; capturas em 360, 700 e 1900 px sem rolagem horizontal | Chromium Fedora 154. Adendo em `SPEC-weather-ui.md`. E2E, performance e CI ficam para o PR |
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
