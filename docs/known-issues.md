# Limitações e trabalho restante

Esta versão não satisfaz ainda o critério final de aceitação. O piloto Encampment → Cilant Lîs → Gilded Vale não foi importado nem validado. Nenhum mapa pode ser marcado pronto para combate.

| Requisito | Situação da implementação |
|---|---|
| Descoberta de instalação, inventário somente leitura | Implementado/testado com fixtures; instalação real ainda em download na primeira auditoria |
| XML de stringtables, conversas, quests | Parsing estrutural implementado; lógica de scripts/condições fica inerte e parcial |
| IDs, proveniência, overlays White March | Implementados/testados independentemente; validar contra instalação completa |
| Extração de fundos Unity e reconstrução | Pendente; nenhuma imagem comercial extraída |
| Catálogo de imagens fora de bundles | Dimensões de cabeçalho, SHA-256 e duplicatas de bytes implementados; não identifica mapas nem valida decodificação |
| Navegação, geometria, paredes, luzes e isometria | Pendente; há matemática de calibração 2D, sem editor visual nem testes de combate |
| Aquisição específica Itemaps/Fandom | Pendente; existe apenas normalizador offline de formato próprio, sem scraper específico |
| Classificação de pinos | Normalização explícita offline; não cria objetos físicos automaticamente |
| Campaign Manager V14 e consulta narrativa GM | Implementados; execução real ainda pendente |
| Scenes com Level e journals de publicText explícito | Importador implementado com backup e merge; testado somente com dublês da API |
| Progresso manual de quests por mundo | Implementado; sem automação dos scripts originais |
| Journals privados persistentes e hierarquia completa | Pendente; pacote narrativo privado permanece na memória do GM e precisa ser recarregado |
| Compêndios reutilizáveis entre mundos | Pendente; manifesto não declara packs artificiais vazios |
| Itens D&D utilizáveis | API prepara clone de Item de compêndio escolhido/aprovado; sem fluxo completo de criação no painel |
| Actors, CR e presets de encontros | Pendente, sem blocos de estatísticas inventados |
| Contêineres, transferência, lojistas, loot sem duplicação | Pendente; não existe fallback de loot funcional nesta versão |
| Portais e interações clicáveis de descoberta | Pendente; não há destinos/condições inferidos |
| Tradução e glossário de campanha | UI PT-BR/EN; conteúdo mantém idiomas/fallback. Glossário/correções de campanha ainda pendentes |
| Adaptação coletiva do Watcher configurável | Pendente; origem preservada separadamente |
| Recuperação | Backup local IndexedDB + exportação antes de writes; restauração automatizada pendente, sem rollback destrutivo |
| Integrações opcionais | Diagnóstico de presença/conflitos; APIs funcionais de integração não implementadas/testadas |
| Testes em dois mundos com jogadores | Testados apenas cenários isolados em dublês; testes reais pendentes |

Prioridade seguinte: concluir download → executar scanner e comparar os formatos reais → extrair narrativa real e pacotes pequenos → identificar recursos Unity e ferramentas compatíveis com sua versão → instalar módulo em mundo descartável → validar permissões/importação/atualização antes de preencher o piloto. A cobertura de conteúdo deve ser recalculada a cada processamento; fixtures próprias não contam como conteúdo do jogo.

Os módulos DAS Core e Midi-QOL declaram conflito; DAS Loot e Item Piles também. Estarem instalados no servidor não indica que estejam ativos num mesmo mundo. O projeto não habilita, desabilita ou modifica terceiros. Versões e fontes estão em `docs/integrations.md`.
