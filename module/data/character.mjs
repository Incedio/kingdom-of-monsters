import { KOM } from "../config.mjs";

const { NumberField, StringField, SchemaField, HTMLField, BooleanField } = foundry.data.fields;

const int = (initial = 0, min = 0) =>
  new NumberField({ required: true, integer: true, min, initial });

function pool(extra = {}) {
  return new SchemaField({
    value: int(0),          // current
    bonus: int(0, -999),    // flat bonus from talents/items (manual for now)
    levelups: int(0),       // total rolled on level-up dice so far
    ...extra
  });
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const stats = {};
    for (const s of KOM.stats) stats[s] = int(KOM.CREATION.statStart);

    return {
      level: int(1, 1),
      xp: int(0),
      // One entry per level-up done with the Level up button (for Undo).
      levelLog: new foundry.data.fields.ArrayField(new foundry.data.fields.ObjectField()),
      size: new StringField({ required: true, initial: "medium", choices: Object.keys(KOM.sizes) }),
      // Chosen at creation: mana regen stat (the other becomes the magic damage stat)
      manaStat: new StringField({ required: true, initial: "int", choices: ["int", "wis"] }),
      auraStat: new StringField({ required: true, initial: "end", choices: ["end", "con"] }),
      stats: new SchemaField(stats),
      hp: pool(),
      mana: pool(),
      aura: pool(),
      soul: pool(),
      durability: new SchemaField({ bonus: int(0, -999) }),
      reflex: new SchemaField({ bonus: int(0, -999) }),
      // armor + other modifiers applied inside the 100 - (...) formulas
      defenseMods: int(0, -999),
      evasionMods: int(0, -999),
      naturalArmor: new SchemaField({ value: int(0), max: int(0) }),
      // Resistance pools (combat info): halve that type, then the pool soaks it; reset at scene end.
      resistances: new foundry.data.fields.ArrayField(new SchemaField({
        type: new StringField({ initial: "" }), max: int(0), value: int(0) })),
      // Weakness: +Value damage from that type, then Value grows by half the damage dealt; resets at scene end.
      weaknesses: new foundry.data.fields.ArrayField(new SchemaField({
        type: new StringField({ initial: "" }), base: int(0), value: int(0) })),
      immunities: new StringField({ initial: "", blank: true }),
      // Condition values (0 = not affected); on/off conditions use 1.
      conditions: new SchemaField(Object.fromEntries(Object.keys(KOM.CONDITIONS).map(k => [k, int(0)]))),
      damageReduction: int(0),
      racialResistUsed: int(0),   // Gargoyle Carved Presence pool spent this scene
      bulkCarried: int(0),
      // Where the character has placed skill points earned from (Any) / racial talents.
      anyAssigned: new SchemaField(Object.fromEntries(
        Object.keys(KOM.skillGroups).filter(k => k !== "perception").map(k => [k, int(0)])
      )),
      // Known arts tab: "group|School" for whole martial schools, art keys for single arts / spells.
      knownSchools: new foundry.data.fields.ArrayField(new StringField()),
      knownArts: new foundry.data.fields.ArrayField(new StringField()),
      extraKnown: int(0),
      notes: new HTMLField({ required: false, blank: true })
    };
  }

  /** Derived values. Everything here is read-only on the sheet. */
  prepareDerivedData() {
    const C = KOM.CREATION;
    const s = this.stats;
    const race = this.parent?.items?.find(i => i.type === "race")?.system;

    // ---- Point buy ----
    // ---- Level / tier / XP ----
    const lvl = this.level;
    const tier = KOM.tierOf(lvl);
    this.tier = tier.tier;
    this.xpNeeded = tier.xp;
    this.xpReady = this.xp >= tier.xp && lvl < KOM.LEVELS.maxLevel;
    this.nextIsEvolution = KOM.LEVELS.evolutionLevels.includes(lvl + 1);

    const spent = KOM.stats.reduce((t, k) => t + s[k], 0);
    const statTotal = C.pointBuy + (lvl - 1);   // +1 stat point per level
    this.pointBuy = {
      spent,
      total: statTotal,
      remaining: statTotal - spent,
      over: {}
    };
    for (const k of KOM.stats) {
      const max = race?.maxes?.[k];
      this.pointBuy.over[k] = (max !== undefined) && s[k] > max;
    }

    // ---- Attributes: race base + stats + level-ups + bonus ----
    const sum = keys => keys.reduce((t, k) => t + s[k], 0);
    const attr = (key, statKeys) => {
      const base = race?.attributes?.[key] ?? 0;
      return { base, fromStats: sum(statKeys) };
    };
    const raceName = this.parent?.items?.find(i => i.type === "race")?.name ?? "";
    this.raceName = raceName;
    for (const key of ["hp", "mana", "aura", "soul"]) {
      const a = attr(key, C[key]);
      const p = this[key];
      p.base = a.base;
      p.fromStats = a.fromStats;
      p.racial = 0;
      p.racialNote = "";
      // Mandrake racial buff: "Your mana is equal to 50+Int+(Wis*1.5)" (replaces race Mana + Int + Wis).
      if (key === "mana" && raceName === "Mandrake") {
        p.base = 50;
        p.fromStats = s.int + Math.floor(s.wis * 1.5);
        p.racialNote = "50 + Int + Wis x1.5 (Mandrake)";
      }
      // Zombie racial buff: "Gain bonus mana equal to your Con every level".
      if (key === "mana" && raceName === "Zombie") {
        p.racial = s.con * lvl;
        p.racialNote = `+ Con x level = ${p.racial} (Zombie)`;
      }
      // HP + Con, Mana + mana regen stat, Aura + End for every level after the first.
      const per = KOM.LEVELS.statPerLevel[key];
      const perStat = per === "manaStat" ? this.manaStat : per;
      p.perLevel = per ? (s[perStat] ?? 0) * (lvl - 1) : 0;
      p.perLevelStat = per ? KOM.statLabels[perStat] : "";
      p.max = p.base + p.fromStats + p.perLevel + p.racial + p.levelups + p.bonus;
    }
    // Gargoyle racial buff: natural armor equal to max mana / 5.
    this.naturalArmorNote = "";
    if (raceName === "Gargoyle") {
      this.naturalArmor.max = Math.floor(this.mana.max / 5);
      this.naturalArmor.value = Math.min(this.naturalArmor.value, this.naturalArmor.max);
      this.naturalArmorNote = "max mana / 5 (Gargoyle)";
    }

    const dur = attr("durability", C.durability);
    this.durability.base = dur.base;
    this.durability.fromStats = dur.fromStats;
    this.durability.value = dur.base + dur.fromStats + this.durability.bonus;

    const ref = attr("reflex", C.reflex);
    this.reflex.base = ref.base;
    this.reflex.fromStats = ref.fromStats;
    this.reflex.value = ref.base + ref.fromStats + this.reflex.bonus;

    // ---- Worn armor and shield (broken pieces give nothing) ----
    const items = this.parent?.items ?? [];
    const worn = items.filter(i => i.type === "armor" && i.system.equipped && !i.system.broken);
    const suit = worn.find(i => !i.system.isShield) ?? null;
    const shield = worn.find(i => i.system.isShield) ?? null;
    this.armorDefense = (suit?.system.defense ?? 0);
    this.armorEvasion = (suit?.system.evasion ?? 0);
    this.shieldDefense = (shield?.system.defense ?? 0);
    this.shieldEvasion = (shield?.system.evasion ?? 0);
    this.wornArmorId = suit?.id ?? null;
    this.wornShieldId = shield?.id ?? null;

    // ---- Resistances: stored pools + Gargoyle's Carved Presence physical resistance ----
    // Corroded: all resistances -2 per point (minimum 0).
    const corr = 2 * (this.conditions.corroded ?? 0);
    this.resistList = this.resistances.map((r, i) => ({ ...r, index: i, value: Math.max(0, r.value - corr) }));
    this.racialResist = null;
    if (raceName === "Gargoyle") {
      const cp = items.find(i => i.type === "talent" && i.name === "Carved Presence");
      const lvlCP = cp ? (cp.system.rank + cp.system.grantedRank) : 0;
      if (lvlCP > 0) {
        const active = this.naturalArmor.value > 0;
        this.racialResist = { type: "Physical", max: lvlCP, value: Math.max(0, lvlCP - this.racialResistUsed), racial: true, active,
          note: `Carved Presence ${lvlCP} (Gargoyle)${active ? "" : ", off: no natural armor"}` };
        if (active) this.resistList.push({ ...this.racialResist, value: Math.max(0, this.racialResist.value - corr) });
      }
    }
    this.immunityList = this.immunities.split(/[,;]/).map(t => t.trim()).filter(Boolean);

    // ---- Defense / Evasion (lower = harder to hit) ----
    // Armor lowers Defense and raises Evasion by its class values; shields stack with armor.
    // Basilisk: "While you have natural armor your Defense equation is 75-Modifiers".
    // Beast Kin: "Your Evasion while not wearing armor is 75-Modifiers" (a shield isn't armor).
    this.defenseBase = C.defenseBase;
    this.evasionBase = C.evasionBase;
    this.defenseNote = "";
    this.evasionNote = "";
    if (raceName === "Basilisk" && this.naturalArmor.value > 0) { this.defenseBase = 75; this.defenseNote = "Basilisk, has natural armor"; }
    if (raceName === "Beast Kin" && !suit) { this.evasionBase = 75; this.evasionNote = "Beast Kin, no armor"; }
    const cd = this.conditions;
    // Marked: Defense +2/pt. Hunted: Evasion +2/pt. Finally: both +2/pt (higher = easier to hit).
    this.condDefense = 2 * cd.marked + 2 * cd.finally;
    this.condEvasion = 2 * cd.hunted + 2 * cd.finally;
    this.defense = this.defenseBase - (this.durability.value + this.defenseMods + this.armorDefense + this.shieldDefense) + this.condDefense;
    this.evasion = this.evasionBase - (this.reflex.value + this.evasionMods) + this.armorEvasion + this.shieldEvasion + this.condEvasion;

    // ---- Regen (Prepping Stage) ----
    this.manaRegen = s[this.manaStat];
    this.magicDamageStat = this.manaStat === "int" ? "wis" : "int";
    this.magicDamage = s[this.magicDamageStat];
    // Exhausted: aura regeneration -Value (can go below 0).
    this.auraRegen = s[this.auraStat] - (this.conditions.exhausted ?? 0);

    // ---- Combat numbers (combat info) ----
    const higher = Math.max(s.end, s.will);
    const actionScore = s.spd + higher;
    this.actions = 3 + (actionScore >= 40 ? 1 : 0) + (actionScore >= 70 ? 1 : 0);
    this.attackCount = Math.floor(s.spd / 8) + 1;
    this.reactions = 1 + Math.floor(s.spd / 8);
    this.overland = 6 + Math.floor(s.spd / 8);
    this.swim = Math.floor(this.overland / 4);
    this.holdBreath = Math.floor((s.con + s.end) / 2);

    // ---- Condition effects on combat numbers ----
    const cn = this.conditions;
    this.condNotes = [];
    // Flow: +1 attack count per 12 (Strikes per 4 are martial-only, shown as a note).
    if (cn.flow) { this.attackCount += Math.floor(cn.flow / 12); this.condNotes.push(`Flow: ${Math.floor(cn.flow / 4)} Strike(s)`); }
    // Petrifying: -1 action per point; at 0 actions Defense -100.
    if (cn.petrifying) {
      this.actions = Math.max(0, this.actions - cn.petrifying);
      if (this.actions === 0) { this.defense -= 100; this.condNotes.push("Petrified: Defense -100, no Evasion saves"); }
    }
    // Movement: Frosting -1/pt, Rotting -1 per 2, Broken Limb 15+ halves, Prone halves overland.
    let move = this.overland - cn.frosting - Math.floor(cn.rotting / 2);
    if (cn.brokenLimb >= 15) move = Math.floor(move / 2);
    if (cn.prone) move = Math.floor(move / 2);
    this.overland = Math.max(0, move);
    this.swim = Math.floor(this.overland / 4);
    if (cn.frosting && this.overland === 0) this.condNotes.push("Frosting: 0 movement, every action goes to the cure check");
    // Accuracy: Stunned -2/pt, Broken Limb -2/pt, Rotting -1/pt (Blind is handled per attack).
    this.accuracyPenalty = 2 * cn.stunned + 2 * cn.brokenLimb + cn.rotting;
    // Sickened: its Tn -3 per point (checks and attacks).
    this.tnPenalty = 3 * cn.sickened;
    // Crit ranges: Cursed widens your crit-fail range, Doomed widens attackers' crit range vs you.
    this.fumbleMin = 95 - Math.floor(cn.cursed / 2);
    this.critAgainst = Math.floor(cn.doomed / 2);
    if (cn.brokenLimb >= 25) this.reactions = 0;

    // ---- Bulk (Skills doc) ----
    const sizeBonus = KOM.sizeBulkBonus[this.size] ?? 0;
    this.bulkLimit = s.str + s.end + sizeBonus;
    this.bulkState = this.bulkCarried > this.bulkLimit * 2 ? "over-double"
      : this.bulkCarried > this.bulkLimit ? "over" : "ok";

    // ---- Skill group bases ----
    this.skillGroups = {};
    for (const [key, g] of Object.entries(KOM.skillGroups)) {
      const base = sum(g.stats);
      this.skillGroups[key] = {
        label: g.label,
        base,
        easy: C.checkBands.easy + base,
        normal: C.checkBands.normal + base,
        hard: C.checkBands.hard + base
      };
    }

    // ---- Stat check Tns ----
    this.statChecks = {};
    for (const k of KOM.stats) {
      this.statChecks[k] = {
        easy: C.checkBands.easy + s[k],
        normal: C.checkBands.normal + s[k],
        hard: C.checkBands.hard + s[k]
      };
    }

    // ---- Skill counts per group (cap 6) and skill points ----
    // Each talent rank gives 1 skill point to the talent's skill group.
    // (Any) talents and racial talents give points placed by the player (anyAssigned).
    // Perception instead gets 5 points per level.
    const skills = this.parent?.items?.filter(i => i.type === "skill") ?? [];
    const allTalents = this.parent?.items?.filter(i => i.type === "talent") ?? [];
    const earned = Object.fromEntries(Object.keys(this.skillGroups).map(k => [k, 0]));
    let anyPool = 0;
    for (const t of allTalents) {
      const r = (t.system.rank ?? 0) + (t.system.grantedRank ?? 0);
      const g = t.system.skillGroup;
      if (t.system.racial || g === "any" || !(g in earned)) anyPool += r;
      else earned[g] += r;
    }
    let anyAssignedTotal = 0;
    for (const key of Object.keys(this.skillGroups)) {
      const g = this.skillGroups[key];
      const mine = skills.filter(i => i.system.group === key);
      g.count = mine.length;
      g.cap = C.skillsPerGroup;
      g.full = mine.length >= C.skillsPerGroup;
      g.spent = mine.reduce((t, i) => t + (i.system.bonus ?? 0), 0);
      if (key === "perception") {
        g.fromTalents = this.level * 5;
        g.anyAssigned = 0;
      } else {
        g.fromTalents = earned[key];
        g.anyAssigned = this.anyAssigned[key] ?? 0;
        anyAssignedTotal += g.anyAssigned;
      }
      g.earned = g.fromTalents + g.anyAssigned;
      g.remaining = g.earned - g.spent;
      g.over = g.remaining < 0;
    }
    this.anyPoints = { total: anyPool, assigned: anyAssignedTotal, remaining: anyPool - anyAssignedTotal };

    // ---- Talent points: 15 at level 1, + ranks per level by tier, + free off-tree ranks ----
    const talents = this.parent?.items?.filter(i => i.type === "talent") ?? [];
    const ranksSpent = talents.reduce((t, i) => t + (i.system.rank ?? 0), 0);
    let rankTotal = C.talentPoints;
    for (let l = 2; l <= lvl; l++) rankTotal += KOM.tierOf(l).ranks;
    const free = KOM.LEVELS.freeRanks.filter(l => l <= lvl).length;
    rankTotal += free;
    this.talentPoints = {
      spent: ranksSpent,
      total: rankTotal,
      free,
      remaining: rankTotal - ranksSpent,
      overCap: talents.filter(i => (i.system.rank + i.system.grantedRank) > i.system.maxRank).map(i => i.name)
    };
  }
}
