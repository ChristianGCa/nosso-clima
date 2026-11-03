# ADR 0002 — Medição agregada de audiência com Vercel Web Analytics

- **Estado:** requisitos aprovados pelo proprietário em 2026-11-03; implementação aguarda autorização separada.
- **Decisores:** proprietário do NossoClima.
- **Requisitos:** `SPEC-weather-ui.md` (seção “Medição agregada de audiência”) e `SPEC-production-delivery.md` (seção “Medição de audiência e headers adicionais”). Progresso em `tasks/vercel-todo.md`.

## Contexto

O site está público desde 2026-10-12, sem nenhuma medição de uso. O proprietário quer saber de onde vêm os acessos e de quais dispositivos. O aviso atual afirma que não há análise de audiência. O web já tem CSP restrita à própria origem, `Referrer-Policy: no-referrer`, nenhuma rota com dado do visitante na URL (a aplicação é uma página única em `/`) e um teste E2E que proíbe requisições do navegador a terceiros. O projeto usa apenas planos gratuitos.

Segundo a documentação “Privacy and Compliance” do Web Analytics (atualizada em 2026-06-26):
- não usa cookies;
- identifica a visita por um hash da requisição, descartado em 24 horas;
- pode guardar por evento: horário, URL, rota, referrer, parâmetros filtrados, localização aproximada (país, região, cidade), sistema, navegador e tipo de dispositivo;
- o painel mostra dados agregados.

No Hobby, são 50.000 eventos por mês sem cobrança: ao atingir o limite, a coleta pausa. Não há eventos personalizados, e o painel mostra um mês.

## Decisão

Ativar o Vercel Web Analytics somente no projeto web, carregado pelo pacote `@vercel/analytics` a partir da própria origem, com estas salvaguardas:
- apenas visualizações de página;
- URL reduzida a origem + caminho;
- nenhuma carga com Global Privacy Control ou Do Not Track;
- nenhum armazenamento novo no navegador;
- aviso de privacidade atualizado no mesmo deployment que inicia a coleta.

Junto, acrescentar `Permissions-Policy` e `Cross-Origin-Opener-Policy` ao web. A base legal é o legítimo interesse (LGPD, art. 7º, IX, e art. 10), sustentada pelo teste abaixo.

## Alternativas consideradas

| Alternativa | Motivo da decisão |
|---|---|
| Não medir | Mantém o estado atual, mas não atende à necessidade do proprietário |
| Google Analytics ou similar com cookies | Usa cookies e domínio de terceiros, tem vínculo com publicidade e exigiria consentimento e mudança de CSP |
| Outro serviço externo sem cookies | Acrescenta um novo operador, uma nova transferência internacional e um domínio externo na CSP |
| Medição própria (self-hosted) | Exigiria nova infraestrutura e armazenamento fora do plano gratuito atual |
| Logs da Vercel | Não fornecem relatórios agregados de origem e dispositivo, e usá-los para isso ampliaria o uso de dados com IP |

## Teste de balanceamento do legítimo interesse

Modelo em três etapas do “Guia Orientativo: Hipóteses Legais de Tratamento de Dados Pessoais — Legítimo Interesse” (ANPD, fevereiro de 2024). O registro abaixo é o documento de referência; deve ser revisado nas situações listadas em “Reavaliação obrigatória” da spec de entrega.

### 1. Finalidade

- **Interesse:** entender o alcance e o uso de um serviço público e gratuito (origem das visitas e tipos de dispositivo) para priorizar compatibilidade, layout e divulgação.
- **Legitimidade:** é um interesse lícito do controlador; não envolve publicidade, venda de dados, perfil individual nem decisão automatizada sobre pessoas.
- **Situação concreta:** a medição começa somente com o aviso atualizado e se limita a uma página sem login.

### 2. Necessidade

- **Dados usados:** a Vercel já recebe o IP e o agente do navegador para entregar o site. A medição produz apenas categorias agregadas (país/região/cidade, tipo de dispositivo, sistema, navegador, site de origem e página).
- **Minimização:**
  - sem eventos personalizados;
  - a URL é reduzida a origem + caminho (sempre `/` hoje);
  - termo buscado, cidade, coordenadas e valores meteorológicos ficam fora da medição por requisito;
  - o referrer externo depende da política do site de origem; os navegadores atuais enviam apenas a origem por padrão.
- **Meio menos intrusivo:** entre as alternativas viáveis no plano gratuito, é o que não usa cookies nem domínio de terceiros e não acrescenta fornecedor.

### 3. Balanceamento e salvaguardas

- **Expectativa do titular:** estatísticas agregadas de visitas são uma prática comum e esperada em sites públicos, desde que informadas. O aviso passa a descrevê-las antes de a coleta começar.
- **Riscos:** a Vercel vê o IP no momento da coleta e mantém um identificador de visita por até 24 horas, o que torna o dado pseudonimizado e não anônimo do lado dela. O tratamento ocorre nos Estados Unidos. A localização pode chegar ao nível de cidade.
- **Salvaguardas:**
  - respeito a Global Privacy Control e Do Not Track, sem carregar o script;
  - nenhum cookie ou armazenamento novo;
  - CSP mantida na própria origem;
  - relatórios somente agregados, sem IP para o controlador;
  - nenhuma exportação ou Drain;
  - nenhum dado do painel no Git;
  - oposição informada no aviso e pelo contato existente;
  - acesso ao painel restrito à conta do proprietário, com segundo fator recomendado.
- **Crianças e adolescentes:** o site não é voltado ao público infantojuvenil, não tem publicidade, perfis nem mecanismos de engajamento. A medição agregada não altera esse quadro; o guia admite legítimo interesse observando o melhor interesse.
- **Resultado:** o interesse prevalece com as salvaguardas acima. Se uma delas deixar de ser viável (por exemplo, envio a outra origem ou impossibilidade de respeitar GPC/DNT), o resultado passa a ser inconclusivo e a medição não deve ser ativada sem nova decisão.

## Referências normativas consultadas (2026-11-03)

- **LGPD (Lei 13.709/2018):**
  - art. 6º (finalidade, necessidade, transparência);
  - art. 7º, IX, e art. 10 (legítimo interesse);
  - art. 9º (acesso facilitado à informação);
  - art. 12 (dados anonimizados);
  - art. 18, § 2º (oposição).
- **Guias da ANPD:** “Cookies e Proteção de Dados Pessoais” (outubro de 2022), aplicado por analogia porque não há cookies, e o guia de legítimo interesse (fevereiro de 2024).
- **Resoluções da ANPD:**
  - CD/ANPD nº 2/2022 (agentes de pequeno porte: o canal de contato substitui o encarregado);
  - CD/ANPD nº 19/2024 (transferência internacional, já pendente na lista ativa para a Vercel).
- **Marco Civil da Internet (Lei 12.965/2014):**
  - art. 7º, VIII (informações claras sobre coleta);
  - art. 15 (guarda de registros), que não se aplica a pessoa natural sem fins econômicos.
- **ECA Digital (Lei 15.211/2025, em vigor desde 2026-03-17):** risco baixo pelo perfil do site.

Esta ADR é uma análise técnica de conformidade feita para o projeto e não substitui parecer jurídico.

## Consequências

- Uma dependência de produção nova (`@vercel/analytics`, licença MIT, sem dependências de runtime), coberta por `npm audit` e pelo lockfile.
- O aviso de privacidade cresce. Diálogo, axe e contraste precisam ser verificados de novo.
- O projeto web passa a depender de uma funcionalidade do painel da Vercel conduzida pelo proprietário. A pausa por limite gratuito é aceita.
- A pendência de transferência internacional da lista ativa passa a abranger também a medição.
