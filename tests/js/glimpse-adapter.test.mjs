import test from "node:test";
import assert from "node:assert/strict";
import {MODULE_ID, stableId} from "../../foundry/scripts/model.mjs";
import {PIN_PROFILES, applyGlimpsePins, pinToGlimpseLocation, planGlimpsePins} from "../../foundry/scripts/glimpse-adapter.mjs";

class Collection extends Array {
  get(id) { return this.find(document => document.id === id); }
  get contents() { return [...this]; }
}

class Document {
  constructor(data = {}) {
    const pages = data.pages, notes = data.notes;
    Object.assign(this, structuredClone({...data, pages: undefined, notes: undefined}));
    if (pages) this.pages = new Collection(...Array.from(pages, page => page instanceof Document ? page : new Document(page)));
    if (notes) this.notes = new Collection(...Array.from(notes, note => note instanceof Document ? note : new Document(note)));
    this.id ??= this._id;
    this.flags ??= {};
  }
  getFlag(scope, key) { return key ? this.flags?.[scope]?.[key] : this.flags?.[scope]; }
  async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = structuredClone(value); return this; }
  toObject() {
    const data = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value === "function") continue;
      if (["pages", "notes"].includes(key) && value) data[key] = [...value].map(document => document.toObject());
      else if (key === "folder" && value && typeof value === "object") data[key] = value.id;
      else if (value instanceof Map) data[key] = [...value.entries()];
      else data[key] = value;
    }
    return structuredClone(data);
  }
}

async function makeHarness() {
  const bundleId = "poe:prologue:maps:v1";
  const mapId = "poe:map:scene:AR_0701_Encampment";
  const pinId = "poe:pin:encampment:odema";
  const map = {id: mapId, kind: "map", name: {"pt-BR": "Encampment"}, data: {width: 1000, height: 800, image: "worlds/test/encampment.webp", calibration: {status: "approved-for-notes", targetPadding: 0}}, provenance: {source: "fixture", sourceId: "map", extractedAt: "2026-11-04T12:00:00Z", status: "converted"}};
  const pin = {id: pinId, kind: "pin", name: {en: "Odema", "pt-BR": "Odema"}, data: {mapId, category: "npc", position: {x: 250, y: 200}, positionCalibrated: true, discovery: "known", publicText: "Líder da caravana.", gmText: "Unity level116/pathId 683."}, provenance: {source: "fixture", sourceId: "level116/pathId:683", extractedAt: "2026-11-04T12:00:00Z", status: "adapted"}};
  const scene = new Document({id: "scene-encampment", name: "Encampment", width: 1000, height: 800, padding: 0, tokenVision: true, fogExploration: true, initialLevel: "level-1", levels: new Map([["level-1", {background: {src: map.data.image}}]]), notes: new Collection(), flags: {[MODULE_ID]: {import: {bundleKey: await stableId(bundleId, "bundle"), entityKey: await stableId(bundleId, mapId)}}}});
  scene.createEmbeddedDocuments = async (type, rows) => {
    assert.equal(type, "Note");
    const made = rows.map(row => new Document({_id: row._id ?? `note-${scene.notes.length + 1}`, ...row}));
    scene.notes.push(...made);
    return made;
  };
  const folders = new Collection();
  const journal = new Collection();
  const context = {world: {id: "world-test"}, user: {isGM: true}, i18n: {lang: "pt-BR"}, scenes: new Collection(scene), folders, journal};
  const calls = [];
  const glimpseApi = {locations: {
    async plan(locations, {scene: target, folder}) {
      return locations.map(location => {
        const entry = journal.find(item => item.getFlag("world", "glimpseLoreId") === location.id) ?? journal.find(item => item.name === location.name && item.folder?.name === folder);
        const note = target.notes.find(item => item.getFlag("world", "glimpseLoreId") === location.id);
        return {id: location.id, name: location.name, journal: entry ? "update" : "create", note: note ? "update" : "create", handMadePages: entry ? entry.pages.filter(page => !page.getFlag("world", "glimpseManaged")).length : 0, missingMedia: []};
      });
    },
    async apply(locations, {scene: target, folder}) {
      calls.push("apply");
      let folderDoc = folders.find(item => item.name === folder);
      if (!folderDoc) { folderDoc = new Document({id: "folder-1", name: folder, type: "JournalEntry"}); folders.push(folderDoc); }
      for (const location of locations) {
        let entry = journal.find(item => item.getFlag("world", "glimpseLoreId") === location.id);
        if (!entry) {
          const pages = new Collection();
          for (const image of location.images ?? []) pages.push(new Document({id: `image-${pages.length}`, type: "image", name: image.name, src: image.src, image: {caption: image.caption}, flags: {world: {glimpseManaged: true}}}));
          if (location.text) pages.push(new Document({id: `text-${pages.length}`, type: "text", name: location.name, text: {content: `<p>${location.text}</p>`}, flags: {world: {glimpseManaged: true}}}));
          entry = new Document({id: `journal-${journal.length + 1}`, name: location.name, folder: folderDoc, ownership: {default: location.ownership === "observer" ? 2 : 0}, pages, flags: {world: {glimpseLoreId: location.id}}});
          entry.createEmbeddedDocuments = async (type, rows) => {
            assert.equal(type, "JournalEntryPage");
            const made = rows.map(row => new Document(row));
            entry.pages.push(...made);
            return made;
          };
          journal.push(entry);
        }
        const keys = ["mode", "size", "image", "focusX", "focusY", "nightImage", "subtitle", "facts", "sound", "seal", "discovery", "rumour", "visited"];
        const glimpseFlags = Object.fromEntries(keys.filter(key => key === "image" ? location.cardImage !== undefined : location[key] !== undefined && !(location[key] === "" || (key === "facts" && Array.isArray(location[key]) && location[key].length === 0))).map(key => [key, key === "image" ? location.cardImage : key === "facts" && Array.isArray(location[key]) ? location[key].join("\n") : location[key]]));
        const note = new Document({id: `note-${target.notes.length + 1}`, x: Math.round(location.position.x), y: Math.round(location.position.y), text: location.label, entryId: entry.id, texture: {src: location.icon}, iconSize: location.iconSize, flags: {"glimpse-map-notes": glimpseFlags, world: {glimpseLoreId: location.id}}});
        target.notes.push(note);
      }
      return locations.map(location => ({id: location.id, ok: true}));
    },
    async export(target) { return {locations: target.notes.map(note => ({id: note.getFlag("world", "glimpseLoreId")}))}; }
  }};
  return {bundle: {schemaVersion: "1.0.0", id: bundleId, source: {kind: "fixture"}, targetFolder: {name: "Pillars of Eternity — Prólogo", type: "Scene"}, entities: [map, pin]}, map, pin, scene, context, glimpseApi, calls};
}

test("profile table covers the narrative categories with safe rumour defaults", () => {
  for (const category of ["npc", "enemy", "neutral-creature", "item", "treasure", "container", "examinable", "document", "book", "poi", "secret"]) {
    assert.ok(PIN_PROFILES[category], `missing ${category}`);
    assert.equal(PIN_PROFILES[category].discovery, "rumour");
  }
});

test("manifest keeps rumor identity private and maps exact canvas coordinates", async () => {
  const {bundle, map, pin, scene} = await makeHarness();
  pin.data.discovery = "rumour";
  pin.data.publicLabel = "Pista";
  pin.data.publicName = "Pista não identificada";
  pin.data.rumour = "A caravana procura uma planta da região.";
  const converted = pinToGlimpseLocation(bundle, pin, map, scene, {locationId: "stable-id"});
  assert.deepEqual(converted.location.position, pin.data.position);
  assert.equal(converted.location.label, "Pista");
  assert.match(converted.location.name, /Pista não identificada/);
  assert.doesNotMatch(converted.location.name, /Odema/);
  assert.equal(converted.location.ownership, "none");
  assert.equal(converted.location.focusX, 25);
  assert.equal(converted.location.focusY, 25);
  assert.equal(converted.location.images.length, 1);
  assert.equal(converted.location.icon, "icons/svg/mystery-man.svg");
});

test("preview calls only locations.plan and verifies a matching imported scene", async () => {
  const h = await makeHarness();
  assert.equal(h.scene.getFlag(MODULE_ID, "import").bundleKey, await stableId(h.bundle.id, "bundle"));
  assert.equal(h.scene.getFlag(MODULE_ID, "import").entityKey, await stableId(h.bundle.id, h.map.id));
  assert.equal(h.context.scenes.length, 1);
  assert.equal(h.context.scenes[0], h.scene);
  assert.equal(h.scene.width, h.map.data.width);
  assert.equal(h.scene.levels.get(h.scene.initialLevel).background.src, h.map.data.image);
  const plan = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(plan.jobs.length, 1, JSON.stringify(plan.skipped));
  assert.equal(plan.jobs[0].operation, "create");
  assert.equal(plan.rows[0].journal, "create");
  assert.equal(h.scene.notes.length, 0);
  assert.equal(h.context.journal.length, 0);
  assert.deepEqual(h.calls, []);
});

test("exploration reveal requires both scene vision and fog", async () => {
  const h = await makeHarness();
  h.pin.data.discovery = "explore";
  h.pin.data.rumour = "Uma pista.";
  h.scene.fogExploration = false;
  const plan = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(plan.jobs.length, 0);
  assert.match(plan.skipped[0].reason, /Fog Exploration/);
});

test("apply backs up before writing, creates a private GM page, then reimport is unchanged", async () => {
  const h = await makeHarness();
  const plan = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  const order = [];
  const result = await applyGlimpsePins(plan, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async payload => { order.push("backup"); assert.equal(payload.plannedCreates.length, 3); }});
  assert.deepEqual(order, ["backup"]);
  assert.equal(result.created.length, 1);
  assert.equal(result.failed.length, 0);
  assert.equal(h.scene.notes.length, 1);
  const entry = h.context.journal[0];
  assert.equal(entry.pages.length, 3);
  assert.equal(entry.pages[2].ownership.default, 0);
  const privateContent = entry.pages[2].text.content;
  const privateHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(privateContent))), byte => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(entry.pages[2].getFlag(MODULE_ID, "glimpsePrivatePage").contentHash, privateHash);
  const repeat = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(repeat.jobs[0].operation, "unchanged");
  const repeated = await applyGlimpsePins(repeat, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async () => { throw new Error("no backup expected for unchanged plan"); }});
  assert.deepEqual(repeated.unchanged, [h.pin.id]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.scene.notes.length, 1);
});

test("manual note edits become conflicts and are never overwritten", async () => {
  const h = await makeHarness();
  const initial = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  await applyGlimpsePins(initial, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async () => {}});
  h.scene.notes[0].x += 10;
  const revised = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(revised.jobs.length, 0);
  assert.match(revised.conflicts[0].reason, /Edição manual/);
  assert.equal(h.scene.notes[0].x, 260);
});

test("adopts an exact partial Glimpse import with rounded Note coordinates without applying twice", async () => {
  const h = await makeHarness();
  h.pin.data.position = {x: 250.6, y: 200.4};
  globalThis.foundry = {utils: {escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}};
  const first = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  await applyGlimpsePins(first, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async () => {}});
  const entry = h.context.journal[0], note = h.scene.notes[0];
  delete entry.flags[MODULE_ID];
  delete note.flags[MODULE_ID];
  entry.pages.splice(2, 1); // Simulate API writes completing before the private GM page step.
  const adoption = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(adoption.jobs[0].operation, "adopt");
  assert.equal(note.x, 251);
  let backup;
  const adopted = await applyGlimpsePins(adoption, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async payload => { backup = payload; }});
  assert.equal(adopted.failed.length, 0);
  assert.equal(adopted.adopted.length, 1);
  assert.equal(backup.plannedCreates.length, 1);
  assert.equal(backup.plannedCreates[0].type, "JournalEntryPage");
  assert.equal(backup.plannedUpdates.length, 1);
  assert.equal(entry.pages.length, 3);
  assert.equal(entry.pages[2].ownership.default, 0);
  const repeated = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(repeated.jobs[0].operation, "unchanged");
  const noOp = await applyGlimpsePins(repeated, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async () => { throw new Error("no backup expected"); }});
  assert.deepEqual(noOp.unchanged, [h.pin.id]);
  assert.equal(h.calls.length, 1);
  delete globalThis.foundry;
});

test("private page baseline tolerates stale hash metadata but detects content edits", async () => {
  const h = await makeHarness();
  const initial = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  await applyGlimpsePins(initial, {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true, backup: async () => {}});
  const page = h.context.journal[0].pages[2];
  page.flags[MODULE_ID].glimpsePrivatePage.contentHash = "stale-normalized-hash";
  const metadataOnly = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(metadataOnly.jobs[0].operation, "unchanged");
  assert.equal(metadataOnly.conflicts.length, 0);
  page.text.content += "<p>edição manual</p>";
  const edited = await planGlimpsePins(h.bundle, [h.pin.id], {context: h.context, glimpseApi: h.glimpseApi, assetExists: async () => true});
  assert.equal(edited.jobs.length, 0);
  assert.match(edited.conflicts[0].reason, /Página privada/);
});
