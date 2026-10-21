import { KOM } from "../config.mjs";
import { startingGear } from "../starting-gear.mjs";
import { knownContext } from "../known.mjs";
import { levelUp, undoLevelUp } from "../level-up.mjs";
import { endScene } from "../combat.mjs";
import * as cond from "../conditions.mjs";
import { weaponInfo, martialInfo, spellInfo, attack, useMartial, castSpell, stanceOf, toggleStance, defenseFor } from "../combat.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class KomCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["kom", "sheet", "actor", "character"],
    position: { width: 780, height: 900 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      createItem: KomCharacterSheet.#createItem,
      addPerception: KomCharacterSheet.#addPerception,
      editItem: KomCharacterSheet.#editItem,
      deleteItem: KomCharacterSheet.#deleteItem,
      rollStat: KomCharacterSheet.#rollStat,
      rollSkill: KomCharacterSheet.#rollSkill,
      attack: KomCharacterSheet.#attack,
      useMartial: KomCharacterSheet.#useMartial,
      castSpell: KomCharacterSheet.#castSpell,
      toggleEquip: KomCharacterSheet.#toggleEquip,
      addNatural: KomCharacterSheet.#addNatural,
      toggleStance: KomCharacterSheet.#toggleStance,
      startingGear: KomCharacterSheet.#startingGear,
      changeQty: KomCharacterSheet.#changeQty,
      toggleSchool: KomCharacterSheet.#toggleSchool,
      toggleArt: KomCharacterSheet.#toggleArt,
      levelUp: KomCharacterSheet.#levelUp,
      undoLevelUp: KomCharacterSheet.#undoLevelUp,
      addResist: KomCharacterSheet.#addResist,
      addWeak: KomCharacterSheet.#addWeak,
      removeRow: KomCharacterSheet.#removeRow,
      endScene: KomCharacterSheet.#endScene,
      addCond: KomCharacterSheet.#addCond,
      condStep: KomCharacterSheet.#condStep,
      cureCond: KomCharacterSheet.#cureCond,
      bleedTick: KomCharacterSheet.#bleedTick,
      phase: KomCharacterSheet.#phase
    }
  };

  static PARTS = {
    header: { template: "systems/kingdom-of-monsters/templates/actor/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/kingdom-of-monsters/templates/actor/main.hbs", scrollable: [""] },
    gear: { template: "systems/kingdom-of-monsters/templates/actor/gear.hbs", scrollable: [""] },
    known: { template: "systems/kingdom-of-monsters/templates/actor/known.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main", label: "Main" }, { id: "gear", label: "Weapons & Arts" }, { id: "known", label: "Known Arts" }],
      initial: "main"
    }
  };

  /** Which school dropdowns on the Known Arts tab are open, so a re-render doesn't collapse them. */
  #openSchools = new Map();

  /** The whole window scrolls (.window-content), which Foundry doesn't restore on re-render. */
  #scrollTop = 0;
  async _preRender(context, options) {
    await super._preRender(context, options);
    const wc = this.element?.querySelector(".window-content");
    if (wc) this.#scrollTop = wc.scrollTop;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const wc = this.element.querySelector(".window-content");
    if (wc && !options.isFirstRender) requestAnimationFrame(() => { wc.scrollTop = this.#scrollTop; });
    for (const d of this.element.querySelectorAll("details[data-open-key]")) {
      const key = d.dataset.openKey;
      d.open = this.#openSchools.has(key) ? this.#openSchools.get(key) : d.dataset.defaultOpen === "1";
      d.addEventListener("toggle", () => this.#openSchools.set(key, d.open));
    }
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs && partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const race = actor.items.find(i => i.type === "race");

    context.actor = actor;
    context.system = sys;
    context.KOM = KOM;
    context.race = race;
    context.stats = KOM.stats.map(k => ({
      key: k,
      label: KOM.statLabels[k],
      value: sys.stats[k],
      max: race?.system.maxes[k],
      over: sys.pointBuy.over[k],
      check: sys.statChecks[k]
    }));
    context.talents = actor.items.filter(i => i.type === "talent")
      .sort((a, b) => a.name.localeCompare(b.name));
    context.skills = actor.items.filter(i => i.type === "skill")
      .sort((a, b) => a.system.group.localeCompare(b.system.group) || a.name.localeCompare(b.name));
    context.sizes = KOM.sizes;
    context.skillGroups = Object.entries(sys.skillGroups).map(([key, g]) => ({ key, ...g }));
    context.tabs = this._prepareTabs("primary");
    const stance = stanceOf(actor);
    context.stance = {
      standGround: stance === "standGround",
      feint: stance === "feint",
      vsMelee: defenseFor(actor, false), vsRanged: defenseFor(actor, true)
    };
    context.stance.vsMeleeValue = sys[context.stance.vsMelee.key];
    context.stance.vsRangedValue = sys[context.stance.vsRanged.key];

    // Weapons, martials, spells (with actor-dependent numbers)
    const byName = (a, b) => a.name.localeCompare(b.name);
    const weapons = actor.items.filter(i => i.type === "weapon").sort(byName)
      .map(item => ({ item, info: weaponInfo(actor, item) }));
    const martials = actor.items.filter(i => i.type === "martial").sort(byName)
      .map(item => ({ item, info: martialInfo(actor, item) }));
    const spells = actor.items.filter(i => i.type === "spell").sort(byName)
      .map(item => ({ item, info: spellInfo(actor, item) }));
    const armor = actor.items.filter(i => i.type === "armor").sort(byName);
    const materials = actor.items.filter(i => i.type === "material")
      .sort((a, b) => a.system.craft.localeCompare(b.system.craft) || a.name.localeCompare(b.name));
    context.gear = { weapons, martials, spells, armor, materials };
    context.activeConditions = cond.activeConditions(actor);
    context.conditionChoices = Object.entries(KOM.CONDITIONS).filter(([k]) => !(sys.conditions[k] > 0))
      .map(([key, c]) => ({ key, label: c.label })).sort((a, b) => a.label.localeCompare(b.label));
    context.known = await knownContext(actor);
    context.startingGearTaken = !!actor.getFlag("kingdom-of-monsters", "startingGear");
    context.quick = { weapons: weapons.filter(w => w.item.system.equipped), martials, spells };
    return context;
  }

  static #itemFrom(target) {
    return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }
  static async #attack(event, target) {
    const item = KomCharacterSheet.#itemFrom.call(this, target);
    if (item) await attack(this.actor, item);
  }
  static async #useMartial(event, target) {
    const item = KomCharacterSheet.#itemFrom.call(this, target);
    if (item) await useMartial(this.actor, item);
  }
  static async #castSpell(event, target) {
    const item = KomCharacterSheet.#itemFrom.call(this, target);
    if (item) await castSpell(this.actor, item);
  }
  static async #startingGear() { await startingGear(this.actor); }
  static async #changeQty(event, target) {
    const item = KomCharacterSheet.#itemFrom.call(this, target);
    if (!item) return;
    const q = Math.max(0, item.system.quantity + Number(target.dataset.delta));
    await item.update({ "system.quantity": q });
  }
  /** Known Arts tab: learn / forget a whole martial school or a single art. */
  static async #levelUp() { await levelUp(this.actor); }
  static async #addResist() {
    const arr = [...this.actor.system.toObject().resistances, { type: "", max: 0, value: 0 }];
    await this.actor.update({ "system.resistances": arr });
  }
  static async #addWeak() {
    const arr = [...this.actor.system.toObject().weaknesses, { type: "", base: 0, value: 0 }];
    await this.actor.update({ "system.weaknesses": arr });
  }
  static async #removeRow(event, target) {
    const f = target.dataset.field;
    const arr = this.actor.system.toObject()[f];
    arr.splice(Number(target.dataset.index), 1);
    await this.actor.update({ [`system.${f}`]: arr });
  }
  static async #addCond(event, target) {
    const sel = this.element.querySelector("select[name=kom-new-cond]");
    const key = sel?.value;
    if (!key) return;
    const n = Number(this.element.querySelector("input[name=kom-new-cond-val]")?.value) || 1;
    await cond.addCondition(this.actor, key, KOM.CONDITIONS[key].value ? n : 1);
  }
  static async #condStep(event, target) {
    const key = target.closest("[data-cond]").dataset.cond;
    const delta = Number(target.dataset.delta);
    if (!KOM.CONDITIONS[key].value && delta > 0) return;
    await cond.addCondition(this.actor, key, delta === 0 ? -9999 : delta);
  }
  static async #cureCond(event, target) { await cond.cure(this.actor, target.closest("[data-cond]").dataset.cond); }
  static async #bleedTick() { await cond.bleedTick(this.actor); }
  static async #phase(event, target) {
    const fn = { prepping: cond.prepping, start: cond.startTurn, end: cond.endTurn, recovery: cond.recovery }[target.dataset.phase];
    if (fn) await fn(this.actor);
  }
  static async #endScene() {
    await endScene(this.actor);
    ui.notifications.info(`${this.actor.name}: resistance pools refilled, weaknesses reset.`);
  }

  /** Collapse system.resistances.N.x / system.weaknesses.N.x form fields into real arrays. */
  _prepareSubmitData(event, form, formData, updateData) {
    const obj = formData.object;
    for (const k of Object.keys(obj)) if (k.startsWith("kom-")) delete obj[k];   // helper inputs, not actor data
    for (const field of ["resistances", "weaknesses"]) {
      const rows = {};
      for (const key of Object.keys(obj)) {
        const m = key.match(new RegExp(`^system\\.${field}\\.(\\d+)\\.(\\w+)$`));
        if (!m) continue;
        (rows[m[1]] ??= {})[m[2]] = obj[key];
        delete obj[key];
      }
      if (Object.keys(rows).length) obj[`system.${field}`] = Object.keys(rows).sort((a, b) => a - b).map(i => rows[i]);
    }
    return super._prepareSubmitData(event, form, formData, updateData);
  }
  static async #undoLevelUp() { await undoLevelUp(this.actor); }
  static async #toggleSchool(event, target) {
    event.preventDefault(); event.stopPropagation();   // don't open/close the <details>
    await KomCharacterSheet.#toggleIn.call(this, "knownSchools", target.dataset.key);
  }
  static async #toggleArt(event, target) {
    await KomCharacterSheet.#toggleIn.call(this, "knownArts", target.dataset.key);
  }
  static async #toggleIn(field, key) {
    const list = new Set(this.actor.system[field]);
    list.has(key) ? list.delete(key) : list.add(key);
    await this.actor.update({ [`system.${field}`]: [...list] });
  }
  static async #toggleStance(event, target) {
    await toggleStance(this.actor, target.dataset.stance);
  }
  static async #toggleEquip(event, target) {
    const item = KomCharacterSheet.#itemFrom.call(this, target);
    if (!item) return;
    // Wearing a second suit or shield takes the first one off (updateItem hook in kom.mjs).
    await item.update({ "system.equipped": !item.system.equipped });
  }
  /** Add bite, claw and tail sized to the character (skips ones it already has). */
  static async #addNatural() {
    const have = new Set(this.actor.items.filter(i => i.type === "weapon").map(i => i.system.base));
    const size = this.actor.system.size;
    const list = [["bite", "Bite"], ["claw", "Claw"], ["tail", "Tail"]].filter(([b]) => !have.has(b))
      .map(([base, name]) => ({ name, type: "weapon", system: { base, skin: "Basic", wielderSize: size, equipped: true } }));
    if (!list.length) return ui.notifications.info("Already has bite, claw and tail.");
    await this.actor.createEmbeddedDocuments("Item", list);
  }

  static async #createItem(event, target) {
    const type = target.dataset.type;
    const name = `New ${type}`;
    const data = { name, type };
    if (type === "weapon") {
      data.system = { wielderSize: this.actor.system.size, equipped: true };
    }
    if (type === "armor") {
      data.system = { armorClass: "light", hp: { value: 45 } };
    }
    if (type === "skill") {
      // Default to the first group that still has room.
      const open = Object.entries(this.actor.system.skillGroups)
        .find(([k, g]) => k !== "perception" && !g.full);
      if (!open) return ui.notifications.warn("Every skill group already has 6 skills.");
      data.system = { group: open[0] };
    }
    await this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
  }

  /** Pick one of the 8 Perception skills (6 may be chosen). */
  static async #addPerception(event, target) {
    const taken = new Set(this.actor.items.filter(i => i.type === "skill" && i.system.group === "perception").map(i => i.name));
    if (taken.size >= KOM.CREATION.skillsPerGroup) return ui.notifications.warn("You already have 6 Perception skills.");
    const options = KOM.perceptionSkills.filter(n => !taken.has(n))
      .map(n => `<option value="${n}">${n}</option>`).join("");
    const content = `<p>Choose a Perception skill (${taken.size} / ${KOM.CREATION.skillsPerGroup} chosen).</p>
      <select name="perception" style="width:100%">${options}</select>`;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Add Perception skill" },
      content,
      ok: { label: "Add", callback: (ev, button) => button.form.elements.perception.value }
    });
    if (!name) return;
    await this.actor.createEmbeddedDocuments("Item", [{ name, type: "skill", system: { group: "perception", passive: true } }]);
  }

  static #editItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    item?.sheet.render(true);
  }

  static async #deleteItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Remove <strong>${item.name}</strong> from ${this.actor.name}?</p>`
    });
    if (ok) await item.delete();
  }

  /** Stat check: d100, roll under band + stat. */
  static async #rollStat(event, target) {
    const stat = target.dataset.stat;
    const band = target.dataset.band ?? "normal";
    const tn = this.actor.system.statChecks[stat][band];
    await rollUnder(this.actor, `${KOM.statLabels[stat]} check (${band})`, tn);
  }

  /** Skill check: d100, roll under group base + skill bonus + band. */
  static async #rollSkill(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    const band = target.dataset.band ?? "normal";
    const tn = item.system[band];
    await rollUnder(this.actor, `${item.name} (${band})`, tn);
  }
}

/** Shared roll-under helper. Natural 1-5 crit success, 95-100 crit fail. */
export async function rollUnder(actor, label, tn) {
  // Sickened: the creature's Tn -3 per point.
  const sick = actor.system.tnPenalty ?? 0;
  if (sick) { tn -= sick; label += ` (Sickened -${sick})`; }
  const roll = await new Roll("1d100").evaluate();
  const r = roll.total;
  let result = r <= tn ? "Success" : "Failure";
  if (r <= 5) result = "Critical Success";
  else if (r >= 95) result = "Critical Failure";
  const margin = tn - r;
  const flavor = `<strong>${label}</strong><br>Tn ${tn} &rarr; ${result} (margin ${margin >= 0 ? "+" : ""}${margin})`;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
}
