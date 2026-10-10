# NossoClima

Consulta meteorológica em português com busca de cidades, condições atuais e previsão de sete dias, usando dados da Open-Meteo. Na primeira visita, a tela começa neutra; depois da seleção, o navegador guarda apenas a última cidade e consulta uma previsão nova nas visitas seguintes. Limpar os dados do site remove essa preferência.

**Entrega:** o fluxo já foi testado em Preview protegido; a publicação pública ainda depende dos gates e da decisão do proprietário. A [lista ativa](tasks/vercel-todo.md) concentra o estado atual e o próximo trabalho.

## Executar localmente

Use Node `>=24.15.0 <25` e npm `12.0.2`, conforme [package.json](package.json). Na raiz:

```bash
npm ci
```

Inicie cada aplicação em um terminal:

```bash
npm run dev --workspace @nosso-clima/api
npm run dev --workspace @nosso-clima/web
```

Abra `http://127.0.0.1:5173` (ou a porta indicada pelo Vite). A API escuta em `http://127.0.0.1:3000`; `GET /health` verifica o processo sem consultar serviços externos. O Vite encaminha `/api` à API. O desenvolvimento local usa cache em memória e não exige Redis; consultas manuais usam a Open-Meteo, enquanto os testes usam dados simulados.

Os valores padrão bastam para começar. [apps/api/.env.example](apps/api/.env.example) lista a configuração da API, que recebe variáveis do ambiente do processo; copiar o arquivo para `.env` não o carrega automaticamente. Para alterar uma opção, por exemplo: `LOG_LEVEL=debug npm run dev --workspace @nosso-clima/api`. No web, deixe `VITE_API_BASE_URL` ausente para usar o proxy; uma origem separada é opcional apenas no desenvolvimento. Em build de produção, valor vazio ou origem divergente é rejeitado. Veja [apps/web/.env.example](apps/web/.env.example).

Confira `node --version` e `npm --version`. Se o npm instalado for diferente, use `npx --yes npm@12.0.2 ci` e `npx --yes npm@12.0.2 run check`.

## Estrutura e contratos

| Caminho | Responsabilidade |
|---|---|
| `apps/web` | React/Vite: busca, seleção de cidade, apresentação e armazenamento local |
| `apps/api` | Fastify/Node: validação, contratos HTTP e acesso à Open-Meteo |
| `scripts` | Fronteiras de código, configuração de entrega, E2E e performance |
| `backgrounds`, `logo` | Originais visuais; as variantes distribuídas ficam no web |

O web consome `GET /api/v1/locations` e `GET /api/v1/forecast`, sem importar runtime da API. Na Vercel, dois projetos são ligados por rewrite e a API usa Upstash para cache, limites e reserva de cota. A [ADR 0001](docs/decisions/0001-vercel-upstash.md) explica essa escolha; o [runbook](docs/deploy/vercel-upstash-runbook.md) descreve configuração, diagnóstico e procedimentos de entrega.

## Verificar mudanças

| Comando na raiz | Verificação |
|---|---|
| `npm run check` | Tipos, lint, formato, testes, fronteiras e configuração de entrega |
| `npm run test:coverage` | Cobertura mínima por aplicação |
| `npm run build --workspaces` | Builds independentes da API e do web |
| `npm run test:a11y` | Acessibilidade e contraste nos dez fundos, em mobile e desktop |
| `npm run test:e2e` | Fluxos de navegador com a entrada Vercel compilada e serviços simulados |
| `npm run test:performance` | LCP e CLS móveis; resultado em `artifacts/performance.json` |
| `npm audit --audit-level=high` | Auditoria de dependências |

Os testes de navegador exigem Chromium: `npx playwright install chromium`. A [CI](.github/workflows/ci.yml) também executa builds e Gitleaks. Os limiares e momentos de execução estão em [CONSTRAINTS.md](CONSTRAINTS.md); resultados antigos não comprovam a revisão atual.

## Onde documentar

Antes de alterar código, leia [AGENTS.md](AGENTS.md), o [mapa de capacidades](CAPABILITY-MAP.md), as [restrições](CONSTRAINTS.md) e a spec do módulo:

- [Plataforma](SPEC-backend-platform.md), incluindo o [contrato local detalhado](docs/architecture/backend-local-baseline.md).
- [Busca](SPEC-location-search.md), [previsão](SPEC-weather-forecast.md) e [interface](SPEC-weather-ui.md).
- [Entrega de produção](SPEC-production-delivery.md).

Cada informação tem um lugar: requisitos nas specs; motivos na ADR; sequência no [plano](tasks/vercel-plan.md); progresso e pendências na [lista ativa](tasks/vercel-todo.md); procedimentos no runbook. Evidências datadas registram o que foi observado, sem se tornar outro plano. O [histórico resumido](docs/history/README.md) preserva aprovações e explica como recuperar documentos encerrados pelo Git.

Atualize o documento responsável em vez de copiar o mesmo status para vários arquivos. Ao encerrar um plano, mantenha o resumo das decisões e use o Git para os detalhes antigos. Logs brutos, builds, cobertura e relatórios gerados ficam nos caminhos já ignorados pelo `.gitignore`; specs, exemplos de ambiente e evidências selecionadas continuam versionados. Nunca inclua credenciais ou identificadores reais de infraestrutura nos relatos.

A documentação será publicada junto com o repositório. Nas evidências operacionais, registre apenas data, revisão Git, papel de cada aplicação, versões, nomes de variáveis, status HTTP, códigos públicos de erro e resultados resumidos. Use domínios de exemplo e placeholders nos procedimentos. Endereços reais de deployments/Redis, IDs de projetos ou contas, valores de ambiente, tokens, cookies, headers de autenticação, IPs, digests HMAC, consultas reais e coordenadas de visitantes ficam fora do Git. O link do repositório, fontes oficiais, contato de publicação já aprovado e exemplos públicos dos contratos têm finalidade pública própria.

Antes de versionar uma evidência, confira o diff e os links locais e revise cada campo para publicação. Remova dados operacionais de capturas e não acrescente exports ou logs brutos, mesmo em caminhos hoje ignorados. Diferencie resultado observado, relato do proprietário e verificação pendente; ausência de acesso e resultados de outra revisão não comprovam um gate concluído.

## Licenças e publicação

O código usa [MIT](LICENSE). Dados e ícones têm [licenças próprias](apps/web/public/third-party-licenses.txt). Os originais de fundos e marca são mantidos para rastreabilidade; a revisão dos direitos de publicação está no [inventário visual](docs/deploy/image-rights.md). Região, retenção, privacidade e rollback ainda fazem parte dos gates de entrega.
