import {MODULE_ID, QUEST_STATES, assetPath, displayName, parseBundle, publicDiagnostic, stableId} from "./model.mjs";
import {applyPlan, persistBackup, planImport, readBackups, requireGM} from "./importer.mjs";
import {prepareMappedItem} from "./dnd-adapter.mjs";
import {renderNarrative} from "./narrative.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const tr = key => game.i18n.localize(`RPGUP.${key}`);
const stateLabel = state => tr(`State.${state}`);
let busy = false, manager;
function integrationConflicts() {
  const active = id => Boolean(game.modules.get(id)?.active);
  return [["dnd5e-combat", "midi-qol"], ["darsh-loot", "item-piles"]].filter(pair => pair.every(active)).map(pair => `${pair.join(" + ")}: ${tr("DeclaredConflict")}`);
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
      import: this.importRecords,
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
    return {...context, loaded: Boolean(this.bundle), rows, query: this.query, bundleName: this.bundle?.id, total: entities.length, filtered: filtered.length, truncated: filtered.length > 200, detailName: detail ? displayName(detail, game.i18n.lang) : "", detailText: detail ? renderNarrative(detail, game.i18n.lang, tr) : "", preview, kinds: [...new Set(entities.map(entity => entity.kind))].sort().map(kind => ({value: kind, selected: kind === this.kind})), regions: [...new Set(entities.map(entity => entity.data.region).filter(Boolean))].sort().map(region => ({value: region, selected: region === this.region})), hasResult: Boolean(this.result), resultText: this.result ? JSON.stringify(publicDiagnostic(this.result), null, 2) : "", hasBackup: Boolean(this.lastBackup), environment: `${game.version} / ${game.system.id} ${game.system.version}`, conflicts: integrationConflicts(), integrations: ["dnd5e-combat", "darsh-loot", "midi-qol", "dae", "item-piles", "monks-active-tiles", "isometric-perspective", "cat", "chris-premades"].map(id => ({id, active: Boolean(game.modules.get(id)?.active), validation: tr("Unverified")}))};
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
  static async importRecords() {
    if (busy) return ui.notifications.warn(tr("Busy"));
    try {
      requireGM();
      if (!this.bundle) throw new Error(tr("ChooseFile"));
      busy = true;
      this.saveSelection();
      const plan = await planImport(this.bundle, [...this.selected]);
      this.result = await applyPlan(plan, {backup: async payload => { await persistBackup(payload); this.lastBackup = payload; foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", `rpgup-backup-${game.world.id}-${Date.now()}.json`); }, verifyAsset: path => new Promise(resolve => {const image = new Image(); const timer = setTimeout(() => {image.src = ""; resolve(false);}, 15000); image.onload = () => {clearTimeout(timer); resolve(true);}; image.onerror = () => {clearTimeout(timer); resolve(false);}; image.src = foundry.utils.getRoute(path);})});
      ui.notifications.info(tr("ImportFinished"));
      await this.render({force: true});
    } catch (error) { ui.notifications.error(error.message); }
    finally { busy = false; }
  }
  static exportDiagnostics() {
    requireGM();
    const diagnostic = {module: MODULE_ID, moduleVersion: "0.1.0", foundry: game.version, system: {id: game.system.id, version: game.system.version}, worldId: game.world.id, liveValidation: "pending", integrationConflicts: integrationConflicts(), ...(this.result ? publicDiagnostic(this.result) : {})};
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
