import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const tool = fileURLToPath(new URL("../../tools/prepare-glimpse-ir.mjs", import.meta.url));
const base = {
  schemaVersion: "1.0.0", id: "fixture:maps", source: {kind: "fixture"},
  entities: [{id: "map:encampment", kind: "map", name: {"pt-BR": "Encampment"}, data: {width: 100, height: 80, image: "worlds/test/map.webp"}, provenance: {source: "fixture", sourceId: "map", extractedAt: "2026-11-04T12:00:00Z", status: "converted"}}]
};
const projection = {map: "AR_0701_Caravan_Encampment", coordinateFrame: "unscaled-background-image/top-left", objects: [{originalId: {serializedFile: "level116", pathId: 42}, name: "NPC_Test", positionFoundry: {x: 10, y: 20}, insideImage: true, activeInHierarchy: true, method: "orthographic-ray-to-original-background-quad/v1", confidence: {objectPivot: "unreviewed"}}]};
const spec = {sourceMapId: projection.map, mapEntityId: "map:encampment", extractedAt: "2026-11-04T12:00:00Z", approval: {status: "approved-for-notes", reference: "validation fixture", sourceToCanvas: {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}}, target: {width: 100, height: 80, image: "worlds/test/map.webp", padding: 0}, pins: [{id: "pin:test:42", pathId: 42, expectedObjectName: "NPC_Test", category: "npc", spawnState: "initial", name: {en: "Test", "pt-BR": "Teste"}, data: {discovery: "known", publicText: "NPC de teste."}}]};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "rpgup-glimpse-ir-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const paths = {base: join(dir, "base.json"), projection: join(dir, "projection.json"), spec: join(dir, "spec.json"), output: join(dir, "out.json")};
  await Promise.all([[paths.base, base], [paths.projection, projection], [paths.spec, spec]].map(([path, value]) => writeFile(path, JSON.stringify(value))));
  return paths;
}

test("prepare-glimpse-ir applies explicit affine mapping and keeps source provenance", async t => {
  const paths = await fixture(t);
  const run = spawnSync(process.execPath, [tool, paths.base, paths.projection, paths.spec, paths.output], {encoding: "utf8"});
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(await readFile(paths.output, "utf8"));
  assert.equal(output.entities.length, 2);
  assert.deepEqual(output.entities[1].data.sourcePosition, {x: 10, y: 20});
  assert.deepEqual(output.entities[1].data.position, {x: 10, y: 20});
  assert.equal(output.entities[1].data.sourceUnityPathId, 42);
  assert.equal(output.entities[1].data.positionCalibrated, true);
  assert.match(output.entities[1].provenance.sha256, /^[a-f0-9]{64}$/);
});

test("prepare-glimpse-ir refuses mismatched source identity and existing output", async t => {
  const paths = await fixture(t);
  const specCopy = {...spec, sourceMapId: "other-map"};
  await writeFile(paths.spec, JSON.stringify(specCopy));
  let run = spawnSync(process.execPath, [tool, paths.base, paths.projection, paths.spec, paths.output], {encoding: "utf8"});
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /não corresponde/);
  await writeFile(paths.spec, JSON.stringify(spec));
  run = spawnSync(process.execPath, [tool, paths.base, paths.projection, paths.spec, paths.output], {encoding: "utf8"});
  assert.equal(run.status, 0, run.stderr);
  run = spawnSync(process.execPath, [tool, paths.base, paths.projection, paths.spec, paths.output], {encoding: "utf8"});
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /já existe/);
});
