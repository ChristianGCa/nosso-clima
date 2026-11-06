# NossoClima

<img src="logo/svg/logo-escuro.svg" alt="Logo do NossoClima" width="300" />

O NossoClima é um site de previsão do tempo em português, simples e direto. Você busca uma cidade e vê a condição atual, a previsão dos próximos sete dias e, para cada dia, a previsão hora a hora. Não tem cadastro nem anúncios, e o site não pede sua localização.

**Acesse:** [nossoclima.vercel.app](https://nossoclima.vercel.app/)

## O que o site oferece

- **Busca de cidades** com sugestões enquanto você digita, inclusive pelo teclado.
- **Condições atuais:** temperatura, sensação térmica, vento e o horário em que os dados valem.
- **Previsão de sete dias:** máxima e mínima, chance e volume de chuva e a condição predominante de cada dia. O dia de hoje traz mais detalhes.
- **Previsão por hora:** condição, temperatura e chuva de cada hora, em qualquer um dos sete dias. No dia de hoje, a hora atual fica destacada.
- **Fundo que acompanha o tempo:** a imagem de fundo muda conforme a condição atual e se é dia ou noite.
- **Funciona no celular e no computador**, com navegação por teclado, compatibilidade com leitores de tela e contraste verificado.

## Privacidade

- A única informação guardada no seu navegador é a última cidade escolhida, para abrir a previsão dela na próxima visita. Para apagá-la, basta limpar os dados do site.
- As visitas são contadas apenas em números agregados, sem cookies. Com Global Privacy Control ou Do Not Track ativos no navegador, nenhuma estatística de visita é coletada.
- O termo buscado e a cidade escolhida não entram nessas estatísticas.

Os detalhes ficam no próprio site, em “Privacidade e créditos”.

## Como funciona

O projeto tem duas partes:

- **Site (`apps/web`):** feito com React e Vite. Ele mostra a busca e a previsão e só conversa com a API do próprio NossoClima.
- **API (`apps/api`):** feita com Fastify em Node.js. Ela busca cidades e previsões na Open-Meteo, confere e organiza os dados e devolve só o que o site precisa.

Em produção, os dois rodam na Vercel. A API usa o Upstash Redis para guardar respostas recentes em cache e para limitar o número de consultas, o que mantém o uso dentro dos limites gratuitos da Open-Meteo.

## Executar localmente

É preciso ter Node.js 24 (`>=24.15.0 <25`) e npm 12.0.2. Na raiz do repositório, instale as dependências:

```bash
npm ci
```

Depois, inicie a API e o site, cada um num terminal:

```bash
npm run dev --workspace @nosso-clima/api
npm run dev --workspace @nosso-clima/web
```

Abra `http://127.0.0.1:5173` (ou a porta indicada pelo Vite). Localmente, a API usa cache em memória e não precisa de Redis. As buscas feitas no navegador consultam a Open-Meteo de verdade, enquanto os testes usam dados simulados.

As opções de configuração estão em `apps/api/.env.example` e `apps/web/.env.example`, mas os valores padrão bastam para começar.

## Testes

| Comando | O que verifica |
|---|---|
| `npm run check` | Tipos, lint, formatação e testes unitários e de integração |
| `npm run test:coverage` | Cobertura mínima de testes em cada aplicação |
| `npm run test:a11y` | Acessibilidade e contraste em celular e computador |
| `npm run test:e2e` | Fluxos completos no navegador, com serviços simulados |
| `npm run test:performance` | Tempo de carregamento e estabilidade do layout no celular |

Os testes de navegador usam o Chromium do Playwright, que pode ser instalado com `npx playwright install chromium`.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `apps/web` | O site |
| `apps/api` | A API |
| `scripts` | Verificações de arquitetura, configuração de publicação e testes de navegador |
| `backgrounds`, `logo` | Imagens originais de fundo e a marca |
| `docs` | Decisões de arquitetura, procedimentos de publicação e registros técnicos |

Os arquivos `SPEC-*.md` na raiz descrevem em detalhe o comportamento de cada parte do projeto.

## Créditos e licenças

- **Dados meteorológicos:** Open-Meteo, sob licença CC BY 4.0. Os dados são adaptados pelo NossoClima.
- **Localidades:** GeoNames, por meio da geocodificação da Open-Meteo.
- **Ícones:** Meteocons, de Bas Milius, sob licença MIT.
- **Código:** licença [MIT](LICENSE).

As licenças de terceiros estão em `apps/web/public/third-party-licenses.txt`.
