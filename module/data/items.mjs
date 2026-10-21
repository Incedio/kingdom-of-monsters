import { KOM } from "../config.mjs";

const { NumberField, StringField, SchemaField, HTMLField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
const int = (initial = 0, min = 0) => new NumberField({ required: true, integer: true, min, initial });

export class RaceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const maxes = {};
    for (const s of KOM.stats) maxes[s] = int(0);
    return {
      size: new StringField({ required: true, initial: "medium", choices: Object.keys(KOM.sizes) }),
      maxes: new SchemaField(maxes),
      attributes: new SchemaField({
        hp: int(0), mana: int(0), aura: int(0),
        soul: int(0), durability: int(0), reflex: int(0)
      }),
      racialTalent: new StringField({ required: false, blank: true }),
      buff: new HTMLField({ required: false, blank: true }),
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    this.maxTotal = KOM.stats.reduce((t, k) => t + this.maxes[k], 0);
    this.attrTotal = Object.values(this.attributes).reduce((t, v) => t + v, 0);
  }
}

export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      tree: new StringField({ required: true, initial: "Generic", choices: KOM.talentTrees }),
      skillGroup: new StringField({ required: true, initial: "any",
        choices: ["any", ...Object.keys(KOM.skillGroups)] }),
      tags: new StringField({ required: false, blank: true }), // e.g. "Class", "Tier 2"
      rank: int(0),                       // ranks bought with talent points
      grantedRank: int(0),                // ranks granted by a racial talent (free)
      maxRank: int(10, 1),
      racial: new BooleanField({ initial: false }),
      // ---- racial talent extras ----
      race: new StringField({ required: false, blank: true }),
      multiPath: new BooleanField({ initial: false }),   // Goblin / Zombie: all paths at once
      pathOrder: new ArrayField(new StringField()),
      paths: new ObjectField(),                           // path name -> html
      path: new StringField({ required: false, blank: true }),
      fullOptions: new ArrayField(new StringField()),
      halfOptions: new ArrayField(new StringField()),
      halfByPath: new ObjectField(),                      // path -> [options]
      fullChoice: new StringField({ required: false, blank: true }),
      halfChoice: new StringField({ required: false, blank: true }),
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    this.totalRank = this.rank + this.grantedRank;
    this.overCap = this.totalRank > this.maxRank;
    // Which half-grant options apply right now
    this.halfChoices = this.multiPath || !Object.keys(this.halfByPath).length
      ? this.halfOptions
      : (this.halfByPath[this.path] ?? []);
    this.fullChoices = this.fullOptions;
    this.currentFull = this.fullChoices.length === 1 ? this.fullChoices[0] : this.fullChoice;
    this.currentHalf = this.halfChoices.length === 1 ? this.halfChoices[0] : this.halfChoice;
    this.pathText = this.multiPath
      ? this.pathOrder.map(p => `<h4>${p}</h4>${this.paths[p] ?? ""}`).join("\n")
      : (this.paths[this.path] ?? "");
  }
}

export class SkillData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      group: new StringField({ required: true, initial: "adventure",
        choices: Object.keys(KOM.skillGroups) }),
      bonus: int(0),
      passive: new BooleanField({ initial: false }), // Perception skills chosen as passive
      description: new HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    // Items are prepared before the actor's derived data, so read the raw stats directly.
    const stats = this.parent?.parent?.system?.stats;
    const groupStats = KOM.skillGroups[this.group]?.stats ?? [];
    const base = stats ? groupStats.reduce((t, k) => t + (stats[k] ?? 0), 0) : 0;
    const bands = KOM.CREATION.checkBands;
    this.creationBonus = KOM.CREATION.skillCreationBonus;
    this.totalBonus = this.bonus + this.creationBonus;
    this.base = base;
    this.easy = bands.easy + base + this.totalBonus;
    this.normal = bands.normal + base + this.totalBonus;
    this.hard = bands.hard + base + this.totalBonus;
    this.passiveScore = this.normal; // Tn an enemy must roll under; refine later
  }
}
