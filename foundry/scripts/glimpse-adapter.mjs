/**
 * RPG UP — reusable IR-to-Glimpse adapter for Foundry V14.
 * Glimpse owns presentation of a location; this module never creates Actors,
 * loot, containers, quest state, or combat objects.
 */
import {MODULE_ID, assetPath, copy, displayName, escapeText, stableId, validateBundle} from "./model.mjs";
import {requireGM} from "./importer.mjs";

export const GLIMPSE_MODULE_ID = "glimpse-map-notes";
export const GLIMPSE_FOLDER_PREFIX = "RPG UP — Pillars — Glimpse — ";
const TRACKING_FLAG = "glimpseImport";
const PRIVATE_PAGE_ROLE = "glimpse-private-page";
const MANAGED_FLAG_KEYS = ["mode", "size", "image", "focusX", "focusY", "nightImage", "subtitle", "facts", "sound", "seal", "discovery", "rumour"];
const DISCOVERY = new Set(["known", "rumour", "explore"]);
const OWNERSHIP = {known: "observer", rumour: "none", explore: "none"};

/** Default policy is least-privilege. IR may explicitly mark a verified place known. */
export const PIN_PROFILES = Object.freeze({
  npc: {label: "NPC", icon: "icons/svg/mystery-man.svg", discovery: "rumour", rumourLabel: "Pista"},
  enemy: {label: "Inimigo", icon: "icons/svg/skull.svg", discovery: "rumour", rumourLabel: "Ameaça"},
  "neutral-creature": {label: "Criatura", icon: "icons/svg/mystery-man.svg", discovery: "rumour", rumourLabel: "Criatura"},
  item: {label: "Item", icon: "icons/svg/coins.svg", discovery: "rumour", rumourLabel: "Item"},
  treasure: {label: "Tesouro", icon: "icons/svg/coins.svg", discovery: "rumour", rumourLabel: "Tesouro"},
  container: {label: "Contêiner", icon: "icons/svg/chest.svg", discovery: "rumour", rumourLabel: "Contêiner"},
  examinable: {label: "Examinável", icon: "icons/svg/eye.svg", discovery: "rumour", rumourLabel: "Ponto de interesse"},
  document: {label: "Documento", icon: "icons/svg/book.svg", discovery: "rumour", rumourLabel: "Documento"},
  book: {label: "Livro", icon: "icons/svg/book.svg", discovery: "rumour", rumourLabel: "Livro"},
  poi: {label: "Local", icon: "icons/svg/mountain.svg", discovery: "rumour", rumourLabel: "Local"},
  secret: {label: "Segredo", icon: "icons/svg/eye.svg", discovery: "rumour", rumourLabel: "Pista"},
  door: {label: "Porta", icon: "icons/svg/house.svg", discovery: "rumour", rumourLabel: "Passagem"},
  passage: {label: "Passagem", icon: "icons/svg/mountain.svg", discovery: "rumour", rumourLabel: "Passagem"},
  transition: {label: "Transição", icon: "icons/svg/mountain.svg", discovery: "rumour", rumourLabel: "Saída"},
  resource: {label: "Recurso", icon: "icons/svg/coins.svg", discovery: "rumour", rumourLabel: "Recurso"},
  "quest-objective": {label: "Objetivo de quest", icon: "icons/svg/book.svg", discovery: "rumour", rumourLabel: "Pista"},
  other: {label: "Referência", icon: "icons/svg/eye.svg", discovery: "rumour", rumourLabel: "Referência"}
});

const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const pagesOf = entry => Array.from(entry?.pages?.contents ?? entry?.pages ?? []);
const notesOf = scene => Array.from(scene?.notes?.contents ?? scene?.notes ?? []);
const flag = (document, scope, key) => document?.getFlag?.(scope, key) ?? document?.flags?.[scope]?.[key];
const sceneId = scene => scene?.id ?? scene?._id;
const pageId = page => page?.id ?? page?._id;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function safePath(path, extensions) {
  if (typeof path !== "string" || !path || path.length > 2048 || /[\\\x00-\x1f?#]/.test(path) || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error("Caminho de asset inseguro.");
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { throw new Error("Caminho de asset inválido."); }
  if (decoded.split("/").some(part => !part || part === "." || part === "..") || /[%\\\x00-\x1f?#]/.test(decoded) || !extensions.test(decoded)) throw new Error("Caminho de asset inválido.");
  return path;
}

function sceneBackground(scene) {
  const level = scene?.levels?.get?.(scene.initialLevel);
  return level?.background?.src ?? scene?._source?.levels?.find(level => level._id === scene.initialLevel)?.background?.src ?? scene?.background?.src;
}

async function resolveSceneForMap(bundle, map, context) {
  const bundleKey = await stableId(bundle.id, "bundle");
  const entityKey = await stableId(bundle.id, map.id);
  const matches = [...(context.scenes ?? [])].filter(scene => {
    const imported = flag(scene, MODULE_ID, "import");
    return imported?.bundleKey === bundleKey && imported?.entityKey === entityKey;
  });
  if (matches.length !== 1) return {error: "Cena importada não encontrada univocamente para este mapa."};
  const scene = matches[0];
  const width = scene.width ?? scene._source?.width;
  const height = scene.height ?? scene._source?.height;
  const padding = scene.padding ?? scene._source?.padding ?? 0;
  if (width !== map.data.width || height !== map.data.height || padding !== map.data.calibration?.targetPadding) return {error: "Dimensões ou padding da cena diferem da calibração aprovada."};
  if (sceneBackground(scene) !== map.data.image) return {error: "O fundo ativo da cena não corresponde à imagem calibrada no IR."};
  return {scene};
}

function clampFocus(value, fallback) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0 || result > 100) throw new Error("Ponto focal precisa estar entre 0 e 100.");
  return Math.round(result * 1000) / 1000;
}

function publicImage(pin, map, position) {
  const data = pin.data;
  const src = assetPath(data.cardImage ?? map.data.image);
  const focusX = clampFocus(data.focusX, position.x / map.data.width * 100);
  const focusY = clampFocus(data.focusY, position.y / map.data.height * 100);
  const supplied = Array.isArray(data.images) ? data.images : [];
  const images = supplied.length ? supplied.map((image, index) => {
    if (!plain(image)) throw new Error("Cada imagem do pin precisa ser um objeto.");
    return {
      src: assetPath(image.src),
      name: escapeText(String(image.name ?? image.caption ?? `Imagem ${index + 1}`).slice(0, 180)),
      caption: escapeText(String(image.caption ?? "").slice(0, 1000)),
      ...(image.focusX !== undefined ? {focusX: clampFocus(image.focusX, focusX)} : {}),
      ...(image.focusY !== undefined ? {focusY: clampFocus(image.focusY, focusY)} : {}),
      ...(image.night ? {night: assetPath(image.night)} : {})
    };
  }) : [{src, name: escapeText(`${displayName(map, "pt-BR")} — referência de localização`), caption: "", focusX, focusY}];
  return {src, focusX, focusY, images};
}

/** Convert one normalized pin into a permission-aware Glimpse manifest entry. */
export function pinToGlimpseLocation(bundle, pin, map, scene, {locationId, folderName} = {}) {
  if (pin?.kind !== "pin" || !plain(pin.data)) throw new Error("Entidade IR não é um pin válido.");
  const category = String(pin.data.category ?? "").toLocaleLowerCase();
  const profile = PIN_PROFILES[category];
  if (!profile) throw new Error(`Categoria sem perfil Glimpse: ${category || "vazia"}.`);
  if (pin.data.positionCalibrated !== true || map?.data?.calibration?.status !== "approved-for-notes") throw new Error("A posição ainda não foi aprovada para Notes.");
  const position = pin.data.position;
  if (!plain(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.y < 0 || position.x > map.data.width || position.y > map.data.height) throw new Error("A posição do pin está fora do mapa ou é inválida.");
  const discovery = pin.data.discovery ?? profile.discovery;
  if (!DISCOVERY.has(discovery)) throw new Error("Discovery deve ser known, rumour ou explore.");
  if (discovery === "explore" && !(scene.tokenVision === true && scene.fogExploration === true)) throw new Error("Discovery por exploração exige Token Vision e Fog Exploration validados na cena.");
  if (discovery !== "known" && (typeof pin.data.rumour !== "string" || !pin.data.rumour.trim())) throw new Error("Pins rumoured/explore precisam de um texto público de rumor.");
  if (discovery === "known" && (typeof pin.data.publicText !== "string" || !pin.data.publicText.trim())) throw new Error("Pins conhecidos precisam de texto público revisado.");
  const label = discovery === "known"
    ? (pin.data.publicLabel ?? displayName(pin, "pt-BR"))
    : (pin.data.publicLabel ?? profile.rumourLabel);
  const journalName = pin.data.publicName ?? (discovery === "known" ? displayName(pin, "pt-BR") : profile.rumourLabel);
  const image = publicImage(pin, map, position);
  const icon = safePath(pin.data.icon ?? profile.icon, /\.svg$/i);
  const subtitle = pin.data.publicSubtitle ?? (discovery === "known" ? profile.label : "");
  const factsInput = pin.data.publicFacts ?? pin.data.facts ?? [];
  if (!Array.isArray(factsInput) || factsInput.some(value => typeof value !== "string")) throw new Error("Facts deve ser uma lista de textos públicos.");
  const loc = {
    id: locationId,
    name: `${escapeText(String(journalName).slice(0, 150))} — ${escapeText(scene.name)} (RPG UP)`,
    label: escapeText(String(label).slice(0, 180)),
    position: {x: position.x, y: position.y},
    icon,
    iconSize: Number.isFinite(pin.data.iconSize) ? Math.min(128, Math.max(16, pin.data.iconSize)) : 32,
    subtitle: escapeText(String(subtitle).slice(0, 300)),
    facts: factsInput.slice(0, 32).map(value => escapeText(value.slice(0, 300))),
    text: typeof pin.data.publicText === "string" ? escapeText(pin.data.publicText.slice(0, 60000)) : "",
    images: image.images,
    cardImage: image.src,
    focusX: image.focusX,
    focusY: image.focusY,
    discovery,
    ownership: OWNERSHIP[discovery]
  };
  if (discovery !== "known") loc.rumour = escapeText(pin.data.rumour.slice(0, 2000));
  if (pin.data.cardNightImage) loc.cardNightImage = assetPath(pin.data.cardNightImage);
  if (pin.data.sound && pin.data.soundVerified === true) loc.sound = safePath(pin.data.sound, /\.(ogg|mp3|wav|webm)$/i);
  if (pin.data.mode !== undefined) loc.mode = pin.data.mode;
  if (pin.data.size !== undefined) loc.size = pin.data.size;
  if (pin.data.seal !== undefined) loc.seal = pin.data.seal;
  return {location: loc, folderName: folderName ?? `${GLIMPSE_FOLDER_PREFIX}${scene.name}`, privateText: pin.data.gmText ?? ""};
}

function findJournal(context, location, folderName) {
  const tagged = [...(context.journal ?? [])].find(entry => flag(entry, "world", "glimpseLoreId") === location.id);
  if (tagged) return tagged;
  const named = [...(context.journal ?? [])].filter(entry => entry.name === location.name);
  const folder = [...(context.folders ?? [])].find(item => item.type === "JournalEntry" && item.name === folderName);
  return named.find(entry => folder && (entry.folder?.id ?? entry.folder) === folder.id) ?? (named.length === 1 ? named[0] : undefined);
}

function findNote(scene, location, entry) {
  return notesOf(scene).find(note => flag(note, "world", "glimpseLoreId") === location.id)
    ?? (entry && notesOf(scene).find(note => note.entryId === entry.id))
    ?? notesOf(scene).find(note => !note.entryId && note.text === location.label);
}

function managedPages(entry) {
  return pagesOf(entry).filter(page => flag(page, "world", "glimpseManaged") === true).map(page => ({
    type: page.type,
    name: page.name,
    src: page.src ?? "",
    caption: page.image?.caption ?? "",
    content: page.text?.content ?? ""
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function expectedTextHTML(text) {
  if (typeof globalThis.showdown !== "undefined") return new globalThis.showdown.Converter().makeHtml(text);
  const escape = value => globalThis.foundry?.utils?.escapeHTML
    ? globalThis.foundry.utils.escapeHTML(value)
    : String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  return text.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph.trim())}</p>`).join("");
}

function matchesLocation(entry, note, location, folderName, apiRow) {
  const folder = entry.folder?.name === folderName ? entry.folder : entry.folder;
  if (entry.name !== location.name || folder?.name !== folderName || apiRow.handMadePages !== 0) return false;
  if (entry.ownership?.default !== (location.ownership === "observer" ? 2 : 0)) return false;
  if (note.entryId !== entry.id || note.x !== Math.round(location.position.x) || note.y !== Math.round(location.position.y) || note.text !== location.label ||
      (note.texture?.src ?? note._source?.texture?.src) !== location.icon || note.iconSize !== location.iconSize) return false;
  const noteFlags = flag(note, GLIMPSE_MODULE_ID, "") ?? note?.flags?.[GLIMPSE_MODULE_ID] ?? {};
  const expectedFlags = {...location, facts: Array.isArray(location.facts) ? location.facts.join("\n") : location.facts, image: location.cardImage, nightImage: location.cardNightImage};
  for (const key of MANAGED_FLAG_KEYS) {
    if (key === "visited" || expectedFlags[key] === undefined) continue;
    if (key === "discovery" && expectedFlags[key] === "known" && noteFlags[key] === undefined) continue;
    if ((expectedFlags[key] === "" || (Array.isArray(expectedFlags[key]) && expectedFlags[key].length === 0)) && (noteFlags[key] === undefined || noteFlags[key] === "" || (Array.isArray(noteFlags[key]) && noteFlags[key].length === 0))) continue;
    if (!equal(noteFlags[key], expectedFlags[key])) return false;
  }
  const actualPages = pagesOf(entry);
  if (actualPages.some(page => flag(page, "world", "glimpseManaged") !== true)) return false;
  const actualImages = actualPages.filter(page => page.type === "image");
  const actualTexts = actualPages.filter(page => page.type === "text");
  if (actualImages.length !== (location.images?.length ?? 0) || actualTexts.length !== (location.text ? 1 : 0)) return false;
  for (const image of location.images ?? []) {
    const page = actualImages.find(candidate => candidate.src === image.src && candidate.name === image.name && (candidate.image?.caption ?? "") === (image.caption ?? ""));
    if (!page) return false;
  }
  if (location.text && actualTexts[0].text?.content !== expectedTextHTML(location.text)) return false;
  return true;
}

function managedNoteState(note) {
  const flags = flag(note, GLIMPSE_MODULE_ID, "") ?? note?.flags?.[GLIMPSE_MODULE_ID] ?? {};
  return {
    x: note.x,
    y: note.y,
    text: note.text,
    entryId: note.entryId,
    icon: note.texture?.src ?? note._source?.texture?.src ?? "",
    iconSize: note.iconSize,
    glimpse: Object.fromEntries(MANAGED_FLAG_KEYS.filter(key => Object.hasOwn(flags, key)).map(key => [key, copy(flags[key])]))
  };
}

async function documentStateHash(entry, note) {
  return digest({journal: {name: entry.name, pages: managedPages(entry)}, note: managedNoteState(note)});
}

function privatePageFor(entry, id) {
  return pagesOf(entry).find(page => pageId(page) === id);
}

async function preflightExisting(pin, location, folderName, scene, context, apiRow, sourceHash) {
  const entry = findJournal(context, location, folderName);
  const note = findNote(scene, location, entry);
  if (!entry && !note) {
    if (apiRow.journal !== "create" || apiRow.note !== "create") return {conflict: "Glimpse encontrou documentos sem uma ligação segura; nenhuma alteração será aplicada."};
    return {operation: "create", entry: null, note: null};
  }
  if (!entry || !note || flag(entry, "world", "glimpseLoreId") !== location.id || flag(note, "world", "glimpseLoreId") !== location.id) return {conflict: "Documento preexistente sem identidade/proveniência RPG UP; preservado para revisão."};
  const entryTracking = flag(entry, MODULE_ID, TRACKING_FLAG);
  const noteTracking = flag(note, MODULE_ID, TRACKING_FLAG);
  if (!entryTracking && !noteTracking && matchesLocation(entry, note, location, folderName, apiRow)) return {operation: "adopt", entry, note};
  if (!entryTracking || !noteTracking || entryTracking.version !== 1 || noteTracking.version !== 1 || entryTracking.entityId !== pin.id || noteTracking.entityId !== pin.id) return {conflict: "Documento Glimpse existe sem baseline confiável do importer; preservado."};
  if (apiRow.journal !== "update" || apiRow.note !== "update") return {conflict: "Estado Glimpse diverge do vínculo esperado; preservado."};
  const stateHash = await documentStateHash(entry, note);
  if (stateHash !== entryTracking.stateHash || stateHash !== noteTracking.stateHash) return {conflict: "Edição manual em Note/Journal detectada; preservada."};
  const pageId = entryTracking.privatePageId;
  const privatePage = pageId ? privatePageFor(entry, pageId) : null;
  const currentPrivateHash = privatePage ? await digest(privatePage.text?.content ?? "") : "";
  if (entryTracking.privatePageHash && currentPrivateHash !== entryTracking.privatePageHash) return {conflict: "Página privada do GM foi alterada; preservada."};
  if (privatePage) {
    const pageTracking = flag(privatePage, MODULE_ID, "glimpsePrivatePage");
    if (pageTracking?.entityId !== pin.id || pageTracking?.sourceHash !== entryTracking.privateSourceHash) return {conflict: "A proveniência da página privada do GM mudou; preservada."};
    if (!entryTracking.privatePageHash && pageTracking.contentHash !== currentPrivateHash) return {conflict: "Página privada do GM foi alterada; preservada."};
  }
  const operation = entryTracking.sourceHash === sourceHash ? "unchanged" : "update";
  return {operation, entry, note, tracking: entryTracking, privatePage};
}

function sceneCalibrationMap(bundle) { return new Map(bundle.entities.filter(entity => entity.kind === "map").map(entity => [entity.id, entity])); }

/** Read-only preview. It calls Glimpse locations.plan() but never writes documents. */
export async function planGlimpsePins(bundle, selectedIds, {context = globalThis.game, glimpseApi = context?.modules?.get?.(GLIMPSE_MODULE_ID)?.api, assetExists = globalThis.foundry?.canvas?.srcExists} = {}) {
  requireGM(context);
  validateBundle(bundle);
  if (!glimpseApi?.locations?.plan || !glimpseApi?.locations?.apply || !glimpseApi?.locations?.export) throw new Error("Glimpse v1.3.0 com locations.plan/apply/export não está disponível.");
  if (!Array.isArray(selectedIds) || selectedIds.length > 500) throw new Error("Planeje até 500 pins por lote.");
  const selection = new Set(selectedIds);
  if (selection.size !== selectedIds.length) throw new Error("IDs de pins repetidos.");
  const byId = new Map(bundle.entities.map(entity => [entity.id, entity]));
  const maps = sceneCalibrationMap(bundle);
  const prepared = [], skipped = [], conflicts = [], groups = new Map();
  for (const pinId of selection) {
    const pin = byId.get(pinId);
    if (!pin || pin.kind !== "pin") { skipped.push({id: pinId, reason: "Pin não encontrado no IR."}); continue; }
    const map = maps.get(pin.data.mapId);
    if (!map) { skipped.push({id: pinId, reason: "Mapa de origem não existe no IR."}); continue; }
    const resolved = await resolveSceneForMap(bundle, map, context);
    if (resolved.error) { skipped.push({id: pinId, reason: resolved.error}); continue; }
    const scene = resolved.scene;
    const locId = await stableId(bundle.id, pin.id, "glimpse-location");
    let converted;
    try { converted = pinToGlimpseLocation(bundle, pin, map, scene, {locationId: locId}); }
    catch (error) { skipped.push({id: pin.id, reason: error.message}); continue; }
    if (typeof assetExists === "function" && !(await assetExists(converted.location.icon))) { skipped.push({id: pin.id, reason: `Ícone não encontrado: ${converted.location.icon}`}); continue; }
    const group = groups.get(scene.id) ?? {scene, folderName: converted.folderName, prepared: []};
    if (group.folderName !== converted.folderName) { skipped.push({id: pin.id, reason: "Um lote não pode misturar pastas Glimpse da mesma cena."}); continue; }
    group.prepared.push({pin, map, ...converted});
    groups.set(scene.id, group);
  }
  const rows = [];
  for (const group of groups.values()) {
    const folder = [...(context.folders ?? [])].find(item => item.type === "JournalEntry" && item.name === group.folderName);
    if (folder) {
      const folderTracking = flag(folder, MODULE_ID, "glimpseFolder");
      if (!folderTracking || folderTracking.bundleId !== bundle.id || folderTracking.sceneId !== group.scene.id) {
        for (const item of group.prepared) conflicts.push({id: item.pin.id, reason: "Pasta de destino já existe sem marca de propriedade RPG UP; preservada."});
        continue;
      }
    }
    const apiRows = await glimpseApi.locations.plan(group.prepared.map(item => item.location), {scene: group.scene, folder: group.folderName, checkMedia: true});
    if (!Array.isArray(apiRows) || apiRows.length !== group.prepared.length) throw new Error("locations.plan devolveu uma quantidade de linhas inesperada.");
    for (let index = 0; index < group.prepared.length; index++) {
      const item = group.prepared[index], apiRow = apiRows[index];
      const media = apiRow.missingMedia ?? [];
      if (apiRow.error || media.length) {
        skipped.push({id: item.pin.id, reason: apiRow.error || `Mídia ausente: ${media.join(", ")}`});
        continue;
      }
      const publicHash = await digest(item.location);
      const privateHash = item.privateText ? await digest(escapeText(String(item.privateText).slice(0, 60000))) : "";
      const sourceHash = await digest({publicHash, privateHash});
      const inspected = await preflightExisting(item.pin, item.location, group.folderName, group.scene, context, apiRow, sourceHash);
      if (inspected.conflict) { conflicts.push({id: item.pin.id, reason: inspected.conflict}); continue; }
      const privatePageId = item.privateText ? await stableId(bundle.id, item.pin.id, PRIVATE_PAGE_ROLE) : (inspected.tracking?.privatePageId ?? null);
      const gmPage = privatePageId ? privatePageFor(inspected.entry, privatePageId) : null;
      if (gmPage && flag(gmPage, MODULE_ID, "glimpsePrivatePage")?.entityId !== item.pin.id) {
        conflicts.push({id: item.pin.id, reason: "Colisão de ID na página privada do GM; preservada."});
        continue;
      }
      if (gmPage && gmPage.ownership?.default !== 0) {
        conflicts.push({id: item.pin.id, reason: "Permissão da página privada do GM não é None; preservada."});
        continue;
      }
      if (inspected.operation !== "create" && inspected.tracking?.privateSourceHash !== privateHash && inspected.tracking?.privatePageId && !gmPage) {
        conflicts.push({id: item.pin.id, reason: "Página privada do GM foi removida; não será recriada automaticamente."});
        continue;
      }
      const row = {id: item.pin.id, name: item.location.label, journal: apiRow.journal, note: apiRow.note, handMadePages: apiRow.handMadePages ?? 0, missingMedia: []};
      rows.push(row);
      prepared.push({pin: item.pin, scene: group.scene, folderName: group.folderName, location: item.location, privateText: item.privateText, privatePageId, privateHash, privatePageBaselineHash: inspected.tracking?.privatePageHash ?? "", publicHash, sourceHash, privatePageExists: Boolean(gmPage), operation: inspected.operation, entryId: inspected.entry?.id ?? null, noteId: inspected.note?.id ?? null});
    }
  }
  return {kind: "glimpse", worldId: context.world.id, bundleId: bundle.id, bundle, createdAt: new Date().toISOString(), folderName: prepared[0]?.folderName ?? "", jobs: prepared, rows, skipped, conflicts};
}

function planSignature(plan) {
  return JSON.stringify({worldId: plan.worldId, bundleId: plan.bundleId,
    jobs: plan.jobs.map(job => [job.pin.id, job.scene.id, job.operation, job.publicHash, job.privateHash, job.entryId, job.noteId]),
    rows: plan.rows.map(row => [row.id, row.journal, row.note, row.handMadePages]),
    skipped: plan.skipped.map(row => [row.id, row.reason]), conflicts: plan.conflicts.map(row => [row.id, row.reason])});
}

async function writePrivatePage(job, entry, context) {
  if (!job.privateText) return null;
  const current = privatePageFor(entry, job.privatePageId);
  const content = `<div>${escapeText(String(job.privateText).slice(0, 60000)).replace(/\r?\n/g, "<br>")}</div>`;
  if (current) {
    const stored = flag(current, MODULE_ID, "glimpsePrivatePage");
    const oldContentHash = await digest(current.text?.content ?? "");
    if (stored?.entityId !== job.pin.id || (job.privatePageBaselineHash ? oldContentHash !== job.privatePageBaselineHash : stored.contentHash !== oldContentHash)) throw new Error("Página privada do GM mudou depois do plano; preservada.");
    if (stored.sourceHash !== job.privateHash) {
      await current.update({"text.content": content});
    }
    const persistedHash = await digest(current.text?.content ?? "");
    const persistedTracking = flag(current, MODULE_ID, "glimpsePrivatePage") ?? {};
    if (persistedTracking.contentHash !== persistedHash || persistedTracking.sourceHash !== job.privateHash) await current.setFlag(MODULE_ID, "glimpsePrivatePage", {entityId: job.pin.id, contentHash: persistedHash, sourceHash: job.privateHash});
    return job.privatePageId;
  }
  const data = {_id: job.privatePageId, name: "Notas do GM — origem e revisão", type: "text", ownership: {default: 0}, text: {format: globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, content}, flags: {[MODULE_ID]: {glimpsePrivatePage: {entityId: job.pin.id, contentHash: await digest(content), sourceHash: job.privateHash}}}};
  const created = await entry.createEmbeddedDocuments("JournalEntryPage", [data], {keepId: true});
  if (!Array.isArray(created) || !created.some(page => pageId(page) === job.privatePageId)) throw new Error("Página privada do GM não persistiu com ID estável.");
  const page = privatePageFor(entry, job.privatePageId);
  if (page.ownership?.default !== 0) throw new Error("Página privada do GM não ficou com ownership None.");
  const persistedHash = await digest(page.text?.content ?? "");
  const persistedTracking = flag(page, MODULE_ID, "glimpsePrivatePage") ?? {};
  if (persistedTracking.contentHash !== persistedHash) await page.setFlag(MODULE_ID, "glimpsePrivatePage", {...persistedTracking, entityId: job.pin.id, contentHash: persistedHash, sourceHash: job.privateHash});
  return job.privatePageId;
}

/** Apply through the official Glimpse API after a fresh plan and a persistent backup. */
export async function applyGlimpsePins(plan, {context = globalThis.game, glimpseApi = context?.modules?.get?.(GLIMPSE_MODULE_ID)?.api, backup, assetExists = globalThis.foundry?.canvas?.srcExists} = {}) {
  requireGM(context);
  if (plan?.kind !== "glimpse" || plan.worldId !== context.world?.id) throw new Error("O plano Glimpse pertence a outro mundo.");
  if (typeof backup !== "function") throw new Error("Backup persistente obrigatório antes de gravar pins Glimpse.");
  // The full bundle is attached by the caller only for application; retaining it in the plan keeps this recheck exact.
  const bundle = plan.bundle;
  if (!bundle) throw new Error("Plano perdeu a referência ao IR; gere uma nova prévia.");
  const current = await planGlimpsePins(bundle, plan.jobs.map(job => job.pin.id), {context, glimpseApi, assetExists});
  if (planSignature(current) !== planSignature(plan)) throw new Error("O estado dos pins/Journals mudou após a prévia; revise uma nova prévia.");
  const writable = current.jobs.filter(job => ["create", "update", "adopt"].includes(job.operation));
  const result = {system: "glimpse-map-notes", created: [], updated: [], adopted: [], unchanged: current.jobs.filter(job => job.operation === "unchanged").map(job => job.pin.id), failed: [], skipped: copy(current.skipped), conflicts: copy(current.conflicts), exports: []};
  if (!writable.length) return result;
  const scenes = [...new Map(writable.map(job => [job.scene.id, job.scene])).values()];
  const entries = writable.map(job => context.journal.get(job.entryId)).filter(Boolean);
  const privatePageSnapshots = entries.flatMap(entry => pagesOf(entry).filter(page => flag(page, MODULE_ID, "glimpsePrivatePage")).map(page => page.toObject?.() ?? copy(page)));
  const plannedCreates = writable.flatMap(job => [
    ...(job.operation === "create" ? [{type: "JournalEntry", locationId: job.location.id}] : []),
    ...(job.operation === "create" ? [{type: "Scene.Note", sceneId: job.scene.id, locationId: job.location.id}] : []),
    ...(job.privateText && !job.privatePageExists ? [{type: "JournalEntryPage", locationId: job.location.id}] : [])
  ]);
  await backup({schemaVersion: "1.0.0", module: MODULE_ID, integration: GLIMPSE_MODULE_ID, worldId: plan.worldId, bundleId: plan.bundleId, createdAt: new Date().toISOString(), documents: [...scenes.map(scene => ({type: "Scene", data: scene.toObject()})), ...entries.map(entry => ({type: "JournalEntry", data: entry.toObject()})), ...privatePageSnapshots.map(data => ({type: "JournalEntryPage", data}))], plannedCreates, plannedUpdates: writable.filter(job => job.operation === "update" || job.operation === "adopt").map(job => ({locationId: job.location.id, journalId: job.entryId, noteId: job.noteId}))});
  for (const [id, scene] of new Map(writable.map(job => [job.scene.id, job.scene]))) {
    const batch = writable.filter(job => job.scene.id === id);
    const apiBatch = batch.filter(job => job.operation === "create" || job.operation === "update");
    const locations = apiBatch.map(job => {
      const location = copy(job.location);
      if (job.operation === "update") delete location.ownership; // never lower sharing after discovery
      return location;
    });
    let applied = [];
    try { if (locations.length) applied = await glimpseApi.locations.apply(locations, {scene, folder: batch[0].folderName}); }
    catch (error) { result.failed.push({sceneId: id, reason: error.message}); break; }
    const byLocation = new Map((Array.isArray(applied) ? applied : []).map(row => [row.id, row]));
    for (const job of batch) {
      try {
        const apiResult = job.operation === "adopt" ? {ok: true} : byLocation.get(job.location.id);
        if (!apiResult?.ok) throw new Error(apiResult?.error ?? "Glimpse não confirmou a aplicação do pin.");
        const entry = findJournal(context, job.location, job.folderName);
        const note = findNote(scene, job.location, entry);
        if (!entry || !note || flag(entry, "world", "glimpseLoreId") !== job.location.id || flag(note, "world", "glimpseLoreId") !== job.location.id) throw new Error("A API Glimpse não persistiu o vínculo Journal/Note esperado.");
        if (!matchesLocation(entry, note, job.location, job.folderName, {handMadePages: 0})) throw new Error("Note/Journal persistido difere dos campos Glimpse planejados.");
        const privatePageId = job.privateText ? await writePrivatePage(job, entry, context) : job.privatePageId;
        const stateHash = await documentStateHash(entry, note);
        const tracking = {version: 1, bundleId: plan.bundleId, entityId: job.pin.id, locationId: job.location.id, sourceHash: job.sourceHash, stateHash, privatePageId, privateSourceHash: job.privateHash, privatePageHash: privatePageId ? await digest(privatePageFor(entry, privatePageId)?.text?.content ?? "") : ""};
        await entry.setFlag(MODULE_ID, TRACKING_FLAG, tracking);
        await note.setFlag(MODULE_ID, TRACKING_FLAG, tracking);
        if (job.operation === "create") result.created.push({id: job.pin.id, journalId: entry.id, noteId: note.id, privatePageId});
        else if (job.operation === "adopt") result.adopted.push({id: job.pin.id, journalId: entry.id, noteId: note.id, privatePageId});
        else result.updated.push({id: job.pin.id, journalId: entry.id, noteId: note.id, privatePageId});
      } catch (error) { result.failed.push({id: job.pin.id, reason: error.message}); }
    }
    const exported = await glimpseApi.locations.export(scene);
    const exportedIds = new Set((exported?.locations ?? []).map(location => location.id));
    const missing = batch.filter(job => !exportedIds.has(job.location.id)).map(job => job.location.id);
    result.exports.push({sceneId: id, count: exportedIds.size, imported: batch.length - missing.length, missing});
    if (missing.length) result.failed.push({sceneId: id, reason: `locations.export não encontrou: ${missing.join(", ")}`});
    const folder = [...(context.folders ?? [])].find(item => item.type === "JournalEntry" && item.name === batch[0].folderName);
    if (folder && !flag(folder, MODULE_ID, "glimpseFolder")) await folder.setFlag(MODULE_ID, "glimpseFolder", {bundleId: plan.bundleId, sceneId: id});
    if (result.failed.length) break;
  }
  return result;
}

/** Public, content-free preview for the manager UI and diagnostics. */
export function summarizeGlimpsePlan(plan) {
  return {
    create: plan.jobs.filter(job => job.operation === "create").map(job => job.pin.id),
    update: plan.jobs.filter(job => job.operation === "update").map(job => job.pin.id),
    adopt: plan.jobs.filter(job => job.operation === "adopt").map(job => job.pin.id),
    unchanged: plan.jobs.filter(job => job.operation === "unchanged").map(job => job.pin.id),
    rows: plan.rows.map(({id, name, journal, note, handMadePages, missingMedia}) => ({id, name, journal, note, handMadePages, missingMedia})),
    skipped: plan.skipped.map(row => ({id: row.id, reason: row.reason})),
    conflicts: plan.conflicts.map(row => ({id: row.id, reason: row.reason}))
  };
}
