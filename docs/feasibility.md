# Viabilidade e riscos técnicos

Esta matriz distingue implementações independentes de dados de inferências ainda não comprovadas. A existência de código ou aprovação de testes com fixtures próprias não é evidência de campanha comercial importada.

| Área | Viável agora | Evidência ainda necessária | Critério para encerrar a pendência |
|---|---|---|---|
| Descoberta da instalação | Scanner somente de leitura, raízes e mecanismos de instalação conhecidos | Instalação real e expansões disponíveis | Inventário local com caminhos, hashes e erros de leitura |
| Textos/quests/conversas | Parsers restritos ao que foi comprovado e árvores originais inertes | Amostras reais de cada versão/expansão, referências cruzadas, nós e condições | Relacionar IDs e textos sem executar scripts; comparar com visualizadores e jogo |
| Dados de sites | Normalização offline com fonte e atribuição | Schema bruto atual e aquisição permitida | Adaptador por fonte, fixtures autorizadas, mapeamento de IDs/mapa/coordenadas e controle de mudanças |
| Texturas Unity | Ferramentas existentes para exportação e inspeção | Bundles/serializedfiles e versão Unity da instalação | Manifesto real de objetos exportados com dimensões/hash/proveniência |
| Composição dos mapas | Contrato de camadas, validação de coordenadas e calibração | Relação câmera/malha/material/textura, planos e ordem de desenho | Comparação visual com origem, proporções e resolução registradas |
| Pinos | IDs estáveis, taxonomia explícita e posição preservada no IR | Correspondência com objetos, conteúdo, estado e segredos reais | Conferência de coordenadas e representação adequada por categoria |
| Distância/isometria | Transformação matemática testável isoladamente | Cena, grade, medidas, tokens e módulo instalado | Mestre testa movimento, alcance, colisões, portas, luz e posicionamento; registrar resultado por cena |
| Journals/quests | Documentos GM, texto público separado e estado por mundo | Traduções, grafo original e validação com conta de jogador | Nenhum segredo no documento público; quest avança manualmente sem executar origem |
| Loot | Modelo de saldo/transferência e mecanismos de importação preservando estado | Itens dnd5e reais, concorrência, falhas, API/versão Item Piles | Transferência única e recuperável; reimportar não repõe itens |
| Adaptação D&D2024 | Camada separada com decisões e pendências explícitas | Tamanho/nível do grupo, equivalentes licenciados, aprovação de homebrew | Items/Actors utilizáveis e encontro validado pelo mestre |
| Dois mundos | IDs de conteúdo independentes de estado do mundo | Instalação de teste com dois mundos e compêndios | Mesma origem, progressos/inventários separados e atualização sem perda |
| Release | Empacotar somente código/documentação e fixtures próprias | Ensaios de instalação, upgrade e APIs reais | Instalação limpa, reimportação, falha parcial e restauração em mundo descartável |

## Escolhas de arquitetura

O extrator é externo e só lê a instalação. O IR é versionado e independente de Foundry; os recursos protegidos ficam em saída local excluída da distribuição. A aplicação Foundry lê o IR e cria documentos mediante operações de GM. Uma camada posterior deve converter metadados do jogo para regras de mesa, mantendo o original consultável e marcando decisões não validadas.

AssetsTools.NET/UnityPy/AssetStudio oferecem mecanismos gerais de leitura e exportação; escrever outro decodificador Unity antes de examinar um bundle real desperdiçaria trabalho. A escolha final da ponte dependerá da versão real dos arquivos e do formato de objetos. As capacidades e licenças foram registradas na [auditoria de fontes](source-audit.md); nenhuma dessas ferramentas foi integrada/testada nesta base.

Conteúdo de compêndio deve ser tratado como modelo reutilizável. Quests, estados de descoberta, inventários e eventos pertencem a cada mundo. Atualizações precisam comparar origem anterior, origem nova e documento atual; conflitos ficam para revisão do mestre. Inventários e progresso não são campos de origem a serem reaplicados.

Não se utiliza a visibilidade do marcador no site como permissão Foundry. Descrição de wiki e de jogo pode conter spoilers. O valor inicial é GM; publicar exige conteúdo público explicitamente separado. Esconder trechos com CSS não constitui controle de acesso.

## Riscos que impedem declarar o piloto concluído

1. Não há comprovação de extração/reconstrução dos mapas de Encampment, Cilant Lîs e Gilded Vale a partir da instalação legítima.
2. Sem inspeção de geometria/navegação e ensaio de cena, transformar coordenadas não estabelece combate confiável.
3. Nós narrativos podem guardar condições/operações desconhecidas. Preservar como dados não equivale a interpretá-los ou automatizá-los.
4. Referências públicas não autorizam redistribuir recursos comerciais. Nenhum texto/asset de terceiros deve entrar nas fixtures ou release sem direito verificado.
5. Não há compatibilidade transitiva: cada combinação Foundry/dnd5e/módulos precisa de versões fixadas e teste próprio. Conforme as [fontes públicas consultadas](integrations.md), CPR possui canal estável V13 e pré-releases 2.1.x para V14. DAS e Midi declaram conflito entre motores.
6. Testes independentes não abrangem permissões reais de rede, renderização de canvas, comportamento D&D, atualizações de Document e concorrência entre clientes.

## Informações que o usuário pode fornecer sem interromper o trabalho independente

- Acesso e identificação de um mundo Foundry **descartável**, com V14.369 e dnd5e6.0.x, separado da produção; URL e forma de acesso GM sem publicar segredos no repositório.
- Versões realmente instaladas de DAS/Midi/DAE/CPR/CAT e escolha de perfil de automação. Os repositórios de DAS foram identificados e seus conflitos documentados em [integrations.md](integrations.md).
- Quando começar o balanceamento: quantidade e nível inicial de PJs, regra preferida para a condição de Watcher e fontes D&D disponíveis legitimamente.

O scanner deve tentar encontrar o jogo automaticamente antes de solicitar caminho manual. Ausência de instalação ou servidor não impede desenvolver/testar as partes independentes, mas mantém pendentes todos os critérios que dependem desses recursos.

Identificar versões de um servidor não disponibiliza automaticamente um ambiente descartável. A validação do importador precisa ocorrer em um ambiente isolado da produção.
