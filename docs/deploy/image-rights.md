# Inventário de origem dos arquivos visuais

Estado em 2026-10-01: **origem declarada; revisão de publicação pendente**. O proprietário informou em 2026-09-27 que gerou os dez fundos no aplicativo Gemini sem enviar imagens de referência e confirmou em 2026-10-01 que os fundos foram gerados no Gemini. Também informou em 2026-10-01 que o logo foi gerado com IA, sem especificar a ferramenta ou o material de origem. Essas declarações não equivalem a uma conclusão sobre direitos autorais, licença ou ausência de elementos de terceiros.

## Fundos WebP

Todos os caminhos da primeira coluna são relativos a `apps/web/src/assets/backgrounds/`; os da segunda são relativos a `backgrounds/`. Em 2026-10-01, `cmp` confirmou que os cinco arquivos diurnos são idênticos aos originais de mesmo nome e que os cinco noturnos diferem. A relação dos noturnos como variantes otimizadas é a já informada em `SPEC-weather-ui.md`; a comparação binária sozinha não prova sua derivação.

| Arquivo distribuído | Original informado | Comparação binária | Origem declarada |
|---|---|---|---|
| `dia-chuvoso.webp` | `dia-chuvoso.webp` | Idêntico | Gemini |
| `dia-limpo.webp` | `dia-limpo.webp` | Idêntico | Gemini |
| `dia-neve.webp` | `dia-neve.webp` | Idêntico | Gemini |
| `dia-nublado.webp` | `dia-nublado.webp` | Idêntico | Gemini |
| `dia-tempestade.webp` | `dia-tempestade.webp` | Idêntico | Gemini |
| `noite-chuvosa.webp` | `noite-chuvosa.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-limpa.webp` | `noite-limpa.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-neve.webp` | `noite-neve.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-nublada.webp` | `noite-nublada.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-tempestade.webp` | `noite-tempestade.webp` | Diferente; variante otimizada informada | Gemini |

## Logo

O proprietário forneceu os SVGs sob `logo/svg/`, os PNGs sob `logo/png/` e `logo/favicon.ico`; variantes usadas pelo site estão sob `apps/web/src/assets/brand/` e `apps/web/public/`. A origem declarada é geração com IA. Ferramenta, eventuais referências, cadeia de exportação e relação exata entre variantes ainda não foram documentadas. Nenhuma licença de código do projeto é inferida da origem do logo.

## Revisão ainda necessária antes da publicação

- Identificar a ferramenta e o tipo de conta usados para o logo, eventual material de referência e os arquivos de origem/edição disponíveis.
- Conferir os termos aplicáveis à geração dos fundos no Gemini e à ferramenta do logo, bem como a presença de marcas, pessoas ou outros elementos de terceiros nos arquivos concretos. Os [termos gerais do Google](https://policies.google.com/terms) dizem que o Google não reivindica propriedade sobre conteúdo original gerado em seus serviços; isso não determina, por si só, direitos exclusivos ou permissão para todo elemento de uma imagem específica.
- Registrar para cada arquivo distribuído a decisão de uso público pretendido, eventual crédito exigido e a relação comprovável com seu original. Se algum arquivo não puder ser liberado, selecionar substituto aprovado antes do build público.

Este inventário atende à parte de **proveniência informada** da tarefa P10 em `tasks/todo.md`. A revisão de direitos e a aprovação final para publicação continuam abertas em `SPEC-production-delivery.md`.
