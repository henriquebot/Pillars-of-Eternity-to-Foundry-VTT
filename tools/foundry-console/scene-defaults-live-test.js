/**
 * Valida ao vivo os defaults de cena do rpgup-pillars-importer 0.1.5.
 *
 * Execução no F12, como GM, dentro de rpgup-pillars-tests:
 *   1. Cole este arquivo no console.
 *   2. await rpgupSceneDefaultsTest.preview()
 *   3. await rpgupSceneDefaultsTest.run()
 *   4. await rpgupSceneDefaultsTest.inspect()
 *   5. Depois da validação, await rpgupSceneDefaultsTest.cleanup()
 *
 * Cria somente duas cenas com IDs estáveis. O importer persiste o backup antes
 * de escrever. cleanup() só apaga essas duas cenas após conferir ID, nome,
 * flags de origem e ausência de conteúdo incorporado.
 */
(() => {
  "use strict";

  const MODULE_ID = "rpgup-pillars-importer";
  const WORLD_ID = "rpgup-pillars-tests";
  const BUNDLE_ID = "rpgup-temp-scene-defaults-2026-11-04-015";
  const TESTS = [
    {id: "scene-defaults-known", knowledge: "known", name: "TMP Scene Defaults — known — 2026-11-04"},
    {id: "scene-defaults-requires-exploration", knowledge: "requires-exploration", name: "TMP Scene Defaults — requires-exploration — 2026-11-04"}
  ];

  function requireEnvironment() {
    if (!globalThis.game?.ready || !game.user?.isGM) throw new Error("Entre no mundo local como GM.");
    if (game.world.id !== WORLD_ID) throw new Error(`Mundo incorreto (${game.world.id}); esperado ${WORLD_ID}.`);
  }

  async function loadImporter() {
    const response = await fetch(`/modules/${MODULE_ID}/module.json`, {cache: "no-store"});
    if (!response.ok) throw new Error(`Manifesto indisponível (${response.status}).`);
    const manifest = await response.json();
    if (manifest.id !== MODULE_ID || manifest.version !== "0.1.5") throw new Error(`Versão instalada inesperada: ${manifest.version ?? "desconhecida"}.`);
    const url = `/modules/${MODULE_ID}/scripts/importer.mjs?scene-defaults-test=015`;
    const importer = await import(url);
    const model = await import(`/modules/${MODULE_ID}/scripts/model.mjs?scene-defaults-test=015`);
    return {manifest, importer, stableId: model.stableId};
  }

  async function buildBundle() {
    requireEnvironment();
    const original = game.scenes.contents.find(scene => scene.name === "Encampment");
    const level = original?.levels?.contents?.find(entry => entry.background?.src);
    if (!level) throw new Error("Não localizei o background Level de Encampment; nenhuma cena foi criada.");
    const image = level.background.src;
    const extractedAt = new Date().toISOString();
    return {
      schemaVersion: "1.0.0",
      id: BUNDLE_ID,
      source: {name: "Validação local dos defaults de cena"},
      entities: TESTS.map(test => ({
        id: test.id,
        kind: "map",
        name: {"pt-BR": test.name},
        data: {image, width: original.width, height: original.height, mapKnowledge: test.knowledge},
        provenance: {
          source: "Foundry Desktop local — referência de background existente",
          sourceId: `temporary-test/${test.knowledge}`,
          extractedAt,
          status: "converted"
        }
      }))
    };
  }

  async function prepare() {
    requireEnvironment();
    const [{manifest, importer}, bundle] = await Promise.all([loadImporter(), buildBundle()]);
    const plan = await importer.planImport(bundle, bundle.entities.map(entity => entity.id));
    if (plan.worldId !== WORLD_ID || plan.actions.length !== 2 || plan.actions.some(action => action.operation !== "create")) {
      throw new Error("A prévia não resultou em exatamente duas cenas novas; nenhuma gravação realizada.");
    }
    return {manifest, importer, bundle, plan};
  }

  async function preview() {
    const {manifest, plan} = await prepare();
    return {
      installedVersion: manifest.version,
      runtimeRegistryVersion: game.modules.get(MODULE_ID)?.version ?? null,
      world: game.world.id,
      beforeSceneCount: game.scenes.size,
      writes: 0,
      scenes: plan.actions.map(action => ({
        entityId: action.descriptor.entityId,
        id: action.descriptor.id,
        name: action.descriptor.fields.name,
        mapKnowledge: action.descriptor.mapKnowledge,
        fields: action.descriptor.fields
      }))
    };
  }

  async function run() {
    const {manifest, importer, plan} = await prepare();
    const verifyAsset = async path => {
      const response = await fetch(new URL(`/${path}`, location.origin), {method: "HEAD", cache: "no-store"});
      return response.ok;
    };
    const result = await importer.applyPlan(plan, {
      backup: payload => importer.persistBackup(payload),
      verifyAsset
    });
    if (result.failed.length || result.created.length + result.unchanged.length !== 2) {
      throw new Error(`Importação incompleta: ${JSON.stringify(result)}`);
    }
    globalThis.__rpgupSceneDefaultsTestIds = plan.actions.map(action => action.descriptor.id);
    const inspected = await inspect();
    return {
      installedVersion: manifest.version,
      runtimeRegistryVersion: game.modules.get(MODULE_ID)?.version ?? null,
      result,
      scenes: inspected,
      sceneCount: game.scenes.size
    };
  }

  async function inspect() {
    requireEnvironment();
    const {stableId} = await loadImporter();
    const bundleKey = await stableId(BUNDLE_ID, "bundle");
    const scenes = [];
    for (const test of TESTS) {
      const id = await stableId(BUNDLE_ID, test.id);
      const scene = game.scenes.get(id);
      if (!scene) {
        scenes.push({entityId: test.id, exists: false, id});
        continue;
      }
      const tracking = scene.getFlag(MODULE_ID, "import");
      const level = scene.levels?.get(scene.initialLevel) ?? scene.levels?.contents?.[0] ?? null;
      scenes.push({
        entityId: test.id,
        exists: true,
        id: scene.id,
        name: scene.name,
        width: scene.width,
        height: scene.height,
        grid: scene._source.grid,
        padding: scene.padding,
        levelBackgroundColor: level?.background?.color ?? null,
        levelBackgroundImage: level?.background?.src ?? null,
        tokenVision: scene.tokenVision,
        fog: scene._source.fog,
        tracking: tracking ? {bundleKey: tracking.bundleKey, entityKey: tracking.entityKey, mapKnowledge: tracking.mapKnowledge, sceneDefaultsVersion: tracking.sceneDefaultsVersion} : null,
        embeddedCounts: {
          tokens: scene.tokens.size,
          notes: scene.notes.size,
          journals: scene.journal ? 1 : 0,
          walls: scene.walls.size,
          lights: scene.lights.size,
          regions: scene.regions.size,
          tiles: scene.tiles.size
        },
        ownership: tracking?.bundleKey === bundleKey && tracking?.entityKey === id && tracking?.kind === "map"
      });
    }
    return scenes;
  }

  async function cleanup() {
    requireEnvironment();
    const {stableId} = await loadImporter();
    const bundleKey = await stableId(BUNDLE_ID, "bundle");
    const candidates = [];
    for (const test of TESTS) {
      const id = await stableId(BUNDLE_ID, test.id);
      const scene = game.scenes.get(id);
      if (!scene) continue;
      const tracking = scene.getFlag(MODULE_ID, "import");
      const isOwnedTestScene = scene.id === id && scene.name === test.name &&
        tracking?.bundleKey === bundleKey && tracking?.entityKey === id &&
        tracking?.kind === "map" && tracking?.mapKnowledge === test.knowledge &&
        tracking?.sceneDefaultsVersion === 1;
      const hasEmbeddedContent = scene.tokens.size || scene.notes.size || scene.walls.size ||
        scene.lights.size || scene.regions.size || scene.tiles.size || Boolean(scene.journal);
      if (!isOwnedTestScene || hasEmbeddedContent) {
        throw new Error(`Limpeza interrompida: ${scene.name} não corresponde a uma cena de teste vazia e identificada.`);
      }
      candidates.push(scene);
    }
    const deleted = [];
    for (const scene of candidates) {
      const id = scene.id;
      await scene.delete();
      if (game.scenes.has(id)) throw new Error(`A cena ${id} ainda aparece na coleção após a exclusão.`);
      deleted.push({id, name: scene.name});
    }
    globalThis.__rpgupSceneDefaultsTestIds = [];
    return {deleted, remaining: await inspect(), sceneCount: game.scenes.size};
  }

  globalThis.rpgupSceneDefaultsTest = Object.freeze({preview, run, inspect, cleanup});
  console.info("RPG UP: rpgupSceneDefaultsTest pronto (preview → run → inspect → cleanup).");
})();
