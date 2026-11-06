# Spec: Weather UI

- **Status:** Local flow approved at Checkpoint U-C on 2026-09-24; revised by owner requests on 2026-09-28 to remove UV maximum and risk and remember the last selected city, and on 2026-10-04 to refine daily cards; 2026-10-01 corrective checks verified locally; hourly section approved by owner and implemented locally on 2026-11-03
- **Module id:** `weather-ui`
- **Depends on:** `location-search`, `weather-forecast`
- **Consumer:** `production-delivery`

## Alcance desta spec

O fluxo e os critérios locais estão implementados, incluindo os adendos aprovados até 2026-10-04. Build, rewrite e fluxo pelo navegador foram verificados em Preview; em 2026-10-08, o proprietário confirmou o funcionamento em `chore/vercel-p1` e melhora após ajustar o orçamento agregado. Os estados 503 continuam seguindo o contrato existente. A continuidade de P1 (`docs/history/preview-evidence-2026-10.md`) registra isso; o release e a publicação de 2026-10-12 estão em [tasks/vercel-todo.md](tasks/vercel-todo.md).

## Objective

Build a responsive Portuguese-language site where a person searches for a city, explicitly selects one result, and understands its current conditions and seven-day forecast. The interface must make the city, local times, units, uncertainty and unavailable metrics clear without requiring weather expertise. It consumes the two approved backend HTTP contracts and does not interpret raw Open-Meteo responses or WMO codes.

The first visit is neutral: no default city, geolocation request or forecast request. The person may type a place name and choose a result that shows city, region when available, and country. A new selection loads that place's forecast. On a later visit in the same browser, load a fresh forecast for the last explicitly selected city. The site does not add accounts, search history, maps, alerts, hourly weather, unit switching or weather advice.

## User Flow and States

1. With no valid saved city, show the app title, a labelled city search field, short guidance, and a neutral background. Do not request either API. With a valid saved city, immediately show its name and loading state and request its fresh forecast without a geocoding call.
2. After the trimmed input reaches three Unicode code points, wait 300 ms after the last edit, then request `GET /api/v1/locations?query=...`. A shorter input clears suggestions and makes no request. The backend may accept two-character searches; the three-character threshold is a UI choice.
3. Show at most five results with city, region if present, and country. Never silently choose the first result. A zero-result response has a distinct message from a loading or error state.
4. Selecting a result closes suggestions, saves that selected city in browser-local storage, and requests `GET /api/v1/forecast` using only that result's `latitude`, `longitude` and `timezone`. Clear the prior forecast and return to a neutral background while a newly selected city's forecast loads; never display one city's forecast beneath another city's name. Editing search text or retrying a forecast does not replace the saved city.
5. On success, show the selected place, current conditions, one detailed card for today and six compact daily summaries. The person can search again while a forecast is visible; editing search text alone does not change the selected place or its forecast.
6. On forecast failure, keep the selected place visible with a concise error and an explicit retry action. Do not automatically retry or show stale data from a different city. A search failure leaves an already displayed forecast in place.

Every request has an `AbortController`. On a new query or selected place, abort the old request and also ignore any late result that belongs to an older request, since abort is not proof that a response cannot arrive. Unmounting the view aborts outstanding work. Treat non-2xx, malformed JSON and unexpected response shapes as an error state; never render unchecked values. Validate place labels against the location contract: trimmed, at most 256 Unicode code points, no C0 controls or DEL, and a non-empty region or `null`. Save only the last selected location, never search text or forecast data. Treat browser storage as untrusted input: reject oversized, malformed or invalid saved records before rendering or sending coordinates. Storage errors must leave search and forecast usable. The saved city remains until another city is selected or the browser's site data is cleared.

For rate limiting, show a specific friendly message for `429 RATE_LIMITED` and allow a later manual retry. For `503 SERVICE_UNAVAILABLE`, network failure, malformed success data or a 503 body that is not valid JSON, show a generic temporary-unavailability message. A 503 with valid JSON but a different error code uses the generic failure state. Do not display provider bodies, raw server diagnostics or coordinates in an error. Other errors use a generic failure state. Preserve the backend's request ID only as a support reference in the error state, if present.

## Backend Contracts and Presentation

The frontend calls the same configured API base URL for both routes and uses `URLSearchParams` for query values. The base URL comes from build configuration, never from a search term or server response. Development may use a Vite proxy; production origin and CORS configuration belong to `production-delivery`.

**Migração Vercel — P7 implementada e publicada em 2026-10-12:** o build de produção usa `/api/v1/*` na origem web, com rewrite para a API. A configuração deixa `VITE_API_BASE_URL` ausente; se a variável for fornecida, a validação aceita somente a própria origem HTTPS e rejeita HTTP, loopback e outra origem. O rewrite, CORS e os headers de entrega seguem [Production Delivery](SPEC-production-delivery.md) e foram verificados em Preview e Production; contratos HTTP e comportamento visual continuam os descritos nesta spec.

The HTTP boundary also rejects a forecast whose first daily date is not the date in `current.validAtLocal`, or whose returned timezone differs from the explicitly selected city's timezone. Such a response uses the unavailable state instead of labelling a mismatched date “HOJE” or presenting a time for the wrong zone.

| UI need | Provider contract | Presentation rule |
|---|---|---|
| Search suggestions | `GET /api/v1/locations` from `SPEC-location-search.md` | Show `name`, optional `region`, and `country`; use the complete selected result for the forecast request. |
| Current conditions | `GET /api/v1/forecast` from `SPEC-weather-forecast.md` | Show current temperature, apparent temperature, condition label, wind speed and local valid time. |
| Seven-day forecast | `daily` from forecast response | Show local date and weekday for all seven days. Today shows max/min temperature and apparent temperature, the day's **predominant** condition, maximum wind, maximum rain chance and rain amount, with the two rain metrics last in that order. Each of the next six days shows its predominant condition, max/min temperature, maximum rain chance and rain amount. |
| Attribution | Each response's `attribution` | Credit Open-Meteo, GeoNames for search results and the selected city, linked CC BY 4.0 licence, and say NossoClima adapted the data. |

The forecast API now calculates predominant daily conditions from hourly codes under the owner's 2026-10-04 amendment. The web displays backend `condition.category` and `condition.labelPt` without interpreting WMO codes or deriving daily conditions from the current condition.

Use `pt-BR` number and date formatting. Show °C, km/h, mm and percent explicitly. Distinguish rain chance (%) and rain amount (mm) with different icons and units, and keep their full names available to assistive technology so `70%` is not mistaken for `8,4 mm`. Maximum and minimum temperatures may use distinct upward and downward icons when their names remain available to assistive technology. A `null` daily precipitation probability is shown as “Indisponível”; never substitute zero.

`current.validAtLocal` is an offset-less local minute in the returned `timezone`; display its clock time directly and identify it as the time the current conditions apply to. Do not parse it as UTC or call it an observed measurement. `retrievedAtUtc` is a distinct retrieval timestamp; format it in the returned timezone and label it “Dados consultados às …”. For daily `YYYY-MM-DD`, calculate weekday from that civil date without shifting it through the browser's local timezone. The site must behave the same when the viewer and selected city are in different timezones.

Keep frontend response types and runtime checks within `apps/web`. Do not import runtime code from `apps/api` or modify provider contracts here. The HTTP boundary treats JSON as `unknown` and accepts only the consumed documented shape; invalid data moves the affected request to an error state.

## Layout, Backgrounds and Accessibility

The visual hierarchy is search first, current conditions second, seven-day forecast third, and source credit adjacent to the data it credits. The owner's 2026-09-27 wireframe defines the organization: a compact header with search, current conditions, a seven-day forecast, then attribution and brief site information. Its blue, cyan and red fills only separate sections in the sketch; they are not the product palette. Keep the selected weather photograph visible behind neutral, readable surfaces. Use distinct multicolor weather icons. Mark the first, detailed daily card visibly as “HOJE” and keep each later day's condition, icon and metrics together. Increase the daily card title size and make both current and daily card surfaces slightly more translucent while preserving contrast on all ten backgrounds. Daily cards share the same height at each viewport width, with enough space and subtle dividers between temperatures, rain chance and rain volume. At 360 px the page has no horizontal overflow, search suggestions remain usable, and all seven days form a compact readable vertical list. Mobile layouts should minimize vertical scrolling without clipping weather data; wider layouts may show the seven days side by side with more detail for today. Loading, empty and error states reserve enough space to avoid disruptive layout shifts.

Use one decorative WebP background from the ten bundled files in `apps/web/src/assets/backgrounds/`, selected solely by `current.condition.category` and `current.isDay`. The originals remain under `backgrounds/`; all ten bundled files are optimized variants. The initial and loading states use a neutral solid or gradient background. Map the five categories to their matching `dia-*` or `noite-*` file; if an image fails to load, use the neutral background. Do not request all ten images on first load or use a daily condition to choose the current background. Load only the active bundled image in the browser.

Text and controls sit on opaque or sufficiently strong translucent surfaces, never directly on the photograph. Verify contrast on every day/night image and on the neutral state at mobile and desktop sizes; meet at least 4.5:1 for ordinary text and 3:1 for large text and interactive boundaries. The image is decorative and has no alternative text. Ensure focus indicators remain visible against every background. Respect reduced-motion preferences; motion cannot carry essential state.

The city picker has a persistent accessible name without a separate visible label and supports keyboard operation: Tab reaches the field and suggestions, arrow keys move the active suggestion, Enter selects it, Escape closes the list, and focus is never trapped. Search feedback, suggestions and search attribution appear in a panel anchored below the field without changing the header height. The current active option and result count are exposed to assistive technology without announcing every keystroke. Loading and error messages use appropriate live announcements; retry and attribution links have discernible names. An empty result is distinguishable from a transport error. Color alone never identifies weather.

## Tech Stack and Commands

The frontend is a separate `@nosso-clima/web` npm workspace using React, Vite and strict TypeScript. It uses native `fetch`, `AbortController` and `Intl` without a client state or HTTP library. Vitest and React Testing Library cover state and component behavior. A browser-based axe check supplies the active `npm run test:a11y` gate. Exact dependency versions are pinned in the committed lockfile.

The web workspace provides these commands:

```bash
npm run dev --workspace @nosso-clima/web
npm run build --workspace @nosso-clima/web
npm run typecheck --workspace @nosso-clima/web
npm run lint --workspace @nosso-clima/web
npm run format:check --workspace @nosso-clima/web
npm test --workspace @nosso-clima/web
npm run test:coverage --workspace @nosso-clima/web
npm run test:a11y
npm run check:boundaries
```

The canonical root `npm run check` must still pass. A web-local `check` command should run typecheck, lint, format, tests and build. The web application must meet the existing 80% floor for statements, branches, functions and lines. Keep local checks under 90 seconds; browser accessibility checks may use the five-minute end-of-task/CI budget. `production-delivery` owns full end-to-end, Lighthouse and deployment checks.

## Project Structure

```text
SPEC-weather-ui.md
apps/web/package.json
apps/web/index.html
apps/web/src/                  application, components, local HTTP contracts and formatting
apps/web/src/assets/backgrounds/ ten bundled WebP files; originals remain in backgrounds/
apps/web/test/                 unit and component tests with offline HTTP fixtures
```

All ten bundled images are optimized variants and differ from the corresponding originals. The frontend and backend build independently. The boundary check rejects imports from `apps/web` into `apps/api/src` and the reverse.

## Code Style

Use named exports, kebab-case file names, typed component props, immutable response models and explicit states. Keep HTTP parsing, formatting and presentation in separate functions so a component never handles provider JSON directly. An illustrative state contract is:

```ts
type ForecastViewState =
  | { status: 'idle' }
  | { status: 'loading'; location: SelectedLocation }
  | { status: 'ready'; location: SelectedLocation; forecast: Forecast }
  | {
      status: 'error';
      location: SelectedLocation;
      failure: {
        kind: 'rate_limited' | 'unavailable' | 'request_failed';
        requestId?: string;
      };
    };
```

## Testing Strategy

- Unit tests cover place labels, timezone-safe current and daily dates, metric formatting, nullable fields, category/day-night image mapping, malformed HTTP data and bounded error messages.
- Component tests with mocked requests cover a neutral first visit with zero calls, saved-city restoration with a fresh forecast and no search call, invalid or unavailable storage, debounce/threshold, result selection, keyboard behavior, empty/error/429 states, stale search and forecast responses, explicit retry, source credit and distinct city transitions.
- Browser verification checks 360 px and desktop layouts, all ten backgrounds, focus visibility, keyboard navigation, screen-reader announcements, no horizontal overflow, and zero critical or serious axe findings. Contrast is checked against actual rendered surfaces because automated axe checks cannot fully prove photographic contrast.
- Tests never call the live provider and use fake timers rather than wall-clock sleep. `production-delivery` adds the end-to-end real-browser flow and performance gate once the local UI works.

## Boundaries

### Always

- Keep the initial screen neutral when no valid city was previously selected; only a prior explicit selection may initiate a forecast on reopening.
- Use only the approved location and forecast HTTP contracts; format their values without changing their meaning.
- Preserve attribution, privacy, keyboard access, readable contrast and safe unavailable states.
- Keep query, coordinates and weather values out of browser logs and analytics.

### Ask first

- Change API fields, add a backend endpoint, change the seven-day horizon or select a default city.
- Add any persistence beyond the single last selected city, geolocation, analytics, a new provider, a state-management library or automatic retries.
- Change the three-character threshold, 300 ms debounce, day/night background rule or source-credit wording after approval.

### Never

- Treat `null` rain probability as zero; call a daily condition “most severe”; parse the local current timestamp as UTC.
- Hide text directly in imagery, rely on color alone, or silently choose a search result.
- Import `apps/api/src` at runtime, expose raw provider diagnostics, or publish images with unverified rights.

## Success Criteria — implementação local

The checked items record the local handoff approved on 2026-09-24, subsequent owner-approved amendments through 2026-10-04 and the completed corrective verification below. Current contrast evidence is in [the 2026-10-04 report](docs/quality/contrast-2026-10-04.md); the same report preserves the original method and summarizes the earlier measurement.

- [x] A first visit without a saved city makes no location or forecast request and shows a useful neutral state.
- [x] Reopening with a valid saved city shows its name and requests a fresh forecast without geocoding; corrupt or blocked storage falls back safely to the neutral state.
- [x] A keyboard or pointer user can search, distinguish homonymous places, explicitly select one, and load its seven-day forecast.
- [x] Search, selection, loading, empty, 429, provider failure, malformed response and retry states are understandable and never show a mismatched city's data.
- [x] Current and daily metrics use the approved labels, units, local dates, distinct valid/retrieval times and null policy. The 2026-10-04 amendment adds predominant daily conditions and the reviewed card layout.
- [x] All ten background mappings, a neutral fallback and all source/licence credits work without compromising contrast or initial load.
- [x] The app works from 360 px through desktop with keyboard access and zero critical or serious axe violations.
- [x] Web typecheck, lint, format, tests, 80% coverage, production build, root check and boundary check pass within their active budgets.
- [x] Public deployment still waits for `production-delivery` to verify aggregate API usage, privacy, current provider licensing, image rights and performance.

## Corrective Verification (2026-10-01)

- [x] The web forecast boundary rejects a response whose first daily date differs from `current.validAtLocal`'s local date, or whose timezone differs from the selected city's canonical timezone. Regression tests cover both cases.
- [x] HTTP failures other than `429 RATE_LIMITED` and `503 SERVICE_UNAVAILABLE` use the generic failure state. Boundary and component tests cover unrelated statuses and keep provider diagnostics hidden.
- [x] Mobile and desktop contrast was measured for all ten bundled backgrounds against computed text and control surfaces. The reproducible browser check and its numeric evidence are in `apps/web/test/contrast.mjs` and `docs/quality/contrast-2026-10-04.md`.

## Decisions and Approval Record

1. The UI starts searching at three Unicode code points after a 300 ms debounce; the API itself still accepts two-character searches.
2. A new city selection clears the old forecast until the new response succeeds; typing alone leaves the current forecast visible.
3. Since the approved amendment of 2026-10-04, the daily condition means “Condição predominante”; rain chance (%) and rain volume (mm) remain distinct values in both the detailed card and compact summaries.
4. The existing WebP images may be used during local development. The owner stated on 2026-09-27 that they generated all ten in the Gemini app without uploading reference images and reaffirmed the Gemini origin on 2026-10-01. This records the stated origin; the public-use rights review remains part of `production-delivery`, and no ownership or licence is inferred from the files' presence in the repository.

The owner approved this spec and the resulting plan and U1–U10 tasks on 2026-09-24. The owner approved the completed local user flow at Checkpoint U-C on 2026-09-24.

The owner revised the search presentation on 2026-09-27: omit the visible "Buscar cidade" label and keep the header height stable throughout search states.

The owner requested last-city restoration on 2026-09-28. This explicitly supersedes the previous prohibition on client persistence and initial forecast requests for returning visitors. The browser stores one selected location only; `production-delivery` must include this local retention and the automatic forecast transfer in the public privacy notice and provider usage budget.

The 2026-10-04 card amendment uses predominant daily conditions, places wind before the two rain metrics in HOJE, increases daily date headings and slightly lowers card opacity. The repeated browser contrast and accessibility result is recorded in [the dated evidence](docs/quality/contrast-2026-10-04.md).

The owner requested site information on 2026-09-28. The neutral screen should link to a short, always accessible explanation of data use. The footer should expose anchored sections for data and privacy, the project's purpose and repository, and distinct licences/credits for weather and location data, icons, and the project code. Keep weather attribution adjacent to weather data. On 2026-10-03 the owner selected MIT for the code and supplied the responsible party and contact. The licence is linked in the footer; the repository link now points to `https://github.com/ChristianGCa/nosso-clima`, whose remote was confirmed on 2026-10-07. This local explanation does not close the full `production-delivery` privacy-notice gate, which still needs hosting retention, current provider review, and owner approval before release.

The owner supplied project-logo assets and requested their use on 2026-09-28. Use the light-on-dark vector wordmark in the existing dark header and the supplied favicon/touch-icon sizes for browser and device surfaces. Retain the supplied variants as source assets without loading every variant on the weather page. Preserve the accessible home-link name, header/search layout, and contrast. Verify the SVGs have no active content or external references before publishing them.

On 2026-10-03 the owner identified Claude personal Free as the logo tool and said they requested options and color variants using text only, without uploading reference material. `production-delivery` records the file-specific provenance and public-use review.

## Correções autorizadas em 2026-10-07

O proprietário pediu a correção das inconsistências da revisão e confirmou que a entrada existente funciona na Vercel. O exemplo de ambiente mantém `VITE_API_BASE_URL` ausente para permitir build com caminhos relativos. O rodapé inclui o remoto GitHub existente e descreve o recebimento do IP pela Vercel, o identificador temporário por minuto e os TTLs de busca/previsão na Upstash. A revisão final de regiões e retenção do host permanece em `production-delivery`; esses valores não são inferidos de um deploy já excluído.

## Continuidade documental em 2026-10-08

O fluxo na nova branch foi confirmado pelo proprietário. A reserva ponderada da plataforma, compartilhada por busca/previsão, pode negar misses com 503 mesmo quando hits ainda respondem 200. Isso é independente do rate limit por visitante e continua usando o estado de indisponibilidade existente. O proprietário ajustou o orçamento de testes e relatou melhora; debounce, retries explícitos, seleção, armazenamento e mensagens da UI não foram alterados. Os avisos CSP dos recursos Vercel no Preview são separados desse diagnóstico. A evidência atual (`docs/history/preview-evidence-2026-10.md`) mantém os dados operacionais anonimizados.

## Estado documental em 2026-10-10

O aviso de privacidade foi revisado com a configuração de região da Function obtida pela CLI, a região Redis e a ausência de backup periódico informadas pelo proprietário, além dos TTLs do aplicativo; prazos gerais de logs dos fornecedores não foram presumidos. Os direitos dos fundos/logo foram revisados no alcance do inventário, e os créditos permanecem na interface. O link GitHub existente respondeu 404 sem autenticação; o proprietário pretende tornar o repositório público, com conferência anônima antes da abertura. As pendências vigentes ficam em `tasks/vercel-todo.md`.

## Informações do site em diálogo — 2026-10-10

O proprietário pediu que as informações de privacidade deixem de ocupar o fim da página e passem a abrir como uma mensagem sobreposta, com fundo desfocado e botão de fechar no canto superior direito. Esta revisão substitui, para a apresentação, o rodapé com seções ancoradas descrito em 2026-09-28; o conteúdo, os links e as atribuições continuam os mesmos.

- Um diálogo modal (`<dialog>` com `showModal()`) reúne “Seus dados”, “Seus direitos” (LGPD, incluído em 2026-10-12), “Sobre o projeto” e “Licenças e créditos”. Ele recebe foco ao abrir, fecha pelo botão “Fechar”, pela tecla Esc ou por clique fora do painel, devolve o foco a quem o abriu e bloqueia a rolagem da página enquanto aberto.
- Primeiro acesso: a tela neutra, exibida apenas enquanto nenhuma cidade foi escolhida neste navegador, mostra um botão evidente “Como usamos seus dados”. Nenhum novo dado é guardado para detectar o primeiro acesso; a última cidade salva continua sendo o único registro local.
- Demais acessos: o rodapé mantém um botão discreto “Privacidade e créditos”, sempre disponível. A atribuição de dados meteorológicos continua no rodapé junto à previsão.
- Testes de componente cobrem abertura pelos dois pontos, fechamento e conteúdo; o teste de acessibilidade do navegador abre o diálogo real e executa axe com ele aberto.

## Ajustes de layout antes da divulgação — 2026-10-12

Pedido do proprietário. Até 540 px, o logo fica centralizado na faixa superior do cabeçalho, acima da busca. Na tela neutra, a partir de 761 px, a chamada e o cartão “Como usamos seus dados” ficam em duas colunas (chamada à esquerda, cartão à direita, alinhado à borda direita da busca). Em larguras menores, o cartão continua abaixo da chamada, com largura limitada e texto ocupando o cartão. Conteúdo, comportamento e acessibilidade do diálogo não mudam. A disposição da tela neutra foi substituída em 2026-11-05 (seção abaixo).

## Ajustes visuais — 2026-11-05

Pedido do proprietário, com a escolha “centralizar tudo” para a tela neutra. Mudança só de apresentação: conteúdo, dados, contrato, armazenamento e comportamento não mudam.

- **Condições atuais:** sensação térmica e vento viram dois blocos lado a lado, com borda fraca, ícone de linha decorativo (`aria-hidden`) e valor maior. No desktop, ocupam a área à direita da temperatura, em vez de uma coluna estreita na borda; até 1050 px, ficam abaixo da temperatura, ocupando a largura do cartão.
- **Previsão por hora:** colunas e ícones maiores, temperatura em destaque, linhas separadas por traços fracos, borda na região rolável e a coluna “Agora” com traços laterais. Até 540 px, a região avança um pouco sobre o recuo do cartão para caber mais horas.
- **Sem coluna de rótulos (conferência do proprietário no mesmo dia):** a coluna fixa com o termômetro e a gota sai, porque não acrescentava informação: as unidades (°C e mm) já distinguem as linhas. Os `<th scope="row">` continuam na tabela, sem largura visível, com os nomes “Condição”, “Temperatura” e “Chuva na hora anterior” só para tecnologia assistiva. Ao abrir o HOJE, a hora atual passa a ser a primeira coluna visível (perto do fim do dia, a rolagem para no máximo possível). O `thermometer.svg` derivado deixa de ser usado e sai do repositório e de `third-party-licenses.txt`. Isto substitui, na seção “Previsão por hora”, os rótulos das linhas por ícones, a coluna fixa e o termômetro derivado.
- **Rodapé no celular, correção:** a regra `justify-content: space-between` do desktop encolhia a coluna única da grade e a deixava à esquerda; a grade passa a ter uma coluna de largura total.
- **Tela neutra:** chamada, subtítulo e cartão “Como usamos seus dados” ficam empilhados e centralizados em todas as larguras, substituindo as duas colunas de 2026-10-12.
- **Rodapé:** centralizado até 760 px e, em qualquer largura, quando só há o bloco do site (tela neutra). No desktop com previsão, continua com o bloco do site à esquerda e a atribuição à direita.

## Medição agregada de audiência — requisitos aprovados em 2026-11-03

**Estado:** requisitos aprovados pelo proprietário em 2026-11-03; **implementação aguarda autorização separada**. Esta seção registra a aprovação exigida em “Ask first” para analytics e substitui, somente para o Vercel Web Analytics descrito aqui, a frase do aviso “Não há publicidade, análise de audiência nem criação de perfis”. A regra “Keep query, coordinates and weather values out of browser logs and analytics” continua integral. Motivo, alternativas e teste de balanceamento estão em `docs/decisions/0002-vercel-web-analytics.md`; headers, painel e release ficam em `SPEC-production-delivery.md`.

Finalidade: saber de onde vêm as visitas (site de origem e localização aproximada) e com quais dispositivos, sistemas e navegadores o site é usado, somente em números agregados.

- **Pacote e ativação:** `@vercel/analytics` em versão exata no lockfile, chamado uma única vez na inicialização por um módulo próprio (`apps/web/src/analytics.ts`, importado por `main.tsx`), com `inject()`. Sem componente React adicional, sem snippet inline e sem `scriptSrc`/`endpoint` de outra origem. Somente builds de produção (`import.meta.env.PROD`) ativam a coleta; `npm run dev` e os testes unitários nunca carregam script de medição.
- **Sinais de recusa:** antes de injetar, verificar `navigator.globalPrivacyControl === true` ou Do Not Track igual a `"1"` ou ao valor antigo `"yes"` (`navigator.doNotTrack` ou `window.doNotTrack`). Com qualquer um deles, não injetar o script e não fazer nenhuma requisição de medição. A verificação não grava nada no navegador.
- **Dados enviados:** apenas visualizações de página automáticas. É proibido usar `track()` ou eventos personalizados. `beforeSend` reduz `url` a origem + caminho, descartando query e fragmento, e descarta o evento se a URL não for da própria origem. Termo buscado, cidade, coordenadas, fuso e valores meteorológicos nunca entram em URL, título, evento ou propriedade enviados à medição.
- **Armazenamento:** o código da aplicação não cria cookie nem chave em `localStorage`, `sessionStorage` ou IndexedDB para a medição. A última cidade continua sendo o único registro local da aplicação.
- **Falha isolada:** bloqueio por extensão, 404 do script fora da Vercel ou erro de rede na medição não afetam busca, previsão nem diálogo e não disparam novas tentativas. O código da aplicação não registra nada no console; a única mensagem aceita é a informativa (`console.log`) que o próprio pacote emite quando o script não carrega.
- **Aviso de privacidade** (`site-information.tsx`), na seção “Seus dados”, em linguagem simples:
  - a Vercel gera estatísticas de visitas sem cookies: página acessada, site de origem, localização aproximada estimada pelo IP (país, região e cidade), tipo de dispositivo, sistema e navegador;
  - o identificador de visita é derivado da conexão e descartado em até 24 horas; o responsável vê apenas números agregados, sem IP; a eventual retenção pela Vercel segue a política dela;
  - o termo buscado e a cidade escolhida não são enviados a essas estatísticas;
  - com Global Privacy Control ou Do Not Track ativos, a medição não é carregada.
- **Finalidade e base legal no aviso:** a frase final passa a citar resposta às consultas, proteção contra abuso e medição agregada do uso, com base no legítimo interesse, e mantém “Não há publicidade, venda de dados nem criação de perfis”.
- **Direitos no aviso:** a seção “Seus direitos” informa que a pessoa pode se opor à medição ativando Global Privacy Control ou Do Not Track (bloqueadores de conteúdo também a impedem), além do contato já existente.
- **Testes deste módulo:**
  - o módulo de medição injeta somente em produção e sem sinal de recusa;
  - não injeta com GPC, com DNT `"1"` em `navigator` ou em `window`, nem em desenvolvimento;
  - `beforeSend` remove query e fragmento e descarta URL de outra origem;
  - o diálogo contém os novos itens do aviso e não contém mais “análise de audiência” como negativa.

  Cobertura, axe e contraste seguem `CONSTRAINTS.md`; o texto maior do diálogo não pode criar rolagem horizontal em 360 px.

## Previsão por hora — requisitos aprovados em 2026-11-03

**Estado:** requisitos aprovados pelo proprietário em 2026-11-03; implementação autorizada no mesmo dia e **concluída localmente**, com gates locais verdes (resultado em `tasks/vercel-todo.md`). Esta seção registra a aprovação exigida em “Ask first” para consumir um campo novo da API. Somente para a seção descrita aqui, ela retira “hourly weather” da lista do que o site não faz. O contrato está em `SPEC-weather-forecast.md`, seção de mesma data.

**Revisão do mesmo dia, a pedido do proprietário:** as horas passam para dentro de cada cartão diário, abertas por um botão; cada hora mostra um ícone de condição, com variante noturna; ícones substituem os rótulos visíveis das linhas; e a nota visível sobre a chuva sai. Esta revisão substitui a seção separada, os botões de escolha de dia e a nota da primeira versão.

**Ajustes do mesmo dia, a pedido do proprietário:** a unidade fica embaixo do número em cada célula; o botão segue os cantos arredondados de 0,45rem dos demais botões, com cores discretas; e o cartão HOJE mostra as 24 horas, com a hora atual destacada e a tabela rolada até ela ao abrir. Estes ajustes substituem a decisão anterior de começar o HOJE na hora atual. Na conferência visual do proprietário, também no mesmo dia: o cabeçalho da hora atual passa a uma linha só (“Agora”), porque a segunda linha aumentava a altura do cabeçalho; e abrir um painel faz crescer só aquele cartão, sem esticar os vizinhos.

### Apresentação

- **Posição:** cada cartão diário (HOJE e os seis seguintes) termina com um botão “Ver por hora”. Ao ser acionado, ele abre a faixa de horas **dentro do próprio cartão**, e o texto passa a “Ocultar horas”.
- **Botão:**
  - usa `aria-expanded` e `aria-controls` apontando para o painel;
  - tem nome acessível com o dia (“Ver por hora de Sexta-feira, 25/09”), que começa pelo texto visível, conforme o critério 2.5.3 da WCAG;
  - cantos de 0,45rem, como os demais botões; fechado, fundo escuro translúcido e borda ciano fraca; aberto, só um preenchimento ciano leve e borda um pouco mais visível, sem o preenchimento claro dos botões principais;
  - o estado aberto também muda o preenchimento e a seta (▾/▴), sem depender só de cor;
  - cada cartão abre e fecha de forma independente, e todos começam fechados.
- **Onde fica o estado:** quais cartões estão abertos existe só na memória da página. Isso não vai para URL (query ou fragmento), armazenamento do navegador, medição de audiência ou logs. Uma nova cidade recria os cartões fechados. A última cidade continua sendo o único registro local.
- **Tabela de horas:**
  - fica numa `<table>` com legenda oculta que nomeia o dia (“Previsão por hora de Sexta-feira, 25/09”);
  - as colunas são as horas, com `<th scope="col">` no formato “14h”;
  - as linhas, com `<th scope="row">`, são condição, temperatura e chuva.
- **Rótulos das linhas:** a linha de temperatura usa o ícone de termômetro, e a de chuva o ícone de gota de medição, sem texto visível. Os nomes “Condição”, “Temperatura” e “Chuva na hora anterior” continuam disponíveis para tecnologia assistiva.
- **Condição por hora:** cada hora mostra o ícone da sua categoria, como nos cartões, usando a variante noturna para céu limpo e tempestade quando `isDay` é falso. O rótulo em português (Limpo, Nublado, Chuva, Neve, Tempestade) fica disponível para tecnologia assistiva.
- **Horas exibidas:** todos os cartões, inclusive HOJE, mostram de 00h a 23h. O painel fechado não renderiza a tabela.
- **Hora atual (só HOJE):**
  - a coluna da hora de `current.validAtLocal` (minutos descartados) recebe um preenchimento leve, e o cabeçalho dela mostra “Agora” no lugar da hora, numa linha só, sem depender só de cor; a hora (“21h”) continua disponível para tecnologia assistiva;
  - ao abrir o painel, a tabela rola de imediato, sem animação, até essa coluna ficar logo depois da coluna fixa dos ícones; perto do fim do dia, a rolagem para no máximo possível. As horas anteriores ficam acessíveis rolando para a esquerda;
  - os outros cartões não têm destaque nem rolagem inicial.
- **Formato dos valores:**
  - temperatura e chuva usam o mesmo formato `pt-BR` dos cartões, com °C e mm explícitos;
  - a unidade fica numa linha própria, embaixo do número, em fonte menor; o texto da célula continua “22,5 °C” para tecnologia assistiva;
  - um `null` aparece como “—” visível, com o texto “Indisponível” para tecnologia assistiva, e nunca como zero.
- **Semântica da chuva:**
  - sem nota visível, por decisão do proprietário; o nome acessível da linha mantém “Chuva na hora anterior”;
  - a interface não soma nem resume as horas: os cartões continuam usando os totais diários da API, que podem diferir levemente da soma horária.
- **Ícones:** os de condição, a gota de medição e um termômetro derivado do `thermometer-warmer` do mesmo conjunto Meteocons (licença MIT), sem as setas. A derivação está registrada em `third-party-licenses.txt`. Todos são decorativos (`alt=""`).

### Layout, acessibilidade e desempenho

- **Rolagem horizontal:** só a região da tabela, dentro do cartão, rola na horizontal.
  - A região é uma `<section>` (papel `region` implícito) com o nome da legenda da tabela e `tabindex="0"`, para atender à regra do axe sobre regiões roláveis focáveis.
  - O Biome proíbe `tabIndex` nesse elemento. O proprietário manteve a tabela rolável em vez de uma grade sem rolagem e aprovou em 2026-11-03 a única supressão necessária, registrada como exceção em `CONSTRAINTS.md`, com validade até 2027-02-01.
  - A região é `position: relative`, para que os rótulos ocultos das células distantes não escapem do recorte e criem rolagem na página.
  - A coluna de ícones das linhas fica fixa à esquerda, com fundo opaco.
  - A barra de rolagem é fina e discreta (`scrollbar-width` e `scrollbar-color`), onde o navegador aceita.
  - O foco permanece visível nos dez fundos, e em 360 px a página não tem rolagem horizontal.
- **Grade dos cartões:**
  - com todos os painéis fechados, as linhas da grade mantêm a mesma altura;
  - com um painel aberto, só aquele cartão cresce. Os demais mantêm a altura de quando todos estavam fechados, e o fundo fica visível ao lado do cartão aberto. A linha seguinte começa abaixo dele;
  - essa altura é medida pela interface enquanto todos estão fechados. Se a largura mudar com um painel aberto, os demais passam à própria altura até todos fecharem;
  - no celular, a coluna única usa `minmax(0, 1fr)`, para que a tabela não alargue o cartão.
- **Movimento:** abrir e rolar não usa animação. `prefers-reduced-motion` continua respeitado.
- **Superfícies e contraste:** as superfícies seguem as dos cartões, com contraste verificado nos dez fundos e no estado neutro, em mobile e desktop, inclusive com um painel aberto.
- **Desempenho:** os painéis começam fechados, então a carga inicial e o elemento de LCP não mudam. Abrir um painel é ação da pessoa, fora da medição de CLS.

### Aviso temporário da novidade — aprovado em 2026-11-03

Pedido do proprietário: avisar os visitantes sobre a previsão por hora por uma semana. Ele escolheu a opção sem armazenamento.

- **Onde e quando:**
  - fica entre o título “Previsão de 7 dias” e os cartões, só quando a previsão traz horas;
  - não aparece na tela neutra, no carregamento nem nos erros.
- **Texto:** selo “Novidade” e “Previsão por hora: toque em “Ver por hora” em qualquer dia para ver a condição, a temperatura e a chuva de cada hora.”
- **Prazo:**
  - aparece até 23h59min59s de 2026-11-10, no horário de Brasília (`HOURLY_NOTICE_ENDS_AT` em `hourly-notice.tsx`), comparado ao relógio do visitante;
  - depois disso some sem novo deploy;
  - a data pode ser ajustada no merge para uma semana após a publicação;
  - depois do prazo, o código do aviso é removido.
- **Fechar:**
  - o botão “Fechar” tem o nome acessível “Fechar aviso de novidade”;
  - o aviso fica fechado só na memória da página: continua fechado ao trocar de cidade e volta numa nova visita, se ainda estiver no prazo;
  - nada vai para armazenamento do navegador, URL, medição ou logs. A última cidade continua sendo o único registro local, e o aviso de privacidade não muda;
  - ao fechar, o foco vai para o botão “Ver por hora” do HOJE.
- **Visual:**
  - superfície escura dos cartões, borda ciano fraca e cantos de 0,75rem;
  - selo no estilo do selo HOJE e botão no estilo de “Ver por hora”, sem animação;
  - no celular, o botão fica abaixo do texto.
- **Testes:**
  - exibição antes do prazo e ausência a partir dele, ou sem horas;
  - fechamento com foco, persistência ao trocar de cidade e nada no armazenamento;
  - limite exato do prazo;
  - o axe, o contraste nos dez fundos e a performance usam data fixa dentro do prazo, para verificar o aviso visível em qualquer data.

### Validação no navegador e compatibilidade

- **Validação de `daily[].hourly`:** a fronteira HTTP confere o campo; os valores que ela recusa levam a previsão ao estado de indisponibilidade, como os demais dados inválidos. São exigidos:
  - exatamente 24 entradas em `temperatureC`, `precipitationMm`, `conditionCategory` e `isDay`;
  - temperatura finita ou `null`;
  - chuva finita ≥ 0 ou `null`;
  - categoria entre as cinco aceitas;
  - `isDay` booleano.
- **Rollback:** se **nenhum** dia trouxer `hourly` (API anterior durante deploy ou rollback), os botões “Ver por hora” não aparecem e o restante funciona. Presença parcial (alguns dias com, outros sem) é dado inválido.
- **Web anterior com API nova:** o web publicado hoje ignora o campo novo, porque `record()` em `validation.ts` não rejeita chaves extras (conferido em 2026-11-03). Assim, web e API podem ser revertidos de forma independente.

### Privacidade e licença

- **Proibições:** nenhum valor meteorológico, cidade ou painel aberto vai para console, medição, URL ou armazenamento. A regra “Keep query, coordinates and weather values out of browser logs and analytics” continua integral, e eventos personalizados continuam proibidos.
- **Aviso de privacidade:** o aviso não muda, porque não há dado pessoal, destinatário ou armazenamento novo.
- **Atribuição:** a atribuição da Open-Meteo e a indicação de dados adaptados continuam visíveis na mesma tela da previsão.

### Testes

- **Componentes:**
  - botão fechado por padrão, com `aria-expanded`, `aria-controls` e nome acessível com o dia;
  - abrir e fechar, com a tabela renderizada só quando aberta;
  - todos os dias com 24 horas; no HOJE, só a coluna da hora atual destacada, com “Agora” e a hora oculta, e rolagem até ela ao abrir;
  - unidade em elemento próprio, embaixo do número;
  - ícones e nomes ocultos das linhas, sem nota visível;
  - ícone de condição por hora, com variante noturna e rótulo em português;
  - “—” com “Indisponível” para `null`;
  - sete botões, um por cartão, e todos fechados ao trocar de cidade;
  - botões omitidos quando a API não traz horas;
  - estado de indisponibilidade para horas inválidas ou parciais.
- **Fronteira HTTP:** comprimentos, tipos, negativos, categorias, `isDay` e `null`.
- **Navegador:**
  - axe e contraste com um painel aberto em 360 px, inclusive o do HOJE com a hora atual destacada, e axe com o HOJE aberto em 1280 px;
  - em 1280 px, abrir o HOJE mantém os outros seis cartões na altura de fechados, e a linha seguinte começa abaixo dele;
  - hora atual logo depois da coluna fixa ao abrir o HOJE em 360 px;
  - ausência de rolagem horizontal da página;
  - foco visível na região rolável alcançada por Tab a partir do botão.
- **Cobertura:** o web mantém pelo menos 80% em todas as métricas.

### Critérios de aceite

- [x] Cada cartão diário abre, dentro dele, a condição, a temperatura e a chuva de cada hora, com ícones e unidades explícitas.
- [x] A tabela é acessível por teclado e leitor de tela, sem rolagem horizontal da página, e passa no axe sem violações críticas ou graves.
- [x] Quais cartões estão abertos não sai da memória da página; nenhum valor vai para logs, URL, armazenamento ou medição.
- [x] Sem `hourly`, a previsão continua funcionando sem os botões; com dados inválidos, aparece o estado de indisponibilidade.
- [x] LCP e CLS continuam dentro de `CONSTRAINTS.md`.
