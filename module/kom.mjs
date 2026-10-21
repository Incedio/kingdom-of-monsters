import { KOM } from "./config.mjs";
import { CharacterData } from "./data/character.mjs";
import { RaceData, TalentData, SkillData } from "./data/items.mjs";
import { WeaponData, MartialData, SpellData, ArmorData, MaterialData } from "./data/gear.mjs";
import { startingGear, importMaterials } from "./starting-gear.mjs";
import * as combat from "./combat.mjs";
import * as conditions from "./conditions.mjs";
import { ARMOR_CLASSES, ARMOR_SKIN_BY_NAME } from "./weapons-data.mjs";
import { KomCharacterSheet } from "./sheets/character-sheet.mjs";
import { KomItemSheet } from "./sheets/item-sheet.mjs";
import { importRaces, importTalents, importRacialTalents, syncRacialGrants, BASE_RACES } from "./races.mjs";

Hooks.once("init", () => {
  console.log("Kingdom of Monsters | init");
  CONFIG.KOM = KOM;

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.race = RaceData;
  CONFIG.Item.dataModels.talent = TalentData;
  CONFIG.Item.dataModels.skill = SkillData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.martial = MartialData;
  CONFIG.Item.dataModels.spell = SpellData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.material = MaterialData;

  const { Actors, Items } = foundry.documents.collections;
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Actors.registerSheet("kingdom-of-monsters", KomCharacterSheet, {
    types: ["character"], makeDefault: true, label: "KoM Character Sheet"
  });
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Items.registerSheet("kingdom-of-monsters", KomItemSheet, {
    types: ["race", "talent", "skill", "weapon", "martial", "spell", "armor", "material"], makeDefault: true, label: "KoM Item Sheet"
  });

  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("gt", (a, b) => a > b);
  Handlebars.registerHelper("lt", (a, b) => a < b);
  Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
  Handlebars.registerHelper("sign", n => (n >= 0 ? `+${n}` : `${n}`));
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));

  // Movement-action stances shown as token status icons.
  for (const st of Object.values(combat.STANCES)) {
    if (!CONFIG.statusEffects.some(e => e.id === st.id)) CONFIG.statusEffects.push({ id: st.id, name: st.name, img: st.img });
  }

  conditions.registerConditionStatuses();
  conditions.registerCombatHooks();

  game.kom = { conditions, KOM, importRaces, importTalents, importRacialTalents, syncRacialGrants, BASE_RACES, combat, linkAllTokens, startingGear, importMaterials };
});

function groupHasRoom(actor, group, ignoreId) {
  const n = actor.items.filter(i => i.type === "skill" && i.system.group === group && i.id !== ignoreId).length;
  return n < KOM.CREATION.skillsPerGroup;
}

Hooks.on("preCreateItem", (item, data) => {
  if (item.type !== "skill" || !item.parent) return;
  const group = item.system.group;
  if (!groupHasRoom(item.parent, group)) {
    ui.notifications.warn(`${KOM.skillGroups[group].label} already has ${KOM.CREATION.skillsPerGroup} skills.`);
    return false;
  }
  if (group === "perception" && !KOM.perceptionSkills.includes(item.name)) {
    ui.notifications.warn("Perception skills must be one of the 8 listed skills. Use the + Perception button.");
    return false;
  }
});

Hooks.on("preUpdateItem", (item, changes) => {
  const group = changes.system?.group;
  if (item.type !== "skill" || !item.parent || !group || group === item.system.group) return;
  if (!groupHasRoom(item.parent, group, item.id)) {
    ui.notifications.warn(`${KOM.skillGroups[group].label} already has ${KOM.CREATION.skillsPerGroup} skills.`);
    return false;
  }
  if (group === "perception" && !KOM.perceptionSkills.includes(item.name)) {
    ui.notifications.warn("Perception skills must be one of the 8 listed skills.");
    return false;
  }
});

// Keep racial grants in sync whenever a racial talent changes on a character.
const isRacial = item => item.type === "talent" && item.system.racial && item.parent?.type === "character";
Hooks.on("updateItem", (item, changes, options) => {
  if (options.komSync || !isRacial(item)) return;
  if (!("system" in changes)) return;
  syncRacialGrants(item.parent);
});
Hooks.on("createItem", (item, options) => { if (!options.komSync && isRacial(item)) syncRacialGrants(item.parent); });
Hooks.on("deleteItem", (item, options) => { if (!options.komSync && isRacial(item)) syncRacialGrants(item.parent); });

// Characters' tokens share the actor's data (damage shows on the sheet you open from the sidebar).
Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type === "character" && data.prototypeToken?.actorLink === undefined) {
    actor.updateSource({ "prototypeToken.actorLink": true });
  }
});

/** Link every character actor and its tokens on all scenes. Unlinked copies lose their separate values. */
async function linkAllTokens() {
  let n = 0;
  for (const a of game.actors.filter(a => a.type === "character" && !a.prototypeToken.actorLink)) {
    await a.update({ "prototypeToken.actorLink": true }); n++;
  }
  let t = 0;
  for (const scene of game.scenes) {
    const ups = scene.tokens.filter(tk => tk.actor?.type === "character" && !tk.actorLink).map(tk => ({ _id: tk.id, actorLink: true }));
    if (ups.length) { await scene.updateEmbeddedDocuments("Token", ups); t += ups.length; }
  }
  ui.notifications.info(`Linked ${n} actor(s) and ${t} token(s).`);
}

// Armor at full HP stays at full HP when its class, skin or Durable changes.
function armorMax(sys) {
  const c = ARMOR_CLASSES[sys.armorClass] ?? ARMOR_CLASSES.light;
  let sk = ARMOR_SKIN_BY_NAME[sys.skin];
  if (!sk || !sk.fits.includes(sys.armorClass)) sk = ARMOR_SKIN_BY_NAME.Basic;
  return Math.max(0, c.hp + sk.hp + (sys.durable ?? 0) * 5);
}
Hooks.on("preUpdateItem", (item, changes) => {
  if (item.type !== "armor" || !changes.system) return;
  const ch = changes.system;
  if (!("armorClass" in ch || "skin" in ch || "durable" in ch) || ch.hp) return;
  const before = item.system.toObject();
  if (before.hp.value !== item.system.hpMax) return;
  const after = { ...before, ...ch };
  foundry.utils.setProperty(changes, "system.hp.value", armorMax(after));
});
Hooks.on("updateItem", async (item, changes, options, userId) => {
  if (userId !== game.user.id || item.type !== "armor" || !item.parent) return;
  if (changes.system?.equipped !== true) return;
  const others = item.parent.items.filter(i => i.type === "armor" && i.id !== item.id
    && i.system.equipped && i.system.isShield === item.system.isShield);
  if (others.length) await item.parent.updateEmbeddedDocuments("Item", others.map(o => ({ _id: o.id, "system.equipped": false })));
});
Hooks.on("preCreateItem", (item, data) => {
  if (item.type === "armor" && !data.system?.hp?.value) item.updateSource({ "system.hp.value": armorMax(item.system.toObject()) });
});

Hooks.on("renderChatMessageHTML", (message, html) => { combat.bindChatButtons(html); conditions.bindCureButtons(html); });

// Conditions <-> token status icons.
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id || actor.type !== "character" || !changes.system?.conditions) return;
  conditions.syncAllIcons(actor);
});
const statusMirror = active => (effect, options, userId) => {
  if (userId !== game.user.id) return;
  const actor = effect.parent;
  if (actor?.documentName !== "Actor" || actor.type !== "character") return;
  for (const id of effect.statuses ?? []) if (id.startsWith("kom-cond-")) conditions.fromStatus(actor, id, active);
};
Hooks.on("createActiveEffect", statusMirror(true));
Hooks.on("deleteActiveEffect", statusMirror(false));

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  if (!game.items.some(i => i.type === "race")) {
    ui.notifications.info("Kingdom of Monsters: run game.kom.importRaces() in a script macro to add the 8 base races.", { permanent: true });
  }
  if (!game.items.some(i => i.type === "talent")) {
    ui.notifications.info("Kingdom of Monsters: run game.kom.importTalents() in a script macro to add the 75 tier 1 talents.", { permanent: true });
  }
  if (!game.items.some(i => i.type === "talent" && i.system.racial)) {
    ui.notifications.info("Kingdom of Monsters: run game.kom.importRacialTalents() to add the 8 racial talents and Flight.", { permanent: true });
  }
});
