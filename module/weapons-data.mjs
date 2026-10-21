/**
 * Weapon data from the Blacksmithing doc (Base weapon table + Weapon skins).
 * grip: default accuracy type. The doc says melee accuracy is light or heavy
 * "depending on the weapon" but does not list which base weapon is which;
 * Ruling: every melee weapon can be light or heavy (player's choice) except polearms,
 * which are always heavy; bows use ranged accuracy.
 */
export const BASE_WEAPONS = {
  dagger:  { label: "Dagger",  harm: 2, hp: 15, limit: 2, req: "1 metal",            damageType: "Piercing",          reach: 0, range: 0,  bulk: 1, talent: "Dagger Combat",  grip: "light",  natural: false },
  sword:   { label: "Sword",   harm: 3, hp: 20, limit: 3, req: "2 metal",            damageType: "Slashing",          reach: 1, range: 0,  bulk: 1, talent: "Sword Combat",   grip: "heavy",  natural: false },
  axe:     { label: "Axe",     harm: 3, hp: 20, limit: 3, req: "1 metal + 1 wood",   damageType: "Slashing",          reach: 1, range: 0,  bulk: 1, talent: "Axe Combat",     grip: "heavy",  natural: false },
  hammer:  { label: "Hammer",  harm: 3, hp: 30, limit: 3, req: "2 metal + 1 wood",   damageType: "Blunt",             reach: 2, range: 0,  bulk: 1, talent: "Hammer Combat",  grip: "heavy",  natural: false },
  polearm: { label: "Polearm", harm: 3, hp: 25, limit: 3, req: "1 metal + 2 wood",   damageType: "Slashing/Piercing", reach: 3, range: 0,  bulk: 2, talent: "Polearm Combat", grip: "heavy",  natural: false, lockedGrip: true },
  bow:     { label: "Bow",     harm: 3, hp: 20, limit: 3, req: "2 wood + 1 leather", damageType: "Piercing",          reach: 0, range: 25, bulk: 2, talent: "Archery",        grip: "ranged", natural: false },
  unarmed: { label: "Unarmed", harm: 3, hp: 15, limit: 3, req: "1 metal",            damageType: "Blunt",             reach: 0, range: 0,  bulk: 1, talent: "Unarmed Combat", grip: "light",  natural: false },
  claw:    { label: "Claw (natural)", harm: 2, hp: 15, limit: null, req: "None", damageType: "Slashing", reach: 0, range: 0, bulk: 0, talent: "Claw Combat", grip: "light", natural: true, sizeOffset: 0 },
  bite:    { label: "Bite (natural)", harm: 1, hp: 15, limit: null, req: "None", damageType: "Piercing", reach: 0, range: 0, bulk: 0, talent: "Bite Combat", grip: "light", natural: true, sizeOffset: 0 },
  tail:    { label: "Tail (natural)", harm: 2, hp: 15, limit: null, req: "None", damageType: "Piercing", reach: 1, range: 0, bulk: 0, talent: "Tail Combat", grip: "light", natural: true, sizeOffset: -1 }
};

// Crafted weapon size: Medium 0, +/-1 per size class.
export const CRAFTED_SIZE = { tiny: -2, small: -1, medium: 0, large: 1, huge: 2, colossal: 3 };
// Natural weapon size by size class (claw/bite; tail uses 1 less).
export const NATURAL_SIZE = { tiny: 0, small: 0, medium: 1, large: 2, huge: 5, colossal: 10 };

/**
 * Skins. type = which base weapon it applies to ("any" = all).
 * harm/acc/reach/range/actions/crit are modifiers; thrownAcc only applies when thrown.
 * grip overrides the accuracy type; damageType overrides the base type; bulk overrides Bulk.
 */
const K = (name, type, o = {}) => ({ name, type, harm: 0, acc: 0, thrownAcc: 0, reach: 0, range: 0, actions: 0, crit: 0, mat: "", effect: "", ...o });
export const SKINS = [
  K("Basic", "any", { effect: "No changes: the weapon uses the default stats from the base weapon table." }),
  K("Bastard sword", "sword", { harm: 3, acc: -10, effect: "Cleave 2" }),
  K("Battle axe", "axe", { acc: 10 }),
  K("Club", "hammer", { effect: "Increase any stun applied by 1, or this weapon gives Stun 1 on a crit" }),
  K("Composite long bow", "bow", { harm: 1, range: 3, effect: "Range +3" }),
  K("Composite short bow", "bow", { harm: 1, range: 3, effect: "Range +3" }),
  K("Crossbow", "bow", { effect: "Must be reloaded after being fired, which costs an action. Suffers no penalty for range" }),
  K("Dogslicer", "sword", { effect: "Applies Bleed 1 to the target" }),
  K("Great axe", "axe", { effect: "Deals double damage when making called shots" }),
  K("Great sword", "sword", { harm: 4, actions: 1, reach: 2, effect: "Costs 1 additional action to strike with. Gains Cleave 3 and Reach 3" }),
  K("Halberd", "polearm", { reach: 2, effect: "Reach +2, but cannot attack creatures in melee range of you" }),
  K("Javelin", "polearm", { thrownAcc: 15, effect: "+15 accuracy when thrown. Thrown range +5" }),
  K("Long bow", "bow", { range: 5, effect: "For every 2 squares the attack travels, increase its damage by 3. Max range +5" }),
  K("Short bow", "bow", { range: -5, effect: "Can be used in melee without a penalty. Max range -5" }),
  K("Short sword", "sword", { grip: "either", effect: "Can deal bonus damage with either light or heavy stats" }),
  K("Smith hammer", "hammer", { grip: "light", effect: "One-handed and counts as a light weapon" }),
  K("Sword breaker", "dagger", { effect: "If this weapon deals damage to a weapon, you can make a grapple check; on a pass deal triple damage to that weapon. If that brings the weapon to zero it fully shatters without a roll" }),
  K("Warhammer", "hammer", { effect: "Ignores armor durability when dealing damage" }),
  K("Falchion", "sword", { harm: 1, effect: "The target's armor Hardness counts as 3 lower against this weapon" }),
  K("Gladius", "sword", { acc: 5, effect: "Attacks of opportunity with this weapon gain +1 Harm" }),
  K("Katana", "sword", { acc: -5, crit: 1, effect: "Crit range +1 (crits on 1-6). Gains +1 Harm on a crit" }),
  K("Long sword", "sword", { effect: "Can be used one-handed or two-handed; two-handed gives +1 Harm" }),
  K("Rapier", "sword", { harm: -1, acc: 10, grip: "light", effect: "Counts as a light weapon. Any Cleave this weapon gains becomes Line instead (Cleave X becomes Line X)" }),
  K("Scimitar", "sword", { effect: "Once per turn, after a hit, move 1 square without provoking attacks of opportunity" }),
  K("Sickle", "sword", { effect: "Has the Disarm trait. +10 on the combat roll when disarming" }),
  K("Flail", "hammer", { acc: -10, effect: "The target's shield Defense does not apply against this weapon" }),
  K("Light hammer", "hammer", { harm: -1, effect: "One-handed and can be thrown (thrown range rules)" }),
  K("Mace", "hammer", { effect: "On hit, the target's armor gains Brittle 1 (once per attack; attack count does not apply it again)" }),
  K("Meteor hammer", "hammer", { reach: 1, effect: "Reach +1. On hit you may make a grapple check; on a pass the target is Prone" }),
  K("Morningstar", "hammer", { harm: 1, damageType: "Blunt/Piercing", effect: "Its damage counts as both Blunt and Piercing. Applies Bleed 1 on a crit" }),
  K("Katar", "dagger", { effect: "Can be equipped as a natural claw weapon. Stealth damage adds 2 dice instead of 1" }),
  K("Kris", "dagger", { effect: "Increase any Bleed applied by 1" }),
  K("Starknife", "dagger", { thrownAcc: 10, effect: "+10 accuracy when thrown. Thrown range +3" }),
  K("Throwing knife", "dagger", { harm: -1, effect: "Thrown range +5. When thrown, gain +1 attack count" }),
  K("Knuckle duster", "unarmed", { effect: "+10 to grapple checks. +1 Harm while you are grappling" }),
  K("Glaive", "polearm", { harm: 1, acc: -5, effect: "Cleave 2" }),
  K("Lance", "polearm", { effect: "Charge bonus damage is 4 times your weight instead of 2 times" }),
  K("Scythe", "polearm", { acc: -10, effect: "Cleave 3. Applies Bleed 2 on a crit" }),
  K("Spear", "polearm", { effect: "Can be thrown (thrown range +2). A creature that Charges you provokes an attack of opportunity before its attack" }),
  K("Staff", "polearm", { harm: -1, effect: "Counts as Focus Class even though it is two-handed. Mana regeneration +2" }),
  K("Trident", "polearm", { effect: "Can attempt grapples at Reach 1. +10 accuracy against creatures that moved using a swim speed on their last turn" }),
  K("Hand cannon", "bow", { harm: 3, range: -10, effect: "Must be reloaded after each shot, which costs an action. Max range -10. Damage dice gain Exploding" }),
  K("Revolver", "bow", { effect: "Holds 6 shots; reloading all 6 costs 2 actions. Can be used in melee without a penalty" }),
  K("Sling", "bow", { harm: -1, bulk: 0, damageType: "Blunt", effect: "Deals Blunt damage. Gains +1 Harm per weight of the stone fired. A stone's weight can be at most half the sling's complexity" })
];
export const SKIN_BY_NAME = Object.fromEntries(SKINS.map(s => [s.name, s]));

/** Damage size chart: step 1 = d4 ... 7 = 2d6, then d12 + the cycle, adding a d12 each time it passes the top. */
const CHART = ["1d4", "1d6", "1d8", "2d4", "1d10", "1d12", "2d6"];
const CYCLE = ["1d4", "1d6", "1d8", "2d4", "1d10", "1d12"];
export function dieAtStep(step) {
  if (step <= 0) return "1";               // minimum flat 1
  if (step <= 7) return CHART[step - 1];
  const k = step - 8;
  const n12 = 1 + Math.floor(k / 6);
  if (k % 6 === 5) return `${n12 + 1}d12`;   // d12 + d12 = 2d12, etc.
  return `${n12}d12+${CYCLE[k % 6]}`;
}
export function prettyDie(die) {
  return die.replace(/(^|\+)1d/g, "$1d");
}
/** Largest die faces in a die expression (for stealth damage). */
export function largestFaces(die) {
  const faces = [...die.matchAll(/d(\d+)/g)].map(m => Number(m[1]));
  return faces.length ? Math.max(...faces) : 0;
}

/** Martial weapon groups (headings in the martial doc) -> base weapons that count. */
export const MARTIAL_GROUPS = {
  axe: { label: "Ax", bases: ["axe"], talent: "Axe Combat" },
  bite: { label: "Bite", bases: ["bite"], talent: "Bite Combat" },
  bow: { label: "Bow", bases: ["bow"], talent: "Archery" },
  claw: { label: "Claw", bases: ["claw"], talent: "Claw Combat" },
  dagger: { label: "Dagger", bases: ["dagger"], talent: "Dagger Combat" },
  hammer: { label: "Hammer", bases: ["hammer"], talent: "Hammer Combat" },
  polearm: { label: "Polearm", bases: ["polearm"], talent: "Polearm Combat" },
  sword: { label: "Swords", bases: ["sword"], talent: "Sword Combat" },
  tail: { label: "Tail", bases: ["tail"], talent: "Tail Combat" },
  unarmed: { label: "Unarmed", bases: ["unarmed"], talent: "Unarmed Combat" }
};
export const MARTIAL_ART_TYPES = ["Core", "On Hit", "Modifier", "Soul Break"];

/** Spell schools -> talent name and base damage type (Spells doc). */
export const SPELL_SCHOOLS = {
  Generic:     { talent: null,                damage: "" },
  Air:         { talent: "Air",               damage: "Sonic or Force" },
  Biomancy:    { talent: "Biomancy",          damage: "Poison or Nether" },
  Cosmic:      { talent: "Cosmic Magic",      damage: "Nether or Fire" },
  Demonic:     { talent: "Demonic Magic",     damage: "Nether" },
  Earth:       { talent: "Earth Magic",       damage: "Blunt" },
  Electricity: { talent: "Electricity Magic", damage: "Electricity" },
  Fire:        { talent: "Fire Magic",        damage: "Fire" },
  Gravity:     { talent: "Gravity Magic",     damage: "Blunt or Nether" },
  Healing:     { talent: "Healing Magic",     damage: "none" },
  Necromancy:  { talent: "Necromancy",        damage: "Nether" },
  Plant:       { talent: "Plant Magic",       damage: "Slashing or Piercing" },
  Water:       { talent: "Water Magic",       damage: "Cold or Force" },
  Weather:     { talent: "Weather Magic",     damage: "other school's type" }
};
export const SPELL_ART_TYPES = ["Projection", "On Hit", "Modifier", "Conditional"];
export const SPELL_MAX_BY_TIER = { 1: 35, 2: 70, 3: 110 };

/* ------------------------------------------------------------------ */
/*  Armor (Blacksmithing doc: Base armor + Armor and Shield Skins)     */
/* ------------------------------------------------------------------ */
// defense = how much it lowers your Defense; evasion = how much it raises your Evasion.
export const ARMOR_CLASSES = {
  light:       { label: "Light",        shield: false, req: "2 leather",          hp: 45,  defense: 20, hardness: 0, evasion: 0,  bulk: 1 },
  medium:      { label: "Medium",       shield: false, req: "1 leather + 1 metal", hp: 80,  defense: 40, hardness: 2, evasion: 25, bulk: 1 },
  heavy:       { label: "Heavy",        shield: false, req: "2 metal",            hp: 110, defense: 60, hardness: 2, evasion: 50, bulk: 2 },
  lightShield: { label: "Light Shield", shield: true,  req: "1 wood + 1 leather",  hp: 25,  defense: 10, hardness: 0, evasion: 0,  bulk: 1 },
  heavyShield: { label: "Heavy Shield", shield: true,  req: "2 metal",            hp: 50,  defense: 20, hardness: 1, evasion: 10, bulk: 2 }
};
const A = (name, fits, o = {}) => ({ name, fits, mat: "", hp: 0, defense: 0, evasion: 0, hardnessVs: [], effect: "", ...o });
// fits: list of armor classes the skin applies to.
export const ARMOR_SKINS = [
  A("Basic", ["light", "medium", "heavy", "lightShield", "heavyShield"], { effect: "No changes: the armor uses the default stats from the base armor table." }),
  A("Leather", ["light"], { evasion: -5 }),
  A("Studded", ["light"], { mat: "1 metal", hardnessVs: ["piercing"], effect: "Hardness increase by 1 when taking piercing damage" }),
  A("Robes", ["light"], { mat: "1 gem", effect: "Mana regeneration plus 2" }),
  A("Bone lattice", ["light"], { mat: "1 bone", effect: "Melee attacks gain bleed 1" }),
  A("Shadow weave", ["light"], { mat: "1 wood", effect: "Evasion is decrease by 10 when in light 2 or less" }),
  A("Scale mail", ["medium"], { mat: "1 metal", effect: "Once per turn decrease a evasion by 3" }),
  A("Ring", ["medium"], { effect: "Aura regeneration plus 2" }),
  A("Splint mail", ["medium"], { mat: "1 wood", hp: 15, evasion: 5 }),
  A("Brigandine", ["medium"], { mat: "1 leather", hardnessVs: ["piercing"], effect: "Hardness increase by 1 when taking piercing damage" }),
  A("Lamellar", ["medium"], { mat: "1 metal + 1 leather", effect: "While below half hp decrease defense by an additional 10" }),
  A("Plate", ["heavy"], { hardnessVs: ["slashing", "piercing"], effect: "Hardness increase by 1 when taking slashing or piercing" }),
  A("Half plate", ["heavy"], { evasion: -15 }),
  A("Breastplate", ["heavy"], { effect: "Called shots to the body deal no bonus damage" }),
  A("Bastion armor", ["heavy"], { mat: "1 metal", effect: "Adjacent allies decrease defense by 5" }),
  A("Fortress", ["heavy"], { mat: "2 metal", effect: "Cannot be knocked prone or pushed. Decrease your movements by 2" }),
  A("Carapace", ["heavy"], { mat: "1 leather", effect: "Resistance 5 acid and poison" }),
  A("Buckler", ["lightShield"], { effect: "Decrease defense by 5 when you haven't moved on your last turn" }),
  A("Round shield", ["lightShield"], { mat: "1 wood", effect: "Once per turn decrease your evasion by 4 vs range attack" }),
  A("Spiked shield", ["lightShield", "heavyShield"], { mat: "1 metal", effect: "Shield bash has plus 1 harm" }),
  A("Kite shield", ["heavyShield"], { mat: "1 leather", evasion: -10 }),
  A("Tower shield", ["heavyShield"], { mat: "1 metal", effect: "Allies behind you have half concealment" })
];
export const ARMOR_SKIN_BY_NAME = Object.fromEntries(ARMOR_SKINS.map(s => [s.name, s]));
