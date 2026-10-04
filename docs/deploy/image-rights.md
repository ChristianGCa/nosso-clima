# Inventário de origem dos arquivos visuais

Estado em 2026-10-03: **origem declarada; revisão de publicação pendente**. O proprietário informou em 2026-09-27 que gerou os dez fundos no aplicativo Gemini sem enviar imagens de referência e confirmou em 2026-10-01 que os fundos foram gerados no Gemini. Em 2026-10-03 determinou que os fundos sejam publicados e informou que gerou o logo em uma conta pessoal gratuita do Claude, pedindo opções e depois variantes de cor, usando apenas texto e sem enviar imagem, marca ou arquivo de referência. Essas declarações não equivalem a uma conclusão sobre direitos autorais ou licença.

## Fundos WebP

Todos os caminhos da primeira coluna são relativos a `apps/web/src/assets/backgrounds/`; os da segunda são relativos a `backgrounds/`. Em 2026-10-03, os cinco arquivos diurnos distribuídos foram reencodados a partir dos originais preservados, usando ImageMagick WebP com qualidade 78 e método 6. As dimensões não mudaram; os tamanhos passaram de 4.092.628 para 2.184.682 bytes no conjunto diurno (redução de 46,6%). Os cinco arquivos noturnos continuam variantes previamente informadas; sua comparação binária com os originais não prova, sozinha, a derivação.

| Arquivo distribuído | Original informado | Comparação binária | Origem declarada |
|---|---|---|---|
| `dia-chuvoso.webp` | `dia-chuvoso.webp` | Reencodado em 2026-10-03 | Gemini |
| `dia-limpo.webp` | `dia-limpo.webp` | Reencodado em 2026-10-03 | Gemini |
| `dia-neve.webp` | `dia-neve.webp` | Reencodado em 2026-10-03 | Gemini |
| `dia-nublado.webp` | `dia-nublado.webp` | Reencodado em 2026-10-03 | Gemini |
| `dia-tempestade.webp` | `dia-tempestade.webp` | Reencodado em 2026-10-03 | Gemini |
| `noite-chuvosa.webp` | `noite-chuvosa.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-limpa.webp` | `noite-limpa.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-neve.webp` | `noite-neve.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-nublada.webp` | `noite-nublada.webp` | Diferente; variante otimizada informada | Gemini |
| `noite-tempestade.webp` | `noite-tempestade.webp` | Diferente; variante otimizada informada | Gemini |

Em 2026-10-03, uma inspeção visual das dez variantes distribuídas e do logo não encontrou marca d'água, texto, pessoa ou marca de terceiros visível. A busca estática nos SVGs de `logo/svg/`, `apps/web/src/assets/` e `apps/web/public/` não encontrou elementos `script`, `foreignObject`, `iframe`, `image` ou `use`, manipuladores de eventos, `href`, `javascript:` ou referências externas em `url(...)`. Isso não substitui a revisão de direitos de publicação.

## Logo

O proprietário forneceu os SVGs sob `logo/svg/`, os PNGs sob `logo/png/` e `logo/favicon.ico`; variantes usadas pelo site estão sob `apps/web/src/assets/brand/` e `apps/web/public/`. A ferramenta declarada é Claude em conta pessoal gratuita; o proprietário pediu opções e depois variações de cor, usando apenas texto. A cadeia de exportação e relação exata entre variantes ainda não foram documentadas. A licença MIT do código não é atribuída ao logo. Os [termos de consumidor da Anthropic](https://www.anthropic.com/legal/consumer-terms) atribuem ao usuário os direitos que a Anthropic eventualmente tenha sobre o output, sujeitos aos termos; isso não prova exclusividade nem ausência de direitos de terceiros.

## Revisão ainda necessária antes da publicação

- Documentar os arquivos de origem/edição disponíveis e a cadeia de exportação do logo, se existirem.
- Conferir os termos aplicáveis à geração dos fundos no Gemini e à ferramenta do logo, bem como a presença de marcas, pessoas ou outros elementos de terceiros nos arquivos concretos. Os [termos gerais do Google](https://policies.google.com/terms) dizem que o Google não reivindica propriedade sobre conteúdo original gerado em seus serviços; isso não determina, por si só, direitos exclusivos ou permissão para todo elemento de uma imagem específica.
- Registrar para cada arquivo distribuído a decisão de uso público pretendido, eventual crédito exigido e a relação comprovável com seu original. Se algum arquivo não puder ser liberado, selecionar substituto aprovado antes do build público.

Este inventário atende à parte de **proveniência informada** da tarefa P10 em `tasks/todo.md`. A revisão de direitos e a aprovação final para publicação continuam abertas em `SPEC-production-delivery.md`.
