# Formato intermediário 1.0.0

O contrato é JSON UTF-8 independente do Foundry, descrito em `schemas/campaign.schema.json`. `schemaVersion` incompatível deve ser recusado. Cada entidade tem ID estável a partir da origem, tipo, nomes por idioma, proveniência e `data`. As ferramentas não devem inferir sucesso de conversão a partir da mera existência da entidade.

Tipos: `map`, `pin`, `npc`, `item`, `container`, `quest`, `dialogue`, `transition`, `encounter`, `lore`. IDs são únicos no pacote; referências usam esses IDs, sem depender dos IDs aleatórios de um mundo. O ID Foundry pertence ao recibo/flags da importação de cada mundo, e não à identidade da fonte.

Estados de proveniência:

| Código | Significado |
|---|---|
| extracted | Estrutura/texto extraído fielmente; não garante tradução nem adaptação |
| converted | Conversão automática documentada |
| adapted | Adaptação para D&D, sujeita a revisão |
| manual | Correção manual registrada |
| pending | Dados ou revisão pendentes |
| unsupported | Estrutura preservada, sem interpretação suportada |

`source`, `sourceId`, `extractedAt` e `status` são obrigatórios na proveniência. `path` é relativo à instalação sempre que possível, `url` registra fonte pública, `sha256` registra o hash dos bytes lidos. Não colocar segredos de autenticação em proveniência. `name.en` preserva a origem e `name['pt-BR']` só existe quando houver tradução identificada; fallback deve ser rotulado pela interface.

Mapas usam `data.image` (caminho relativo ao UserData previamente copiado pelo mestre), `width`, `height`, `grid`, `calibration`. Metadados sem imagem não constituem cena pronta. Não são aceitos caminhos absolutos, travessia de diretórios ou URLs externas no importador. Não há extrator de texturas Unity implementado nesta versão.

Pinos usam `mapId`, `category`, `position:{x,y}` e origem de coordenadas explícita. A calibração afim 2D usa pelo menos três pares `source/target`; o resultado inclui matriz, erro RMS e erro máximo. Essa calibração não resolve perspectiva 3D, distância, iluminação ou colisão. `combatValidated` permanece falso; a validação de combate depende de execução no Foundry.

`publicText` é conteúdo explicitamente liberado. `gmText` e descrições de origem são privados por padrão. Scripts e condições originais são dados inertes; nunca JavaScript executável. A implementação Foundry descreve suas regras concretas de armazenamento e de acesso em `docs/foundry.md`.

O schema descreve o envelope. Campos específicos por entidade ainda evoluem; os parsers documentam em `docs/formats.md` o que foi verificado contra fontes primárias. Não confundir preservação de XML com interpretação completa da lógica de uma quest.
