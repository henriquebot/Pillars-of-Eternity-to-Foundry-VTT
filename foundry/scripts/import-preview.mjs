/** Pure dry-run helpers. These summarize IDs and operations only, never content. */
export function selectSubsystemIds(entities, selectedIds, scopes) {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  return selectedIds.filter(id => {
    const kind = byId.get(id)?.kind;
    if (kind === "map") return scopes.maps;
    if (kind === "pin") return scopes.pins;
    if (["quest", "dialogue", "lore"].includes(kind)) return scopes.journals;
    return true; // Unsupported selected records remain visible as skipped.
  });
}

export function summarizeImportPreview({bundleId, worldId, selectedIds, scopes, entities, ordinaryPlan, pinPlan}) {
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const createdMapIds = new Set(ordinaryPlan?.actions
    .filter(action => action.descriptor.type === "Scene" && action.operation === "create")
    .map(action => action.descriptor.entityId) ?? []);
  const deferredPinIds = (pinPlan?.skipped ?? []).filter(row => {
    const pin = entityById.get(row.id);
    return row.reason === "Cena importada não encontrada univocamente para este mapa." && createdMapIds.has(pin?.data?.mapId);
  }).map(row => row.id);
  const summarize = plan => plan ? {
    actions: plan.actions.map(action => ({id: action.descriptor.entityId, type: action.descriptor.type, operation: action.operation})),
    skipped: plan.skipped.map(row => ({id: row.id, reason: row.reason})),
    conflicts: plan.conflicts.map(row => ({id: row.id, path: row.path, reason: row.reason}))
  } : {actions: [], skipped: [], conflicts: []};
  const pins = pinPlan?.kind === "glimpse" ? {
    integration: "glimpse-map-notes",
    create: pinPlan.jobs.filter(job => job.operation === "create").map(job => job.pin.id),
    update: pinPlan.jobs.filter(job => job.operation === "update").map(job => job.pin.id),
    unchanged: pinPlan.jobs.filter(job => job.operation === "unchanged").map(job => job.pin.id),
    deferredAfterMapCreation: deferredPinIds,
    rows: pinPlan.rows,
    skipped: pinPlan.skipped.filter(row => !deferredPinIds.includes(row.id)),
    conflicts: pinPlan.conflicts
  } : pinPlan ? {
    integration: "legacy-notes",
    create: pinPlan.jobs.filter(job => job.noteOp === "create" || job.journalOp === "create").map(job => job.pinId),
    unchanged: pinPlan.jobs.filter(job => job.noteOp === "unchanged" && job.journalOp === "unchanged").map(job => job.pinId),
    deferredAfterMapCreation: deferredPinIds,
    skipped: pinPlan.skipped.filter(row => !deferredPinIds.includes(row.id)),
    conflicts: pinPlan.conflicts.map(row => ({id: row.id, reason: row.reason}))
  } : {integration: null, create: [], update: [], unchanged: [], deferredAfterMapCreation: [], skipped: [], conflicts: []};
  return {
    deferredPinIds,
    summary: {
      mode: "prévia sem gravação",
      bundle: bundleId,
      world: worldId,
      selection: selectedIds.length,
      subsystems: {...scopes},
      documents: summarize(ordinaryPlan),
      targetFolder: ordinaryPlan?.folder ? {name: ordinaryPlan.folder.descriptor.name, type: ordinaryPlan.folder.descriptor.type, operation: ordinaryPlan.folder.operation} : null,
      mapFeatureInventory: selectedIds.filter(id => entityById.get(id)?.kind === "map").map(id => {
        const source = entityById.get(id).data.sourceFeatureInventory;
        return source ? {
          mapId: id,
          lights: source.lights,
          collisions: source.collisions,
          triggers: source.triggers,
          ambientSettings: source.ambientSettings
        } : {mapId: id, status: "inventário de luzes, colisões e gatilhos ausente"};
      }),
      sourceAssets: selectedIds.filter(id => entityById.get(id)?.kind === "map").map(id => ({mapId:id, ...(entityById.get(id).data.sourceAsset ?? {coverageStatus:"unverified",orientationValidated:false})})),
      pins,
      unavailable: {
        lights: "sem conversão aprovada no pacote",
        walls: "geometria 2D ainda não validada",
        regionsAndTriggers: "condições Unity ainda não interpretadas"
      }
    }
  };
}
