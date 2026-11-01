import test from "node:test";
import assert from "node:assert/strict";
import {MODULE_ID, copy, setPath} from "../../foundry/scripts/model.mjs";
import {applyPlan, planImport} from "../../foundry/scripts/importer.mjs";

const record = (kind = "quest", data = {publicText: "Own synthetic text"}) => ({id: "own-record", kind, sourceId: "own-record", name: {"pt-BR": "Registro de teste próprio"}, provenance: {source: "synthetic", sourceId: "own-record", extractedAt: "2026-11-01T00:00:00Z", status: "extracted", sha256: "0".repeat(64)}, data});
const bundle = entity => ({schemaVersion: "1.0.0", id: "synthetic-bundle", source: {game: "synthetic"}, entities: [entity]});
class Collection extends Map { [Symbol.iterator]() { return this.values(); } }
function environment() {
  const log = [], context = {user: {isGM: true}, world: {id: "own-world-a"}, i18n: {lang: "pt-BR"}, journal: new Collection(), scenes: new Collection()};
  const makeClass = type => ({async create(data, options) {
    log.push("create");
    assert.equal(options.keepId, true);
    const source = copy(data);
    const document = {id: source._id, uuid: `${type}.${source._id}`, toObject: () => copy(source), getFlag: (scope, key) => source.flags?.[scope]?.[key], update: async patch => {log.push("update"); for (const [key, value] of Object.entries(patch)) setPath(source, key, value); return document;}, updateEmbeddedDocuments: async (embeddedType, updates) => {log.push("embedded-update"); const list = embeddedType === "Level" ? source.levels : source.pages; for (const patch of updates) {const entry = list.find(value => value._id === patch._id); for (const [key, value] of Object.entries(patch)) setPath(entry, key, value);} return updates.map(patch => ({id: patch._id}));}};
    (type === "Scene" ? context.scenes : context.journal).set(source._id, document);
    return document;
  }});
  return {context, log, documentClasses: {JournalEntry: makeClass("JournalEntry"), Scene: makeClass("Scene")}, backup: async () => log.push("backup"), verifyAsset: async () => true};
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
  assert.ok(source.flags[MODULE_ID].import.baseline);
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
test("missing asset blocks scene creation before mutation", async () => {
  const env = environment(); env.verifyAsset = async () => false;
  const input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png"}));
  await assert.rejects(applyPlan(await planImport(input, ["own-record"], env.context), env), /Imagem ausente/);
  assert.deepEqual(env.log, []);
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
  const doc = [...env.context.journal][0], baseline = copy(doc.getFlag(MODULE_ID, "import").baseline), realUpdate = doc.updateEmbeddedDocuments;
  doc.updateEmbeddedDocuments = async () => [];
  input.entities[0].data.publicText = "Changed after source update";
  const failed = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(failed.failed.length, 1); assert.equal(failed.updated.length, 0);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, baseline);
  doc.updateEmbeddedDocuments = realUpdate;
  const retried = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(retried.updated.length, 1); assert.deepEqual(retried.conflicts, []);
});
test("a cancelled Level update never marks the image updated", async () => {
  const env = environment(), input = bundle(record("map", {width: 1000, height: 800, image: "assets/own-map.png"}));
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.scenes][0], before = copy(doc.getFlag(MODULE_ID, "import").baseline);
  doc.updateEmbeddedDocuments = async () => [];
  input.entities[0].data.image = "assets/changed.webp";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.equal(result.updated.length, 0);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, before);
});
test("a cancelled main update preserves the old baseline", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], before = copy(doc.getFlag(MODULE_ID, "import").baseline);
  doc.update = async () => undefined;
  input.entities[0].name["pt-BR"] = "New source name";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.equal(result.updated.length, 0);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, before);
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
  const doc = [...env.context.journal][0], before = copy(doc.getFlag(MODULE_ID, "import").baseline);
  doc.updateEmbeddedDocuments = async (type, updates) => updates.map(patch => ({id: patch._id}));
  input.entities[0].data.publicText = "Not actually persisted";
  const result = await applyPlan(await planImport(input, ["own-record"], env.context), env);
  assert.equal(result.failed.length, 1); assert.match(result.failed[0].reason, /não persistida/);
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, before);
});
test("parent fields changed during an awaited embedded update are preserved", async () => {
  const env = environment(), input = bundle(record());
  await applyPlan(await planImport(input, ["own-record"], env.context), env);
  const doc = [...env.context.journal][0], realEmbedded = doc.updateEmbeddedDocuments;
  const before = copy(doc.getFlag(MODULE_ID, "import").baseline);
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
  assert.deepEqual(doc.getFlag(MODULE_ID, "import").baseline, before);
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
