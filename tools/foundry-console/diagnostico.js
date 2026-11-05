console.clear();

/**
 * Diagnóstico Foundry somente leitura; executar em uma sessão de mestre.
 *
 * Manual: copiar este arquivo inteiro para o console F12 do Foundry.
 * Codex / chrome-devtools evaluate_script:
 *   {pageId: <aba>, function: <conteúdo integral deste arquivo como string>,
 *    format: "script", waitForStableDom: false}
 * sourcePath é opcional e exige um caminho nas raízes permitidas pelo MCP.
 * A expressão final devolve um objeto serializável.
 *
 * Pinos = documentos Note da cena ATIVA (game.scenes.active).
 * Público/privado = permissão PADRÃO de pelo menos LIMITED no alvo
 * (página, ou Journal quando não há página), resolvendo INHERIT no pai.
 * Exceções individuais, filtros, visão e névoa não entram nessa classificação.
 * Pinos sem Journal seguem a regra de autoria do Note do Foundry V14.
 * Vínculos quebrados são contados separadamente, sem presumir privacidade.
 * Journals = game.journal, sem páginas ou compêndios.
 *
 * console.clear() limpa apenas o console; os resultados usam console.table().
 * Não grava documentos, configurações, arquivos, backups ou estado global.
 * Não lê textos de Journals, não carrega código externo nem faz requisições.
 * A saída contém metadados privados: mantê-la fora do Git e do release.
 */
(() => {
  "use strict";

  try {
    const game = globalThis.game;
    if (!game?.ready) throw new Error("Foundry não está pronto. Entre no mundo e tente novamente.");
    if (!game.user?.isGM) throw new Error("Execute como mestre para contar também os documentos privados.");
    if (!game.version || !game.world?.id) throw new Error("Versão ou ID do mundo indisponível.");
    if (game.world.id !== "rpgup-pillars-tests") {
      throw new Error("Mundo incorreto: abra rpgup-pillars-tests. Nenhum documento foi alterado.");
    }
    if (game.system?.id !== "dnd5e" || !game.system.version) {
      throw new Error("Sistema D&D 5e ou sua versão indisponível.");
    }

    const scene = game.scenes?.active;
    if (!scene) throw new Error("Não há cena ativa no mundo.");
    if (scene.name !== "Encampment" || !scene.id) {
      throw new Error("Cena ativa incorreta: esperada Encampment com ID válido. Nenhuma cena foi ativada.");
    }
    if (!Array.isArray(scene.notes?.contents) || !Number.isInteger(game.journal?.size)) {
      throw new Error("Coleção de pinos ou Journals indisponível.");
    }
    const levels = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS;
    if (!levels || !Number.isInteger(levels.LIMITED) || !Number.isInteger(levels.INHERIT)) {
      throw new Error("Níveis de permissão do Foundry indisponíveis.");
    }

    const defaultPermission = target => {
      for (let document = target; document; document = document.parent) {
        const level = document.ownership?.default ?? levels.NONE;
        if (level !== levels.INHERIT) return level;
      }
      return levels.NONE;
    };

    const pins = {total: scene.notes.size, public: 0, private: 0, unresolved: 0};
    for (const note of scene.notes.contents) {
      if ((note.entryId && !note.entry) || (note.pageId && !note.page)) {
        pins.unresolved++;
        continue;
      }
      const target = note.page ?? note.entry;
      if (target) {
        const level = defaultPermission(target);
        if (!Number.isInteger(level)) pins.unresolved++;
        else if (level >= levels.LIMITED) pins.public++;
        else pins.private++;
      } else if (note.author === null || note.author?.isGM === false) {
        pins.public++;
      } else if (note.author?.isGM === true) {
        pins.private++;
      } else {
        pins.unresolved++;
      }
    }

    const result = {
      ok: true,
      foundryVersion: game.version,
      system: {id: game.system.id, version: game.system.version},
      worldId: game.world.id,
      activeScene: {id: scene.id, name: scene.name},
      pins,
      pinClassification: "default-ownership-at-least-LIMITED; excludes individual overrides, vision and filters",
      journalCount: game.journal.size
    };
    console.info("[RPG UP] Diagnóstico somente leitura — pinos por permissão padrão (LIMITED ou superior).");
    console.table([
      {campo: "Versão Foundry", valor: result.foundryVersion},
      {campo: "Sistema", valor: result.system.id},
      {campo: "Versão D&D 5e", valor: result.system.version},
      {campo: "ID do mundo", valor: result.worldId},
      {campo: "ID da cena ativa", valor: result.activeScene.id},
      {campo: "Cena ativa", valor: result.activeScene.name},
      {campo: "Pinos públicos", valor: pins.public},
      {campo: "Pinos privados", valor: pins.private},
      {campo: "Pinos não resolvidos", valor: pins.unresolved},
      {campo: "Total de pinos", valor: pins.total},
      {campo: "Journals", valor: result.journalCount}
    ]);
    return result;
  } catch (error) {
    const result = {ok: false, error: error instanceof Error ? error.message : String(error)};
    console.error("[RPG UP] Diagnóstico interrompido\n" + JSON.stringify(result, null, 2));
    return result;
  }
})();
