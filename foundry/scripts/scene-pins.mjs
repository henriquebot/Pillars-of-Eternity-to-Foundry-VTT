/**
 * RPG UP — cautious GM map annotations for Foundry V14.
 * Annotations describe placement; they DO NOT spawn NPCs, create loot, or
 * change quest state. Source positions must be explicitly calibrated.
 */
import {MODULE_ID, copy, displayName, escapeText, stableId, validateBundle} from "./model.mjs";
import {requireGM} from "./importer.mjs";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SUPPORTED_CATEGORIES = new Set([
  "npc", "enemy", "neutral-creature", "container", "treasure", "examinable",
  "item", "document", "book", "door", "passage", "trap", "resource", "poi",
  "quest-objective", "transition", "other"
]);
const short = (value, max = 3000) => String(value ?? "").slice(0, max);

function noteJournalData({pin, bundle, journalId, pageId, language}) {
  const name = displayName(pin, language);
  const category = pin.data.category;
  const description = short(pin.data.description);
  const refs = {
    quests: Array.isArray(pin.data.questRefs) ? pin.data.questRefs : [],
    related: Array.isArray(pin.data.relatedPins) ? pin.data.relatedPins : [],
    conditions: Array.isArray(pin.data.conditions) ? pin.data.conditions : []
  };
  const rows = [
    ["Categoria", category],
    ["Localização no mapa", `${pin.data.position.x.toFixed(1)}, ${pin.data.position.y.toFixed(1)}`],
    ["Descrição da referência", description],
    ["Quests relacionadas", refs.quests.join("; ")],
    ["Referências", refs.related.join("; ")],
    ["Condições", refs.conditions.join("; ")],
    ["Fonte", short(pin.provenance.source, 250)]
  ].filter(([, value]) => Boolean(value));
  const content = `<p><strong>MARCAÇÃO DO MESTRE — não cria Actor, item nem contêiner.</strong></p>` +
    rows.map(([key, value]) => `<p><strong>${escapeText(key)}:</strong> ${escapeText(value)}</p>`).join("");
  return {
    _id: journalId,
    name: `[GM · ${category}] ${name}`,
    ownership: {default: 0},
    flags: {[MODULE_ID]: {pin: {bundleId: bundle.id, entityId: pin.id, sourceId: pin.sourceId ?? ""}}},
    pages: [{_id: pageId, name, type: "text", ownership: {default: 0}, text: {format: 1, content}}]
  };
}

function noteData(pin, bundle, noteId, journalId, pageId, language) {
  return {
    _id: noteId,
    x: pin.data.position.x,
    y: pin.data.position.y,
    entryId: journalId,
    pageId,
    text: `[GM] ${displayName(pin, language)}`.slice(0, 220),
    global: false,
    iconSize: 32,
    flags: {[MODULE_ID]: {pin: {bundleId: bundle.id, entityId: pin.id, category: pin.data.category}}}
  };
}

function reviewJournal(existing, expected, pageId) {
  if (!existing) return "create";
  const data = existing.toObject();
  const page = data.pages?.find(p => p._id === pageId);
  if (existing.id !== expected._id ||
      !equal(data.flags?.[MODULE_ID]?.pin, expected.flags[MODULE_ID].pin) ||
      data.name !== expected.name ||
      data.ownership?.default !== 0 ||
      !page || page.text?.content !== expected.pages[0].text.content ||
      page.ownership?.default !== 0) return "conflict";
  return "unchanged";
}

function reviewNote(existing, expected) {
  if (!existing) return "create";
  const data = existing.toObject();
  if (existing.id !== expected._id ||
      !equal(data.flags?.[MODULE_ID]?.pin, expected.flags[MODULE_ID].pin) ||
      ["x", "y", "entryId", "pageId", "text", "global"].some(key => !equal(data[key], expected[key]))) return "conflict";
  return "unchanged";
}

/** Plan only known calibrated pins for ALREADY imported scenes. */
export async function planScenePins(bundle, selectedIds, context = globalThis.game) {
  requireGM(context);
  validateBundle(bundle);
  if (!context.world?.id) throw new Error("Mundo Foundry não identificado.");
  if (!Array.isArray(selectedIds) || selectedIds.length > 500) throw new Error("Importe até 500 pinos por lote.");
  const selection = new Set(selectedIds);
  if (selection.size !== selectedIds.length) throw new Error("IDs de pinos repetidos.");
  const entities = new Map(bundle.entities.map(e => [e.id, e]));
  const jobs = [], skipped = [], conflicts = [];
  const bundleKey = await stableId(bundle.id, "bundle");
  for (const pinId of selection) {
    const pin = entities.get(pinId);
    if (!pin || pin.kind !== "pin") { skipped.push({id: pinId, reason: "Pino não encontrado."}); continue; }
    const map = entities.get(pin.data.mapId);
    const position = pin.data.position;
    if (!map || map.kind !== "map" || map.data.calibration?.status !== "approved-for-notes" || pin.data.positionCalibrated !== true) {
      skipped.push({id: pin.id, reason: "Mapa ou calibração de pinos ainda não aprovada."}); continue;
    }
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
      position.x < 0 || position.y < 0 || position.x > map.data.width || position.y > map.data.height ||
      !SUPPORTED_CATEGORIES.has(pin.data.category)) {
      skipped.push({id: pin.id, reason: "Coordenadas ou categoria não verificadas."}); continue;
    }
    const mapKey = await stableId(bundle.id, map.id);
    const matching = [...context.scenes].filter(scene =>
      scene.getFlag(MODULE_ID, "import")?.entityKey === mapKey &&
      scene.getFlag(MODULE_ID, "import")?.bundleKey === bundleKey);
    if (matching.length !== 1) {
      skipped.push({id: pin.id, reason: "Cena importada não encontrada univocamente para este mapa."}); continue;
    }
    const scene = matching[0];
    const journalId = await stableId(bundle.id, pin.id, "gm-pin-journal");
    const pageId = await stableId(bundle.id, pin.id, "gm-pin-page");
    const noteId = await stableId(bundle.id, pin.id, "gm-scene-note");
    const journal = noteJournalData({pin, bundle, journalId, pageId, language: context.i18n?.lang ?? "pt-BR"});
    const note = noteData(pin, bundle, noteId, journalId, pageId, context.i18n?.lang ?? "pt-BR");
    const existingJournal = context.journal.get(journalId);
    const existingNote = scene.getEmbeddedDocument("Note", noteId);
    const journalOp = reviewJournal(existingJournal, journal, pageId);
    const noteOp = reviewNote(existingNote, note);
    if (journalOp === "conflict" || noteOp === "conflict") {
      conflicts.push({id: pin.id, reason: "Pino ou journal já modificado. Edição do mestre preservada; revisão manual necessária.", journalOp, noteOp});
      continue;
    }
    jobs.push({pinId: pin.id, sceneId: scene.id, journalId, pageId, noteId, journal, note, journalOp, noteOp});
  }
  return {worldId: context.world.id, bundleId: bundle.id, createdAt: new Date().toISOString(), jobs, skipped, conflicts};
}

/** Backups precede writes. Existing edited pins/journals are never overwritten. */
export async function applyScenePins(plan, {context = globalThis.game, backup, journalClass} = {}) {
  requireGM(context);
  if (plan.worldId !== context.world?.id) throw new Error("O plano de pinos pertence a outro mundo.");
  if (typeof backup !== "function") throw new Error("Backup persistente obrigatório.");
  journalClass ??= globalThis.foundry?.utils?.getDocumentClass?.("JournalEntry");
  if (!journalClass) throw new Error("Classe JournalEntry do Foundry não encontrada.");
  const result = {created: [], unchanged: [], failed: [], skipped: copy(plan.skipped), conflicts: copy(plan.conflicts)};
  if (!plan.jobs.length) return result;
  // Protect against scene changes between planning and applying.
  const sceneSnapshots = new Map();
  for (const job of plan.jobs) {
    const scene = context.scenes.get(job.sceneId);
    if (!scene) throw new Error("Cena foi removida após o planejamento; nenhuma escrita realizada.");
    if (!sceneSnapshots.has(scene.id)) sceneSnapshots.set(scene.id, scene.toObject());
    if (reviewJournal(context.journal.get(job.journalId), job.journal, job.pageId) !== job.journalOp ||
        reviewNote(scene.getEmbeddedDocument("Note", job.noteId), job.note) !== job.noteOp) {
      throw new Error("Pino ou journal mudou após o planejamento; gere novo plano.");
    }
  }
  const creates = plan.jobs.flatMap(job => [
    ...(job.journalOp === "create" ? [{type: "JournalEntry", id: job.journalId}] : []),
    ...(job.noteOp === "create" ? [{type: "Scene.Note", sceneId: job.sceneId, id: job.noteId}] : [])
  ]);
  if (!creates.length) {
    result.unchanged = plan.jobs.map(job => job.pinId);
    return result;
  }
  await backup({schemaVersion: "1.0.0", module: MODULE_ID, worldId: plan.worldId,
    createdAt: plan.createdAt,
    documents: [...sceneSnapshots.values()].map(data => ({type: "Scene", data})),
    plannedCreates: creates});
  for (const job of plan.jobs) {
    try {
      requireGM(context);
      const scene = context.scenes.get(job.sceneId);
      if (!scene) throw new Error("Cena não está mais disponível.");
      if (job.journalOp === "create") {
        if (context.journal.get(job.journalId)) throw new Error("Colisão de ID de journal.");
        const created = await journalClass.create(job.journal, {keepId: true});
        if (!created || created.id !== job.journalId) throw new Error("Journal não persistido.");
      }
      if (job.noteOp === "create") {
        if (scene.getEmbeddedDocument("Note", job.noteId)) throw new Error("Colisão de ID de pino.");
        // Never update an existing note: a GM's relocation stays authoritative.
        const created = await scene.createEmbeddedDocuments("Note", [job.note], {keepId: true});
        if (!Array.isArray(created) || !created.some(n => n.id === job.noteId)) throw new Error("Note não persistido.");
      }
      const journalStatus = reviewJournal(context.journal.get(job.journalId), job.journal, job.pageId);
      const noteStatus = reviewNote(scene.getEmbeddedDocument("Note", job.noteId), job.note);
      if (journalStatus !== "unchanged" || noteStatus !== "unchanged") throw new Error("Campos persistidos diferem do planejamento; revisar.");
      if (job.journalOp === "create" || job.noteOp === "create") result.created.push({id: job.pinId, journalId: job.journalId, noteId: job.noteId});
      else result.unchanged.push(job.pinId);
    } catch (error) {
      result.failed.push({id: job.pinId, reason: error.message});
      const remaining = plan.jobs.slice(plan.jobs.indexOf(job) + 1);
      result.skipped.push(...remaining.map(entry => ({id: entry.pinId, reason: "Lote interrompido após erro; sem exclusão automática."})));
      break;
    }
  }
  return result;
}
