// Foundry V14 console helper for a temporary, isolated scene-level isometry test.
// Load in F12, then call: RPGUPIsoAB.inspect(), createCopy(), configureCopy(true), openCopy().
// Cleanup removes only a scene carrying this helper's private temporary marker.
(() => {
  const MODULE_ID = "isometric-perspective";
  const OWNER_FLAG = "rpgup-pillars-importer";
  const MARKER = "isoAbTemporary";
  const OVERLAY_KEY = "__rpgupIsoABPositionOverlay";

  const findTemporary = () => game.scenes.contents.filter(scene =>
    scene.getFlag(OWNER_FLAG, MARKER)?.temporary === true
  );

  const inspect = (scene = canvas.scene) => {
    const background = canvas.primary?.background;
    return {
      worldId: game.world.id,
      sceneId: scene.id,
      sceneName: scene.name,
      dimensions: { width: scene.width, height: scene.height },
      grid: { type: scene.grid.type, size: scene.grid.size, distance: scene.grid.distance, units: scene.grid.units },
      background: scene.background,
      isometric: foundry.utils.deepClone(scene.flags[MODULE_ID] ?? {}),
      modules: [MODULE_ID, "3d-to-iso"].map(id => {
        const module = game.modules.get(id);
        return { id, installed: Boolean(module), active: Boolean(module?.active), version: module?.version ?? null };
      }),
      counts: {
        tokens: scene.tokens.size,
        notes: scene.notes.size,
        journals: game.journal.size,
        tiles: scene.tiles.size,
        walls: scene.walls.size,
        lights: scene.lights.size,
        sounds: scene.sounds.size
      },
      activeCanvas: canvas.scene.id === scene.id,
      backgroundSprite: canvas.scene.id === scene.id && background ? {
        x: background.x, y: background.y, width: background.width, height: background.height,
        scaleX: background.scale.x, scaleY: background.scale.y, rotation: background.rotation
      } : null
    };
  };

  const copy = () => {
    const copies = findTemporary();
    if (copies.length !== 1) throw new Error(`Expected one marked temporary scene; found ${copies.length}.`);
    return copies[0];
  };

  const clearPositionOverlay = () => {
    const old = window[OVERLAY_KEY];
    if (!old) return { status: "clear" };
    old.parent?.removeChild(old);
    old.destroy({ children: true });
    delete window[OVERLAY_KEY];
    return { status: "cleared" };
  };

  const showPositionOverlay = points => {
    const scene = canvas.scene;
    if (!scene.getFlag(OWNER_FLAG, MARKER)?.temporary) throw new Error("Position preview is allowed only on the marked temporary scene.");
    if (!scene.flags[MODULE_ID]?.isometricEnabled || !scene.flags[MODULE_ID]?.isometricBackground) {
      throw new Error("Enable Isometric Perspective and native-background transformation on the temporary scene first.");
    }
    if (!Array.isArray(points) || !points.length) throw new TypeError("Pass the original image-pixel point array.");
    const image = canvas.primary?.background;
    if (!image?.texture) throw new Error("Rendered scene background is unavailable.");
    const sourceWidth = image.texture.orig?.width ?? image.texture.width;
    const sourceHeight = image.texture.orig?.height ?? image.texture.height;
    if (scene.width !== sourceWidth || scene.height !== sourceHeight) throw new Error("Scene dimensions differ from source background dimensions.");
    const anchorX = scene.background.anchorX ?? 0.5;
    const anchorY = scene.background.anchorY ?? 0.5;
    const mapped = points.map(point => {
      const local = new PIXI.Point(point.x - anchorX * sourceWidth, point.y - anchorY * sourceHeight);
      const global = image.toGlobal(local);
      const canvasPoint = canvas.interface.toLocal(global);
      return { ...point, canvasX: canvasPoint.x, canvasY: canvasPoint.y };
    });

    clearPositionOverlay();
    const colors = { initial: 0x37d67a, event: 0xff5252, alternative: 0xb084ff, marker: 0x53c7ff,
      conditional: 0xffb347, ambient: 0x61d7d1, uncertain: 0xff69b4 };
    const container = new PIXI.Container();
    container.name = "RPGUP_TEMP_ISOMETRIC_POSITION_OVERLAY";
    container.zIndex = 950;
    container.eventMode = "none";
    const marks = new PIXI.Graphics();
    container.addChild(marks);
    const labels = [];
    for (const point of mapped) {
      const color = colors[point.category] ?? 0xffffff;
      marks.beginFill(color, 0.92).lineStyle(2, 0x101820, 1).drawCircle(point.canvasX, point.canvasY, 12).endFill();
      const label = new PIXI.Text(String(point.number).padStart(2, "0"), {
        fontFamily: "Arial", fontSize: 11, fontWeight: "bold", fill: 0xffffff,
        stroke: 0x101820, strokeThickness: 3, align: "center"
      });
      label.anchor.set(0.5);
      label.position.set(point.canvasX, point.canvasY);
      label.eventMode = "none";
      labels.push(label);
      container.addChild(label);
    }
    canvas.interface.addChild(container);
    window[OVERLAY_KEY] = container;
    return {
      status: "shown",
      sceneId: scene.id,
      sceneName: scene.name,
      count: mapped.length,
      background: { width: sourceWidth, height: sourceHeight, transformBackground: true },
      sample: mapped.slice(0, 3).map(p => ({ number: p.number, id: p.id, x: p.canvasX, y: p.canvasY }))
    };
  };

  window.RPGUPIsoAB = {
    inspect,

    async createCopy(name = `Encampment — TESTE ISO TEMP ${new Date().toISOString().slice(0, 10)}`) {
      const source = canvas.scene;
      if (source.getFlag(OWNER_FLAG, MARKER)?.temporary) throw new Error("Open the original scene before creating the test copy.");
      if (findTemporary().length) throw new Error("A marked temporary scene already exists; inspect or clean it first.");
      if (game.scenes.getName(name)) throw new Error(`Scene name already exists: ${name}`);
      const flags = foundry.utils.deepClone(source.flags ?? {});
      flags[OWNER_FLAG] = { ...(flags[OWNER_FLAG] ?? {}), [MARKER]: {
        temporary: true,
        sourceSceneId: source.id,
        sourceSceneName: source.name,
        createdAt: new Date().toISOString()
      } };
      const created = await source.clone({ name, active: false, flags }, { save: true });
      return inspect(created);
    },

    async configureCopy(enabled, transformBackground = false, projectionType = "True Isometric") {
      if (typeof enabled !== "boolean" || typeof transformBackground !== "boolean") {
        throw new TypeError("Pass booleans for enabled and transformBackground.");
      }
      const testScene = copy();
      await testScene.update({
        [`flags.${MODULE_ID}.isometricEnabled`]: enabled,
        [`flags.${MODULE_ID}.isometricBackground`]: transformBackground,
        [`flags.${MODULE_ID}.projectionType`]: projectionType
      });
      return inspect(testScene);
    },

    async openCopy() {
      const testScene = copy();
      await testScene.view();
      return inspect(testScene);
    },

    showPositionOverlay,
    clearPositionOverlay,

    async cleanup() {
      const testScene = copy();
      const sourceId = testScene.getFlag(OWNER_FLAG, MARKER).sourceSceneId;
      const source = game.scenes.get(sourceId);
      if (!source) throw new Error("Original scene not found; refusing to delete the temporary scene.");
      if (canvas.scene.id === testScene.id) await source.view();
      const deletedId = testScene.id;
      await testScene.delete();
      return { deletedTemporarySceneId: deletedId, restoredSceneId: canvas.scene.id, remainingMarkedCopies: findTemporary().length };
    }
  };
})();
