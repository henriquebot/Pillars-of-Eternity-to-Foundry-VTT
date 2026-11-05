/**
 * Abre uma cena no canvas do cliente GM e informa se o fundo carregou.
 * Não cria nem altera documentos; Scene.view() muda apenas a cena visualizada.
 *
 * F12: execute este arquivo e depois rode:
 *   await rpgupValidateImportedScene("<scene-id>")
 */
globalThis.rpgupValidateImportedScene = async function rpgupValidateImportedScene(sceneId, timeoutMs = 30000) {
  if (!game?.user?.isGM) throw new Error("A validação exige uma sessão GM.");
  if (typeof sceneId !== "string" || !sceneId) throw new Error("Informe o ID da cena.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error("timeoutMs deve estar entre 1000 e 60000.");
  }

  const scene = game.scenes.get(sceneId);
  if (!scene) throw new Error(`Cena não encontrada: ${sceneId}`);
  const activeSceneId = game.scenes.active?.id ?? null;
  await scene.view();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && (!canvas.ready || canvas.scene?.id !== scene.id)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!canvas.ready || canvas.scene?.id !== scene.id) {
    throw new Error(`O canvas não carregou a cena ${scene.name} dentro do prazo.`);
  }

  const level = scene.levels?.contents?.find(entry => entry.background?.src) ?? null;
  const texture = canvas.primary?.background?.texture ?? null;
  const importFlag = scene.getFlag("rpgup-pillars-importer", "import") ?? null;
  return {
    sceneId: scene.id,
    name: scene.name,
    folder: scene.folder?.name ?? null,
    dimensions: {width: scene.width, height: scene.height},
    canvasDimensions: {width: canvas.dimensions?.width ?? null, height: canvas.dimensions?.height ?? null},
    background: level?.background?.src ?? null,
    texture: {
      valid: texture?.valid ?? false,
      width: texture?.width ?? null,
      height: texture?.height ?? null
    },
    importedKind: importFlag?.kind ?? null,
    documents: {
      notes: scene.notes?.size ?? null,
      tokens: scene.tokens?.size ?? null,
      walls: scene.walls?.size ?? null,
      lights: scene.lights?.size ?? null,
      regions: scene.regions?.size ?? null,
      tiles: scene.tiles?.size ?? null,
      drawings: scene.drawings?.size ?? null
    },
    activeScenePreserved: game.scenes.active?.id === activeSceneId,
    viewedSceneId: game.user.viewedScene ?? null
  };
};
