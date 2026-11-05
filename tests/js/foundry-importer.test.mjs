import test from "node:test";
import assert from "node:assert/strict";
import {MODULE_ID, copy, describeEntity, setPath} from "../../foundry/scripts/model.mjs";
import {applyPlan, planImport} from "../../foundry/scripts/importer.mjs";

const record = (kind = "quest", data = {publicText: "Own synthetic text"}) => ({id: "own-record", kind, sourceId: "own-record", name: {"pt-BR": "Registro de teste próprio"}, provenance: {source: "synthetic", sourceId: "own-record", extractedAt: "2026-11-01T00:00:00Z", status: "extracted", sha256: "0".repeat(64)}, data});
const bundle = entity => ({schemaVersion: "1.0.0", id: "synthetic-bundle", source: {game: "synthetic"}, entities: [entity]});
class Collection extends Map { [Symbol.iterator]() { return this.values(); } }
function expandDottedKeys(value) {
  if (Array.isArray(value)) return value.map(expandDottedKeys);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) setPath(result, key, expandDottedKeys(child));
  return result;
}
function environment({expandDotted = false, noOpReturnsUndefined = false, mutateUpdatePayload = false} = {}) {
  const log = [], context = {user: {isGM: true}, world: {id: "own-world-a"}, i18n: {lang: "pt-BR"}, journal: new Collection(), scenes: new Collection(), folders: new Collection()};
  const normalize = expandDotted ? expandDottedKeys : copy;
  const makeClass = type => ({async create(data, options) {
    log.push("create");
    assert.equal(options.keepId, true);
    const source = normalize(data);
    const document = {id: source._id, name: source.name, type: source.type, uuid: `${type}.${source._id}`, toObject: () => copy(source), getFlag: (scope, key) => source.flags?.[scope]?.[key], update: async patch => {log.push("update"); const before = JSON.stringify(source); if (mutateUpdatePayload) patch._id = source._id; for (const [key, value] of Object.entries(patch)) setPath(source, key, normalize(value)); document.name = source.name; return noOpReturnsUndefined && before === JSON.stringify(source) ? undefined : document;}, updateEmbeddedDocuments: async (embeddedType, updates) => {log.push("embedded-update"); const list = embeddedType === "Level" ? source.levels : source.pages; for (const patch of updates) {const entry = list.find(value => value._id === patch._id); for (const [key, value] of Object.entries(patch)) setPath(entry, key, normalize(value));} return updates.map(patch => ({id: patch._id}));}};
    (type === "Scene" ? context.scenes : type === "Folder" ? context.folders : context.journal).set(source._id, document);
    return document;
  }});
  return {context, log, documentClasses: {JournalEntry: makeClass("JournalEntry"), Scene: makeClass("Scene"), Folder: makeClass("Folder")}, backup: async () => log.push("backup"), verifyAsset: async () => true};
}

test("non-GM users cannot plan or mutate documents", async () => {
  const env = environment(); env.context.user.isGM = false;
  await assert.rejects(planImport(bundle(record()), ["own-record"], env.context), /Somente o mestre/);
  await assert.rejects(applyPlan({actions: []}, env), /Somente o mestre/);
  assert.deepEqual(env.log, []);
});
test("initial import persists backup first, private ownership and stable IDs", async () => {
  const env = environment(); const plan = await planImport(bundle(record()), ["own-record"], env.context);
  const result = await applyPlan(plan, env);
  assert.equal(result.created.length, 1);
  assert.deepEqual(env.log, ["backup", "create"]);
  const source = [...env.context.journal][0].toObject();
  assert.equal(source.ownership.default, 0);
  assert.equal(source.pages[0].ownership.default, 0);
  assert.ok(source.flags[MODULE_ID].import.managedBaseline);
});
test("reimport is idempotent with no mutation or needless backup", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  env.log.length = 0;
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.unchanged.length, 1); assert.deepEqual(env.log, []); assert.equal(env.context.journal.size, 1);
});
test("source update keeps GM title, unrelated pages and quest progress", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const document = [...env.context.journal][0];
  await document.update({name: "Título improvisado", [`flags.${MODULE_ID}.questState`]: "completed"});
  const next = bundle(record("quest", {publicText: "New source wording", gmText: "Never publish"}));
  const result = await applyPlan(await planImport(next, ["own-record"], env.context), env);
  const source = document.toObject();
  assert.equal(source.name, "Título improvisado");
  assert.match(source.pages[0].text.content, /New source wording/);
  assert.equal(source.flags[MODULE_ID].questState, "completed");
  assert.ok(!JSON.stringify(source).includes("Never publish"));
  assert.equal(result.conflicts[0].path, "name");
});
test("backup failure prevents every mutation", async () => {
  const env = environment(); env.backup = async () => {throw new Error("quota");};
  await assert.rejects(applyPlan(await planImport(bundle(record()), ["own-record"], env.context), env), /quota/);
  assert.equal(env.context.journal.size, 0);
});
test("missing map asset is isolated and does not create the scene folder", async () => {
  const env = environment(); env.verifyAsset = async () => false;
  const input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png"}));
  input.targetFolder = {name:"Own map batch",type:"Scene"};
  const result=await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length,1);
  assert.match(result.failed[0].reason,/Imagem ausente/);
  assert.deepEqual(env.log, []);
  assert.equal(env.context.scenes.size,0); assert.equal(env.context.folders.size,0);
});
test("scene uses V14 Level API and never activates a scene", async () => {
  const env = environment();
  const input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png"}));
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.scenes][0], source = doc.toObject();
  assert.equal(source.levels[0].background.src, "assets/own-map.png");
  assert.equal(source.initialLevel, source.levels[0]._id);
  assert.equal(source.flags[MODULE_ID].combatValidated, false);
  assert.equal(source.navigation, false);
  assert.equal(source.active, undefined);
  input.entities[0].data.image = "assets/own-map-v2.webp";
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(doc.toObject().levels[0].background.src, "assets/own-map-v2.webp");
});
test("new scenes receive the V14 grid, padding, background, vision and fog defaults", async () => {
  const env = environment();
  const input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png", grid: {type: 0, size: 100, distance: 5, units: "ft"}}));
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const scene = [...env.context.scenes][0], source = scene.toObject(), metadata = scene.getFlag(MODULE_ID, "import");
  assert.equal(result.created.length, 1);
  assert.equal(source.grid.type, 1);
  assert.equal(source.grid.size, 150);
  assert.equal(source.padding, 0.1);
  assert.equal(source.backgroundColor, "#000000");
  assert.equal(source.tokenVision, true);
  assert.equal(source.fog.mode, 1);
  assert.equal(source.fog.colors.explored, "#666666");
  assert.equal(source.fog.colors.unexplored, "#000000");
  assert.equal(metadata.sceneDefaultsVersion, 1);
  for (const path of ["grid.type", "grid.size", "padding", "backgroundColor", "tokenVision", "fog.mode", "fog.colors.explored", "fog.colors.unexplored"]) {
    assert.ok(metadata.managedBaseline.fields.some(field => field.path === path), `${path} must be verified after creation`);
  }
});
test("known maps are created without token vision or fog while exploration is opt-in by default", async () => {
  const env = environment();
  const knownBundle = bundle(record("map", {width: 1000, height: 800, image: "assets/known.png", mapKnowledge: "known"}));
  const unknownBundle = {...knownBundle, id: "other-synthetic-bundle", entities: [record("map", {width: 1000, height: 800, image: "assets/explore.png"})]};
  await applyPlan(await planImport(knownBundle, ["own-record"], env.context), env);
  await applyPlan(await planImport(unknownBundle, ["own-record"], env.context), env);
  const scenes = [...env.context.scenes].map(scene => scene.toObject());
  const known = scenes.find(scene => scene.name === "Registro de teste próprio");
  const unexplored = scenes.find(scene => scene.levels[0].background.src === "assets/explore.png");
  assert.equal(known.tokenVision, false);
  assert.equal(known.fog.mode, 0);
  assert.equal(known.flags[MODULE_ID].import.mapKnowledge, "known");
  assert.equal(unexplored.tokenVision, true);
  assert.equal(unexplored.fog.mode, 1);
  assert.equal(unexplored.flags[MODULE_ID].import.mapKnowledge, "requires-exploration");
  knownBundle.entities[0].data.mapKnowledge = "requires-exploration";
  const reimport = await applyPlan(await planImport(knownBundle, ["own-record"], env.context), env);
  assert.equal(reimport.unchanged.length, 1);
  const preservedKnown = [...env.context.scenes].find(scene => scene.name === "Registro de teste próprio").toObject();
  assert.equal(preservedKnown.tokenVision, false);
  assert.equal(preservedKnown.fog.mode, 0);
});
test("reimport keeps new-scene defaults and GM scene-setting edits", async () => {
  const env = environment(), input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png", grid: {type: 0, size: 100}}));
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const scene = [...env.context.scenes][0];
  await scene.update({"grid.size": 175, padding: 0.2, backgroundColor: "#123456", tokenVision: false, "fog.mode": 0, "fog.colors.explored": "#aabbcc"});
  env.log.length = 0;
  const plan = await planImport(input, ["own-record"], env.context);
  assert.equal(plan.actions[0].operation, "unchanged");
  assert.ok(plan.conflicts.some(conflict => conflict.path === "grid.size"));
  const result = await applyPlan(plan, env), source = scene.toObject();
  assert.equal(result.unchanged.length, 1);
  assert.equal(source.grid.size, 175);
  assert.equal(source.padding, 0.2);
  assert.equal(source.backgroundColor, "#123456");
  assert.equal(source.tokenVision, false);
  assert.equal(source.fog.mode, 0);
  assert.equal(source.fog.colors.explored, "#aabbcc");
  assert.deepEqual(env.log, []);
});
test("legacy scenes without the defaults marker are not retrofitted", async () => {
  const env = environment(), input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png", grid: {type: 0, size: 100}}));
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const scene = [...env.context.scenes][0];
  const raw = await describeEntity(input, input.entities[0]);
  const fields = Object.entries(raw.fields).sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => ({path, value}));
  await scene.update({"flags.rpgup-pillars-importer.import.sceneDefaultsVersion": null, grid: {type: 0, size: 100, distance: 5, units: "ft"}, padding: 0, backgroundColor: "#222222", "flags.rpgup-pillars-importer.import.managedBaseline": {version: 1, fields}});
  env.log.length = 0;
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const source = scene.toObject();
  assert.equal(result.unchanged.length, 1);
  assert.equal(source.grid.type, 0);
  assert.equal(source.grid.size, 100);
  assert.equal(source.padding, 0);
  assert.equal(source.backgroundColor, "#222222");
  assert.deepEqual(env.log, []);
});
test("Foundry update payload mutation does not fail scene verification", async () => {
  const env=environment({mutateUpdatePayload:true}), input=bundle(record("map",{width:1000,height:800,image:"assets/own-map.png"}));
  await applyPlan(await planImport(input,["own-record"],env.context),env);
  const scene=[...env.context.scenes][0];
  input.entities[0].data.image="assets/own-map-v2.webp";
  const result=await applyPlan(await planImport(input,["own-record"],env.context),env);
  assert.deepEqual(result.failed,[]);
  assert.equal(result.updated.length,1);
  assert.equal(scene.toObject().levels[0].background.src,"assets/own-map-v2.webp");
  assert.equal(scene.getFlag(MODULE_ID,"import").managedBaseline.fields.find(field=>field.path==="level.background.src").value,"assets/own-map-v2.webp");
});
test("tracking verification ignores object key order while preserving exact values", async () => {
  const env=environment(), input=bundle(record("map",{width:1000,height:800,image:"assets/own-map.png",sourceAsset:{layer:"BKG",selectionType:"initial",rowOrigin:"bottom"}}));
  await applyPlan(await planImport(input,["own-record"],env.context),env);
  const scene=[...env.context.scenes][0],update=scene.update.bind(scene);
  input.entities[0].data.sourceAsset={layer:"BKG",selectionType:"explicit-base-grid",rowOrigin:"bottom"};
  scene.update=async patch=>{
    for(const [path,value] of Object.entries(patch)) if(path.endsWith(".sourceAsset")&&value&&typeof value==="object") patch[path]=Object.fromEntries(Object.entries(value).reverse());
    return update(patch);
  };
  const result=await applyPlan(await planImport(input,["own-record"],env.context),env);
  assert.deepEqual(result.failed,[]);
  assert.equal(result.updated.length,1);
  assert.deepEqual(scene.getFlag(MODULE_ID,"import").sourceAsset,input.entities[0].data.sourceAsset);
});
test("map batch creates one stable Scene folder and reimport stays idempotent", async () => {
  const env=environment(), input=bundle(record("map",{width:1000,height:800,image:"assets/own-map.png"}));
  input.targetFolder={name:"Pillars of Eternity — Prólogo",type:"Scene"};
  const plan=await planImport(input,["own-record"],env.context);
  assert.equal(plan.folder.operation,"create");
  let backupPayload;
  env.backup=async payload=>{backupPayload=payload;env.log.push("backup");};
  const created=await applyPlan(plan,env);
  assert.equal(created.folder.operation,"created"); assert.equal(env.context.folders.size,1);
  assert.equal(backupPayload.plannedCreates[0].type,"Folder");
  const folder=[...env.context.folders][0], scene=[...env.context.scenes][0];
  assert.equal(folder.type,"Scene"); assert.equal(folder.name,"Pillars of Eternity — Prólogo");
  assert.equal(scene.toObject().folder,folder.id);
  env.log.length=0;
  const again=await applyPlan(await planImport(input,["own-record"],env.context),env);
  assert.equal(again.unchanged.length,1); assert.equal(again.folder.operation,"unchanged");
  assert.deepEqual(env.log,[]); assert.equal(env.context.folders.size,1); assert.equal(env.context.scenes.size,1);
});
test("one map create failure does not prevent the remaining map from importing",async()=>{
  const env=environment(), one=record("map",{width:1000,height:800,image:"assets/one.png"}), two={...record("map",{width:1000,height:800,image:"assets/two.png"}),id:"second-map",sourceId:"second-map",name:{"pt-BR":"Second map"}};
  const input={...bundle(one),entities:[one,two]};
  const create=env.documentClasses.Scene.create;
  env.documentClasses.Scene.create=async(data,options)=>{if(data.name==="Registro de teste próprio")throw new Error("isolated map failure");return create(data,options);};
  const result=await applyPlan(await planImport(input,[one.id,two.id],env.context),env);
  assert.equal(result.failed.length,1); assert.equal(result.failed[0].id,one.id);
  assert.equal(result.created.length,1); assert.equal(result.created[0].id,two.id);
  assert.equal(env.context.scenes.size,1);
});
test("same bundle in two worlds has independent documents and state", async () => {
  const a = environment(), b = environment(); b.context.world.id = "own-world-b";
  const input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], a.context), a);
  await applyPlan(await planImport(input, ["own-record"], b.context), b);
  await [...a.context.journal][0].update({name: "World A edited"});
  assert.notEqual([...a.context.journal][0].toObject().name, [...b.context.journal][0].toObject().name);
});
test("another world cannot apply a plan", async () => {
  const env = environment(); const plan = await planImport(bundle(record()), ["own-record"], env.context);
  env.context.world.id = "other";
  await assert.rejects(applyPlan(plan, env), /outro mundo/);
  assert.deepEqual(env.log, []);
});
test("changes after backup are preserved and reported as failures", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  input.entities[0].data.publicText = "Updated source";
  const plan = await planImport(input, ["own-record"], env.context), doc = [...env.context.journal][0];
  env.backup = async () => doc.update({name: "Concurrent GM change"});
  const result = await applyPlan(plan, env);
  assert.equal(result.failed.length, 1);
  assert.equal(doc.toObject().name, "Concurrent GM change");
  assert.ok(!doc.toObject().pages[0].text.content.includes("Updated source"));
});
test("unsupported records remain pending without artificial documents", async () => {
  const env = environment(), input = bundle(record("container", {gmText: "private loot"}));
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.skipped.length, 1);
  assert.equal(env.context.journal.size, 0);
  assert.deepEqual(env.log, []);
});
test("a removed GM page is never silently recreated", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const document = [...env.context.journal][0]; await document.update({pages: []});
  input.entities[0].data.publicText = "Updated";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(document.toObject().pages.length, 0);
  assert.ok(result.conflicts.some(entry => entry.path === "page.text.content"));
});
test("a cancelled page update is reported without advancing the baseline", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], baseline = copy(doc.getFlag(MODULE_ID, "import").managedBaseline), realUpdate = doc.updateEmbeddedDocuments;
  doc.updateEmbeddedDocuments = async () => [];
  input.entities[0].data.publicText = "Changed after source update";
  const failed = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(failed.failed.length, 1); assert.equal(failed.updated.length, 0);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").managedBaseline, baseline);
  doc.updateEmbeddedDocuments = realUpdate;
  const retried = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(retried.updated.length, 1); assert.deepEqual(retried.conflicts, []);
});
test("a cancelled Level update never marks the image updated", async () => {
  const env = environment(), input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png"}));
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.scenes][0], before = copy(doc.getFlag(MODULE_ID, "import").managedBaseline);
  doc.updateEmbeddedDocuments = async () => [];
  input.entities[0].data.image = "assets/changed.webp";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.equal(result.updated.length, 0);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").managedBaseline, before);
});
test("a cancelled main update preserves the old baseline", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], before = copy(doc.getFlag(MODULE_ID, "import").managedBaseline);
  doc.update = async () => undefined;
  input.entities[0].name["pt-BR"] = "New source name";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.equal(result.updated.length, 0);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").managedBaseline, before);
});
test("retry reconciles baseline after embedded succeeds and tracking is cancelled", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], realUpdate = doc.update;
  doc.update = async () => undefined;
  input.entities[0].data.publicText = "Second source version";
  const failed = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(failed.failed.length, 1); assert.match(doc.toObject().pages[0].text.content, /Second/);
  doc.update = realUpdate;
  const plan = await planImport(input, ["own-record"], env.context);
  assert.equal(plan.actions[0].operation, "update"); assert.deepEqual(plan.actions[0].patch, {});
  const retry = await applyPlan(plan, env);
  assert.equal(retry.updated.length, 1); assert.deepEqual(retry.conflicts, []);
  input.entities[0].data.publicText = "Third source version";
  const third = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(third.updated.length, 1); assert.deepEqual(third.conflicts, []);
  assert.match(doc.toObject().pages[0].text.content, /Third/);
});
test("successful-looking embedded return cannot hide fields that were not persisted", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], before = copy(doc.getFlag(MODULE_ID, "import").managedBaseline);
  doc.updateEmbeddedDocuments = async (type, updates) => updates.map(patch => ({id: patch._id}));
  input.entities[0].data.publicText = "Not actually persisted";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.match(result.failed[0].reason, /não persistida/);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").managedBaseline, before);
});
test("parent fields changed during an awaited embedded update are preserved", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], realEmbedded = doc.updateEmbeddedDocuments;
  const before = copy(doc.getFlag(MODULE_ID, "import").managedBaseline);
  doc.updateEmbeddedDocuments = async (...args) => {
    const result = await realEmbedded(...args);
    await doc.update({name: "Concurrent GM title"});
    return result;
  };
  input.entities[0].name["pt-BR"] = "Updated source title";
  input.entities[0].data.publicText = "Updated source prose";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.equal(result.updated.length, 0);
  assert.match(result.failed[0].reason, /mudou durante/);
  assert.equal(doc.toObject().name, "Concurrent GM title");
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").managedBaseline, before);
});
test("tracking changed during an awaited embedded update is never overwritten", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], realEmbedded = doc.updateEmbeddedDocuments;
  doc.updateEmbeddedDocuments = async (...args) => {
    const result = await realEmbedded(...args);
    await doc.update({[`flags.${MODULE_ID}.import.sourceHash`]: "f".repeat(64)});
    return result;
  };
  input.entities[0].data.publicText = "Updated source prose";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.equal(result.updated.length, 0);
  assert.equal(doc.getFlag(MODULE_ID, "import").sourceHash, "f".repeat(64));
});
test("versioned baseline survives recursive dot expansion and remains idempotent", async () => {
  const env = environment({expandDotted: true, noOpReturnsUndefined: true}), input = bundle(record());
  const created = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(created.created.length, 1);
  const metadata = [...env.context.journal][0].getFlag(MODULE_ID, "import");
  assert.equal(metadata.managedBaseline.version, 1);
  assert.ok(metadata.managedBaseline.fields.some(field => field.path === "page.text.content"));
  env.log.length = 0;
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.deepEqual(result.failed, []); assert.equal(result.unchanged.length, 1); assert.deepEqual(env.log, []);
});
test("nested legacy baseline migrates once with backup and without deleting legacy metadata", async () => {
  const env = environment({expandDotted: true, noOpReturnsUndefined: true}), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], old = copy(doc.getFlag(MODULE_ID, "import"));
  const fields = Object.fromEntries(old.managedBaseline.fields.map(field => [field.path, field.value]));
  delete old.managedBaseline; old.baseline = expandDottedKeys(fields); old.gmMetadata = "Preserve own note";
  await doc.update({[`flags.${MODULE_ID}.import`]: old});
  env.log.length = 0;
  const plan = await planImport(input, ["own-record"], env.context);
  assert.equal(plan.actions[0].operation, "update"); assert.deepEqual(plan.actions[0].patch, {}); assert.deepEqual(plan.conflicts, []);
  const migrated = await applyPlan(plan, env);
  assert.equal(migrated.updated.length, 1); assert.deepEqual(migrated.failed, []);
  assert.equal(env.log[0], "backup");
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, old.baseline);
  assert.equal(doc.getFlag(MODULE_ID, "import").gmMetadata, "Preserve own note");
  assert.equal(doc.id, plan.actions[0].descriptor.id);
  const retried = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(retried.unchanged.length, 1); assert.deepEqual(retried.failed, []);
});
test("flat legacy baseline migrates while preserving GM edits and source updates", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], old = copy(doc.getFlag(MODULE_ID, "import"));
  old.baseline = Object.fromEntries(old.managedBaseline.fields.map(field => [field.path, field.value]));
  delete old.managedBaseline;
  await doc.update({[`flags.${MODULE_ID}.import`]: old, name: "GM-edited title"});
  input.entities[0].data.publicText = "Updated own source";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.updated.length, 1); assert.deepEqual(result.failed, []);
  assert.ok(result.conflicts.some(conflict => conflict.path === "name"));
  assert.equal(doc.toObject().name, "GM-edited title");
  assert.match(doc.toObject().pages[0].text.content, /Updated own source/);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, old.baseline);
});
test("undefined update result is accepted only when reread proves the requested state", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], realUpdate = doc.update;
  doc.update = async patch => {await realUpdate(patch); return undefined;};
  input.entities[0].provenance.sha256 = "1".repeat(64);
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.updated.length, 1); assert.deepEqual(result.failed, []);
  assert.equal(doc.getFlag(MODULE_ID, "import").sourceHash, "1".repeat(64));
});
