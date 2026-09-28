# Nosso Clima

## Problem Statement

Como podemos permitir que pessoas comuns entendam rapidamente o clima atual e dos próximos sete dias, com informações claras sobre chuva, temperatura e vento, sem uma interface carregada ou ambígua?

## Recommended Direction

Construir um site responsivo de consulta meteorológica orientado à pergunta: **“Como está o tempo e o que esperar dos próximos dias?”**

A interface deve ser utilitária primeiro e visual depois. O fundo muda conforme o clima e o período do dia, mas nunca compromete a leitura. Os dez arquivos WebP existentes cobrem cinco condições — limpo, nublado, chuvoso, tempestade e neve — nas versões diurna e noturna.

O backend funciona como uma camada de proteção e tradução: consulta a Open-Meteo, aplica cache, trata erros e entrega ao frontend um contrato estável e simplificado. O frontend não precisa conhecer o formato original da API externa.

### Stack

- React, Vite e TypeScript no frontend.
- Node.js, Fastify e TypeScript no backend.
- Vitest para testes unitários e de integração.
- React Testing Library para comportamento dos componentes.
- Um pequeno conjunto de testes ponta a ponta com Playwright.
- Cache LRU em memória, evitando Redis no MVP.
- Logs estruturados do Fastify, com identificador da requisição, duração, status e cache hit/miss.
- Frontend e backend implantados separadamente.
- Aplicações independentes em um único repositório, com contratos compartilhados apenas se isso não atrasar a entrega.

Um cache em memória funciona melhor com um processo Node persistente. Em um ambiente serverless com várias instâncias, ele perde boa parte do valor.

## Key Assumptions to Validate

- [ ] Usuários entendem a apresentação conjunta de chance e volume de chuva — testar “70% · 8,4 mm” com pelo menos cinco pessoas.
- [ ] A busca diferencia corretamente cidades homônimas — mostrar cidade, estado ou região e país nos resultados.
- [ ] Os fundos não prejudicam a legibilidade — testar contraste em todas as dez imagens e nos tamanhos móveis.
- [ ] Os arquivos, que chegam perto de 1 MB cada, não degradam a abertura — carregar apenas o fundo atual e medir a página em conexão móvel simulada.
- [ ] Um cache curto mantém os dados suficientemente atuais — mostrar explicitamente o horário da atualização.
- [ ] As imagens podem ser publicadas legalmente — confirmar licença, autoria e eventual necessidade de atribuição.

## MVP Scope

### Busca

- Pesquisa por cidade.
- Busca iniciada apenas após alguns caracteres, com pequeno debounce.
- Lista de resultados contendo cidade, região e país.
- Estados para nenhum resultado, falha e carregamento.
- Seleção explícita antes de carregar a previsão.

### Condições atuais

- Temperatura atual.
- Sensação térmica.
- Condição meteorológica em linguagem simples.
- Velocidade do vento.
- Horário local da cidade.
- Fundo correspondente ao código meteorológico e a dia/noite.
- Horário da última atualização.

### Previsão de sete dias

- Data e dia da semana.
- Temperaturas máxima e mínima.
- Sensações térmicas máxima e mínima.
- Condição predominante.
- Probabilidade máxima de precipitação em `%`.
- Volume previsto de precipitação em `mm`.
- Velocidade máxima do vento.

### Qualidade técnica

- Layout funcional a partir de 360 px.
- Navegação da busca por teclado.
- Contraste adequado sobre todos os fundos.
- Validação das respostas externas no backend.
- Timeout e tratamento de indisponibilidade da Open-Meteo.
- Cache separado para geocodificação e clima.
- Logs sem armazenar dados pessoais desnecessários.
- Endpoint de saúde para o deploy.
- Testes do mapeamento dos códigos meteorológicos.
- Testes dos fluxos de sucesso, cidade inexistente e falha externa.

### Critério de conclusão

O MVP está pronto quando uma pessoa consegue pesquisar uma cidade e compreender a previsão atual e semanal em menos de dez segundos, tanto no celular quanto no computador, mesmo sem conhecer termos meteorológicos.

Também deve ser possível diagnosticar uma falha externa pelos logs e provar por testes que os dados da Open-Meteo são transformados corretamente.

## Not Doing (and Why)

- **Previsão horária** — aumenta muito a densidade da interface.
- **Geolocalização automática** — adiciona permissões e estados extras sem ser essencial.
- **Contas, favoritos ou histórico** — exigiriam persistência e autenticação.
- **Alertas e notificações** — pertencem a uma futura versão PWA.
- **Mapas meteorológicos** — não contribuem para o trabalho central.
- **Comparação de cidades** — útil para viagens, mas é outro fluxo.
- **Troca de unidades** — o MVP usará °C, km/h e mm.
- **Redis ou banco de dados** — cache local basta para validar a arquitetura.
- **Gráficos complexos** — os cartões diários comunicam melhor o escopo atual.
- **Regras como “leve guarda-chuva”** — evitamos transformar previsões incertas em recomendações categóricas.

## Risks

- O mapeamento dos códigos WMO para apenas cinco fundos precisará de uma regra clara e testada.
- Um fundo visualmente forte pode competir com os dados.
- Resultados de busca ambíguos podem levar à cidade errada.
- A Open-Meteo é uma dependência externa; o backend deve falhar de maneira compreensível.
- Observabilidade e cobertura excessivas podem consumir o prazo. Devemos testar os contratos e fluxos críticos, não cada detalhe visual.

## Open Questions

- Quais serão os TTLs exatos de geocodificação e previsão?
- Quais plataformas de deploy oferecem a melhor combinação para um frontend estático e um processo Node persistente?
- O primeiro carregamento deve mostrar uma tela neutra ou uma cidade padrão?
