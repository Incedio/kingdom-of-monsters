import { ARMOR_CLASSES, ARMOR_SKIN_BY_NAME } from "../weapons-data.mjs";
import { BASE_WEAPONS, SKIN_BY_NAME, CRAFTED_SIZE, NATURAL_SIZE, dieAtStep, prettyDie,
  MARTIAL_GROUPS, MARTIAL_ART_TYPES, SPELL_SCHOOLS, SPELL_ART_TYPES } from "../weapons-data.mjs";
import { KOM } from "../config.mjs";

const { NumberField, StringField, SchemaField, HTMLField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
const int = (initial = 0, min = 0) => new NumberField({ required: true, integer: true, min, initial });
const sint = (initial = 0) => new NumberField({ required: true, integer: true, initial }); // signed

/* ------------------------------------------------------------------ */
/*  Weapon                                                             */
/* ------------------------------------------------------------------ */
export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      base: new StringField({ required: true, initial: "sword", choices: Object.keys(BASE_WEAPONS) }),
      skin: new StringField({ required: true, initial: "Basic" }),
      wielderSize: new StringField({ required: true, initial: "medium", choices: Object.keys(KOM.sizes) }),
      grip: new StringField({ required: true, initial: "auto", choices: ["auto", "light", "heavy"] }),
      // From materials / accessories / runes (Blacksmithing Step 7 results), entered by hand.
      harmBonus: sint(0),
      hardness: sint(0),
      durable: sint(0),
      accuracyBonus: sint(0),   // Guide, Wild, etc.
      damageBonus: sint(0),     // Wild, flat bonuses
      critBonus: int(0),        // Blessed
      hp: new SchemaField({ value: int(0) }),
      equipped: new BooleanField({ initial: true }),
      countsAsGroup: new BooleanField({ initial: false }), // natural: equipping a weapon of that group adds the table Harm
      rarity: new StringField({ required: false, blank: true, initial: "Common" }),
      grade: new StringField({ required: false, blank: true, initial: "basic" }),
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    const b = BASE_WEAPONS[this.base] ?? BASE_WEAPONS.sword;
    let skin = SKIN_BY_NAME[this.skin];
    if (!skin || (skin.type !== "any" && skin.type !== this.base) || b.natural) skin = SKIN_BY_NAME.Basic;
    this.skinData = skin;
    this.skinName = skin.name;
    this.baseData = b;
    this.natural = b.natural;
    this.talentName = b.talent;
    this.baseLabel = b.label;

    // Weapon size + Harm -> step on the damage chart
    this.sizeStep = b.natural
      ? (NATURAL_SIZE[this.wielderSize] ?? 1) + (b.sizeOffset ?? 0)
      : (CRAFTED_SIZE[this.wielderSize] ?? 0);
    const baseHarm = b.natural ? (this.countsAsGroup ? b.harm : 0) : b.harm;
    this.harm = baseHarm + skin.harm + this.harmBonus;
    this.step = this.sizeStep + this.harm;
    this.die = dieAtStep(this.step);
    this.dieLabel = prettyDie(this.die);

    this.complexityLimit = b.natural ? null : this.harm + this.hardness;
    this.hpMax = Math.max(0, b.hp + this.durable * 5);
    this.reach = b.reach + skin.reach;
    this.range = b.range ? b.range + skin.range : 0;
    this.isRanged = b.grip === "ranged";
    this.damageType = skin.damageType ?? b.damageType;
    this.bulk = skin.bulk ?? b.bulk;
    this.actionCost = 1 + skin.actions;
    this.critMax = 5 + skin.crit + this.critBonus;
    this.accuracyMod = skin.acc + this.accuracyBonus;
    this.thrownAcc = skin.thrownAcc;
    this.requirement = skin.mat ? `${b.req} + ${skin.mat}` : b.req;

    // Accuracy type: ranged for bows; skin can force light; else the per-weapon choice, else the base default.
    this.gripLocked = !!b.lockedGrip;
    if (this.isRanged) this.gripResolved = "ranged";
    else if (b.lockedGrip) this.gripResolved = b.grip;           // polearms are always heavy
    else if (this.grip !== "auto") this.gripResolved = this.grip;
    else if (skin.grip === "light") this.gripResolved = "light";
    else this.gripResolved = b.grip;
    this.gripEither = skin.grip === "either";
    this.rangeLabel = this.isRanged ? `Range ${this.range}` : (this.reach ? `Reach ${this.reach}` : "Melee");
  }
}

/* ------------------------------------------------------------------ */
/*  Shared "arts" array for martials and spells                        */
/* ------------------------------------------------------------------ */
function artsField(types, withSchool = false) {
  const fields = {
    name: new StringField({ required: true, blank: true, initial: "" }),
    type: new StringField({ required: true, initial: types[0], choices: types }),
    cx: int(0),
    text: new StringField({ required: false, blank: true, initial: "" }),
    extra: new StringField({ required: false, blank: true, initial: "" }),   // Soul Break form (martials)
    tier: int(1, 1)
  };
  fields.school = withSchool
    ? new StringField({ required: true, initial: "Generic", choices: Object.keys(SPELL_SCHOOLS) })
    : new StringField({ required: false, blank: true, initial: "" });        // martial school name (Ice, Steel...)
  return new ArrayField(new SchemaField(fields));
}

/* ------------------------------------------------------------------ */
/*  Martial (a built technique: 1 Core + Modifiers/On Hits + Soul Break) */
/* ------------------------------------------------------------------ */
export class MartialData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      group: new StringField({ required: true, initial: "sword", choices: Object.keys(MARTIAL_GROUPS) }),
      schools: int(1, 1),            // number of schools used (same weapon only)
      schoolNames: new StringField({ required: false, blank: true }),
      arts: artsField(MARTIAL_ART_TYPES),
      damage: new StringField({ required: false, blank: true, initial: "" }), // extra damage formula, e.g. @ml*5
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    this.groupLabel = MARTIAL_GROUPS[this.group]?.label ?? this.group;
    this.talentName = MARTIAL_GROUPS[this.group]?.talent;
    this.baseCx = this.arts.reduce((t, a) => t + (a.cx ?? 0), 0);
    // Schools used: counted from the arts' schools when they have them (library arts do), else the manual number.
    const named = [...new Set(this.arts.map(a => a.school).filter(Boolean))];
    this.schoolList = named;
    this.schoolCount = named.length ? named.length : this.schools;
    this.totalCx = this.baseCx * this.schoolCount;
    this.hasTier2 = this.arts.some(a => a.tier === 2);
    // 4 aura per complexity; complexity 1 costs 1 aura.
    this.aura = this.totalCx <= 1 ? this.totalCx : this.totalCx * 4;
    // Action cost increases by 1 for every 40 aura.
    this.actions = 1 + Math.floor(this.aura / 40);
    this.coreCount = this.arts.filter(a => a.type === "Core").length;
  }
}

/**
 * Pull the damage dice out of a spell part's text (base form, before "Conditional:").
 * "dealing SLd4 damage" -> (@sl)d4; "(SL*1.5)d4 Fire damage" -> (max(1, floor(@sl*1.5)))d4; "2d6 damage" -> 2d6.
 * Returns "" when the part deals no dice damage.
 */
export function artDamage(text = "") {
  const base = String(text).split(/\*?Conditional:?\*?/i)[0];
  const COUNT = "(\\([^)]*\\)|(?:SL|Lv)(?:[*/]\\d+(?:\\.\\d+)?)?|\\d+)";
  const m = base.match(new RegExp(`${COUNT}d(\\d+)\\s*(?:[A-Za-z]+\\s+){0,2}damage`, "i"))
    ?? base.match(new RegExp(`(?:deal(?:s|ing)?|takes?)\\s+${COUNT}d(\\d+)`, "i"));
  if (!m) return "";
  let count = m[1].replace(/^\(|\)$/g, "");
  if (/^\d+$/.test(count)) return `${count}d${m[2]}`;
  count = count.replace(/\bSL\b/gi, "@sl").replace(/\bLv\b/gi, "@level");
  if (!/^[@\w\s*/+\-.]+$/.test(count)) return "";
  const n = /^@\w+$/.test(count) ? count : `max(1, floor(${count}))`;
  return `(${n})d${m[2]}`;
}

/* ------------------------------------------------------------------ */
/*  Spell (Projection + Arts + optional Conditional)                   */
/* ------------------------------------------------------------------ */
export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      arts: artsField(SPELL_ART_TYPES, true),
      damage: new StringField({ required: false, blank: true, initial: "" }), // e.g. (@sl)d6
      area: new BooleanField({ initial: false }),     // line/cone/non-X target: targets roll over Evasion for half
      cantrip: new BooleanField({ initial: false }),
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    const schools = [...new Set(this.arts.map(a => a.school).filter(s => s && s !== "Generic"))];
    this.schoolList = schools;
    this.schoolCount = schools.length;
    this.focused = schools.length <= 1;
    this.multiplier = Math.max(1, schools.length);
    this.baseCx = this.arts.reduce((t, a) => t + (a.cx ?? 0), 0);
    this.totalCx = this.baseCx * this.multiplier;
    this.mana = this.cantrip ? 0 : this.totalCx * 4;
    // Same as martials: 1 action, +1 for every 40 mana (cantrips cost 0).
    this.actions = this.cantrip ? 0 : 1 + Math.floor(this.mana / 40);
    this.hasProjection = this.arts.some(a => a.type === "Projection");
    this.touch = this.arts.some(a => a.type === "Projection" && /touch/i.test(a.name));
    this.damageTypes = schools.map(s => `${s}: ${SPELL_SCHOOLS[s]?.damage}`).join("; ");
    this.schoolLabel = schools.length ? schools.join(" + ") : "Generic";
    this.tier2Schools = [...new Set(this.arts.filter(a => a.tier === 2).map(a => a.school))];
    // Damage: the Damage field if filled in, otherwise every part's damage dice added together.
    this.autoDamage = this.arts.map(a => artDamage(a.text)).filter(Boolean).join(" + ");
    this.damageFormula = this.damage?.trim() || this.autoDamage;
  }
}

/* ------------------------------------------------------------------ */
/*  Armor and shields                                                  */
/* ------------------------------------------------------------------ */
export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      armorClass: new StringField({ required: true, initial: "light", choices: Object.keys(ARMOR_CLASSES) }),
      skin: new StringField({ required: true, initial: "Basic" }),
      // From materials (Blacksmithing Step 7), entered by hand.
      hardnessBonus: sint(0),
      durable: sint(0),
      complexity: int(0),
      brittle: int(0),
      hp: new SchemaField({ value: int(0) }),
      equipped: new BooleanField({ initial: false }),
      rarity: new StringField({ required: false, blank: true, initial: "Common" }),
      grade: new StringField({ required: false, blank: true, initial: "basic" }),
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    const c = ARMOR_CLASSES[this.armorClass] ?? ARMOR_CLASSES.light;
    let skin = ARMOR_SKIN_BY_NAME[this.skin];
    if (!skin || !skin.fits.includes(this.armorClass)) skin = ARMOR_SKIN_BY_NAME.Basic;
    this.classData = c;
    this.classLabel = c.label;
    this.isShield = c.shield;
    this.skinData = skin;
    this.skinName = skin.name;
    this.hpMax = Math.max(0, c.hp + skin.hp + this.durable * 5);
    this.broken = this.hp.value <= 0;
    // Material Hardness is added to the class Hardness; each point of Brittle lowers it by 2 (min 0).
    this.hardnessBase = c.hardness + this.hardnessBonus;
    this.hardness = Math.max(0, this.hardnessBase - 2 * this.brittle);
    this.hardnessVs = skin.hardnessVs;
    this.defense = c.defense + skin.defense;     // lowers the wearer's Defense
    this.evasion = c.evasion + skin.evasion;     // raises the wearer's Evasion
    this.bulk = c.bulk + Math.floor(this.complexity / 10);
    this.rank = Math.floor(this.complexity / 5);
    this.requirement = skin.mat ? `${c.req} + ${skin.mat}` : c.req;
  }
}

/* ------------------------------------------------------------------ */
/*  Materials (Blacksmithing materials, Alchemy reagents, Cooking ingredients) */
/* ------------------------------------------------------------------ */
export const CRAFTS = { blacksmithing: "Blacksmithing material", alchemy: "Alchemy reagent", cooking: "Cooking ingredient" };
export class MaterialData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      craft: new StringField({ required: true, initial: "blacksmithing", choices: Object.keys(CRAFTS) }),
      category: new StringField({ required: false, blank: true }),   // Metal, Wood, Mushroom, Meat...
      rarity: new StringField({ required: false, blank: true, initial: "Common" }),
      tier: int(1, 0),
      grade: new StringField({ required: false, blank: true, initial: "basic" }),
      quantity: int(1),
      summary: new StringField({ required: false, blank: true }),
      attributes: new StringField({ required: false, blank: true }),
      values: new ObjectField(),
      description: new HTMLField({ required: false, blank: true })
    };
  }
  prepareDerivedData() { this.craftLabel = CRAFTS[this.craft] ?? this.craft; }
}
