import test from "node:test";
import assert from "node:assert/strict";
import {assetPath, describeEntity, displayName, escapeText, mergeManaged, parseBundle, stableId, validateBundle} from "../../foundry/scripts/model.mjs";

const entity = (kind = "quest", data = {}) => ({id: `synthetic-${kind}`, sourceId: "synthetic", kind, name: {en: "Own test record"}, provenance: {source: "synthetic-test", sourceId: "own-test", extractedAt: "2026-11-01T00:00:00Z", status: "extracted", sha256: "0".repeat(64)}, data});
const bundle = entities => ({schemaVersion: "1.0.0", id: "own-test-fixture", source: {game: "synthetic"}, entities});

test("bundle validates without commercial fixtures", () => assert.equal(validateBundle(bundle([entity()])).entities.length, 1));
test("bundle rejects unsupported version and duplicate IDs", () => {
  assert.throws(() => validateBundle({...bundle([]), schemaVersion: "2"}));
  assert.throws(() => validateBundle(bundle([entity(), entity()])));
});
test("entity provenance is required and conversion statuses match the IR contract", () => {
  const missing = entity(); delete missing.provenance.sourceId;
  assert.throws(() => validateBundle(bundle([missing])), /Proveniência/);
  const invalid = entity(); invalid.provenance.status = "converted-automatically";
  assert.throws(() => validateBundle(bundle([invalid])), /Proveniência/);
  const badHash = entity(); badHash.provenance.sha256 = "bad";
  assert.throws(() => validateBundle(bundle([badHash])), /SHA-256/);
});
test("untrusted keys cannot pollute prototypes", () => {
  assert.throws(() => parseBundle('{"schemaVersion":"1.0.0","id":"x","source":{},"entities":[],"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
});
test("deeply nested data and non-finite numbers are rejected", () => {
  let data = {}; for (let i = 0; i < 45; i++) data = {child: data};
  assert.throws(() => validateBundle(bundle([entity("lore", data)])));
  assert.throws(() => validateBundle(bundle([entity("map", {width: Infinity})])));
});
test("source prose and Foundry enrichers become inert text", () => {
  const escaped = escapeText('<script>alert(1)</script> @UUID[secret] [[/r 1d20]] {x}');
  assert.ok(!escaped.includes("<script>"));
  assert.ok(!escaped.includes("@UUID["));
  assert.ok(!escaped.includes("[["));
});
test("HTML entity decoding cannot recover ASCII enrichment delimiters", () => {
  const escaped = escapeText('@UUID[secret] [[/r 1d20]] {macro} <b>A & B</b>');
  const decoded = escaped.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  assert.ok(!decoded.includes("@UUID["));
  assert.ok(!decoded.includes("[["));
  assert.ok(!decoded.includes("{macro}"));
  assert.match(decoded, /＠UUID［secret］/);
  assert.match(decoded, /A & B/);
});
test("translation fallback is explicitly identified", () => assert.match(displayName(entity()), /EN — tradução pendente/));
test("stable IDs remain independent of translated names", async () => {
  assert.match(await stableId("a", "b"), /^[a-f0-9]{16}$/);
  assert.equal(await stableId("a", "b"), await stableId("a", "b"));
  assert.notEqual(await stableId("a", "b"), await stableId("a", "c"));
  assert.notEqual(await stableId("a", "b"), await stableId("b", "a"));
});
test("asset paths reject URLs, traversal, SVG and encoded traversal", () => {
  for (const path of ["https://bad/x.png", "file:///a.png", "/a.png", "../a.png", "a/../b.png", "a\\b.png", "a.svg", "a/%2e%2e/b.png", "%2fsecret.png", "a.png?x=1", "javascript:a.png"]) assert.throws(() => assetPath(path), path);
  assert.equal(assetPath("rpgup/assets/test%20map.webp"), "rpgup/assets/test%20map.webp");
});
test("three-way merge updates untouched fields and preserves GM edits", () => {
  const merged = mergeManaged({name: "v1", text: "old"}, {name: "GM title", text: "old"}, {name: "v2", text: "new"});
  assert.deepEqual(merged.patch, {text: "new"});
  assert.equal(merged.conflicts[0].path, "name");
  assert.deepEqual(merged.baseline, {name: "v1", text: "new"});
});
test("three-way merge is idempotent and never deletes removed source fields", () => {
  assert.deepEqual(mergeManaged({name: "same", text: "old"}, {name: "same", text: "GM"}, {name: "same"}).patch, {});
  assert.deepEqual(mergeManaged({}, {name: "GM"}, {name: "source"}).patch, {});
});
test("private-only quests are not serialized into world documents", async () => {
  const record = entity("quest", {gmText: "secret solution", sourceTree: {Secret: "do not publish"}});
  const result = await describeEntity(bundle([record]), record);
  assert.equal(result.supported, false);
  assert.ok(!JSON.stringify(result).includes("secret solution"));
});
test("public journal descriptor excludes secrets and source scripts", async () => {
  const record = entity("dialogue", {publicText: "A public inscription.", gmText: "secret solution", sourceTree: {Script: "danger"}});
  const result = await describeEntity(bundle([record]), record);
  assert.equal(result.type, "JournalEntry");
  assert.ok(!JSON.stringify(result).includes("secret solution"));
  assert.ok(!JSON.stringify(result).includes("danger"));
});
test("maps require real image metadata and remain unvalidated for combat", async () => {
  assert.equal((await describeEntity(bundle([]), entity("map", {}))).supported, false);
  const result = await describeEntity(bundle([]), entity("map", {width: 1200, height: 800, image: "assets/synthetic.png"}));
  assert.equal(result.type, "Scene");
  assert.equal(result.fields["level.background.src"], "assets/synthetic.png");
  assert.match(result.warning, /não validada para combate/);
});
test("bad grid configuration remains pending", async () => {
  const record = entity("map", {width: 1000, height: 1000, image: "assets/synthetic.webp", grid: {size: -1}});
  assert.equal((await describeEntity(bundle([]), record)).supported, false);
});
test("actors and item stats are never fabricated", async () => {
  for (const kind of ["npc", "item", "container", "encounter", "transition"]) assert.equal((await describeEntity(bundle([]), entity(kind))).supported, false);
});
