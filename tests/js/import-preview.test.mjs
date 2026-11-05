import test from "node:test";
import assert from "node:assert/strict";
import {selectSubsystemIds, summarizeImportPreview} from "../../foundry/scripts/import-preview.mjs";

const entities = [
  {id: "map:one", kind: "map", data: {}},
  {id: "pin:one", kind: "pin", data: {mapId: "map:one"}},
  {id: "quest:one", kind: "quest", data: {}},
  {id: "actor:one", kind: "npc", data: {}}
];

test("subsystem scopes exclude disabled map, pin, and journal records, preserving visible unsupported selections", () => {
  assert.deepEqual(selectSubsystemIds(entities, entities.map(entity => entity.id), {maps: false, pins: false, journals: true}), ["quest:one", "actor:one"]);
});

test("dry-run summarizes operations without exposing journal content and defers pins for a new map", () => {
  const ordinaryPlan = {actions: [{descriptor: {entityId: "map:one", type: "Scene", fields: {"page.text.content": "private text"}}, operation: "create"}], skipped: [], conflicts: []};
  const pinPlan = {jobs: [], skipped: [{id: "pin:one", reason: "Cena importada não encontrada univocamente para este mapa."}], conflicts: []};
  const inventory = {lights: {identified: 2, converted: 0, status: "pending-review"}};
  const withInventory = entities.map(entity => entity.id === "map:one" ? {...entity, data: {sourceFeatureInventory: inventory}} : entity);
  const result = summarizeImportPreview({bundleId: "bundle", worldId: "world", selectedIds: ["map:one", "pin:one"], scopes: {maps: true, journals: true, pins: true}, entities: withInventory, ordinaryPlan, pinPlan});
  assert.deepEqual(result.deferredPinIds, ["pin:one"]);
  assert.deepEqual(result.summary.pins.deferredAfterMapCreation, ["pin:one"]);
  assert.deepEqual(result.summary.mapFeatureInventory[0].lights, inventory.lights);
  assert.equal(JSON.stringify(result.summary).includes("private text"), false);
});

test("pins are not deferred unless the selected import will create their map", () => {
  const ordinaryPlan = {actions: [{descriptor: {entityId: "map:one", type: "Scene"}, operation: "unchanged"}], skipped: [], conflicts: []};
  const pinPlan = {jobs: [], skipped: [{id: "pin:one", reason: "Cena importada não encontrada univocamente para este mapa."}], conflicts: []};
  const result = summarizeImportPreview({bundleId: "bundle", worldId: "world", selectedIds: ["map:one", "pin:one"], scopes: {maps: true, journals: true, pins: true}, entities, ordinaryPlan, pinPlan});
  assert.deepEqual(result.deferredPinIds, []);
  assert.equal(result.summary.pins.skipped.length, 1);
});

test("Glimpse preview summarizes create/update/unchanged without exposing location text", () => {
  const entities = [
    {id: "p-create", kind: "pin", data: {mapId: "m"}},
    {id: "p-update", kind: "pin", data: {mapId: "m"}},
    {id: "p-same", kind: "pin", data: {mapId: "m"}}
  ];
  const pinPlan = {kind: "glimpse", jobs: [
    {pin: entities[0], operation: "create"},
    {pin: entities[1], operation: "update"},
    {pin: entities[2], operation: "unchanged"}
  ], rows: [{id: "p-create", name: "Pista", journal: "create", note: "create", handMadePages: 0, missingMedia: []}], skipped: [], conflicts: []};
  const result = summarizeImportPreview({bundleId: "bundle", worldId: "world", selectedIds: entities.map(entity => entity.id), scopes: {maps: false, journals: false, pins: true}, entities, pinPlan});
  assert.deepEqual(result.summary.pins.create, ["p-create"]);
  assert.deepEqual(result.summary.pins.update, ["p-update"]);
  assert.deepEqual(result.summary.pins.unchanged, ["p-same"]);
  assert.equal(result.summary.pins.integration, "glimpse-map-notes");
  assert.equal(JSON.stringify(result.summary).includes("text"), false);
});
