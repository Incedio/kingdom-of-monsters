import { KOM } from "../config.mjs";
import { knows } from "../known.mjs";
import { ARMOR_CLASSES, ARMOR_SKINS } from "../weapons-data.mjs";
import { BASE_WEAPONS, SKINS, MARTIAL_GROUPS, MARTIAL_ART_TYPES, SPELL_SCHOOLS, SPELL_ART_TYPES } from "../weapons-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

let ARTS = null;
const T = p => ({ template: `systems/kingdom-of-monsters/templates/item/${p}.hbs`, scrollable: [""] });

export class KomItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["kom", "sheet", "item"],
    position: { width: 600, height: 660 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      toggleEdit: KomItemSheet.#toggleEdit,
      addArt: KomItemSheet.#addArt,
      fromLibrary: KomItemSheet.#fromLibrary,
      removeArt: KomItemSheet.#removeArt
    }
  };

  #editing = false;
  static #toggleEdit() { this.#editing = !this.#editing; this.render(); }

  static PARTS = {
    race: T("race"), talent: T("talent"), skill: T("skill"),
    weapon: T("weapon"), martial: T("martial"), spell: T("spell"), armor: T("armor"), material: T("material")
  };

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    // Only render the part that matches this item's type.
    return { [this.item.type]: parts[this.item.type] };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.item.system;
    context.item = this.item;
    context.system = sys;
    context.editing = this.#editing;
    context.KOM = KOM;
    context.stats = KOM.stats.map(k => ({ key: k, label: KOM.statLabels[k] }));
    context.sizes = KOM.sizes;
    context.skillGroups = KOM.skillGroups;
    context.trees = KOM.talentTrees;
    if (this.item.type === "weapon") {
      context.bases = BASE_WEAPONS;
      context.skins = SKINS.filter(s => s.type === "any" || s.type === sys.base);
    }
    if (this.item.type === "material") context.crafts = { blacksmithing: "Blacksmithing material", alchemy: "Alchemy reagent", cooking: "Cooking ingredient" };
    if (this.item.type === "armor") {
      context.classes = ARMOR_CLASSES;
      context.skins = ARMOR_SKINS.filter(sk => sk.fits.includes(sys.armorClass));
    }
    if (this.item.type === "martial") {
      context.groups = MARTIAL_GROUPS;
      context.artTypes = MARTIAL_ART_TYPES;
    }
    if (this.item.type === "spell") {
      context.schools = SPELL_SCHOOLS;
      context.artTypes = SPELL_ART_TYPES;
    }
    return context;
  }

  /**
   * The arts table uses names like system.arts.0.name. Collapse those into a real
   * array before Foundry validates the update (an indexed object would fail).
   */
  _prepareSubmitData(event, form, formData, updateData) {
    const obj = formData.object;
    const rows = {};
    for (const key of Object.keys(obj)) {
      const m = key.match(/^system\.arts\.(\d+)\.(\w+)$/);
      if (!m) continue;
      (rows[m[1]] ??= {})[m[2]] = obj[key];
      delete obj[key];
    }
    if (Object.keys(rows).length) {
      obj["system.arts"] = Object.keys(rows).sort((a, b) => a - b).map(i => rows[i]);
    }
    return super._prepareSubmitData(event, form, formData, updateData);
  }

  static async #addArt() {
    const arts = foundry.utils.deepClone(this.item.system.toObject().arts ?? []);
    const blank = this.item.type === "spell"
      ? { name: "", school: "Generic", type: arts.length ? "On Hit" : "Projection", cx: 0, text: "" }
      : { name: "", type: arts.length ? "On Hit" : "Core", cx: 0, text: "" };
    arts.push(blank);
    await this.item.update({ "system.arts": arts });
  }

  /** Pick arts from the martial / spell library (data/arts.json, parsed from the martial and Spells docs). */
  static async #fromLibrary() {
    ARTS ??= await (await fetch("systems/kingdom-of-monsters/data/arts.json")).json();
    const isSpell = this.item.type === "spell";
    let pool = isSpell ? ARTS.spell : ARTS.martial.filter(a => a.group === this.item.system.group);
    // On a character, only show what they know (Known Arts tab). Unowned items show everything.
    const actor = this.item.actor;
    if (actor?.type === "character") {
      const all = pool.length;
      pool = pool.filter(a => knows(actor, a));
      if (!pool.length) return ui.notifications.warn(all
        ? `${actor.name} doesn't know any ${isSpell ? "spell arts" : "arts for this weapon"} yet. Pick them on the Known Arts tab.`
        : "No arts found for this weapon.");
    }
    if (!pool.length) return ui.notifications.warn("No arts found for this weapon.");
    const bySchool = {};
    pool.forEach((a, i) => (bySchool[a.school] ??= []).push({ ...a, i }));
    const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const groups = Object.entries(bySchool).map(([school, arts]) => `<details${isSpell ? "" : " open"}>
        <summary><strong>${school}</strong> (${arts.length})</summary>
        ${arts.map(a => `<label class="kom-lib-art" title="${esc(a.text)}${a.extra ? "\n" + esc(a.extra) : ""}">
          <input type="checkbox" name="art" value="${a.i}">
          [${a.cx}] <strong>${esc(a.name)}</strong> (${a.type})${a.tier === 2 ? ` <span class="bad">Tier 2</span>` : ""}
          <small>${esc(a.text).slice(0, 140)}${a.text.length > 140 ? "..." : ""}</small></label>`).join("")}
      </details>`).join("");
    const hint = isSpell
      ? "Pick a Projection plus at least one Art. Tier 2 arts need rank 11 in that school's talent. Generic parts don't count as a school."
      : `Arts for ${this.item.system.groupLabel}. A martial is 1 Core + Modifiers / On Hits + an optional Soul Break condition; mixing schools multiplies the complexity. Tier 2 arts need level 11 in the talent.`;
    const picked = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${this.item.name}: add from library` },
      position: { width: 620, height: 640 },
      content: `<p class="hint">${hint}</p><div class="kom-lib">${groups}</div>`,
      ok: { label: "Add selected", callback: (ev, btn) => [...btn.form.querySelectorAll("input[name=art]:checked")].map(c => Number(c.value)) },
      rejectClose: false
    });
    if (!picked?.length) return;
    const arts = foundry.utils.deepClone(this.item.system.toObject().arts ?? []);
    for (const i of picked) {
      const a = pool[i];
      arts.push({ name: a.name, type: a.type, cx: a.cx, text: a.text, extra: a.extra ?? "", tier: a.tier ?? 1,
        school: isSpell ? a.school : a.school });
    }
    await this.item.update({ "system.arts": arts });
  }

  static async #removeArt(event, target) {
    const i = Number(target.dataset.index);
    const arts = foundry.utils.deepClone(this.item.system.toObject().arts ?? []);
    arts.splice(i, 1);
    await this.item.update({ "system.arts": arts });
  }
}
