# Extração local e formatos comprovados

Implementação: Python 3.11+ e biblioteca padrão, sem instalar ferramentas no jogo.
Não há recursos comerciais incorporados ao código nem às fixtures. A leitura
de arquivos originais só acontece quando o usuário executa `extract` ou quando
uma instalação é explicitamente inventariada por `scan`.

## Evidência consultada

Em 01/11/2026, o código do projeto
[PillarsDialogEditor](https://github.com/kjmikkel/PillarsDialogEditor) confirmou
as estruturas abaixo. Ele tem licença MIT; a implementação Python deste
repositório foi escrita separadamente, sem copiar seu código C#.

- [Poe1ConversationParser.cs](https://github.com/kjmikkel/PillarsDialogEditor/blob/main/DialogEditor.Core/Parsing/Poe1ConversationParser.cs):
  `ConversationData/Nodes/FlowChartNode`, `NodeID`, `xsi:type`, `SpeakerGuid`,
  `ListenerGuid`, `Links/FlowChartLink/FromNodeID/ToNodeID`, `Conditionals`,
  `OnEnterScripts`, `OnExitScripts` e `OnUpdateScripts`.
- [StringTableParser.cs](https://github.com/kjmikkel/PillarsDialogEditor/blob/main/DialogEditor.Core/Parsing/StringTableParser.cs):
  `StringTableFile/Entries/Entry`, `ID`, `DefaultText` e `FemaleText`.
- [Poe1DataRoots.cs](https://github.com/kjmikkel/PillarsDialogEditor/blob/main/DialogEditor.Core/GameData/Poe1DataRoots.cs)
  e [Poe1GameDataProvider.cs](https://github.com/kjmikkel/PillarsDialogEditor/blob/main/DialogEditor.Core/GameData/Poe1GameDataProvider.cs):
  diretórios `PillarsOfEternity_Data/data`, `data_expansion1`,
  `data_expansion2` e `data_expansion4`; as últimas pastas sobrepõem as
  anteriores por ID de texto. Para cada pacote sem o idioma solicitado,
  usa-se sua tabela inglesa e registra-se esse fallback.
- [Quest Editor de Xaratas, root-data-elements.html](https://github.com/Xaratas/PillarsOfEternity-Quest-Editor/blob/master/app/root-data-elements.html):
  `QuestData`, tipos `QuestNode`, `ObjectiveNode`, `GlobalQuestNode`,
  `EndStateNode` e associação dos textos por offsets. Não foi encontrada
  licença explícita no inventário desse repositório; nenhum código seu foi
  copiado ou distribuído aqui. A inspeção limitou-se à estrutura do formato.

O [ObsidianKnapper](https://github.com/jackburkhardt/ObsidianKnapper) lista
PoE II, mas não PoE I entre seus jogos suportados; não é usado como prova
de compatibilidade com os arquivos do primeiro jogo. O projeto
[poe-localization](https://github.com/cerrorism/poe-localization) confirmou
pastas de localização, porém nenhuma tradução ou DLL sua foi incorporada.

## O que os parsers fazem

`.stringtable`: preservam caracteres Unicode e variantes feminina/padrão;
recusam IDs repetidos; avisam quando `EntryCount` diverge dos dados. São
aceitas apenas tabelas XML cuja raiz seja `StringTableFile`.

`.conversation`: preservam os nós, sua ordem, tipos, interlocutores,
ramificações, condições e chamadas de scripts. Os textos são relacionados
pelo caminho relativo da conversa e pelo ID do nó. Links para nós ausentes
produzem aviso. Os scripts são apenas dados, com `executable: false`.

`.quest`: preservam o grafo e a árvore XML completa em JSON. Extraem os
títulos dos nós e descrições usando o ID e ID + 10000; conservam addenda
e finais, com offsets 20000 e 30000. A associação específica de cada
addendum, suas condições e a semântica de eventos permanecem na árvore
original para revisão. **Não se implementou uma máquina de execução de
quests equivalente à do jogo.** `data.semantics` é
`partial-structural-only` e `data.automation` é `manual-only`.

Um formato desconhecido ou XML inválido gera diagnóstico e não bloqueia
a extração de outros arquivos. Identificadores de entidades são UUIDv5
estáveis derivados de jogo, tipo e caminho relativo original. Caminhos
de scripts que terminem em `.quest` geram referências estruturais; não
se interpreta que determinada função deva avançar a quest no Foundry.

## Contrato com o módulo

O envelope segue `schemas/campaign.schema.json`, versão `1.0.0`.

| Campo | Conteúdo |
|---|---|
| `entities[].kind` | Nesta etapa, apenas `quest` e `dialogue` comprovados |
| `entities[].sourceId` | Caminho narrativo sem extensão, ex.: `quests/test/sample` |
| `entities[].name` | Nomes por idioma real; nomes ausentes mantêm o identificador original |
| `entities[].provenance` | Fonte, caminho, ID original, SHA-256, data UTC, estado `extracted` |
| `data.nodes[]` | IDs numéricos, tipo, falante, links, condições, scripts e árvore de origem |
| `data.nodes[].texts` | Textos por idioma solicitado, com idioma real e `translationMissing` explícitos |
| `data.texts` | Nas quests, títulos, descrições, objetivos, addenda e finais por idioma |
| `source.tables` | Todas as tabelas lidas, com sua proveniência individual |
| `diagnostics` | Lista de `{severity, code, path, message}` |

Tabelas de UI, itens e outros textos não classificados não viram
automaticamente lore, NPCs ou itens utilizáveis. Elas são conservadas em
`source.tables`, sem aumentar indevidamente os números dessas categorias.

O JSON contém texto externo não confiável, inclusive campos de origem.
O renderizador deve escapá-lo como texto antes de inseri-lo no HTML;
scripts e marcações do jogo nunca são executados. As condições e chamadas
armazenadas em árvores não podem ser avaliadas por `eval`.

## Uso

PowerShell, na raiz do projeto:

```powershell
$env:PYTHONPATH = Join-Path (Get-Location) 'extractor'
python -m rpgup_pillars scan --output local/scan.json
python -m rpgup_pillars scan --root 'D:/biblioteca' --no-auto --output local/scan-explicit.json
python -m rpgup_pillars extract --root 'D:/Pillars of Eternity' --language pt-BR --output local/campaign.json
python -m rpgup_pillars validate local/campaign.json
python -m rpgup_pillars package local/campaign.json --output local/pilot.json --select-source 'conversations/test/*'
python -m unittest discover -s tests/python -p test_extractor.py -v
```

Linux:

```sh
PYTHONPATH=extractor python -m rpgup_pillars scan --output local/scan.json
PYTHONPATH=extractor python -m rpgup_pillars extract --root '/games/Pillars of Eternity' --output local/campaign.json
```

`scan` consulta registro do Steam/GOG e desinstalação no Windows, metadados
`libraryfolders.vdf`, manifesto Steam de app ID 291650, caminhos comuns do
Steam no Linux e raízes explícitas. Não percorre discos inteiros. Uma raiz
pode ser a instalação, `PillarsOfEternity_Data`, uma biblioteca Steam ou
uma pasta contendo diretamente instalações com “Pillars” no nome.
`RPGUP_PILLARS_ROOT` acrescenta um candidato explícito.

O inventário percorre só instalações identificadas, ignora links e
junctions e aplica limite de arquivos. Erros de acesso aparecem nos
avisos. Uma instalação ainda em download pode estar ausente ou incompleta;
um inventário não comprova integridade dos arquivos baixados. O scanner
avisa quando `StateFlags` do manifesto Steam difere do valor 4 e quando
existe a pasta de staging `steamapps/downloading/291650`. Não retorna IDs
de conta ou outros campos pessoais do manifesto.

A saída precisa ficar fora da instalação original. Escritas JSON são
atômicas e guardam uma cópia `.bak` antes de substituir um arquivo
existente. `extract` sai com código 1 se produziu diagnósticos de erro,
mantendo o resultado parcial para inspeção; erro fatal de argumentos,
leitura ou escrita usa código 2. Nenhum documento Foundry é escrito pelo
extrator.

## Pacotes pequenos para importação

O extrato completo serve de auditoria e pode ser maior que os limites do
Foundry. O comando `package` cria outro JSON, compacto, com uma seleção
de `sourceId` usando globs sem distinção entre maiúsculas e minúsculas.
`--select-source` e `--kind` podem ser repetidos. Sem filtros, tenta
empacotar todas as entidades; seleção vazia gera erro.

Por padrão, as quests referenciadas pelas entidades selecionadas são
incluídas, mesmo que não correspondam ao filtro inicial.
`--no-related` desativa esse comportamento. A estrutura da campanha e
os IDs estáveis se mantêm, permitindo importar partes em sequência.

O pacote não contém `source.tables`, `data.sourceTree` nem as árvores
de origem redundantes dos nós, links e scripts. As condições,
assinaturas e parâmetros dos scripts, textos, links, metadados extras
dos links e proveniência continuam presentes. O arquivo completo não
é sobrescrito; seu caminho e SHA-256 ficam em
`source.importPackage.originalExtract` para consulta local.

O comando recusa pacotes acima de **50 MiB, 500.000 valores JSON, 40
níveis ou 50.000 entidades**, como o módulo. Também limita textos a
2.000.000 caracteres e recusa chaves perigosas para objetos JavaScript.
Se exceder o limite, crie vários pacotes com filtros menores. A entrada
completa de `validate` e `package` tem limite de 512 MiB.

Para consultar os identificadores reais antes de escolher o piloto:

```powershell
(Get-Content local/campaign.json -Raw | ConvertFrom-Json).entities |
    Select-Object kind, sourceId
```

Os padrões nos exemplos são de fixtures; os diretórios internos do jogo
devem ser escolhidos a partir dos identificadores efetivamente extraídos.

## Catálogo de imagens externas ao Unity

```powershell
python -m rpgup_pillars catalog-images --root 'D:/recursos-extraidos' --output local/images.json
```

O catálogo percorre a raiz explicitamente escolhida, sem seguir links ou
junctions, e lê arquivos PNG/JPEG/WebP/DDS/TGA. Não abre AssetBundles.
Lê dimensões por cabeçalho de PNG, JPEG, WebP (VP8, VP8L e VP8X) e DDS.
Para PNG, verifica a assinatura, os campos IHDR e seu CRC. Para JPEG,
percorre segmentos até um SOF suportado; altura adiada por DNL não é
interpretada. Para DDS, dimensões são da superfície principal descrita
pelo cabeçalho, sem montar mipmaps, cubemaps ou texturas de volume.
TGA recebe SHA-256 e registro de origem, com dimensões explicitamente
`unsupported`; seu formato não é adivinhado.

SHA-256 é calculado em blocos, sem carregar o arquivo completo em memória.
`duplicateBytes` reúne arquivos de bytes idênticos. Texturas visualmente
equivalentes com codificações diferentes não são tratadas como duplicatas.
Uma fonte que mude durante a leitura perde o hash e as dimensões daquela
tentativa e recebe diagnóstico. Há limites de 512 MiB por arquivo, 8 GiB
totais de leitura, 1 MiB de inspeção de cabeçalho, 100.000 arquivos
percorridos e dimensão máxima de 1.048.576 pixels por eixo. Os limites
de bytes e de arquivos podem ser reduzidos pela CLI.

Todo registro permanece `classification: unclassified-image` e
`quality: unassessed`, com `imageDecodeValidated: false` e
`foundryLoadValidated: false`. Cabeçalho e hash **não comprovam** que os
pixels possam ser decodificados, que a imagem seja um mapa, que a
qualidade seja adequada, ou que a imagem carregue no Foundry.
Arquivos com cabeçalho inválido ou não suportado conservam seu hash,
quando legíveis, e geram avisos; erros de leitura ou limites geram
diagnósticos de erro e código de saída 1. A saída nunca pode ficar
dentro da fonte nem de uma instalação Pillars identificável por seu
ancestral `PillarsOfEternity_Data`.

Fontes primárias dos formatos:
[PNG IHDR, W3C](https://www.w3.org/TR/png-3/#11IHDR),
[JPEG T.81, anexo B](https://www.w3.org/Graphics/JPEG/itu-t81.pdf),
[contêiner WebP](https://developers.google.com/speed/webp/docs/riff_container),
[WebP lossless](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification),
[VP8 RFC 6386](https://datatracker.ietf.org/doc/html/rfc6386#section-9.1) e
[DDS_HEADER, Microsoft](https://learn.microsoft.com/en-us/windows/win32/direct3ddds/dds-header).

## Limites atuais e validação

- XML limitado a 16 MiB, 100.000 elementos e 64 níveis; DTD e declarações
  de entidades são recusadas, inclusive em UTF-16/32 com BOM.
- Assets Unity, texturas compostas, geometria, posições de NPCs, loot e
  mapas não são decodificados por esses parsers. O inventário distingue
  candidatos binários e imagens; não transforma esses arquivos em cenas.
- Idiomas ausentes têm fallback identificado; nenhuma tradução foi
  inventada. O código não comprova a licença de traduções instaladas.
- `validate` faz verificações mínimas de runtime alinhadas ao schema e
  IDs únicos; não substitui validação semântica do conteúdo no Foundry.
- Fixtures próprias testam estruturas e falhas; não comprovam cobertura
  da campanha comercial. Nenhuma validação de movimentação, combate ou
  permissões em Foundry foi executada pelo extrator.

O relatório embutido separa encontrados, extraídos, importados e validados
no Foundry. As duas últimas contagens ficam em zero enquanto não houver
evidência do runtime. Categorias não classificadas não são consideradas
ausentes; esse limite consta no próprio relatório.
