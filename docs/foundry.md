# Módulo Foundry — estado real da versão 0.1.0

O módulo é uma base executável de desenvolvimento, com testes independentes. **Não foi instalado nem executado em Foundry real nesta entrega.** O alvo solicitado é Foundry 14.369 / dnd5e 6.0.x. O manifesto não preenche `verified`, pois a compatibilidade não foi validada. A documentação pública consultada em 01/11/2026 identifica sua versão como 14.368; o patch 14.369 precisa de ensaio próprio.

## Instalação local de teste

1. Faça backup e use um mundo descartável, separado da produção.
2. Extraia o ZIP do módulo em `Data/modules/rpgup-pillars-importer/`, garantindo que `module.json` fique diretamente nessa pasta. Alternativamente copie o conteúdo de `foundry/` para essa pasta.
3. Reinicie o Foundry, habilite o módulo no mundo de teste com dnd5e 6.0.x.
4. Abra Configurações → Configurações de módulos → RPG UP — Pillars Campaign Manager → Abrir gerenciador.
5. Carregue o JSON IR local criado pelo extrator. O JSON é lido pelo navegador do mestre; não é enviado como arquivo ao Foundry.

Também há uma API de abertura para macros do GM:

```js
game.modules.get("rpgup-pillars-importer").api.open();
```

Não há URL de instalação pública: o projeto não foi publicado. Nenhum recurso comercial do jogo integra o ZIP. Os caminhos Linux/Docker abaixo do `UserData` são configurados pelo operador e não são os caminhos da instalação Windows do jogo.

## O que funciona no código e nos testes independentes

- ApplicationV2 com Handlebars, PT-BR e inglês, carregamento JSON com limites, filtros por tipo/região e pesquisa por ato/nome/ID. A tabela exibe até 200 registros por filtro; a seleção persiste entre filtros.
- Consulta local dos textos e ramificações de quests/conversas extraídas, sem executar condições ou scripts do jogo. O painel mostra nós, escolhas, links, condições e consequências para interpretação manual. Tradução ausente recebe identificação explícita.
- Prévia de imagens relativas ao UserData. A criação de cenas exige imagem carregável e dimensões válidas; não busca imagens da internet nem monta fundos Unity nesta etapa.
- Criação de Scenes com um Level V14 inicial. Nenhuma cena é ativada automaticamente, não se geram paredes/visão/colisão por suposição e `combatValidated` permanece falso.
- Criação de JournalEntry com página de texto somente se houver `data.publicText` explícito. `data.publicName` pode fornecer um título sem spoilers. Os nomes do IR são usados como título na ausência desse campo; revise-os antes de importar. Os journals e suas páginas começam com ownership padrão NONE. O mestre compartilha o journal e a página pelo Foundry quando apropriado.
- Quests possuem os seis estados solicitados. O botão avança manualmente para o próximo estado. A mudança altera apenas um registro de progresso do módulo, sem scripts, recompensas ou consequências automáticas.
- Estados ficam em uma configuração `scope: world`, indexados por hashes estáveis; importar o mesmo IR em outro mundo não compartilha o progresso.
- Diagnóstico de módulos presentes/ativos, sem ativá-los, desativá-los ou modificar suas APIs. `dnd5e-combat + midi-qol` e `darsh-loot + item-piles` produzem avisos de conflitos declarados nas fontes dos autores; isso não constitui teste de compatibilidade.

### Contrato de dados importável nesta versão

O IR usa `schemaVersion: "1.0.0"`, `id`, `source` e `entities`. Cada entidade possui `id`, `kind`, `name` por idioma, `provenance` e `data`.

| Tipo | Campos adicionais necessários | Documento criado |
|---|---|---|
| `map` | `data.image`, `data.width`, `data.height`; `data.grid` opcional | Scene e Level |
| `quest`, `dialogue`, `lore` | `data.publicText` explícito | JournalEntry e página |
| `pin` | `data.publicText` explícito | JournalEntry apenas; posição física pendente |
| Demais tipos | — | Nenhum; pendência no relatório |

`data.image` deve ser caminho relativo seguro, por exemplo `rpgup/assets/meu-mapa.webp`, cujo arquivo já esteja no UserData. URLs, caminhos absolutos, SVG, traversal e esquemas executáveis são recusados. As imagens aceitas são PNG, JPEG e WebP. `data.grid` aceita `type: 0` (sem grade) ou `type: 1` (quadrada), `size` em pixels de 50 a 1000, `distance > 0` e `units` textual. Esses campos não garantem coerência isométrica.

Os demais campos de narrativa do extrator ficam disponíveis na memória do painel, mas **não tornam o conteúdo público automaticamente**. A ausência de `publicText` gera pendência de revisão, não um journal vazio.

## Sigilo e conteúdo externo

`gmText`, `sourceTree`, scripts e demais dados brutos não são persistidos nos documentos, flags ou configurações do mundo. Permanecem somente na memória do navegador do mestre que abriu o pacote. Isso evita depender exclusivamente de permissões de interface para proteger conteúdo que não deve ser enviado aos clientes dos jogadores. Após recarregar a página, carregue o JSON novamente.

Nomes explicitamente importados, dimensões, imagens, textos marcados públicos e metadados mínimos de rastreamento entram nos documentos. Os campos de tracking usam hashes de IDs e da fonte; não copiam a árvore original nem o caminho local Windows. Os arquivos de imagem instalados em UserData são recursos servidos pelo servidor; o módulo não oferece armazenamento de assets secretos com autorização própria. Use somente os fundos escolhidos para servir ao mundo.

O HTML dos journals é escapado. Os delimitadores ASCII `@`, colchetes e chaves do texto externo tornam-se caracteres de largura completa (`＠［］｛｝`) na apresentação pública, para não recuperarem sintaxe de enriquecimento por uma simples decodificação HTML. O IR mantém o texto original intacto. Isso tem teste independente de decodificação; a passagem real por `TextEditor.enrichHTML` ainda exige teste no Foundry. Condições e consequências são exibidas como texto, nunca executadas. O pacote não deve ser colocado inteiro em uma pasta pública de assets: carregue o arquivo pelo seletor local.

O painel/API requer GM. Esses controles não substituem a segurança de conta/servidor; módulos de terceiros e jogadores com acesso administrativo ao host ficam fora dessa fronteira. O teste de permissões com um cliente jogador continua obrigatório antes do uso real.

## Atualização, backup e recuperação

Cada documento tem ID estável derivado de pacote/entidade/papel com SHA-256, reduzido a 16 caracteres válidos do Foundry, e tracking em `flags.rpgup-pillars-importer.import`. Colisões e duplicatas de tracking causam interrupção para revisão.

O merge compara o último valor importado, o valor atual e o valor novo por campo gerenciado. Alterações do mestre ficam preservadas e aparecem como conflitos. Campos removidos na origem nunca são apagados automaticamente. Páginas e níveis extras não são substituídos. Páginas/níveis removidos pelo mestre não são restaurados silenciosamente. Progresso, inventários e flags de terceiros ficam fora dos campos gerenciados.

Antes da primeira alteração de uma importação, um backup com os documentos existentes afetados é gravado em IndexedDB no navegador do GM. Em seguida, oferece-se um download JSON. Falha de persistência impede as alterações. Importações que criam apenas documentos novos registram os IDs planejados no backup. Mudanças manuais no progresso de quests também têm backup local anterior.

O botão **Exportar backups locais deste mundo** permite recuperar os registros de IndexedDB após recarregar a página, filtrados por usuário e mundo. Exporte e guarde os arquivos fora do navegador: limpar dados do site ou mudar de navegador perde esse armazenamento local. Backups podem conter textos privados adicionados pelo mestre; não os compartilhe com jogadores nem os coloque em UserData público.

Não há restauração automática nesta versão. A restauração deve ser revisada no mundo de teste e autorizada pelo mestre usando as ferramentas nativas/documentos do backup; o módulo não apaga documentos. O backup do importador é complementar ao backup completo do UserData/volume Docker.

Se ocorrer uma falha, o processamento para; o relatório identifica falha e registros ainda não processados. Retornos de atualização e campos relidos são conferidos antes de avançar a base de importação; cancelamentos silenciosos de hooks são falhas, não sucessos. Campos do documento pai e tracking são conferidos novamente depois de operações assíncronas em páginas/níveis e imediatamente antes de serem escritos. Se páginas/níveis mudarem mas o tracking for cancelado, a reimportação pode reconciliar apenas o tracking antes da próxima atualização. A operação não é uma transação atômica de múltiplos documentos. Alterações já realizadas permanecem, com backup; reimporte após revisar. IDs estáveis e comparações por campo permitem retomar sem duplicar documentos. As verificações não são compare-and-swap atômico do servidor e não há bloqueio distribuído entre navegadores de GM; permanece uma janela de concorrência entre conferir e gravar. Execute uma importação de cada vez.

## Adaptador D&D

O adaptador preparado pelo projeto pode clonar um Item de compêndio escolhido e aprovado explicitamente pelo mestre. O módulo expõe uma operação de preparação sem gravar o Item:

```js
const result = await game.modules.get("rpgup-pillars-importer").api.prepareMappedItem(
  entidadeItemDoIR,
  {uuid: "Compendium.pacote.compendio.Item.IDdoItem", approved: true, decision: "Equivalência revisada pelo mestre"}
);
```

O UUID deve existir no ambiente. Não use o exemplo literalmente. A resposta é um DTO revisável ou uma pendência, não uma criação automática. Automação, atividades, efeitos, balanceamento e licenças do compêndio exigem revisão no Foundry real.

## Ainda não implementado ou não validado

- Compêndios reutilizáveis reais: `packs` fica vazio deliberadamente, sem arquivos simulando bases LevelDB funcionais.
- Tokens/Actors e blocos de estatísticas, criação automática de Itens, transferências/saques, contêineres, loot aleatório, comerciantes, Item Piles.
- Pinos físicos tipados, portas, paredes, armadilhas, deslocamento entre cenas, encontros e presets, efeitos e ações das quests.
- Reconstrução de fundos Unity e aplicação da calibração à geometria/posições do canvas. As funções geométricas independentes não tornam a cena pronta para combate.
- Integração operacional DAS/Darshyne, Midi-QOL, DAE, CPR/CAT, Monk's Active Tile Triggers e Isometric Perspective. Presença instalada não prova compatibilidade.
- Piloto real Encampment/Cilant Lîs/Gilded Vale e expansão da campanha. Não há conteúdo comercial de piloto artificial.
- Instalação limpa/atualização/reimportação/permissões testadas no servidor Foundry e teste simultâneo em dois mundos reais. Os testes de merge/mundo independente usados nesta entrega são mocks.

## Validação real ainda necessária

Use um mundo descartável e um login de jogador em navegador separado. Carregue assets de teste próprios; importe uma cena e um journal público com um segredo diferente em `gmText`. Verifique dados serializados nos clientes, compartilhamento do journal/página, imagem e dimensão, posicionamento, tokens, distância, movimento, visão, iluminação e colisão. Reimporte após mudar um título e a página pelo GM; confirme conflito e preservação. Simule imagem ausente e erro de escrita; confira backup e retomada. Repita em outro mundo com progresso diferente. Por fim teste integrações opcionais em combinações suportadas pelos respectivos autores. Nada disso foi marcado como aprovado nesta entrega.

## Fontes primárias consultadas

- [ApplicationV2 / Handlebars e eventos declarativos V14](https://foundryvtt.com/api/v14/modules/foundry.applications.html).
- [JournalEntry e operações documentais públicas V14](https://foundryvtt.com/api/v14/classes/foundry.documents.JournalEntry.html).
- [SceneData V14: coleção de níveis e nível inicial](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.SceneData.html), [LevelData: imagem de fundo por nível](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.LevelData.html).
- [saveDataToFile: exportação de download local](https://foundryvtt.com/api/v14/functions/foundry.utils.saveDataToFile.html).
- [Estrutura e manifesto de módulos](https://foundryvtt.com/article/module-development/).
- [dnd5e: versões oficiais e requisito de Foundry V14](https://github.com/foundryvtt/dnd5e/releases), [pacote oficial dnd5e e compatibilidade publicada](https://foundryvtt.com/packages/dnd5e).
- [Manifesto DAS / dnd5e-combat e conflitos declarados](https://raw.githubusercontent.com/Darshyne/dnd5e-combat/main/module/module.json), [Darsh Loot e relação com Item Piles](https://github.com/Darshyne/darsh-loot).

As fontes documentam APIs ou declarações de seus autores. A decisão de manter os segredos somente na memória GM é uma medida conservadora de projeto, não uma alegação de validação do transporte do Foundry.
