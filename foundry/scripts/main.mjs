import {MODULE_ID, QUEST_STATES, assetPath, displayName, parseBundle, publicDiagnostic, stableId} from "./model.mjs";
import {applyPlan, persistBackup, planImport, readBackups, requireGM} from "./importer.mjs";
import {prepareMappedItem} from "./dnd-adapter.mjs";
import {planScenePins, applyScenePins} from "./scene-pins.mjs";
import {planGlimpsePins, applyGlimpsePins} from "./glimpse-adapter.mjs";
import {renderNarrative} from "./narrative.mjs";
import {selectSubsystemIds, summarizeImportPreview} from "./import-preview.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const tr = key => game.i18n.localize(`RPGUP.${key}`);
const stateLabel = state => tr(`State.${state}`);
let busy = false, manager;
function integrationConflicts() {
  const active = id => Boolean(game.modules.get(id)?.active);
  return [["dnd5e-combat", "midi-qol"], ["darsh-loot", "item-piles"]].filter(pair => pair.every(active)).map(pair => `${pair.join(" + ")}: ${tr("DeclaredConflict")}`);
}
function verifyAsset(path) {
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => {image.src = ""; resolve(false);}, 15000);
    image.onload = () => {clearTimeout(timer); resolve(true);};
    image.onerror = () => {clearTimeout(timer); resolve(false);};
    image.src = `${foundry.utils.getRoute(path)}?rpgup=${Date.now()}`;
  });
}

export class PillarsCampaignManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "rpgup-pillars-campaign-manager",
    classes: ["rpgup-manager"],
    window: {title: "RPG UP — Pillars Campaign Manager", resizable: true},
    position: {width: 1000, height: 760},
    actions: {
      load: this.loadBundle,
      filter: this.filterRecords,
      inspect: this.inspectRecord,
      preview: this.previewImport,
      applyPreview: this.applyPreparedImport,
      diagnostics: this.exportDiagnostics,
      backup: this.exportBackup,
      storedBackups: this.exportStoredBackups,
      cycleQuest: this.cycleQuest
    }
  };
  static PARTS = {main: {template: `modules/${MODULE_ID}/templates/manager.hbs`}};
  bundle = null;
  query = "";
  kind = "";
  region = "";
  inspected = null;
  result = null;
  lastBackup = null;
  selected = new Set();
  pendingImport = null;
  subsystems = {maps: true, journals: true, pins: true};

  async _prepareContext(options) {
    requireGM();
    const context = await super._prepareContext(options);
    const entities = this.bundle?.entities ?? [];
    const query = this.query.toLocaleLowerCase();
    const filtered = entities.map((entity, index) => ({entity, index})).filter(({entity}) => (!this.kind || entity.kind === this.kind) && (!this.region || (entity.data.region ?? "") === this.region) && (!query || `${displayName(entity)} ${entity.id} ${entity.kind} ${entity.data.act ?? ""} ${entity.data.region ?? ""}`.toLocaleLowerCase().includes(query)));
    const progress = game.settings.get(MODULE_ID, "questProgress");
    const rows = await Promise.all(filtered.slice(0, 200).map(async ({entity, index}) => ({index, name: displayName(entity, game.i18n.lang), kind: entity.kind, region: entity.data.region ?? "", act: entity.data.act ?? "", selected: this.selected.has(entity.id), quest: entity.kind === "quest", state: stateLabel(progress[await stableId(this.bundle.id, entity.id, "quest-progress")] ?? "not-started")})));
    const detail = this.inspected !== null ? entities[this.inspected] : null;
    let preview = null;
    if (detail?.kind === "map") { try { preview = assetPath(detail.data.image); } catch { /* Missing image is displayed in diagnostics during preview. */ } }
    return {
      ...context, loaded: Boolean(this.bundle), rows, query: this.query, bundleName: this.bundle?.id,
      total: entities.length, filtered: filtered.length, truncated: filtered.length > 200,
      subsystems: Object.entries(this.subsystems).map(([key, checked]) => ({key, checked, label: tr(`Subsystem${key[0].toUpperCase()}${key.slice(1)}`)})),
      detailName: detail ? displayName(detail, game.i18n.lang) : "",
      detailText: detail ? renderNarrative(detail, game.i18n.lang, tr) : "", preview,
      kinds: [...new Set(entities.map(entity => entity.kind))].sort().map(kind => ({value: kind, selected: kind === this.kind})),
      regions: [...new Set(entities.map(entity => entity.data.region).filter(Boolean))].sort().map(region => ({value: region, selected: region === this.region})),
      hasResult: Boolean(this.result), resultText: this.result ? JSON.stringify(publicDiagnostic(this.result), null, 2) : "",
      hasPending: Boolean(this.pendingImport), pendingText: this.pendingImport ? JSON.stringify(this.pendingImport.summary, null, 2) : "",
      hasBackup: Boolean(this.lastBackup), environment: `${game.version} / ${game.system.id} ${game.system.version}`,
      conflicts: integrationConflicts(),
      integrations: ["dnd5e-combat", "darsh-loot", "midi-qol", "dae", "item-piles", "monks-active-tiles", "isometric-perspective", "cat", "chris-premades"].map(id => ({id, active: Boolean(game.modules.get(id)?.active), validation: tr("Unverified")}))
    };
  }

  static async loadBundle() {
    try {
      requireGM();
      const file = this.element.querySelector('input[type="file"]').files[0];
      if (!file) throw new Error(tr("ChooseFile"));
      if (file.size > 50 * 1024 * 1024) throw new Error("JSON excede 50 MiB.");
      this.bundle = parseBundle(await file.text());
      this.inspected = null;
      this.selected.clear();
      this.query = this.kind = this.region = "";
      this.result = null;
      this.pendingImport = null;
      await this.render({force: true});
    } catch (error) { ui.notifications.error(error.message); }
  }

  saveSelection() {
    for (const checkbox of this.element.querySelectorAll("input[data-entity-index]")) {
      const id = this.bundle.entities[Number(checkbox.dataset.entityIndex)].id;
      if (checkbox.checked) this.selected.add(id); else this.selected.delete(id);
    }
  }
  static async filterRecords() {
    requireGM();
    this.saveSelection();
    this.query = this.element.querySelector('[name="query"]').value;
    this.kind = this.element.querySelector('[name="kind"]').value;
    this.region = this.element.querySelector('[name="region"]').value;
    await this.render({force: true});
  }
  static async inspectRecord(event, target) {
    requireGM();
    this.saveSelection();
    this.inspected = Number(target.dataset.index);
    await this.render({force: true});
  }
  readSubsystems() {
    this.subsystems = Object.fromEntries(["maps", "journals", "pins"].map(key => [key, Boolean(this.element.querySelector(`[data-subsystem="${key}"]`)?.checked)]));
    return {...this.subsystems};
  }
  async buildImportPreview(ids, scopes) {
    const chosen = selectSubsystemIds(this.bundle.entities, ids, scopes);
    if (!chosen.length) throw new Error(tr("NoSubsystemSelected"));
    const entities = new Map(this.bundle.entities.map(entity => [entity.id, entity]));
    const ordinary = chosen.filter(id => entities.get(id)?.kind !== "pin");
    const pinIds = chosen.filter(id => entities.get(id)?.kind === "pin");
    const ordinaryPlan = ordinary.length ? await planImport(this.bundle, ordinary) : null;
    const glimpse = game.modules.get("glimpse-map-notes");
    const glimpseApi = glimpse?.active ? glimpse.api : null;
    if (glimpse?.active && (!glimpseApi?.locations?.plan || !glimpseApi?.locations?.apply || !glimpseApi?.locations?.export)) throw new Error("Glimpse está ativo, mas locations.plan/apply/export ainda não está pronto.");
    const pinPlan = pinIds.length
      ? glimpseApi?.locations?.plan && glimpseApi?.locations?.apply && glimpseApi?.locations?.export
        ? await planGlimpsePins(this.bundle, pinIds, {glimpseApi, assetExists: path => foundry.canvas.srcExists(path)})
        : await planScenePins(this.bundle, pinIds)
      : null;
    const {summary, deferredPinIds} = summarizeImportPreview({bundleId: this.bundle.id, worldId: game.world.id, selectedIds: chosen, scopes, entities: this.bundle.entities, ordinaryPlan, pinPlan});
    const assetChecks = await Promise.all((ordinaryPlan?.actions ?? []).filter(action => action.descriptor.type === "Scene" && action.operation !== "unchanged").map(async action => ({id: action.descriptor.entityId, available: await verifyAsset(action.descriptor.fields["level.background.src"])})));
    summary.assets = assetChecks;
    return {requestedIds: [...ids], ids: chosen, pinIds, deferredPinIds, scopes, ordinaryPlan, pinPlan, assetChecks, summary};
  }
  static async previewImport() {
    try {
      requireGM();
      if (!this.bundle) throw new Error(tr("ChooseFile"));
      this.saveSelection();
      const scopes = this.readSubsystems();
      const ids = this.bundle.entities.filter(entity => this.selected.has(entity.id)).map(entity => entity.id);
      if (!ids.length) throw new Error(tr("SelectRecords"));
      this.pendingImport = await this.buildImportPreview(ids, scopes);
      this.result = null;
      await this.render({force: true});
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async applyPreparedImport() {
    if (busy) return ui.notifications.warn(tr("Busy"));
    try {
      requireGM();
      if (!this.bundle || !this.pendingImport) throw new Error(tr("PreviewRequired"));
      busy = true;
      this.saveSelection();
      const currentIds = this.bundle.entities.filter(entity => this.selected.has(entity.id)).map(entity => entity.id);
      const currentScopes = this.readSubsystems();
      if (JSON.stringify(currentIds) !== JSON.stringify(this.pendingImport.requestedIds) || JSON.stringify(currentScopes) !== JSON.stringify(this.pendingImport.scopes)) {
        throw new Error(tr("PreviewStale"));
      }
      const fresh = await this.buildImportPreview(currentIds, currentScopes);
      if (JSON.stringify(fresh.summary) !== JSON.stringify(this.pendingImport.summary)) {
        this.pendingImport = fresh;
        await this.render({force: true});
        throw new Error(tr("PreviewChanged"));
      }
      const backup = async payload => {
        await persistBackup(payload);
        this.lastBackup = payload;
        foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", `rpgup-backup-${game.world.id}-${Date.now()}.json`);
      };
      this.result = {created: [], updated: [], unchanged: [], failed: [], skipped: [], conflicts: []};
      if (fresh.ordinaryPlan) {
        this.result = await applyPlan(fresh.ordinaryPlan, {backup, verifyAsset});
      }
      if (!this.result.failed.length && fresh.pinPlan) {
        const pinPlan = fresh.deferredPinIds.length
          ? fresh.pinPlan.kind === "glimpse"
            ? await planGlimpsePins(this.bundle, fresh.pinIds, {assetExists: path => foundry.canvas.srcExists(path)})
            : await planScenePins(this.bundle, fresh.pinIds)
          : fresh.pinPlan;
        this.result.pinNotes = pinPlan.kind === "glimpse"
          ? await applyGlimpsePins(pinPlan, {backup, assetExists: path => foundry.canvas.srcExists(path)})
          : await applyScenePins(pinPlan, {backup});
      }
      this.pendingImport = null;
      ui.notifications.info(tr("ImportFinished"));
      await this.render({force: true});
    } catch (error) { ui.notifications.error(error.message); }
    finally { busy = false; }
  }
  static exportDiagnostics() {
    requireGM();
    const diagnostic = {module: MODULE_ID, moduleVersion: game.modules.get(MODULE_ID)?.version ?? "unknown", foundry: game.version, system: {id: game.system.id, version: game.system.version}, worldId: game.world.id, liveValidation: "partial", integrationConflicts: integrationConflicts(), ...(this.result ? publicDiagnostic(this.result) : {})};
    foundry.utils.saveDataToFile(JSON.stringify(diagnostic, null, 2), "application/json", "rpgup-diagnostics.json");
  }
  static exportBackup() {
    requireGM();
    if (this.lastBackup) foundry.utils.saveDataToFile(JSON.stringify(this.lastBackup, null, 2), "application/json", `rpgup-backup-${game.world.id}.json`);
  }
  static async exportStoredBackups() {
    try {
      requireGM();
      const backups = await readBackups();
      foundry.utils.saveDataToFile(JSON.stringify({worldId: game.world.id, backups}, null, 2), "application/json", `rpgup-stored-backups-${game.world.id}.json`);
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async cycleQuest(event, target) {
    if (busy) return ui.notifications.warn(tr("Busy"));
    try {
      requireGM();
      busy = true;
      const entity = this.bundle.entities[Number(target.dataset.index)];
      if (entity?.kind !== "quest") return;
      this.saveSelection();
      const key = await stableId(this.bundle.id, entity.id, "quest-progress");
      const progress = {...game.settings.get(MODULE_ID, "questProgress")};
      const state = progress[key] ?? "not-started";
      progress[key] = QUEST_STATES[(QUEST_STATES.indexOf(state) + 1) % QUEST_STATES.length];
      const payload = {worldId: game.world.id, createdAt: new Date().toISOString(), questProgress: game.settings.get(MODULE_ID, "questProgress")};
      await persistBackup(payload);
      this.lastBackup = payload;
      await game.settings.set(MODULE_ID, "questProgress", progress);
      await this.render({force: true});
    } catch (error) { ui.notifications.error(error.message); }
    finally { busy = false; }
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "questProgress", {scope: "world", config: false, type: Object, default: {}});
  game.settings.registerMenu(MODULE_ID, "manager", {name: "RPGUP.Menu", label: "RPGUP.Open", hint: "RPGUP.MenuHint", icon: "fa-solid fa-book-open", type: PillarsCampaignManager, restricted: true});
  game.modules.get(MODULE_ID).api = Object.freeze({open: () => {requireGM(); manager ??= new PillarsCampaignManager(); return manager.render({force: true});}, prepareMappedItem: async (entity, mapping) => {requireGM(); return prepareMappedItem(entity, mapping, {fromUuid: foundry.utils.fromUuid, systemId: game.system.id, systemVersion: game.system.version});}});
});
