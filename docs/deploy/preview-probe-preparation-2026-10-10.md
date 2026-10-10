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
