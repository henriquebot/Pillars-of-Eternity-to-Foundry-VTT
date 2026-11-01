/**
 * Offline boundary for explicitly normalized public-reference data.
 * This is NOT an Itemaps/Fandom scraper or a reverse-engineered endpoint client.
 * No network request is made. External descriptions remain inert plain text.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLIC_SOURCE_FORMAT = 'rpgup-public-source/v1';
export const MAX_PUBLIC_BYTES = 16 * 1024 * 1024;
const LANGUAGES = new Set(['en', 'pt-BR']);
const RIGHTS = new Set(['user-authorized', 'personal-reference', 'licensed']);
const CATEGORIES = new Set([
  'npc', 'enemy', 'neutral-creature', 'container', 'treasure', 'examinable',
  'document', 'book', 'door', 'passage', 'trap', 'resource', 'poi',
  'quest-objective', 'transition', 'other',
]);
const CATEGORY_ALIASES = new Map([
  ['character', 'npc'], ['loot', 'treasure'], ['loot plant', 'resource'],
  ['point of interest', 'poi'], ['exit', 'transition'],
]);

function fail(message) { throw new TypeError(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: objeto esperado`);
}
function text(value, label, max = 1000000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}: texto ausente ou inválido`);
  return value;
}
function array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) fail(`${label}: lista inválida ou excede limite`);
  return value;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}: número finito esperado`);
  return value;
}
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 131072) fail(`${label}: dimensão inteira entre 1 e 131072 esperada`);
  return value;
}
function stringList(value, label) {
  return array(value ?? [], label, 10000).map((v) => text(v, label, 4096));
}
function rejectUnsafeKeys(value, depth = 0, visited = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (depth > 32 || visited.has(value)) fail('Estrutura excessivamente profunda ou cíclica');
  visited.add(value);
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(`Chave não permitida: ${key}`);
    rejectUnsafeKeys(value[key], depth + 1, visited);
  }
  visited.delete(value);
}
function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function unique(value, used, label) {
  text(value, label, 4096);
  if (used.has(value)) fail(`${label}: identificador duplicado: ${value}`);
  used.add(value);
  return value;
}
export function classifyPublicPin(category) {
  const original = text(category, 'pin.category', 256);
  const normalized = original.trim().toLowerCase();
  return CATEGORIES.has(normalized) ? normalized : CATEGORY_ALIASES.get(normalized) ?? 'other';
}

export function parsePublicSource(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_PUBLIC_BYTES) fail('JSON excede limite de 16 MiB');
  let parsed;
  try { parsed = JSON.parse(json); } catch { fail('JSON inválido; HTML e JavaScript não são aceitos'); }
  rejectUnsafeKeys(parsed);
  return parsed;
}

export function normalizePublicSource(input, { extractedAt = new Date().toISOString() } = {}) {
  object(input, 'input');
  rejectUnsafeKeys(input);
  if (input.format !== PUBLIC_SOURCE_FORMAT) fail(`Formato desconhecido: use ${PUBLIC_SOURCE_FORMAT}; não há adaptador específico Itemaps/Fandom`);
  object(input.source, 'source');
  const source = input.source;
  let url;
  try { url = new URL(text(source.url, 'source.url', 8192)); } catch { fail('source.url: URL inválida'); }
  if (url.protocol !== 'https:' || url.username || url.password) fail('source.url: HTTPS público sem credenciais esperado');
  const attribution = text(source.attribution, 'source.attribution', 8192);
  if (!RIGHTS.has(source.rights)) fail('source.rights: declare user-authorized, personal-reference ou licensed; isto não concede direitos de redistribuição');
  const language = source.language;
  if (!LANGUAGES.has(language)) fail('source.language: use en ou pt-BR explicitamente');
  if (typeof extractedAt !== 'string' || !Number.isFinite(Date.parse(extractedAt))) fail('extractedAt: data ISO inválida');
  const canonicalUrl = url.href;
  const sha256 = digest(JSON.stringify(input));
  const entities = [];
  const warnings = [];
  const mapIds = new Set();
  let totalPins = 0;
  const provenance = (sourceId, status) => ({
    source: canonicalUrl, path: canonicalUrl, sourceId, sha256, extractedAt,
    status, attribution, rights: source.rights, redistribution: false, hashBasis: 'normalized-input-json',
  });
  for (const map of array(input.maps, 'maps', 10000)) {
    object(map, 'map');
    const sourceId = unique(map.id, mapIds, 'map.id');
    const mapId = `poe:public:map:${digest(`${canonicalUrl}\n${sourceId}`).slice(0, 24)}`;
    const width = integer(map.width, 'map.width');
    const height = integer(map.height, 'map.height');
    entities.push({
      id: mapId, kind: 'map', sourceId, name: { [language]: text(map.name, 'map.name', 8192) },
      provenance: provenance(sourceId, 'pending'),
      data: { width, height, coordinateSystem: 'pixels-top-left', calibration: { status: 'pending' }, combatReady: false, combatValidated: false },
    });
    warnings.push({ code: 'MAP_ASSET_PENDING', entityId: mapId, message: 'Imagem local de alta qualidade e calibração de combate pendentes; nenhum recurso visual foi copiado.' });
    const pinIds = new Set();
    for (const pin of array(map.pins ?? [], 'map.pins', 100000)) {
      if (++totalPins > 100000) fail('O lote excede 100000 pinos');
      object(pin, 'pin');
      const pinSourceId = unique(pin.id, pinIds, 'pin.id');
      const x = finite(pin.x, 'pin.x');
      const y = finite(pin.y, 'pin.y');
      if (x < 0 || y < 0 || x > width || y > height) fail('Pino fora das dimensões declaradas; normalize coordenadas antes de importar');
      const category = classifyPublicPin(pin.category);
      const pinId = `${mapId}:pin:${digest(pinSourceId).slice(0, 24)}`;
      const description = pin.description === undefined ? '' : text(pin.description, 'pin.description');
      entities.push({
        id: pinId, kind: 'pin', sourceId: pinSourceId,
        name: { [language]: text(pin.name, 'pin.name', 8192) },
        provenance: provenance(`${sourceId}/${pinSourceId}`, 'converted'),
        data: {
          mapId, position: { x, y }, sourcePosition: { x, y }, category, originalCategory: pin.category, description,
          visibility: 'gm', sourceVisibility: 'unknown',
          questRefs: stringList(pin.questRefs, 'pin.questRefs'),
          relatedPins: stringList(pin.relatedPins, 'pin.relatedPins'),
          conditions: stringList(pin.conditions, 'pin.conditions'),
        },
      });
      if (category === 'other') warnings.push({ code: 'PIN_CATEGORY_UNKNOWN', entityId: pinId, originalCategory: pin.category });
      if (category === 'transition') warnings.push({ code: 'TRANSITION_UNRESOLVED', entityId: pinId, message: 'Destino e coordenada de chegada não foram inferidos.' });
    }
  }
  return {
    schemaVersion: '1.0.0', id: `poe:public:${digest(canonicalUrl).slice(0, 24)}`,
    source: { game: 'pillars-of-eternity', url: canonicalUrl, language, extractedAt, attribution, rights: source.rights, redistribution: false },
    entities, diagnostics: warnings.map((warning) => ({ severity: 'warning', ...warning })),
  };
}

async function main(args) {
  if (args.length !== 2) throw new Error('Uso: node tools/import-public.mjs entrada-normalizada.json saida-ir.json (somente offline; saída existente não é substituída)');
  const inputPath = resolve(args[0]);
  const outputPath = resolve(args[1]);
  if (inputPath === outputPath) throw new Error('Entrada e saída devem ser arquivos distintos');
  if ((await stat(inputPath)).size > MAX_PUBLIC_BYTES) throw new Error('JSON excede limite de 16 MiB');
  const input = parsePublicSource(await readFile(inputPath, 'utf8'));
  const output = normalizePublicSource(input);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
  process.stdout.write(`${output.entities.length} entidades normalizadas; ${output.diagnostics.length} pendências. Nenhum acesso de rede.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
