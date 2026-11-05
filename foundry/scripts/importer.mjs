import {MODULE_ID, copy, describeEntity, getPath, mergeManaged, setPath, stableId, validateBundle} from "./model.mjs";

const SCENE_DEFAULTS_VERSION = 1;
// Foundry V14: GRID_TYPES.SQUARE = 1; FOG_EXPLORATION_MODES.INDIVIDUAL = 1.
// These are create-time defaults. Existing scenes only opt into this profile
// when their import tracking carries the same version marker.
const NEW_SCENE_DEFAULTS = Object.freeze({
  "grid.type": 1,
  "grid.size": 150,
  padding: 0.1,
  backgroundColor: "#000000",
  tokenVision: true,
  "fog.mode": 1,
  "fog.colors.explored": "#666666",
  "fog.colors.unexplored": "#000000"
});

function withSceneDefaults(descriptor, mapKnowledge = descriptor.mapKnowledge ?? "requires-exploration") {
  const fields = {...descriptor.fields, ...NEW_SCENE_DEFAULTS};
  if (mapKnowledge === "known") {
    fields.tokenVision = false;
    fields["fog.mode"] = 0;
  }
  return {
    ...descriptor,
    mapKnowledge,
    meta: {...descriptor.meta, mapKnowledge, sceneDefaultsVersion: SCENE_DEFAULTS_VERSION},
    fields
  };
}

export function requireGM(context = globalThis.game) {
  if (!context?.user?.isGM) throw new Error("Somente o mestre pode operar o importador.");
}

const collectionFor = (context, type) => type === "Scene" ? context.scenes : type === "Folder" ? context.folders : context.journal;
const sourceOf = document => document.toObject();
function same(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, index) => same(value, b[index]));
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}
function managedCurrent(descriptor, source) {
  const values = {};
  for (const path of Object.keys(descriptor.fields)) {
    if (path.startsWith("page.")) values[path] = getPath(source.pages?.find(page => page._id === descriptor.pageId), path.slice(5));
    else if (path.startsWith("level.")) values[path] = getPath(source.levels?.find(level => level._id === descriptor.levelId), path.slice(6));
    else values[path] = getPath(source, path);
  }
  return values;
}
function verifyManaged(document, descriptor, expected) {
  const current = managedCurrent(descriptor, sourceOf(document));
  for (const [path, value] of Object.entries(expected)) if (!same(current[path], value)) throw new Error(`Alteração não persistida ou modificada por hook: ${path}. A base de importação não foi avançada.`);
}
function requireUpdatedDocument(result, id) {
  // Foundry can return undefined for a no-op. The caller must still reread and
  // verify every expected field before reporting success or advancing tracking.
  if (result !== undefined && (!result || result.id !== id)) throw new Error("Atualização devolveu um documento inesperado; revise e reexecute.");
}
function requireUpdatedEmbedded(result, id) {
  if (!Array.isArray(result) || (result.length && !result.some(document => document?.id === id))) throw new Error("Atualização incorporada devolveu documentos inesperados; a base anterior foi preservada.");
}
function verifyTrackingUnchanged(document, snapshot) {
  if (!same(document.getFlag(MODULE_ID, "import"), snapshot.flags?.[MODULE_ID]?.import)) throw new Error("Tracking mudou durante a importação; atualização suspensa para preservar a outra operação.");
}
function readBaseline(metadata, descriptor) {
  const paths = new Set(Object.keys(descriptor.fields)), result = {};
  if (metadata?.managedBaseline !== undefined) {
    const stored = metadata.managedBaseline;
    if (stored?.version !== 1 || !Array.isArray(stored.fields)) throw new Error("Versão da base de importação não suportada; nenhuma migração automática realizada.");
    for (const field of stored.fields) {
      if (!field || typeof field.path !== "string" || !paths.has(field.path)) continue;
      if (Object.hasOwn(result, field.path)) throw new Error("Campo duplicado na base de importação; revisão manual necessária.");
      if (Object.hasOwn(field, "value")) result[field.path] = copy(field.value);
    }
    return result;
  }
  // 0.1.0 stored dotted keys inside flags. Foundry may expand those keys into
  // nested objects, so accept both legacy shapes without altering the old flag.
  const legacy = metadata?.baseline;
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return undefined;
  for (const path of paths) {
    if (Object.hasOwn(legacy, path)) result[path] = copy(legacy[path]);
    else {
      const value = getPath(legacy, path);
      if (value !== undefined) result[path] = copy(value);
    }
  }
  return result;
}
function storeBaseline(fields) {
  // Paths are string VALUES rather than object keys, so dot expansion cannot
  // change this representation during Foundry create/update serialization.
  return {version: 1, fields: Object.keys(fields).sort().map(path => ({path, value: copy(fields[path])}))};
}

export async function planImport(bundle, selectedIds, context = globalThis.game) {
  requireGM(context);
  validateBundle(bundle);
  const selection = new Set(selectedIds);
  if (!selection.size) throw new Error("Selecione pelo menos uma entidade.");
  for (const id of selection) if (!bundle.entities.some(entity => entity.id === id)) throw new Error(`Entidade selecionada inexistente: ${id}`);
  const plan = {bundleId: bundle.id, worldId: context.world?.id, createdAt: new Date().toISOString(), actions: [], skipped: [], conflicts: [], folder: null};
  if (bundle.targetFolder && [...selection].some(id => bundle.entities.find(entity => entity.id === id)?.kind === "map")) {
    const id = await stableId(bundle.id, "target-folder", "folder"), bundleKey = await stableId(bundle.id, "bundle"), entityKey = id;
    const matches = [...(context.folders ?? [])].filter(folder => folder.getFlag(MODULE_ID, "import")?.entityKey === entityKey && folder.getFlag(MODULE_ID, "import")?.bundleKey === bundleKey);
    if (matches.length > 1) throw new Error("Pastas duplicadas para o lote; revisão manual necessária.");
    const existing = matches[0];
    if (existing && (existing.type !== "Scene" || existing.id !== id)) throw new Error("A pasta importada não é do tipo Scene ou perdeu seu ID estável.");
    if (!existing && collectionFor(context, "Folder")?.get(id)) throw new Error(`Colisão de ID ${id}; nenhuma pasta foi alterada.`);
    plan.folder = {operation: existing ? "unchanged" : "create", descriptor: {id, name: bundle.targetFolder.name, type: bundle.targetFolder.type, bundleKey, entityKey}, existingId: existing?.id ?? null};
    if (existing && existing.name !== bundle.targetFolder.name) plan.conflicts.push({id: "target-folder", path: "name", reason: "Nome da pasta alterado pelo mestre; mantido."});
  }
  for (const entity of bundle.entities.filter(entry => selection.has(entry.id))) {
    let descriptor = await describeEntity(bundle, entity, context.i18n?.lang ?? "pt-BR");
    if (!descriptor.supported) { plan.skipped.push({id: entity.id, reason: descriptor.reason}); continue; }
    const collection = collectionFor(context, descriptor.type);
    const matches = [...collection].filter(doc => doc.getFlag(MODULE_ID, "import")?.entityKey === descriptor.id && doc.getFlag(MODULE_ID, "import")?.bundleKey === descriptor.meta.bundleKey);
    if (matches.length > 1) throw new Error(`Documentos duplicados para ${entity.id}; revisão manual necessária.`);
    const existing = matches[0];
    if (!existing) {
      if (collection.get(descriptor.id)) throw new Error(`Colisão de ID ${descriptor.id}; nenhum documento foi alterado.`);
      if (descriptor.type === "Scene") descriptor = withSceneDefaults(descriptor);
      plan.actions.push({operation: "create", descriptor});
      continue;
    }
    const snapshot = sourceOf(existing), old = existing.getFlag(MODULE_ID, "import");
    if (descriptor.type === "Scene" && old?.sceneDefaultsVersion === SCENE_DEFAULTS_VERSION) {
      const storedKnowledge = ["known", "requires-exploration"].includes(old.mapKnowledge) ? old.mapKnowledge : descriptor.mapKnowledge;
      descriptor = withSceneDefaults(descriptor, storedKnowledge);
    }
    const merged = mergeManaged(readBaseline(old, descriptor), managedCurrent(descriptor, snapshot), descriptor.fields);
    plan.conflicts.push(...merged.conflicts.map(conflict => ({id: entity.id, ...conflict})));
    const metadataChanged = Object.entries({...descriptor.meta, managedBaseline: storeBaseline(merged.baseline)}).some(([key, value]) => !same(old?.[key], value));
    plan.actions.push({operation: Object.keys(merged.patch).length || metadataChanged ? "update" : "unchanged", descriptor, existingId: existing.id, snapshot, patch: merged.patch, baseline: merged.baseline});
  }
  return plan;
}

function createData(descriptor) {
  const data = {_id: descriptor.id, ownership: {default: 0}, flags: {[MODULE_ID]: {import: {...descriptor.meta, managedBaseline: storeBaseline(descriptor.fields)}, combatValidated: false}}};
  if (descriptor.type === "Folder") return {_id: descriptor.id, name: descriptor.fields.name, type: "Scene", sorting: "m", flags: {[MODULE_ID]: {import: descriptor.meta}}};
  for (const [path, value] of Object.entries(descriptor.fields)) if (!path.startsWith("page.") && !path.startsWith("level.")) setPath(data, path, value);
  if (descriptor.type === "JournalEntry") {
    const page = {_id: descriptor.pageId, type: "text", ownership: {default: 0}, text: {format: 1}};
    for (const [path, value] of Object.entries(descriptor.fields)) if (path.startsWith("page.")) setPath(page, path.slice(5), value);
    data.pages = [page];
  } else {
    data.navigation = false;
    data.initialLevel = descriptor.levelId;
    data.levels = [{_id: descriptor.levelId, name: "RPG UP", background: {src: descriptor.fields["level.background.src"]}}];
  }
  return data;
}

/** Requires a successfully persisted backup BEFORE the first write. No deletion or automatic rollback. */
export async function applyPlan(plan, {context = globalThis.game, documentClasses, backup, verifyAsset} = {}) {
  requireGM(context);
  documentClasses ??= Object.fromEntries(["Scene", "JournalEntry", "Folder"].map(type => [type, foundry.utils.getDocumentClass(type)]));
  if (context.world?.id !== plan.worldId) throw new Error("O plano pertence a outro mundo.");
  if (typeof backup !== "function") throw new Error("Armazenamento de backup é obrigatório.");
  if (typeof verifyAsset !== "function" && plan.actions.some(action => action.descriptor.type === "Scene")) throw new Error("Verificação de imagens é obrigatória antes de criar cenas.");
  const result = {created: [], updated: [], unchanged: [], failed: [], skipped: copy(plan.skipped), conflicts: copy(plan.conflicts), folder: plan.folder ? {name: plan.folder.descriptor.name, id: plan.folder.descriptor.id, operation: plan.folder.operation} : null};
  const eligible = [];
  for (const action of plan.actions) {
    if (action.operation === "unchanged" || action.descriptor.type !== "Scene") { eligible.push(action); continue; }
    if (await verifyAsset(action.descriptor.fields["level.background.src"])) eligible.push(action);
    else result.failed.push({id: action.descriptor.entityId, reason: `Imagem ausente ou inacessível: ${action.descriptor.fields["level.background.src"]}`});
  }
  if (plan.folder) {
    const folder = collectionFor(context, "Folder")?.get(plan.folder.descriptor.id);
    if (plan.folder.operation === "unchanged" && !folder) throw new Error("A pasta do lote mudou após a prévia; refaça a importação.");
    if (plan.folder.operation === "create" && folder) throw new Error("A pasta foi criada após a prévia; refaça a importação.");
  }
  const mutating = eligible.filter(action => action.operation !== "unchanged");
  const needsFolder = Boolean(plan.folder?.operation === "create" && mutating.some(action => action.descriptor.type === "Scene"));
  if (!mutating.length && !needsFolder) {
    result.unchanged.push(...plan.actions.filter(action => action.operation === "unchanged").map(action => action.descriptor.entityId));
    return result;
  }
  await backup({schemaVersion: "1.0.0", module: MODULE_ID, worldId: plan.worldId, createdAt: plan.createdAt, documents: mutating.filter(action => action.snapshot).map(action => ({type: action.descriptor.type, data: action.snapshot})), plannedCreates: [...(needsFolder ? [{type: "Folder", id: plan.folder.descriptor.id}] : []), ...mutating.filter(action => action.operation === "create").map(action => ({type: action.descriptor.type, id: action.descriptor.id}))]});
  if (needsFolder) {
    try {
      requireGM(context);
      const {id, name, type, bundleKey, entityKey} = plan.folder.descriptor;
      const created = await documentClasses.Folder.create({_id: id, name, type, sorting: "m", flags: {[MODULE_ID]: {import: {bundleKey, entityKey, kind: "folder", status: "converted"}}}}, {keepId: true});
      if (!created || created.id !== id || created.type !== "Scene") throw new Error("Criação da pasta cancelada ou inválida.");
      result.folder = {name, id, operation: "created"};
    } catch (error) {
      result.failed.push({id: "target-folder", reason: error.message});
      for (const action of mutating) result.failed.push({id: action.descriptor.entityId, reason: "Pasta de destino não pôde ser criada; cena não gravada."});
      return result;
    }
  }
  for (const action of [...plan.actions.filter(entry => entry.operation === "unchanged"), ...eligible.filter(entry => entry.operation !== "unchanged")]) {
    const descriptor = action.descriptor;
    if (action.operation === "unchanged") { result.unchanged.push(descriptor.entityId); continue; }
    try {
      requireGM(context);
      const collection = collectionFor(context, descriptor.type);
      if (action.operation === "create") {
        if (collection.get(descriptor.id)) throw new Error("Outro documento foi criado após a prévia; refaça a importação.");
        const created = await documentClasses[descriptor.type].create(createData(descriptor), {keepId: true});
        if (!created || created.id !== descriptor.id) throw new Error("Criação cancelada ou ID alterado pelo Foundry/outro módulo.");
        verifyManaged(created, descriptor, descriptor.fields);
        result.created.push({id: descriptor.entityId, uuid: created.uuid});
      } else {
        const document = collection.get(action.existingId);
        if (!document || !same(sourceOf(document), action.snapshot)) throw new Error("Documento mudou após o backup; atualização suspensa para preservar alterações.");
        const main = {}, page = {}, level = {};
        for (const [path, value] of Object.entries(action.patch)) {
          if (path.startsWith("page.")) page[path.slice(5)] = value;
          else if (path.startsWith("level.")) level[path.slice(6)] = value;
          else main[path] = value;
        }
        if (Object.keys(page).length) {
          if (!action.snapshot.pages?.some(entry => entry._id === descriptor.pageId)) throw new Error("Página importada foi removida; restauração exige revisão manual.");
          const updated = await document.updateEmbeddedDocuments("JournalEntryPage", [{_id: descriptor.pageId, ...page}]);
          requireUpdatedEmbedded(updated, descriptor.pageId);
          verifyManaged(document, descriptor, Object.fromEntries(Object.entries(page).map(([path, value]) => [`page.${path}`, value])));
        }
        if (Object.keys(level).length) {
          if (!action.snapshot.levels?.some(entry => entry._id === descriptor.levelId)) throw new Error("Nível importado foi removido; restauração exige revisão manual.");
          const updated = await document.updateEmbeddedDocuments("Level", [{_id: descriptor.levelId, ...level}]);
          requireUpdatedEmbedded(updated, descriptor.levelId);
          verifyManaged(document, descriptor, Object.fromEntries(Object.entries(level).map(([path, value]) => [`level.${path}`, value])));
        }
        // Embedded writes await network operations. Recheck pending parent fields
        // immediately before touching them, so edits made during those awaits survive.
        const beforeMain = sourceOf(document);
        for (const path of Object.keys(main)) if (!same(getPath(beforeMain, path), getPath(action.snapshot, path))) throw new Error(`Campo ${path} mudou durante a importação; alteração concorrente preservada.`);
        verifyTrackingUnchanged(document, action.snapshot);
        if (Object.keys(main).length) {
          // V14's updateSource workflow mutates the changes object during
          // cleaning/validation. Keep the caller's intended fields separate
          // from Foundry-added metadata such as _id before verifying persistence.
          const expectedMain = copy(main);
          requireUpdatedDocument(await document.update(main), document.id);
          verifyManaged(document, descriptor, expectedMain);
        }
        // A cancelled parent update can follow successful embedded writes. Retry must
        // reconcile the old baseline even when the fields now equal the incoming data.
        const previousBaseline = readBaseline(action.snapshot.flags?.[MODULE_ID]?.import, descriptor) ?? {};
        const advancing = Object.fromEntries(Object.entries(action.baseline).filter(([path, value]) => !same(previousBaseline[path], value)));
        verifyManaged(document, descriptor, {...action.patch, ...advancing});
        const tracking = {...descriptor.meta, managedBaseline: storeBaseline(action.baseline)};
        verifyTrackingUnchanged(document, action.snapshot);
        // Update individual tracking keys so legacy baseline and unrelated GM
        // metadata survive even when a Document implementation replaces objects.
        const trackingPatch = Object.fromEntries(Object.entries(tracking).map(([key, value]) => [`flags.${MODULE_ID}.import.${key}`, value]));
        requireUpdatedDocument(await document.update(trackingPatch), document.id);
        const persisted = document.getFlag(MODULE_ID, "import");
        if (!persisted || Object.entries(tracking).some(([key, value]) => !same(persisted[key], value))) throw new Error("Tracking não foi persistido; revise e reexecute a atualização.");
        verifyManaged(document, descriptor, {...action.patch, ...advancing});
        result.updated.push({id: descriptor.entityId, uuid: document.uuid});
      }
    } catch (error) {
      result.failed.push({id: descriptor.entityId, reason: error.message});
      // Each scene is isolated: one rejected map never suppresses the remaining scene actions.
    }
  }
  return result;
}

/** Browser-local backup; secret GM edits are never uploaded to UserData or world flags. */
export async function persistBackup(payload) {
  requireGM();
  if (!globalThis.indexedDB) throw new Error("IndexedDB indisponível. Nenhuma alteração realizada.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${MODULE_ID}-gm-backups`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backups", {keyPath: "id"});
    request.onerror = () => reject(new Error("Não foi possível abrir o armazenamento local de backup."));
    request.onblocked = () => reject(new Error("Armazenamento de backup bloqueado; feche outras abas e tente novamente."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("backups", "readwrite");
      const id = `${payload.worldId}:${Date.now()}:${crypto.randomUUID()}`;
      transaction.objectStore("backups").put({id, userId: game.user.id, payload});
      transaction.oncomplete = () => { database.close(); resolve(id); };
      transaction.onerror = () => { database.close(); reject(new Error("Backup não foi persistido. Importação cancelada.")); };
      transaction.onabort = () => { database.close(); reject(new Error("Backup cancelado. Importação cancelada.")); };
    };
  });
}

export async function readBackups() {
  requireGM();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${MODULE_ID}-gm-backups`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backups", {keyPath: "id"});
    request.onerror = () => reject(new Error("Falha ao ler backups locais."));
    request.onblocked = () => reject(new Error("Armazenamento de backup bloqueado."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("backups", "readonly");
      const entries = transaction.objectStore("backups").getAll();
      entries.onsuccess = () => {
        const matches = entries.result.filter(entry => entry.userId === game.user.id && entry.payload.worldId === game.world.id);
        matches.sort((a, b) => String(b.payload.createdAt).localeCompare(String(a.payload.createdAt)));
        resolve(matches);
      };
      entries.onerror = () => reject(new Error("Falha ao ler backups locais."));
      transaction.oncomplete = () => database.close();
    };
  });
}
