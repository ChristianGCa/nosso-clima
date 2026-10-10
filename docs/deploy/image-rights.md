# Inventário de origem dos arquivos visuais

Estado em 2026-10-10: **origem e uso público declarados; conferência documental e visual concluída no alcance abaixo**. O proprietário informou em 2026-09-27 que gerou os dez fundos no aplicativo Gemini sem enviar imagens de referência e confirmou em 2026-10-01 que os fundos foram gerados no Gemini. Em 2026-10-03 determinou que os fundos sejam publicados e informou que gerou o logo em uma conta pessoal gratuita do Claude, usando apenas texto e sem enviar imagem, marca ou arquivo de referência. Em 2026-10-10 detalhou que pediu ao Gemini uma paisagem urbana e variações para cada clima; para o Claude, pediu ideias de logo para um site de previsão do tempo chamado NossoClima e escolheu a opção preferida. Não possui registros adicionais de exportação do logo ou das cinco variantes noturnas. A licença MIT do código não se estende automaticamente a esses ativos; as declarações não comprovam exclusividade ou ausência de direitos de terceiros.

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

Em 2026-10-03, uma inspeção visual das dez variantes distribuídas e do logo não encontrou marca d'água, texto, pessoa ou marca de terceiros visível. A busca estática nos SVGs de `logo/svg/`, `apps/web/src/assets/` e `apps/web/public/` não encontrou elementos `script`, `foreignObject`, `iframe`, `image` ou `use`, manipuladores de eventos, `href`, `javascript:` ou referências externas em `url(...)`. Em 2026-10-10, os pares original/distribuído foram comparados: mantêm dimensões e composição compatíveis; os diurnos têm a reencodificação já registrada, enquanto os noturnos diferem substancialmente no arquivo e na tonalidade. A comparação apoia a relação visual, mas não reconstrói a edição/exportação dos noturnos. Nenhum registro inexistente é tratado como requisito a produzir.

## Logo

O proprietário forneceu os SVGs sob `logo/svg/`, os PNGs sob `logo/png/` e `logo/favicon.ico`; variantes usadas pelo site estão sob `apps/web/src/assets/brand/` e `apps/web/public/`. A ferramenta declarada é Claude em conta pessoal gratuita. A comparação de bytes em 2026-10-10 confirmou cópias exatas do SVG escuro, `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png` e `icon-512.png` entre os arquivos fornecidos e os usados pelo site. Isso estabelece a relação desses arquivos locais, sem provar a cadeia anterior de geração no Claude. Os [termos de consumidor da Anthropic](https://www.anthropic.com/legal/consumer-terms) atribuem ao usuário os direitos que a Anthropic eventualmente tenha sobre o output, sujeitos aos termos; isso não prova exclusividade nem ausência de direitos de terceiros.

## Decisão de uso e limites da revisão

- O proprietário aprovou o uso público dos dez fundos e do logo no site. A origem Gemini/Claude é declarada e creditada na seção “Licenças e créditos” da interface. Os termos gerais do Google e os termos de consumidor da Anthropic conferidos em 2026-10-10 não indicaram crédito obrigatório ao provedor para esses outputs; os créditos exibidos são uma escolha de transparência. A revisão visual registrada acima não encontrou elemento de terceiro reconhecível que exija crédito adicional.
- Os [termos gerais do Google](https://policies.google.com/terms) dizem que o Google não reivindica propriedade sobre conteúdo original gerado em seus serviços; isso não determina, por si só, direitos exclusivos ou permissão para todo elemento de uma imagem específica. O mesmo limite vale para a atribuição de direitos nos termos da Anthropic. Não declarar os ativos sob MIT nem como exclusivos.
- Não há registros extras de exportação a anexar. Para os cinco WebP noturnos, a relação com os originais é informada pelo proprietário e apoiada pela comparação visual, sem cadeia técnica comprovada. Caso surja reivindicação ou elemento identificável de terceiro, retirar o ativo afetado e reavaliar antes de voltar a publicá-lo.

Este inventário conclui a revisão de origem, termos e crédito dos ativos para a tarefa P10 na [lista ativa Vercel](../../tasks/vercel-todo.md), no alcance declarado e observado. A aprovação final de publicação do site continua separada em [Production Delivery](../../SPEC-production-delivery.md).

## Conferência das fontes em 2026-10-07

Os [termos gerais do Google](https://policies.google.com/terms), vigentes desde 2026-07-30 na página consultada, mantêm a declaração de que o Google não reivindica propriedade do conteúdo original gerado. Os [termos de consumidor da Anthropic](https://www.anthropic.com/legal/consumer-terms), seção 4, mantêm a atribuição ao usuário dos direitos que a Anthropic eventualmente tenha sobre os outputs, sob cumprimento dos termos. A conferência foi renovada em 2026-10-10 e não encontrou exigência de atribuir crédito ao Gemini/Claude para os outputs aqui descritos. Ela não cria licença MIT para os ativos nem comprova cadeias de exportação não fornecidas. O deploy anterior foi excluído, conforme relato do proprietário em 2026-10-07; a evidência final de publicação será vinculada à revisão da retomada.
