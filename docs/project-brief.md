# PROJETO RPG UP — PILLARS OF ETERNITY → FOUNDRY VTT V14

## 1. MISSÃO

Você é o engenheiro principal responsável por desenvolver uma solução de importação de **Pillars of Eternity 1 (Obsidian Entertainment)** para **Foundry VTT V14, sistema D&D 5e 2024**.

O objetivo é transformar a campanha original de Pillars of Eternity, incluindo suas expansões quando disponíveis, em uma aventura de RPG de mesa funcional, preservando ao máximo seus recursos visuais e narrativos.

**Não quero apenas um estudo, relatório ou protótipo visual. Quero implementação real, código executável, testes, documentação e um módulo instalável.**

Trabalhe autonomamente, em fases, fazendo o máximo possível com os recursos disponíveis.

Se não tiver acesso aos arquivos originais, desenvolva os componentes independentes deles e prepare o processamento local. Não fabrique dados para simular uma importação concluída.

## 2. AMBIENTE E REQUISITOS

- Foundry VTT: versão 14, com alvo inicial 14.369.
- Sistema: D&D 5e, versão 6.0.x, regras de 2024.
- Idioma da interface e da campanha: português brasileiro.
- Campanha original: Pillars of Eternity 1.
- Expansões: The White March Part I e II.
- Cenário: Eora, preservando sua ambientação.
- Plataforma de execução: Foundry autogerenciado em Linux/Docker.
- Ferramentas de desenvolvimento: escolha tecnologias adequadas e explique as decisões.
- Nome do projeto: `rpgup-pillars-importer`.
- Priorizar APIs públicas e documentadas do Foundry V14.

Compatibilidade desejada, sempre que tecnicamente possível:

- D&D 5e 2024.
- Ecossistema DAS/Darshyne.
- Midi-QOL, DAE, CPR e CAT.
- Item Piles.
- Monk's Active Tile Triggers.
- Isometric Perspective.

Não assuma compatibilidade sem testes. As dependências opcionais não devem impedir o funcionamento básico do módulo.

O conteúdo será usado em **dois mundos Foundry independentes**, representando dois grupos que jogarão a mesma campanha, com progressão, estados de quests e inventários separados.

## 3. FONTES PARA PESQUISA

Investigue profundamente a documentação, os repositórios relevantes e os formatos disponíveis.

### 3.1. Mapas interativos

Fontes prioritárias:

- https://itemaps.com/maps/pillars-of-eternity
- https://pillarsofeternity.fandom.com/wiki/
- https://pillarsofeternity.fandom.com/wiki/Modding

Descubra como os sites armazenam:

- Mapas e imagens.
- Pinos de localização.
- Coordenadas dos pinos.
- Identificadores dos mapas.
- Descrições dos objetos.
- Entradas e saídas de áreas.
- NPCs, inimigos e criaturas.
- Contêineres e respectivos itens.
- Passagens secretas.
- Portas e fechaduras.
- Armadilhas.
- Relações com quests.
- Requisitos de interações.
- Informações exclusivas do mestre.

Examine HTML, dados incorporados, endpoints públicos documentados e estruturas JSON/JavaScript, respeitando os termos de acesso.

Não dependa exclusivamente de scraping visual.

Se o mapa original puder fornecer informação mais completa que a wiki, priorize os dados originais.

### 3.2. GitHub e ferramentas de extração

Investigue, avalie e aproveite o que for aplicável:

- https://github.com/kjmikkel/PillarsDialogEditor
- https://xaratas.github.io/
- https://github.com/Perfare/AssetStudio
- https://github.com/nesrak1/AssetsTools.NET
- https://github.com/jackburkhardt/ObsidianKnapper
- https://github.com/cerrorism/poe-localization

Pesquise outros projetos que permitam extrair ou interpretar os dados do Pillars 1.

Não recrie ferramentas existentes desnecessariamente. Respeite suas licenças.

### 3.3. Arquivos originais do jogo

Crie um scanner que identifique automaticamente uma instalação local de Pillars of Eternity, sem presumir seu caminho.

Investigue:

- Arquivos `.quest`.
- Arquivos `.conversation`.
- Arquivos `.stringtable`.
- AssetBundles e arquivos Unity.
- Texturas, mapas, sprites e ícones.
- Itens, personagens e criaturas.
- Dados de áreas e suas interações.
- Tabelas e identificadores internos.
- Dados de scripts e condições.
- Recursos das expansões.

Verifique a estrutura real de cada arquivo antes de implementar um parser.

Procure obter dados de posicionamento, navegação, colisão e geometria, quando presentes.

O scanner deve funcionar de forma somente leitura.

Não altere, corrompa ou substitua arquivos do jogo original.

## 4. ARQUITETURA OBRIGATÓRIA

Desenvolva dois componentes principais.

### A. Extrator e conversor externo

Uma ferramenta local responsável por:

1. Encontrar e ler os arquivos de origem.
2. Extrair os recursos disponíveis.
3. Normalizar as informações.
4. Relacionar mapas, quests, diálogos, NPCs e itens.
5. Converter os dados para um formato intermediário documentado.
6. Identificar dados ausentes e inconsistentes.
7. Gerar os recursos necessários para importação.
8. Produzir relatórios de validação.

O resultado intermediário deve ser estruturado, versionável e independente do Foundry.

### B. Módulo RPG UP para Foundry V14

Desenvolva um módulo com interface de importação, permitindo:

- Selecionar regiões, mapas e quests.
- Pré-visualizar recursos.
- Importar conteúdo.
- Atualizar conteúdo já importado.
- Gerenciar dependências.
- Visualizar falhas de conversão.
- Consultar itens ainda não resolvidos.
- Preservar modificações feitas pelo mestre.
- Restaurar estados iniciais quando possível.
- Exportar diagnósticos.

O módulo deve criar compêndios reutilizáveis, mas manter os estados de jogo independentes em cada mundo.

## 5. CONVERSÃO DOS MAPAS

Esta é uma das prioridades máximas.

### 5.1. Imagens originais

Obtenha os melhores fundos disponíveis dos arquivos locais do jogo, quando autorizado.

Investigue se os cenários são compostos por múltiplas texturas ou camadas.

Se necessário, implemente um reconstrutor capaz de montar a imagem final.

Requisitos:

- Preservar a qualidade visual original.
- Evitar distorções.
- Manter proporções e coordenadas.
- Permitir diferentes resoluções.
- Otimizar o formato para Foundry.
- Detectar mapas duplicados.
- Catalogar todos os mapas encontrados.
- Registrar origem e qualidade de cada imagem.

Não usar imagens de baixa resolução da wiki quando existir recurso local superior.

### 5.2. Geometria e isometria

Pillars utiliza cenários de perspectiva isométrica.

Investigue a melhor estratégia para:

- Posicionamento de tokens.
- Escala e distância.
- Grade de combate.
- Movimento.
- Alcance de ataques.
- Visão.
- Iluminação.
- Paredes e obstáculos.
- Objetos elevados.
- Passagens e portas.

Teste o módulo Isometric Perspective no Foundry V14.

Não presuma que a transformação de perspectiva resolve automaticamente paredes, alcance ou colisões.

Se houver dados originais de geometria ou navegação, investigue como convertê-los.

Se não houver conversão confiável, implemente uma etapa visual de calibração manual.

**Nenhum mapa pode ser considerado pronto para combate até passar por teste de movimentação, alcance e posicionamento de tokens.**

## 6. IMPORTAÇÃO DOS PINOS

Cada pino da wiki ou dos dados originais deve ser analisado e classificado.

Categorias:

- NPC.
- Inimigo.
- Criatura neutra.
- Contêiner.
- Tesouro.
- Objeto examinável.
- Documento.
- Livro.
- Porta.
- Passagem.
- Armadilha.
- Recurso coletável.
- Ponto de interesse.
- Objetivo de quest.
- Entrada ou saída de área.
- Outro.

Preservar:

- Nome.
- Identificador original.
- Coordenadas.
- Mapa de origem.
- Descrição.
- Conteúdo.
- Condições.
- Referências de quests.
- Relações com outros pinos.

Implementar a conversão de coordenadas para o espaço do Foundry.

Criar testes que comparem posições originais e importadas.

Pinos narrativos devem abrir journals ou interfaces apropriadas.

Pinos que representem objetos físicos podem gerar tokens, tiles ou outros documentos do Foundry.

Não transformar todos os tipos de marcador indiscriminadamente em Map Notes.

## 7. DESCRIÇÕES CLICÁVEIS

O jogador deve conseguir interagir com o cenário.

Exemplos:

- Clicar numa placa e ler sua inscrição.
- Examinar uma estátua.
- Encontrar um cadáver.
- Examinar uma mesa.
- Abrir um livro.
- Descobrir uma pista.
- Identificar uma passagem.
- Investigar um objeto misterioso.

Cada interação deve permitir:

- Texto público.
- Texto exclusivo do mestre.
- Requisitos de descoberta.
- Testes de habilidade opcionais.
- Resultado de sucesso.
- Resultado de falha.
- Recompensas.
- Associação com quests.

Implemente controles de permissão.

**Informações secretas, spoilers e soluções não devem ficar acessíveis aos jogadores antes da descoberta.**

## 8. CONTÊINERES, ITENS E LOOT

Desenvolva importação de:

- Baús.
- Corpos saqueáveis.
- Armários.
- Barris.
- Objetos coletáveis.
- Equipamentos.
- Armas.
- Armaduras.
- Consumíveis.
- Itens mágicos.
- Livros e documentos.
- Moedas.
- Loot aleatório.
- Inventário de comerciantes.

Use Item Piles quando compatível.

Caso não esteja instalado, ofereça uma alternativa básica funcional.

### Conversão para D&D 2024

Crie uma camada de mapeamento entre itens originais de Pillars e itens D&D.

Regras:

1. Usar equivalentes oficiais quando houver correspondência.
2. Criar itens homebrew quando necessário.
3. Preservar nome e descrição originais como referência.
4. Identificar efeitos que não tenham equivalente direto.
5. Não inventar automações que não funcionam.
6. Registrar decisões e diferenças de conversão.
7. Permitir revisão manual pelo mestre.

Itens precisam ser utilizáveis, não apenas descrições textuais.

### Controle de loot

- Um baú saqueado não deve repor o conteúdo automaticamente.
- Atualizações do importador não podem restaurar itens já coletados.
- Loot aleatório deve ser gerado com regras explícitas.
- Restaurar o estado original exige confirmação do mestre.

## 9. JOURNALS DE QUESTS

Esta é outra prioridade máxima.

Extraia as quests originais e seus textos, objetivos, estados e relações.

Crie journals organizados por:

**Ato → Região → Quest → Eventos → NPCs → Localizações.**

Cada quest deve conter:

- Nome original.
- Nome traduzido.
- Descrição.
- Contexto.
- Objetivo principal.
- Objetivos secundários.
- Pré-requisitos.
- NPCs envolvidos.
- Mapas relacionados.
- Escolhas possíveis.
- Condições de progressão.
- Consequências.
- Recompensas.
- Referências para outras quests.
- Informações exclusivas do mestre.

Preservar os vínculos existentes entre conversas e estados de quests.

Criar um identificador estável para cada quest.

### Rastreamento de progresso

Desenvolva um sistema de acompanhamento de quests com:

- Não iniciada.
- Disponível.
- Em andamento.
- Concluída.
- Falhada.
- Bloqueada.

Permitir progressão manual pelo mestre.

Automatizar apenas eventos cujas condições forem seguramente interpretadas.

Não executar diretamente scripts do jogo original.

Não aplicar efeitos irreversíveis sem autorização.

## 10. DIÁLOGOS E ESCOLHAS

Utilize os arquivos de conversas para reconstruir a estrutura narrativa.

Extrair:

- Falas de NPCs.
- Respostas do jogador.
- Ordem das falas.
- Ramificações.
- Condições.
- Consequências.
- Referências a quests.
- Alterações de reputação.
- Recompensas.
- Requisitos de atributos ou habilidades.

Converter as árvores de diálogo em conteúdo útil ao mestre.

A interface deve permitir consultar rapidamente:

- O que o NPC sabe.
- O que pode revelar.
- O que esconde.
- Quais escolhas importam.
- Quais quests podem ser iniciadas.
- Quais consequências cada escolha provoca.

Não é necessário obrigar os jogadores a navegar por menus de videogame.

**O objetivo é facilitar a narração de RPG de mesa, preservando as escolhas e consequências originais.**

O mestre deve poder improvisar normalmente.

## 11. LORE E ENCICLOPÉDIA

Importe e organize, conforme os dados disponíveis:

- História de Eora.
- Dyrwood.
- Povos e culturas.
- Religiões.
- Divindades.
- Almas e reencarnação.
- Animancy.
- Facções.
- Cidades.
- Regiões.
- Eventos históricos.
- Livros.
- Cartas.
- Documentos.
- Personagens relevantes.

Criar compêndios pesquisáveis.

Separar conteúdo conhecido pelos jogadores de informações secretas.

Manter links internos entre locais, NPCs, quests e livros.

## 12. NPCS, CRIATURAS E ENCONTROS

Investigue como extrair:

- Nomes.
- Aparência.
- Imagens e retratos.
- Localização.
- Facção.
- Inventário.
- Habilidades.
- Comportamento.
- Relações narrativas.
- Participação em quests.
- Encontros e condições de surgimento.

Converter para Actors do D&D 5e 2024.

Criar uma tabela de correspondência para monstros existentes no sistema D&D.

Para criaturas exclusivas de Pillars:

- Preservar identidade e características.
- Estimar função tática.
- Propor bloco de estatísticas adaptado.
- Calcular e revisar dificuldade do encontro.
- Identificar características não automatizadas.
- Exigir aprovação do mestre para balanceamento não validado.

### Posicionamento

Quando disponíveis, importar as posições originais de NPCs e inimigos.

Identificar NPCs presentes somente durante quests específicas.

Implementar presets de encontros vinculados aos eventos.

O mestre deve poder ativar um encontro sem alterar permanentemente o estado da campanha.

### Automação

Investigar integração com DAS, Midi-QOL, DAE, CPR e CAT.

Usar APIs documentadas.

Não modificar módulos de terceiros.

Manter funcionamento básico mesmo sem automação avançada.

## 13. PASSAGENS E NAVEGAÇÃO

Converter conexões entre mapas.

Exemplos:

- Entrada de casa → interior.
- Escada → piso superior.
- Alçapão → subterrâneo.
- Passagem secreta → área oculta.
- Saída da vila → mapa regional.

Requisitos:

- Destino correto.
- Coordenada de chegada.
- Controle de visibilidade.
- Requisitos de acesso.
- Fechaduras.
- Permissões.
- Estado de descoberta.

Passagens devem ser testadas para evitar destinos inexistentes ou loops incorretos.

## 14. ADAPTAÇÃO PARA RPG DE MESA

Não reproduza mecanicamente toda a estrutura de um videogame.

Pillars foi escrito com um protagonista central, o Watcher.

A adaptação deverá contemplar um grupo de aventureiros.

Diretrizes narrativas:

- Todos os PJs participam do evento sobrenatural inicial.
- A condição de Watcher pode ser compartilhada ou distribuída narrativamente.
- Cada personagem pode receber visões e pistas diferentes.
- Nenhum personagem deve monopolizar o protagonismo.
- Preservar o mistério do Hollowborn Legacy.
- Preservar os acontecimentos principais e o papel de Thaos.
- Manter as grandes escolhas morais e seus efeitos.
- Converter testes e encontros para D&D 2024.
- Permitir soluções criativas não previstas no videogame.
- Reduzir combates repetitivos sem importância narrativa.

A adaptação narrativa deve ser **uma camada configurável**, separada dos dados originais.

Preservar a possibilidade de consultar a versão fiel à origem.

## 15. INTERFACE DO MESTRE

Criar um painel de controle chamado:

**RPG UP — Pillars Campaign Manager**

Funcionalidades:

- Navegar pelos atos.
- Selecionar regiões.
- Abrir mapas.
- Consultar quests.
- Pesquisar NPCs.
- Pesquisar itens.
- Ativar presets de encontros.
- Consultar diálogos.
- Visualizar eventos disponíveis.
- Marcar objetivos.
- Consultar consequências.
- Identificar cenas incompletas.
- Executar diagnósticos.
- Atualizar conteúdo importado.
- Consultar informações de origem.

O painel não pode substituir nem bloquear as funcionalidades normais do Foundry.

Utilize interfaces compatíveis com V14.

## 16. DUAS CAMPANHAS INDEPENDENTES

O mesmo conteúdo será usado em dois grupos.

Criar uma solução que permita:

- Compartilhar compêndios de recursos.
- Instalar o módulo nos dois mundos.
- Importar as mesmas cenas.
- Reaproveitar configurações de mapas.
- Manter quests independentes.
- Manter inventários independentes.
- Manter estados de encontros independentes.
- Manter alterações dos jogadores independentes.

Atualizações não devem sobrescrever o progresso de nenhum grupo.

Use identificadores estáveis, controle de versões e migrações seguras.

## 17. PORTUGUÊS BRASILEIRO

Implementar internacionalização.

O sistema deve aceitar:

- Textos originais em inglês.
- Traduções verificadas em PT-BR.
- Glossário próprio de tradução.
- Correções manuais.
- Traduções futuras.

Não misturar idiomas silenciosamente.

Quando faltar tradução, manter texto original identificado.

Não incorporar traduções de terceiros ao repositório sem licença compatível.

## 18. SEGURANÇA, DIREITOS E INTEGRIDADE

Regras obrigatórias:

- Não contornar DRM.
- Não modificar a instalação original.
- Não incluir recursos comerciais de Pillars diretamente no repositório público.
- Não redistribuir mapas, áudio, textos ou imagens protegidos sem autorização.
- Usar recursos do jogo instalado legitimamente pelo usuário.
- Respeitar licenças de ferramentas e termos dos sites.
- Não coletar dados de páginas bloqueadas ou privadas.
- Fazer cache local dos dados permitidos.
- Não executar código embutido em conteúdos extraídos.
- Sanitizar HTML, XML e textos externos.
- Não usar `eval` em scripts recuperados.
- Criar backup antes de modificar dados existentes.
- Nunca apagar documentos do mundo sem confirmação.
- Nunca alterar o mundo de produção durante testes.

O módulo pode conter código e mecanismos de importação, enquanto recursos protegidos permanecem locais.

## 19. TESTES OBRIGATÓRIOS

Criar testes automatizados e testes reais dentro do Foundry.

### Testes de extração

- Quests interpretadas corretamente.
- Diálogos relacionados aos textos.
- Identificadores preservados.
- Arquivos ausentes tratados.
- Caracteres especiais preservados.
- Dados duplicados detectados.

### Testes de mapas

- Imagens carregam.
- Dimensões corretas.
- Pinos posicionados.
- Entradas e saídas funcionam.
- Tokens podem se movimentar.
- Obstáculos e paredes não geram movimentos impossíveis.
- Iluminação funciona quando configurada.
- Alcance e distância são coerentes.

### Testes de interação

- Journals abrem corretamente.
- Jogador não vê informações secretas.
- Contêineres podem ser saqueados.
- Itens são transferidos.
- Loot não duplica.
- Objetivos de quests podem avançar.
- Encontros podem ser ativados.
- Restauração não destrói progresso.

### Testes de instalação

- Instalação limpa.
- Atualização do módulo.
- Reimportação idempotente.
- Importação parcial.
- Falha de importação.
- Recuperação após erro.
- Compatibilidade com os dois mundos.
- Funcionamento sem módulos opcionais.

Não declarar testes aprovados sem execução real.

## 20. PRIMEIRO TESTE DE PONTA A PONTA

Usar como piloto:

1. Encampment.
2. Cilant Lîs.
3. Gilded Vale.

O piloto deve incluir:

- Mapas.
- Pinos.
- Descrições.
- Journals.
- NPCs.
- Um ou mais contêineres reais, conforme os dados.
- Uma quest vinculada a eventos.
- Diálogo com ramificações.
- Entrada ou saída entre mapas.
- Um encontro adaptado.
- Configuração de isometria.
- Teste de movimentação e combate.
- Teste de permissões de jogador.

Se houver dados suficientes, expandir para Caed Nua e outras regiões.

O piloto não é o produto final.

**Depois de validar a arquitetura, continuar a importação do restante do jogo e das expansões disponíveis.**

## 21. ETAPAS DE EXECUÇÃO

### Fase 1 — Auditoria

Investigar ferramentas, wiki, formatos e ambiente.

Gerar:

- Inventário de fontes.
- Matriz de viabilidade.
- Riscos técnicos.
- Dependências.
- Arquitetura escolhida.

### Fase 2 — Extração

Implementar parsers, scanner e normalização.

### Fase 3 — Mapas

Implementar reconstrução de imagens, importação de cenas e transformação de coordenadas.

### Fase 4 — Conteúdo

Importar pinos, itens, journals, diálogos, quests, lore e NPCs.

### Fase 5 — Interatividade

Implementar contêineres, passagens, gatilhos e presets de encontros.

### Fase 6 — Foundry V14

Implementar módulo, compêndios, interface e mecanismos de atualização.

### Fase 7 — Adaptação D&D

Criar camada de conversão das regras, criaturas e encontros.

### Fase 8 — Validação

Executar testes automáticos e integração real.

### Fase 9 — Expansão

Processar todas as regiões disponíveis, incluindo White March, respeitando as dependências de dados.

### Fase 10 — Entrega

Gerar release instalável e documentação.

Execute as fases na ordem necessária para não desperdiçar trabalho.

Não interrompa o desenvolvimento depois de produzir a auditoria ou um documento de arquitetura.

## 22. CRITÉRIOS DE QUALIDADE

O projeto deve ser:

- Modular.
- Reproduzível.
- Documentado.
- Versionado.
- Testável.
- Reexecutável.
- Seguro para atualizar.
- Independente dos estados dos mundos.
- Resistente a dados incompletos.
- Compatível com a API pública do Foundry V14.

Cada entidade importada deve preservar sua proveniência:

- Fonte.
- Caminho ou URL.
- Identificador original.
- Versão.
- Data de extração.
- Identificador gerado no Foundry.
- Estado da conversão.

Diferencie explicitamente:

- Extraído fielmente.
- Convertido automaticamente.
- Adaptado para D&D.
- Corrigido manualmente.
- Pendente.
- Não suportado.

## 23. ENTREGÁVEIS

Quero um repositório organizado contendo:

1. Código do extrator.
2. Parsers dos arquivos Pillars.
3. Importador da wiki e mapas interativos.
4. Modelo intermediário de dados.
5. Reconstrutor de mapas, quando viável.
6. Módulo Foundry V14.
7. Sistema de journals e quests.
8. Gerenciador de encontros.
9. Sistema de loot.
10. Adaptador para D&D 2024.
11. Recursos de tradução.
12. Testes automatizados.
13. Scripts de build.
14. Manifesto de instalação.
15. Documentação de instalação.
16. Manual de utilização.
17. Relatório de cobertura.
18. Lista de problemas conhecidos.
19. Release para instalação local.

Não incluir recursos comerciais do jogo dentro do release.

### Relatório de cobertura obrigatório

Apresentar números reais:

| Recurso | Encontrados | Importados | Validados | Pendentes |
|---|---:|---:|---:|---:|
| Mapas | | | | |
| Pinos | | | | |
| NPCs | | | | |
| Itens | | | | |
| Contêineres | | | | |
| Quests | | | | |
| Diálogos | | | | |
| Entradas e saídas | | | | |
| Encontros | | | | |
| Textos de lore | | | | |

Nunca usar números estimados como se fossem resultados de processamento real.

## 24. REGRAS DE AUTONOMIA

Você tem autorização para pesquisar, analisar, desenvolver, refatorar, executar testes e criar arquivos no ambiente de desenvolvimento autorizado.

Não precisa solicitar aprovação a cada pequena decisão técnica.

Quando encontrar um obstáculo:

1. Diagnostique.
2. Pesquise alternativas.
3. Implemente a solução viável.
4. Documente limitações.
5. Continue com as demais funcionalidades.

Se não houver acesso aos arquivos do jogo, não considere o projeto bloqueado: entregue o scanner, parsers, arquitetura, módulo e testes usando fixtures próprias e pequenas, sem conteúdo comercial.

Se não houver Foundry de testes acessível, execute os testes independentes e documente claramente que a validação em Foundry está pendente.

Não afirmar que algo funciona apenas porque o código compila.

Não realizar deploy em produção, publicar o repositório ou sobrescrever dados externos sem autorização explícita.

## 25. CRITÉRIO FINAL DE ACEITAÇÃO

O resultado desejado é:

**Abrir Foundry V14 → instalar o RPG UP Pillars → apontar para os recursos previamente extraídos da instalação local → importar a campanha → abrir uma cena → encontrar NPCs, objetos, baús e pinos nas posições corretas → interagir com eles → consultar quests e diálogos → realizar um encontro em D&D 2024.**

Posteriormente, instalar a mesma estrutura em outro mundo Foundry com os estados independentes.

O produto deve reduzir drasticamente o trabalho necessário para narrar Pillars of Eternity como uma campanha de mesa.

**Inicie imediatamente a auditoria do ambiente e a implementação. Não responda somente com um plano: crie o projeto, execute os testes possíveis e entregue resultados verificáveis, informando precisamente tudo que ainda não foi concluído.**