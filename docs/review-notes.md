# Revisão independente da base 0.1.0

Revisão em 01/11/2026 de `main.mjs`, `model.mjs`, `importer.mjs`, geometria e adaptador D&D. A revisão combinou leitura do código, reprodução independente com documentos simulados e consulta à documentação pública V14. Não incluiu instalação ou execução do RPG UP em servidor Foundry.

## Regressões identificadas e encaminhadas para correção

- **Cancelamento silencioso de escrita:** o Foundry pode retornar `undefined` em `Document.update` e uma lista sem o documento esperado nas operações incorporadas. Ignorar isso fazia registrar sucesso e avançar a base mesmo mantendo texto antigo; a reimportação seguinte classificava a divergência como edição do mestre. A correção precisa verificar retornos e valores persistidos antes de registrar sucesso ou avançar tracking, incluindo retomada após escrita parcialmente aplicada.
- **Lock de importação:** uma segunda chamada rejeitada dentro do `try` podia executar `finally` e liberar o lock da primeira. O guard foi movido para fora; a alteração manual de quest também deve adquirir e liberar o próprio lock.
- **Fallback de tradução:** a existência da chave `texts['pt-BR']` não comprova tradução. O extrator conserva o inglês nessa chave com `translationMissing:true` e idioma real. A identificação deve ocorrer por entrada, incluindo título, descrição, falas, objetivos, adendos e estados finais.
- **Adendos e finais de quests:** o IR usa `{id,text:{defaultText,...}}`; ler `defaultText` no wrapper ocultava os textos. A renderização deve ler o campo interno e conservar o identificador.
- **Edição concorrente entre escritas:** verificar somente o snapshot inicial não preservava uma mudança no título feita enquanto a atualização incorporada aguardava. Revalidar os campos principais contra o snapshot imediatamente antes da escrita reduz essa janela e preserva o caso reproduzido.

Esses casos devem permanecer cobertos pela suíte de regressão. O relatório final de testes do projeto, gerado após as correções, é a referência de execução; esta nota não substitui seus resultados nem afirma testes reais de integração.

## API pública conferida

[SceneData](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.SceneData.html) documenta a coleção `levels` e `initialLevel` como ID do nível inicial. [BaseLevel](https://foundryvtt.com/api/v14/classes/foundry.documents.BaseLevel.html) apresenta criação incorporada com nome `Level` e imagem em `background.src`. A leitura da documentação não revelou incompatibilidade nesses nomes usados pela base; os defaults e o ciclo de criação ainda exigem execução no build alvo.

[ApplicationConfiguration](https://foundryvtt.com/api/v14/interfaces/foundry.applications.types.ApplicationConfiguration.html) suporta callbacks em `actions`. [ApplicationClickAction](https://foundryvtt.com/api/v14/types/foundry.applications.types.ApplicationClickAction.html) define os parâmetros `event,target` e o contexto da aplicação, coerentes com os callbacks declarativos utilizados.

As páginas da API consultadas indicam build 14.368, enquanto o alvo deste projeto é 14.369. A proximidade dos builds não constitui validação de runtime.

## Riscos residuais

- **Concorrência distribuída:** não há transação atômica de múltiplos documentos nem compare-and-swap do servidor neste importador. Releituras locais não eliminam a janela entre leitura e escrita de outro cliente. Operar uma importação por vez, com um único GM, e evitar edições simultâneas dos documentos afetados. Falha parcial exige revisar o backup antes de retomar.
- **Renderização e enriquecimento:** testes que verificam somente a string HTML escapada não certificam o comportamento de `TextEditor.enrichHTML`. A [API TextEditor](https://foundryvtt.com/api/v14/classes/foundry.applications.ux.TextEditor.html) descreve enriquecimento sobre nós de texto DOM; entidades HTML podem ser decodificadas durante esse processo. A neutralização efetiva de links, embeds, rolagens e enrichers de terceiros precisa de teste próprio no ambiente descartável. Não confundir ausência de tags executáveis com prova de ausência de enriquecimento.
- **Permissões reais:** controles GM, ownership inicial e retenção local de dados privados precisam ser confrontados com um cliente jogador. Os testes com mocks não verificam payloads de rede ou concessões de acesso feitas por outros módulos.
- **Backup:** IndexedDB depende do navegador/origem/usuário e não substitui o backup do volume Docker. Exportar as cópias locais para armazenamento do mestre antes de limpar dados do navegador.
- **Geometria e D&D:** não foi identificado outro defeito concreto nas entradas suportadas durante esta revisão. Isso não certifica mapas, itens preparados, alcance, movimento, colisões, atividades ou balanceamento no Foundry. A geometria ainda não é aplicada ao canvas e o adaptador apenas prepara um Item revisável.

Não foram criados documentos, modificados mundos ou executados testes de combate/permissões no servidor de produção durante esta revisão.
