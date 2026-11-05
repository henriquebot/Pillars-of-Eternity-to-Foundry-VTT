console.clear();

/**
 * Testa envio, execução e leitura de resultado no console sem alterar Foundry.
 * Manual: copiar o arquivo inteiro no F12, como mestre no mundo de testes.
 * MCP evaluate_script: conteúdo integral em function, format: "script",
 * waitForStableDom: false. Retorna JSON e imprime a mesma execução no console.
 * O identificador aleatório identifica este teste; não é uma credencial.
 * Sem requisições, documentos, backups, hooks ou gravação em estado global.
 */
(() => {
  "use strict";
  try {
    const game = globalThis.game;
    if (!game?.ready) throw new Error("Foundry não está pronto.");
    if (!game.user?.isGM) throw new Error("Execute em uma sessão de mestre.");
    if (game.world?.id !== "rpgup-pillars-tests") {
      throw new Error("Mundo incorreto: esperado rpgup-pillars-tests.");
    }
    const scene = game.scenes?.active;
    if (scene?.name !== "Encampment" || !scene.id) {
      throw new Error("Cena ativa incorreta: esperada Encampment com ID válido.");
    }
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      throw new Error("Gerador de identificador de execução indisponível.");
    }

    const result = {
      ok: true,
      test: "codex-brave-console",
      executionId: globalThis.crypto.randomUUID(),
      executedAt: new Date().toISOString(),
      worldId: game.world.id,
      activeScene: {id: scene.id, name: scene.name},
      calculation: {expression: "6 * 7", result: 6 * 7}
    };
    console.table([
      {campo: "Teste", valor: result.test},
      {campo: "ID desta execução", valor: result.executionId},
      {campo: "Horário UTC", valor: result.executedAt},
      {campo: "Mundo", valor: result.worldId},
      {campo: "Cena ativa", valor: result.activeScene.name},
      {campo: result.calculation.expression, valor: result.calculation.result}
    ]);
    console.info("[RPG UP] TESTE-CONSOLE " + JSON.stringify(result));
    return result;
  } catch (error) {
    const result = {ok: false, error: error instanceof Error ? error.message : String(error)};
    console.error("[RPG UP] Teste de console interrompido: " + result.error);
    return result;
  }
})();
