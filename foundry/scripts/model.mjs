export const MODULE_ID = "rpgup-pillars-importer";
export const KINDS = new Set(["map", "pin", "npc", "item", "container", "quest", "dialogue", "transition", "encounter", "lore"]);
export const QUEST_STATES = ["not-started", "available", "in-progress", "completed", "failed", "blocked"];
const CONVERSION_STATES = new Set(["extracted", "converted", "adapted", "manual", "pending", "unsupported"]);
const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** Treat imported prose as text, including Foundry enrichers. Never execute source scripts. */
export function escapeText(value) {
  // Fullwidth delimiters remain inert after an HTML parser decodes entities.
  // The original ASCII prose is retained unchanged in the local IR bundle.
  return String(value ?? "").replace(/[&<>"'@\[\]{}]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;", "@":"＠", "[":"［", "]":"］", "{":"｛", "}":"｝"}[c]));
}

function inspect(value, depth = 0, counter = {n: 0}) {
  if (++counter.n > 500000 || depth > 40) throw new Error("Pacote excede os limites de estrutura.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Número não finito.");
  if (typeof value === "string" && value.length > 2000000) throw new Error("Texto muito grande.");
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (DANGEROUS.has(key)) throw new Error(`Chave proibida: ${key}`);
      inspect(child, depth + 1, counter);
    }
  }
}

export function validateBundle(bundle) {
  inspect(bundle);
  if (!plain(bundle) || bundle.schemaVersion !== "1.0.0" || typeof bundle.id !== "string" || !bundle.id.trim() || bundle.id.length > 256) throw new Error("IR inválido: schemaVersion 1.0.0 e id de até 256 caracteres são obrigatórios.");
  if (!plain(bundle.source) || !Array.isArray(bundle.entities) || bundle.entities.length > 50000) throw new Error("IR inválido: source e entities são obrigatórios (máximo 50.000 entidades).");
  const ids = new Set();
  for (const entity of bundle.entities) {
    if (!plain(entity) || typeof entity.id !== "string" || !entity.id || entity.id.length > 256 || !KINDS.has(entity.kind) || !plain(entity.data) || !plain(entity.provenance) || !plain(entity.name)) throw new Error("Entidade inválida: id, kind, name, data e provenance obrigatórios.");
    if (ids.has(entity.id)) throw new Error(`Identificador duplicado: ${entity.id}`);
    ids.add(entity.id);
    if (!Object.keys(entity.name).length || !Object.values(entity.name).every(v => typeof v === "string")) throw new Error("Nomes devem ser textos por idioma.");
    const provenance = entity.provenance;
    if (!["source", "sourceId", "extractedAt"].every(key => typeof provenance[key] === "string" && provenance[key].length > 0) || !Number.isFinite(Date.parse(provenance.extractedAt)) || !CONVERSION_STATES.has(provenance.status)) throw new Error("Proveniência inválida: source, sourceId, extractedAt válido e status são obrigatórios.");
    if (provenance.sha256 !== undefined && (typeof provenance.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(provenance.sha256))) throw new Error("SHA-256 de origem inválido.");
  }
  return bundle;
}

export function parseBundle(text) {
  if (typeof text !== "string" || text.length > 50 * 1024 * 1024) throw new Error("Pacote JSON excede 50 MiB.");
  return validateBundle(JSON.parse(text));
}

export function displayName(entity, language = "pt-BR") {
  if (entity.name[language]) return entity.name[language];
  if (entity.name.en) return `${entity.name.en} [EN — tradução pendente]`;
  const entry = Object.entries(entity.name).find(([, value]) => value);
  return entry ? `${entry[1]} [${entry[0]}]` : entity.id;
}

export function assetPath(path) {
  if (typeof path !== "string" || !path || path.length > 2048 || /[\\\x00-\x1f?#]/.test(path) || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error("Imagem deve usar caminho relativo seguro ao UserData do Foundry.");
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { throw new Error("Caminho de imagem inválido."); }
  if (decoded.split("/").some(part => !part || part === "." || part === "..") || /[%\\\x00-\x1f?#]/.test(decoded) || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) throw new Error("Caminho de imagem inválido.");
  if (!/\.(png|webp|jpe?g)$/i.test(decoded)) throw new Error("Imagem deve ser PNG, JPEG ou WebP.");
  return path;
}

export async function stableId(bundleId, entityId, role = "document") {
  const bytes = new TextEncoder().encode(JSON.stringify([MODULE_ID, bundleId, entityId, role]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function setPath(object, path, value) {
  const keys = path.split(".");
  if (keys.some(key => DANGEROUS.has(key) || !key)) throw new Error("Caminho de propriedade inseguro.");
  let current = object;
  for (const key of keys.slice(0, -1)) current = current[key] ??= {};
  current[keys.at(-1)] = copy(value);
  return object;
}

/** Changes apply only when the current field still equals the previous imported value. */
export function mergeManaged(baseline, current, incoming) {
  const patch = {}, conflicts = [], nextBaseline = copy(baseline ?? {});
  for (const [path, value] of Object.entries(incoming)) {
    if (!baseline || !Object.hasOwn(baseline, path)) {
      if (equal(current[path], value)) nextBaseline[path] = copy(value);
      else conflicts.push({path, reason: "Campo sem base anterior; preservado para revisão."});
      continue;
    }
    if (equal(current[path], value)) { nextBaseline[path] = copy(value); continue; }
    if (equal(current[path], baseline[path])) { patch[path] = copy(value); nextBaseline[path] = copy(value); }
    else conflicts.push({path, reason: "Alteração do mestre preservada."});
  }
  // Removed source fields remain untouched. Import never erases content automatically.
  return {patch, conflicts, baseline: nextBaseline};
}

export async function describeEntity(bundle, entity, language = "pt-BR") {
  const id = await stableId(bundle.id, entity.id);
  const name = displayName(entity, language);
  const meta = {bundleKey: await stableId(bundle.id, "bundle"), entityKey: id, kind: entity.kind, sourceHash: entity.provenance.sha256 ?? null, status: "converted"};
  if (entity.kind === "map") {
    const {width, height} = entity.data;
    if (![width, height].every(v => Number.isInteger(v) && v > 0 && v <= 100000)) return {entityId: entity.id, supported: false, reason: "Dimensões de mapa ausentes ou inválidas."};
    let image;
    try { image = assetPath(entity.data.image); } catch (error) { return {entityId: entity.id, supported: false, reason: error.message}; }
    const grid = entity.data.grid ?? {};
    if ((grid.size !== undefined && (!Number.isFinite(grid.size) || grid.size < 50 || grid.size > 1000)) || (grid.distance !== undefined && (!Number.isFinite(grid.distance) || grid.distance <= 0)) || (grid.type !== undefined && ![0, 1].includes(grid.type)) || (grid.units !== undefined && typeof grid.units !== "string")) return {entityId: entity.id, supported: false, reason: "Configuração de grade inválida (tipos aceitos: sem grade ou quadrada)."};
    return {entityId: entity.id, supported: true, type: "Scene", id, meta, fields: {name, width, height, "grid.type": grid.type ?? 0, "grid.size": grid.size ?? 100, "grid.distance": grid.distance ?? 5, "grid.units": grid.units ?? "ft", "level.background.src": image}, levelId: await stableId(bundle.id, entity.id, "level"), warning: "Cena não validada para combate: conferir imagem, calibração, movimento, alcance, visão e paredes."};
  }
  if (["quest", "dialogue", "lore", "pin"].includes(entity.kind)) {
    if (typeof entity.data.publicText !== "string" || !entity.data.publicText.trim()) return {entityId: entity.id, supported: false, reason: "Texto público não definido. Conteúdo privado permanece somente no painel do mestre."};
    const publicName = typeof entity.data.publicName === "string" && entity.data.publicName ? entity.data.publicName : name;
    return {entityId: entity.id, supported: true, type: "JournalEntry", id, meta, fields: {name: publicName, "page.name": publicName, "page.text.content": `<p>${escapeText(entity.data.publicText).replace(/\r?\n/g, "<br>")}</p>`}, pageId: await stableId(bundle.id, entity.id, "public-page"), warning: entity.kind === "pin" ? "Journal criado; marcador físico e posição ainda precisam de revisão. Nenhum Map Note automático." : null};
  }
  return {entityId: entity.id, supported: false, reason: `Conversão de ${entity.kind} ainda não implementada; nenhum documento artificial será criado.`};
}

export function publicDiagnostic(result) {
  // Diagnostic files never include package prose or original machine paths.
  return {created: result.created ?? [], updated: result.updated ?? [], unchanged: result.unchanged ?? [], failed: result.failed ?? [], skipped: result.skipped ?? [], conflicts: result.conflicts ?? [], validation: "Foundry real pendente; cenas não aprovadas para combate."};
}
