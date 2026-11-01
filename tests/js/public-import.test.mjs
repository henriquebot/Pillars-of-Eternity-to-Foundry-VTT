import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPublicPin, normalizePublicSource, parsePublicSource } from '../../tools/import-public.mjs';
import { validateBundle } from '../../foundry/scripts/model.mjs';

// Authored synthetic data; no original game or website content.
const fixture = () => ({
  format: 'rpgup-public-source/v1',
  source: { url: 'https://example.org/own-test-map', attribution: 'Fixture própria RPG UP', rights: 'user-authorized', language: 'en' },
  maps: [{ id: 'test-map', name: 'Synthetic Square', width: 1000, height: 500,
    pins: [{ id: 'test-pin', name: 'Synthetic Sign', category: 'Examinable', x: 125.5, y: 200.25, description: 'Own test text.' }] }],
});
const at = { extractedAt: '2026-11-01T00:00:00.000Z' };

test('offline normalization preserves coordinates, source IDs and provenance', () => {
  const ir = normalizePublicSource(fixture(), at);
  const [map, pin] = ir.entities;
  assert.equal(ir.schemaVersion, '1.0.0');
  assert.equal(map.kind, 'map');
  assert.equal(map.provenance.status, 'pending');
  assert.equal(map.data.combatReady, false);
  assert.equal(pin.data.mapId, map.id);
  assert.deepEqual(pin.data.position, { x: 125.5, y: 200.25 });
  assert.deepEqual(pin.data.sourcePosition, pin.data.position);
  assert.equal(pin.sourceId, 'test-pin');
  assert.equal(pin.provenance.sourceId, 'test-map/test-pin');
  assert.equal(pin.provenance.sha256.length, 64);
  assert.equal(pin.data.visibility, 'gm');
});
test('stable IDs survive descriptive changes and extraction dates', () => {
  const a = normalizePublicSource(fixture(), at);
  const input = fixture();
  input.maps[0].pins[0].name = 'Corrected synthetic sign';
  const b = normalizePublicSource(input, { extractedAt: '2026-11-02T00:00:00Z' });
  assert.deepEqual(a.entities.map(x => x.id), b.entities.map(x => x.id));
  assert.notEqual(a.entities[1].provenance.sha256, b.entities[1].provenance.sha256);
});
test('same marker source ID in distinct maps has distinct stable IDs', () => {
  const input = fixture();
  input.maps.push({ ...structuredClone(input.maps[0]), id: 'second-map' });
  const ir = normalizePublicSource(input, at);
  const pins = ir.entities.filter(x => x.kind === 'pin');
  assert.notEqual(pins[0].id, pins[1].id);
});
test('unknown categories remain explicit and do not create Actors', () => {
  const input = fixture(); input.maps[0].pins[0].category = 'Unidentified source object';
  const ir = normalizePublicSource(input, at);
  assert.equal(ir.entities[1].kind, 'pin');
  assert.equal(ir.entities[1].data.category, 'other');
  assert.equal(ir.entities[1].data.originalCategory, 'Unidentified source object');
  assert.ok(ir.diagnostics.some(w => w.code === 'PIN_CATEGORY_UNKNOWN'));
});
test('known categories do not guess loot containers or exit destinations', () => {
  assert.equal(classifyPublicPin('Loot'), 'treasure');
  assert.equal(classifyPublicPin('Character'), 'npc');
  const input = fixture(); input.maps[0].pins[0].category = 'Exit';
  const ir = normalizePublicSource(input, at);
  assert.equal(ir.entities[1].data.destination, undefined);
  assert.ok(ir.diagnostics.some(w => w.code === 'TRANSITION_UNRESOLVED'));
});
test('duplicates within one map are rejected', () => {
  const input = fixture(); input.maps[0].pins.push(structuredClone(input.maps[0].pins[0]));
  assert.throws(() => normalizePublicSource(input, at), /duplicado/);
});
test('duplicate map source IDs are rejected', () => {
  const input = fixture(); input.maps.push(structuredClone(input.maps[0]));
  assert.throws(() => normalizePublicSource(input, at), /duplicado/);
});
test('out of bounds and nonfinite positions are rejected without clamping', () => {
  for (const x of [-1, 1001, NaN, Infinity, '12']) {
    const input = fixture(); input.maps[0].pins[0].x = x;
    assert.throws(() => normalizePublicSource(input, at));
  }
});
test('language and rights are explicit; no translation is fabricated', () => {
  const input = fixture(); input.source.language = 'pt-BR'; input.maps[0].name = 'Praça sintética';
  const ir = normalizePublicSource(input, at);
  assert.equal(ir.entities[0].name['pt-BR'], 'Praça sintética');
  assert.equal(ir.entities[0].name.en, undefined);
  assert.equal(ir.source.redistribution, false);
  delete input.source.rights;
  assert.throws(() => normalizePublicSource(input, at), /rights/);
});
test('HTML, scripts and unknown website schemas are not executed or accepted as schema', () => {
  assert.throws(() => parsePublicSource('<html><script>anything()</script></html>'), /JSON inválido/);
  assert.throws(() => normalizePublicSource({ pins: [] }), /Formato desconhecido/);
  const input = fixture(); input.maps[0].pins[0].description = '<img src=x onerror="anything()">';
  assert.equal(normalizePublicSource(input, at).entities[1].data.description, input.maps[0].pins[0].description);
  // Description is inert JSON/plain text. The Foundry view must escape it.
});
test('prototype pollution keys are rejected recursively', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const json = `{"outer":{"${key}":{"polluted":true}}}`;
    assert.throws(() => parsePublicSource(json), /Chave não permitida/);
  }
  assert.equal({}.polluted, undefined);
});
test('credentials, non-HTTPS provenance and invalid dimensions are rejected', () => {
  for (const url of ['http://example.org', 'https://name:password@example.org', 'not-a-url']) {
    const input = fixture(); input.source.url = url;
    assert.throws(() => normalizePublicSource(input, at));
  }
  const input = fixture(); input.maps[0].width = 0;
  assert.throws(() => normalizePublicSource(input, at), /dimensão/);
});
test('normalized source satisfies the Foundry consumer IR contract', () => {
  const ir = normalizePublicSource(fixture(), at);
  assert.equal(validateBundle(ir), ir);
  assert.ok(Array.isArray(ir.diagnostics));
  assert.ok(ir.diagnostics.every(d => d.severity === 'warning'));
});
