import {MODULE_ID, copy, describeEntity, getPath, mergeManaged, setPath, validateBundle} from "./model.mjs";

export function requireGM(context = globalThis.game) {
  if (!context?.user?.isGM) throw new Error("Somente o mestre pode operar o importador.");
}

const collectionFor = (context, type) => type === "Scene" ? context.scenes : context.journal;
const sourceOf = document => document.toObject();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
  if (!result || result.id !== id) throw new Error("Atualização cancelada pelo Foundry ou por outro módulo; revise e reexecute.");
}
function requireUpdatedEmbedded(result, id) {
  if (!Array.isArray(result) || !result.some(document => document?.id === id)) throw new Error("Atualização incorporada cancelada pelo Foundry ou por outro módulo; a base anterior foi preservada.");
}
function verifyTrackingUnchanged(document, snapshot) {
  if (!same(document.getFlag(MODULE_ID, "import"), snapshot.flags?.[MODULE_ID]?.import)) throw new Error("Tracking mudou durante a importação; atualização suspensa para preservar a outra operação.");
}

export async function planImport(bundle, selectedIds, context = globalThis.game) {
  requireGM(context);
  validateBundle(bundle);
  const selection = new Set(selectedIds);
  if (!selection.size) throw new Error("Selecione pelo menos uma entidade.");
  for (const id of selection) if (!bundle.entities.some(entity => entity.id === id)) throw new Error(`Entidade selecionada inexistente: ${id}`);
  const plan = {bundleId: bundle.id, worldId: context.world?.id, createdAt: new Date().toISOString(), actions: [], skipped: [], conflicts: []};
  for (const entity of bundle.entities.filter(entry => selection.has(entry.id))) {
    const descriptor = await describeEntity(bundle, entity, context.i18n?.lang ?? "pt-BR");
    if (!descriptor.supported) { plan.skipped.push({id: entity.id, reason: descriptor.reason}); continue; }
    const collection = collectionFor(context, descriptor.type);
    const matches = [...collection].filter(doc => doc.getFlag(MODULE_ID, "import")?.entityKey === descriptor.id && doc.getFlag(MODULE_ID, "import")?.bundleKey === descriptor.meta.bundleKey);
    if (matches.length > 1) throw new Error(`Documentos duplicados para ${entity.id}; revisão manual necessária.`);
    const existing = matches[0];
    if (!existing) {
      if (collection.get(descriptor.id)) throw new Error(`Colisão de ID ${descriptor.id}; nenhum documento foi alterado.`);
      plan.actions.push({operation: "create", descriptor});
      continue;
    }
    const snapshot = sourceOf(existing), old = existing.getFlag(MODULE_ID, "import");
    const merged = mergeManaged(old?.baseline, managedCurrent(descriptor, snapshot), descriptor.fields);
    plan.conflicts.push(...merged.conflicts.map(conflict => ({id: entity.id, ...conflict})));
    const metadataChanged = Object.entries({...descriptor.meta, baseline: merged.baseline}).some(([key, value]) => !same(old?.[key], value));
    plan.actions.push({operation: Object.keys(merged.patch).length || metadataChanged ? "update" : "unchanged", descriptor, existingId: existing.id, snapshot, patch: merged.patch, baseline: merged.baseline});
  }
  return plan;
}

function createData(descriptor) {
  const data = {_id: descriptor.id, ownership: {default: 0}, flags: {[MODULE_ID]: {import: {...descriptor.meta, baseline: copy(descriptor.fields)}, combatValidated: false}}};
  for (const [path, value] of Object.entries(descriptor.fields)) if (!path.startsWith("page.") && !path.startsWith("level.")) setPath(data, path, value);
  if (descriptor.type === "JournalEntry") {
    const page = {_id: descriptor.pageId, type: "text", ownership: {default: 0}, text: {format: 1}};
    for (const [path, value] of Object.entries(descriptor.fields)) if (path.startsWith("page.")) setPath(page, path.slice(5), value);
    data.pages = [page];
  } else {
    data.navigation = false;
    data.padding = 0;
    data.tokenVision = true;
    data.initialLevel = descriptor.levelId;
    data.levels = [{_id: descriptor.levelId, name: "RPG UP", background: {src: descriptor.fields["level.background.src"]}}];
  }
  return data;
}

/** Requires a successfully persisted backup BEFORE the first write. No deletion or automatic rollback. */
export async function applyPlan(plan, {context = globalThis.game, documentClasses, backup, verifyAsset} = {}) {
  requireGM(context);
  documentClasses ??= Object.fromEntries(["Scene", "JournalEntry"].map(type => [type, foundry.utils.getDocumentClass(type)]));
  if (context.world?.id !== plan.worldId) throw new Error("O plano pertence a outro mundo.");
  if (typeof backup !== "function") throw new Error("Armazenamento de backup é obrigatório.");
  if (typeof verifyAsset !== "function" && plan.actions.some(action => action.descriptor.type === "Scene")) throw new Error("Verificação de imagens é obrigatória antes de criar cenas.");
  for (const action of plan.actions) {
    if (action.descriptor.type === "Scene" && action.operation !== "unchanged" && !await verifyAsset(action.descriptor.fields["level.background.src"])) throw new Error(`Imagem ausente ou inacessível: ${action.descriptor.entityId}`);
  }
  const result = {created: [], updated: [], unchanged: [], failed: [], skipped: copy(plan.skipped), conflicts: copy(plan.conflicts)};
  const mutating = plan.actions.filter(action => action.operation !== "unchanged");
  if (!mutating.length) { result.unchanged = plan.actions.map(action => action.descriptor.entityId); return result; }
  await backup({schemaVersion: "1.0.0", module: MODULE_ID, worldId: plan.worldId, createdAt: plan.createdAt, documents: mutating.filter(action => action.snapshot).map(action => ({type: action.descriptor.type, data: action.snapshot})), plannedCreates: mutating.filter(action => action.operation === "create").map(action => ({type: action.descriptor.type, id: action.descriptor.id}))});
  for (const action of plan.actions) {
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
        if (!document || JSON.stringify(sourceOf(document)) !== JSON.stringify(action.snapshot)) throw new Error("Documento mudou após o backup; atualização suspensa para preservar alterações.");
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
        if (Object.keys(main).length) requireUpdatedDocument(await document.update(main), document.id);
        // A cancelled parent update can follow successful embedded writes. Retry must
        // reconcile the old baseline even when the fields now equal the incoming data.
        const previousBaseline = action.snapshot.flags?.[MODULE_ID]?.import?.baseline ?? {};
        const advancing = Object.fromEntries(Object.entries(action.baseline).filter(([path, value]) => !same(previousBaseline[path], value)));
        verifyManaged(document, descriptor, {...action.patch, ...advancing});
        const tracking = {...descriptor.meta, baseline: action.baseline};
        verifyTrackingUnchanged(document, action.snapshot);
        requireUpdatedDocument(await document.update({[`flags.${MODULE_ID}.import`]: tracking}), document.id);
        const persisted = document.getFlag(MODULE_ID, "import");
        if (!persisted || Object.entries(tracking).some(([key, value]) => !same(persisted[key], value))) throw new Error("Tracking não foi persistido; revise e reexecute a atualização.");
        verifyManaged(document, descriptor, {...action.patch, ...advancing});
        result.updated.push({id: descriptor.entityId, uuid: document.uuid});
      }
    } catch (error) {
      result.failed.push({id: descriptor.entityId, reason: error.message});
      const remaining = plan.actions.slice(plan.actions.indexOf(action) + 1).filter(entry => entry.operation !== "unchanged");
      result.skipped.push(...remaining.map(entry => ({id: entry.descriptor.entityId, reason: "Não processado após falha anterior; reexecute depois de revisar o backup."})));
      // Stop after first write failure; a backup and stable IDs support a deliberate retry.
      break;
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
