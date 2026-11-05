(() => {
  "use strict";
  const g = globalThis.game;
  const mod = g?.modules?.get("rpgup-pillars-importer");
  const scene = g?.scenes?.active;
  const result = {
    ok: Boolean(g?.ready),
    foundryVersion: g?.version ?? null,
    world: g?.world ? { id: g.world.id, title: g.world.title, system: g.world.system } : null,
    system: g?.system ? { id: g.system.id, version: g.system.version ?? null } : null,
    importer: mod ? { id: mod.id, version: mod.version ?? null, active: Boolean(mod.active) } : null,
    activeScene: scene ? { id: scene.id, name: scene.name } : null
  };
  console.info("[RPG UP] LOCAL STATUS " + JSON.stringify(result));
  return result;
})();
