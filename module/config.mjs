/**
 * Kingdom of Monsters - rules config.
 * CREATION values confirmed by the creator on 2026-10-19:
 * 45 points, stats start at 0 (free form within race maxes),
 * stat checks use the easy/normal/hard bands (75/50/25) + stat,
 * base attack count = Spd/8 + 1.
 */
export const KOM = {};

KOM.stats = ["str", "con", "agi", "int", "wis", "will", "spd", "end"];
KOM.statLabels = {
  str: "Str", con: "Con", agi: "Agi", int: "Int",
  wis: "Wis", will: "Will", spd: "Spd", end: "End"
};

KOM.CREATION = {
  pointBuy: 45,
  statStart: 0,
  // Talent points at level 1 and max ranks in one talent.
  talentPoints: 15,
  talentMaxRank: 10,
  // Stat check bands (roll d100 under band + stat).
  checkBands: { easy: 75, normal: 50, hard: 25 },
  // Every created skill gets +5 once; each group holds at most 6 skills (Perception: pick 6 of 8).
  skillCreationBonus: 5,
  skillsPerGroup: 6,
  // Level 1 attribute formulas from the Primary Doc "Attributes" section.
  // race value + the listed stats.
  hp:         ["con", "will"],
  mana:       ["int", "wis"],
  aura:       ["str", "agi"],
  soul:       ["will"],
  durability: ["end", "con"],
  reflex:     ["agi", "spd"],
  // Defense = 100 - (Durability + armor + mods); Evasion = 100 - (Reflex + armor + mods)
  defenseBase: 100,
  evasionBase: 100
};

/**
 * Leveling (user rulings; the level up section of the docs isn't written yet).
 * Tiers: 1 = levels 1-10, 2 = 11-25, 3 = 26-45. XP per level 10 / 15 / 20.
 * Talent ranks per level 5 / 7 / 9 (max 3 / 5 / 7 into one talent per level).
 * Free off-tree ranks at levels 3, 6, 9 (tier 1) and 14, 19, 24 (tier 2).
 * Each level: roll d6, d8, d10, d12 (minimums 3 / 4 / 5 / 6), assign one to each of HP, Mana, Aura, Soul;
 * +1 stat point; HP also gains Con, Mana the mana regen stat, Aura End, per level after the first.
 */
KOM.LEVELS = {
  tiers: [
    { tier: 1, from: 1,  to: 10, xp: 10, ranks: 5, perTalent: 3 },
    { tier: 2, from: 11, to: 25, xp: 15, ranks: 7, perTalent: 5 },
    { tier: 3, from: 26, to: 45, xp: 20, ranks: 9, perTalent: 7 }
  ],
  maxLevel: 45,
  freeRanks: [3, 6, 9, 14, 19, 24],
  evolutionLevels: [11, 26],
  dice: [{ faces: 6, min: 3 }, { faces: 8, min: 4 }, { faces: 10, min: 5 }, { faces: 12, min: 6 }],
  statPerLevel: { hp: "con", mana: "manaStat", aura: "end" }
};
KOM.tierOf = level => KOM.LEVELS.tiers.find(t => level <= t.to) ?? KOM.LEVELS.tiers.at(-1);

/**
 * Conditions (combat info). value: true = has a number (stacks); false = on/off.
 * cure: Recovery Stage check { stats, band, perFive } (perFive = lower by 1 per 5 under the Tn, otherwise it ends).
 */
const I = n => `icons/svg/${n}.svg`;
KOM.CONDITIONS = {
  attraction:  { label: "Attraction",   img: I("eye"),          value: false, note: "Drawn to the creature that applied it (talents like Smooth Talker use it)." },
  bleed:       { label: "Bleed",        img: I("blood"),        value: true,  cure: { stats: ["con"], band: "normal", perFive: true },
                 note: "Lose X hp each action (Bleed resistance soaks it instead; at 0 hp lose aura). Recovery: lower by Bleed resistance, or +1 with none." },
  blind:       { label: "Blind",        img: I("blind"),        value: true,  cure: { stats: ["end"], band: "normal", perFive: true },
                 note: "Accuracy bonus not from stats is negated; ranged attacks pick a random target. End of turn: remove half (2 or less ends)." },
  brokenLimb:  { label: "Broken Limb",  img: I("downgrade"),    value: true,  note: "-2 accuracy per point. 10: one arm, 15: movement halved, 20: Bleed 2x (can't be lowered), 25: Stunned = value, no reactions." },
  charmed:     { label: "Charmed",      img: I("holy-shield"),  value: false, note: "Half dice vs whoever charmed you; +2 dice vs anyone who damages them." },
  corroded:    { label: "Corroded",     img: I("acid"),         value: true,  cure: { stats: ["end"], band: "normal", perFive: true },
                 note: "All resistances -2 per point. Start of turn: natural armor loses 1d4 per point (armor HP if none). Natural armor can't regenerate." },
  cursed:      { label: "Cursed",       img: I("sun"),          value: true,  cure: { stats: ["wis"], band: "normal", perFive: true },
                 note: "Damage you deal -2 per point; crit fail range +half the value." },
  doomed:      { label: "Doomed",       img: I("skull"),        value: true,  cure: { stats: ["will"], band: "normal", perFive: true },
                 note: "Damage you take +2 per point; attacks crit you on a range increased by half the value." },
  electrified: { label: "Electrified",  img: I("lightning"),    value: true,  note: "Taking electricity damage adds 1d6 per point electricity damage (chains to other Electrified within Value burst). End of turn: remove half." },
  enraged:     { label: "Enraged",      img: I("fire-shield"),  value: false, note: "Must attack the closest living creature; can't cast magic." },
  exhausted:   { label: "Exhausted",    img: I("sleep"),        value: true,  note: "Aura regeneration -Value (below 0 = lose aura in the Prepping Stage)." },
  feared:      { label: "Feared",       img: I("terror"),       value: true,  note: "Can't move closer to the source; moves at least Value squares away; -3 accuracy per point vs the source." },
  finally:     { label: "Finally",      img: I("target"),       value: true,  note: "Defense and Evasion +2 per point (easier to hit); crits on it always deal max damage." },
  flammable:   { label: "Flammable",    img: I("degen"),        value: true,  note: "Fire damage +2x Value, then Value doubles; all removed at the end of that attack." },
  flow:        { label: "Flow",         img: I("regen"),        value: true,  note: "1 Strike per 4, +1 attack count per 12; 2 aura per point when landing 4+ attack counts. Removed at end of turn." },
  frosting:    { label: "Frosting",     img: I("ice-shield"),   value: true,  cure: { stats: ["str", "will"], band: "normal", perFive: true },
                 note: "Movement -1 square per point. At 0 movement, spend every action on the cure check." },
  frozen:      { label: "Frozen",       img: I("frozen"),       value: false, note: "Can't act, auto-hit. Physical or fire damage ends it and that damage is a crit (doubled)." },
  furious:     { label: "Furious",      img: I("upgrade"),      value: true,  note: "+2 damage per stack on your next melee attack (used up); 10+ gives Enraged." },
  grappled:    { label: "Grappled",     img: I("net"),          value: false, note: "No Evasion; can't move away, cast, or use cleave/reach/range weapons (see Grappling)." },
  grimWound:   { label: "Grim Wound",   img: I("degen"),        value: true,  note: "Takes +Value damage from any attack (+2x Value from Bleed or Rotting damage)." },
  hunted:      { label: "Hunted",       img: I("target"),       value: true,  note: "Evasion +2 per point (easier to hit with ranged)." },
  inferno:     { label: "Inferno",      img: I("fire"),         value: true,  note: "Taking fire damage gives every creature within burst Value Molten and Flammable equal to Value." },
  invisibility:{ label: "Invisibility", img: I("invisible"),    value: false, note: "-50 to perceive it except by sound or touch; gains Stealth. Ends at the end of the caster's turn." },
  marked:      { label: "Marked",       img: I("target"),       value: true,  note: "Defense +2 per point (easier to hit in melee)." },
  molten:      { label: "Molten",       img: I("fire"),         value: true,  note: "Takes +1d4 fire damage per point from every fire damage source." },
  onFire:      { label: "On Fire",      img: I("fire"),         value: true,  cure: { stats: ["agi"], band: "normal", perFive: true },
                 note: "Prepping Stage and start of turn: 2d6 + 1d4 per point fire damage. Water (overland) or a Water force spell ends it." },
  petrifying:  { label: "Petrifying",   img: I("paralysis"),    value: true,  cure: { stats: ["con"], band: "normal", perFive: true },
                 note: "-1 action per point. With no actions: Defense -100, no Evasion saves, can't act." },
  prone:       { label: "Prone",        img: I("falling"),      value: false, note: "Overland movement halved; ending it costs a movement action." },
  rotting:     { label: "Rotting",      img: I("biohazard"),    value: true,  cure: { stats: ["con"], band: "hard", perFive: true, undeadNormal: true },
                 note: "End of turn: 1d6 Death per 3 points (min 1d6), then +1. Movement -1 per 2, accuracy -1 per point, healing halved." },
  show:        { label: "Show",         img: I("eye"),          value: true,  note: "Called shot penalty -3 per point; +3 each called shot landed. End of turn: remove half." },
  sickened:    { label: "Sickened",     img: I("poison"),       value: true,  note: "Its Tn -3 per point (checks and attacks)." },
  stealth:     { label: "Stealth",      img: I("mole"),         value: false, note: "Can deal stealth damage; lost after an attack action or when noticed." },
  stunned:     { label: "Stunned",      img: I("daze"),         value: true,  cure: { stats: ["end"], band: "normal", perFive: true },
                 note: "Accuracy -2 per point." },
  taunted:     { label: "Taunted",      img: I("terror"),       value: true,  note: "-5 accuracy per point vs anyone but the source." },
  turnToIce:   { label: "Turn to Ice",  img: I("frozen"),       value: true,  note: "Takes +1d4 per point Blunt and Cold damage. At 10, more becomes Frosting." },
  turbulence:  { label: "Turbulence",   img: I("wingfoot"),     value: false, note: "Above ground: drop a height stage (2 on a crit-failed hard Agi). Ends at turn start on the ground, or 2 actions in the air." }
};

// Skill groups and their three stats (Skills doc).
KOM.skillGroups = {
  adventure:  { label: "Adventure",  stats: ["str", "agi", "end"] },
  social:     { label: "Social",     stats: ["wis", "str", "int"] },
  combat:     { label: "Combat",     stats: ["con", "agi", "spd"] },
  studies:    { label: "Studies",    stats: ["int", "will", "end"] },
  trades:     { label: "Trades",     stats: ["spd", "agi", "wis"] },
  arcane:     { label: "Arcane",     stats: ["int", "wis", "con"] },
  perception: { label: "Perception", stats: ["agi", "wis", "int"] }
};

KOM.perceptionSkills = [
  "Magic detection", "Passive detection", "Search", "Track",
  "Examine", "Martial Examine", "Magic recognition", "Trickery Spotting"
];

KOM.talentTrees = ["Body", "Generic", "Leadership", "Magic", "Martial", "Racial"];

// Size bonus to Bulk limit (Skills doc).
KOM.sizeBulkBonus = { tiny: 0, small: 5, medium: 10, large: 20, huge: 30, colossal: 50 };
KOM.sizes = {
  tiny: "Tiny", small: "Small", medium: "Medium",
  large: "Large", huge: "Huge", colossal: "Colossal"
};
