# Preparação local de eco e ensaios agrupados — 2026-10-10

Continuação na branch `chore/vercel-p1`, checkout inicialmente limpo, base `40d674e`. A implementação executa o mecanismo de teste de Preview já autorizado nas specs. Este registro não conclui P1 nem autoriza publicação; não houve alteração de variáveis/painéis, deployment, túnel público ou chamadas Open-Meteo nesta rodada.

## Resultado preparado

- API: destino HTTPS de teste com token, permitido somente em Preview, depois da allowlist, circuito e reserva. Configuração parcial/inválida ou presente em Production impede inicialização com erro seguro. A marca de modo de eco permite ao executor interromper antes de consultas válidas ao deployment errado.
- Receptor: fixtures compatíveis com os adapters, HTTP loopback protegido, contagens limitadas, indicadores de IP/canário, calibração de sete headers e controles de 429, excesso de tamanho e timeout. Sem retenção de requests, consulta, header bruto ou credencial nas respostas/logs. Comparação de IPv6 equivalente e IPv4 mapeado incluída.
- Executor: perfis frios/repetidos e quatro chamadas concorrentes por chave nos dois caminhos, ou perfil 503 com zero chamadas ao eco. Confere JSON, cache/no-store, CDN MISS e deltas do receptor, separando tokens de proteção por projeto e interrompendo redirects. O resumo omite dados operacionais e mantém atomicidade, confiança de identidade e múltiplas instâncias como não comprovadas.
- Guia: `docs/deploy/preview-probe-guide.md` organiza preparação, coleta, cenários complementares e restauração. O proprietário informou que não dispõe de entrada HTTPS para o eco. Foi definida a opção temporária Quick Tunnel, disponível no `cloudflared` 2026.9.3 já instalado; nenhum túnel foi iniciado. A reescrita de headers pela Cloudflare limita a prova de privacidade, e a calibração impede tratá-la como completa.

## Verificação local

Node 24.21.0 e npm 12.0.2, usando o npm disponível no cache local. O launcher do npm desse cache não resolve corretamente sua instalação quando invocado diretamente pelo PATH; foi usado um wrapper temporário fora do repositório para executar o CLI exato. Nenhuma dependência ou lockfile mudou.

| Gate | Resultado observado |
|---|---|
| `npm run check` | Passou: tipos, lint, formato, 535 testes API, 90 web, três testes de fronteiras, quatro de configuração web e 15 das ferramentas de Preview |
| `npm run test:coverage` | Passou: API 94,95% statements, 91,99% branches, 94,78% functions e 97,97% lines; web 96,88%, 89,84%, 97,43% e 98,94%, respectivamente |
| Builds API/web e entrada Function | Passaram; entrada também compilada pelo comando E2E |
| `npm audit --audit-level=high` | Zero vulnerabilidades |
| Gitleaks 8.30.1 | Arquivo baixado com checksum da CI validado; zero achados no diretório atual e nos 120 commits do histórico consultado |
| Diff/documentação | Diff sem erros de whitespace; documentação adicionada sem hyperlinks novos ou URLs operacionais |
| `npm run test:e2e` | Pendente: não iniciou Chromium porque a revisão exigida pelo Playwright não está instalada; instalação completa e somente headless shell falharam por timeout do download, mesmo fora do sandbox |

O sandbox bloqueou o teste HTTP de loopback, que passou fora dele. A auditoria/download do scanner também precisaram de acesso de rede autorizado. Esses bloqueios não foram contornados com alterações de testes, versões, constraints ou supressões. O browser antigo existente não foi substituído pela revisão esperada nem usado para alegar sucesso do gate.

Axe, performance e CI hospedada não foram reexecutados. A interface não foi alterada. A indisponibilidade de instalação do Chromium mantém E2E pendente; o comando canônico deve passar antes de merge/release. Não inferir resultado atual a partir de evidências antigas.

## Próxima execução

Preparar o arquivo local privado e a entrada HTTPS conforme o guia, configurar/deployar o Preview isolado pelo proprietário e coletar uma rodada agrupada. Registrar apenas resultados anonimizados e o alcance da calibração. Continuam as provas hospedadas de contenção/reserva, headers de identidade confiáveis, ausência de IP nos caminhos finais, custo Free, demais falhas/TTL e corpo bruto real, além de Production, direitos, privacidade final e rollback.

## Diagnóstico posterior do executor — 2026-10-10

O proprietário iniciou o receptor/túnel e forneceu relatório autenticado 200, modo normal e contagens zeradas. Após a interrupção genérica do probe, o agente validou somente a sintaxe da configuração local, sem imprimir valores, e fez coletas de leitura limitadas ao eco e a entradas inválidas. Nenhuma consulta meteorológica válida foi enviada. A calibração conjunta retornou 403. Na coleta individual, relatório, canário e os outros seis controles retornaram 200; `cf-connecting-ip` retornou 403 da Cloudflare. A correção testa os controles separadamente, registra status por header e mantém a privacidade parcial quando um controle é bloqueado; o baseline autenticado continua obrigatório.

Com a calibração corrigida, o preflight da API direta retornou 401. A conferência local de presença encontrou `PROBE_API_BYPASS` e `PROBE_WEB_BYPASS` ausentes, sem ler/exibir seus valores. O próximo passo do proprietário é criar segredos de Protection Bypass for Automation nos respectivos projetos e guardá-los somente no arquivo privado do executor, mantendo Deployment Protection. Fonte oficial conferida: Vercel Docs, Protection Bypass for Automation. O fluxo de aplicação/rewrite ainda não foi coletado nesta continuação.

`npm run check` passou com 535 testes API, 90 web e 20 das ferramentas de Preview, além de tipos, lint, formato e fronteiras. O scan direto do diretório detectou a credencial esperada no arquivo privado `.env.preview-probe`; o arquivo está ignorado e não versionado. Um snapshot dos arquivos rastreados e novos não ignorados, incluindo as mudanças desta correção, passou Gitleaks sem achados. Não foi adicionada supressão ou exceção; configurações privadas e relatório redigido ficaram fora do Git. Os gates de release, inclusive E2E pendente, permanecem.

### Autorização do rewrite protegido

Após a correção do executor, `npm run check` passou com 535 testes API, 90 web e 21 das ferramentas de Preview. A execução hospedada do executor foi limitada aos dois preflights inválidos, que passaram; a rotina de diagnóstico recusou todas as consultas válidas. O proprietário pode executar a rodada completa com o arquivo privado já configurado.

Após o proprietário corrigir a configuração de eco e cadastrar os tokens de automação, o preflight direto passou e o rewrite retornou 401. A coleta independente do agente encontrou HTML web 200 com documento da aplicação e busca inválida reescrita 401: o token web autorizava o ingresso, mas não o destino API. Com o bootstrap oficial de cookie do web, foram observados redirect 307 com cookie, HTML 200 e busca inválida pelo rewrite 400 com marca de eco. Nenhum cookie/valor de token, URL ou identificador foi impresso/versionado; nenhum pedido meteorológico válido foi enviado. O executor passou a aplicar esse fluxo em memória, com isolamento de headers/cookie e interrupção quando o bootstrap falha. Fonte: Vercel Docs, Protection Bypass for Automation. Nenhuma configuração de projeto/proteção foi alterada pelo agente.
