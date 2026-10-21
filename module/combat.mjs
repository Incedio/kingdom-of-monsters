import { KOM } from "./config.mjs";
import { MARTIAL_GROUPS, SPELL_SCHOOLS, SPELL_MAX_BY_TIER, largestFaces } from "./weapons-data.mjs";

const { DialogV2 } = foundry.applications.api;

/* ---------------- lookups ---------------- */
export function getTalentLevel(actor, name) {
  if (!name) return 0;
  const t = actor.items.find(i => i.type === "talent" && i.name === name);
  return t ? (t.system.rank ?? 0) + (t.system.grantedRank ?? 0) : 0;
}
function raceName(actor) { return actor.items.find(i => i.type === "race")?.name ?? ""; }
function tierOf(level) { return level >= 26 ? 3 : level >= 11 ? 2 : 1; }

/* ---------------- weapons ---------------- */
/** Accuracy, damage stat, base attack cost for a weapon on this actor. */
export function weaponInfo(actor, weapon, gripOverride) {
  const s = actor.system.stats;
  const w = weapon.system;
  const talentLevel = getTalentLevel(actor, w.talentName);
  const race = raceName(actor);
  const grip = gripOverride ?? w.gripResolved;

  // Accuracy (combat info): Heavy Str+Con, Light Str+Agi, Ranged Agi+Spd; + weapon mods + talent level.
  let statAcc, accLabel;
  if (grip === "ranged") { statAcc = s.agi + s.spd; accLabel = "Agi + Spd"; }
  else if (grip === "heavy") {
    if (race === "Ogre") { statAcc = Math.floor(s.str * 1.5) + s.con; accLabel = "Str x1.5 + Con (Ogre)"; }
    else { statAcc = s.str + s.con; accLabel = "Str + Con"; }
  } else { statAcc = s.str + s.agi; accLabel = "Str + Agi"; }
  // Blind: accuracy bonus not from stats is negated. Stunned / Broken Limb / Rotting lower accuracy.
  const blind = (actor.system.conditions?.blind ?? 0) > 0;
  const penalty = actor.system.accuracyPenalty ?? 0;
  const accuracy = statAcc + (blind ? 0 : w.accuracyMod + talentLevel) - penalty;
  if (blind) accLabel += " (Blind: no weapon/talent bonus)";
  if (penalty) accLabel += ` - ${penalty} (conditions)`;

  // Damage stat: Str melee, Agi ranged. Goblin: light melee / natural = Str + Agi x1.5.
  let statDmg, dmgLabel;
  if (grip === "ranged") { statDmg = s.agi; dmgLabel = "Agi"; }
  else if (race === "Goblin" && (grip === "light" || w.natural)) { statDmg = s.str + Math.floor(s.agi * 1.5); dmgLabel = "Str + Agi x1.5 (Goblin)"; }
  else { statDmg = s.str; dmgLabel = "Str"; }
  const damageFlat = statDmg + w.damageBonus;

  // Base attack: complexity 1 with at least 1 talent level, otherwise 3. 4 aura per point, 1 aura at complexity 1.
  const baseCx = talentLevel >= 1 ? 1 : 3;
  const baseAura = baseCx === 1 ? 1 : baseCx * 4;
  const maxCx = talentLevel * 3 + 5;

  return { talentLevel, grip, accuracy, accLabel, statDmg, dmgLabel, damageFlat, baseCx, baseAura, maxCx };
}

/* ---------------- martials ---------------- */
export function martialInfo(actor, martial) {
  const m = martial.system;
  const ml = getTalentLevel(actor, m.talentName);
  const maxCx = ml * 3 + 5;
  const channel = m.actions > actor.system.actions;
  const bases = MARTIAL_GROUPS[m.group]?.bases ?? [];
  const weapons = actor.items.filter(i => i.type === "weapon" && i.system.equipped && bases.includes(i.system.base));
  // Tier 2 arts need level 11 in the associated talent.
  const tier2Locked = m.hasTier2 && ml < 11;
  return { ml, maxCx, over: m.totalCx > maxCx, channel, weapons, tier2Locked };
}

/* ---------------- spells ---------------- */
export function spellInfo(actor, spell) {
  const sp = spell.system;
  const levels = sp.schoolList.map(s => getTalentLevel(actor, SPELL_SCHOOLS[s]?.talent));
  const allMagic = Object.values(SPELL_SCHOOLS).filter(v => v.talent).map(v => getTalentLevel(actor, v.talent));
  const highest = Math.max(0, ...allMagic);
  const genericSL = Math.min(Math.floor(allMagic.reduce((a, b) => a + b, 0) / 3), highest);
  let sl;
  if (!levels.length) sl = genericSL;
  else if (levels.length <= 2) sl = Math.max(...levels);   // Dual Spell: highest
  else sl = Math.min(...levels);                            // University Spell: lowest
  const tierCap = SPELL_MAX_BY_TIER[tierOf(actor.system.level)];
  const totalMagic = allMagic.reduce((a, b) => a + b, 0);
  // Max complexity = total talent levels in the Magic tree x3 + 5, capped by tier.
  const maxCx = Math.min(totalMagic * 3 + 5, tierCap);
  const channel = sp.actions > actor.system.actions;
  // Tier 2 spell arts need rank 11 in that school's magic talent.
  const tier2Locked = sp.tier2Schools.filter(sc => getTalentLevel(actor, SPELL_SCHOOLS[sc]?.talent) < 11);
  return { sl, genericSL, totalMagic, maxCx, tierCap, over: sp.totalCx > maxCx, channel, tier2Locked };
}

/* ---------------- stances (movement actions) ---------------- */
export const STANCES = {
  standGround: { id: "kom-stand-ground", name: "Stand your ground", img: "icons/svg/shield.svg",
    note: "Ranged attacks against you roll vs your Defense instead of Evasion" },
  feint: { id: "kom-feint", name: "Feint", img: "icons/svg/daze.svg",
    note: "Melee attacks against you roll vs your Evasion instead of Defense" }
};
export function stanceOf(actor) {
  const st = actor?.statuses;
  if (st?.has(STANCES.standGround.id)) return "standGround";
  if (st?.has(STANCES.feint.id)) return "feint";
  return "";
}
/** Which of the target's numbers an attack rolls against, after Stand your ground / Feint. */
export function defenseFor(actor, ranged) {
  const stance = stanceOf(actor);
  if (ranged) return stance === "standGround"
    ? { key: "defense", label: "Defense (Stand your ground)" } : { key: "evasion", label: "Evasion" };
  return stance === "feint"
    ? { key: "evasion", label: "Evasion (Feint)" } : { key: "defense", label: "Defense" };
}
/** Turn one stance on (the other off), or off if it's already on. Stances end when you take another movement action. */
export async function toggleStance(actor, stance) {
  const turnOn = stanceOf(actor) !== stance;
  for (const [key, s] of Object.entries(STANCES)) {
    await actor.toggleStatusEffect(s.id, { active: turnOn && key === stance });
  }
}

/* ---------------- rolling ---------------- */
function targetActor() { return [...game.user.targets][0]?.actor ?? null; }

function dialogContent({ defLabel, prefill, extra = "" }) {
  return `<div class="kom-dialog">
    <label>Target ${defLabel} <input name="def" type="number" value="${prefill}" placeholder="e.g. 70" autofocus></label>
    <label>Situational accuracy <input name="mod" type="number" value="0"></label>
    ${extra}
  </div>`;
}

/** d100 roll-under with attack count. Returns hit info. */
async function rollToHit(tn, attackCount, critMax = 5, fumbleMin = 95) {
  const roll = await new Roll("1d100").evaluate();
  const r = roll.total;
  const crit = r <= critMax;
  const fumble = r >= fumbleMin;
  const hit = !fumble && (crit || r <= tn);
  let extras = 0;
  if (hit && attackCount >= 2) {
    extras = Math.max(1, Math.floor((tn - r) / 5));   // within 5 still counts as 1 extra
    extras = Math.min(extras, attackCount - 1);
  }
  return { roll, r, hit, crit, fumble, extras, margin: tn - r };
}

function damageFormula(die, dice, flat, extra, { stealth, crit, hit }) {
  let terms = Array(dice).fill(die).join(" + ");
  if (stealth) { const f = largestFaces(die); if (f) terms += ` + 1d${f}`; }
  let f = `${terms}${flat ? ` + ${flat}` : ""}${extra ? ` + (${extra})` : ""}`;
  if (crit) f = `(${f}) * 2`;
  return f;
}

/** Spending Soul (combat info): 1 soul = 10 aura or 5 mana. */
export const SOUL_RATE = { aura: 10, mana: 5 };

/** Soul needed to cover what the pool can't pay (0 if the pool has enough). */
export function soulShortfall(actor, pool, cost) {
  const short = Math.max(0, cost - actor.system[pool].value);
  return { short, soul: Math.ceil(short / SOUL_RATE[pool]) };
}

/** Checkbox for the cast / attack dialog, only shown when the pool can't pay. */
function soulRow(actor, pool, cost) {
  const { short, soul } = soulShortfall(actor, pool, cost);
  if (!short) return "";
  const have = actor.system.soul.value;
  return `<label class="${soul > have ? "bad" : ""}"><input name="soul" type="checkbox"> Short ${short} ${pool}: pay with ${soul} soul
    (1 soul = ${SOUL_RATE[pool]} ${pool}; you have ${have})</label>`;
}

async function spend(actor, pool, cost, useSoul = false) {
  if (!cost) return "";
  const cur = actor.system[pool].value;
  if (cur >= cost) {
    await actor.update({ [`system.${pool}.value`]: cur - cost });
    return `<p>Spent ${cost} ${pool} (${cur} &rarr; ${cur - cost}).</p>`;
  }
  const { short, soul } = soulShortfall(actor, pool, cost);
  const have = actor.system.soul.value;
  if (!useSoul) return `<p class="bad">Not enough ${pool}: needs ${cost}, has ${cur} (not spent). Tick "pay with soul" to cover the ${short} short.</p>`;
  if (soul > have) return `<p class="bad">Not enough ${pool} or soul: short ${short} ${pool} = ${soul} soul, you have ${have} (not spent).</p>`;
  await actor.update({ [`system.${pool}.value`]: 0, "system.soul.value": have - soul });
  return `<p>Spent ${cur} ${pool} (${cur} &rarr; 0) + ${soul} soul for the other ${short} ${pool} (soul ${have} &rarr; ${have - soul}).${have - soul === 0 ? ` <strong class="bad">0 soul: dead!</strong>` : ""}</p>`;
}

/**
 * Over max complexity (spells: hard Arcane check; martials: hard Combat check), Tn minus the complexity.
 * The check is the skill group, or a skill in that group the player made to stand in for it.
 * Fail: 10 Death damage per point over the max (goes through worn and natural armor) and lose all
 * mana (spells) / aura (martials).
 */
function checkRow(actor, group, over) {
  if (!over) return "";
  const g = actor.system.skillGroups[group];
  const skills = actor.items.filter(i => i.type === "skill" && i.system.group === group);
  const opts = [`<option value="">${g.label} group (hard ${g.hard})</option>`,
    ...skills.map(i => `<option value="${i.id}">${i.name} (hard ${i.system.hard})</option>`)].join("");
  return `<label class="bad">Over max complexity: check with <select name="check">${opts}</select></label>`;
}

async function overMaxCheck(actor, { group, pool, cx, maxCx, rolls, check = "" }) {
  const g = actor.system.skillGroups[group];
  const skill = check ? actor.items.get(check) : null;
  const base = skill ? skill.system.hard : g.hard;
  const label = skill ? skill.name : `${g.label} group`;
  const tn = base - cx;
  const roll = await new Roll("1d100").evaluate(); rolls.push(roll);
  const r = roll.total;
  const pass = r <= 5 || (r < 95 && r <= tn);
  const over = cx - maxCx;
  const head = `Over max complexity (${cx} &gt; ${maxCx}): hard ${label} check, Tn ${base} &minus; ${cx} = ${tn}, rolled ${r}`;
  if (pass) return `<p>${head}: it holds.</p>`;
  const lost = actor.system[pool].value;
  await actor.update({ [`system.${pool}.value`]: 0 });
  const dmg = await autoApply(actor, over * 10, { hits: 1, damageType: "Death" });
  return `<p class="bad">${head}: failed! Lose all ${pool} (${lost} &rarr; 0) and take ${over * 10} Death damage (10 x ${over} over).</p>${dmg.html}`;
}

/* ---------------- applying damage ---------------- */
/* Damage groups (combat info). Death is its own type, outside both groups. */
const PHYSICAL = ["crushing", "blunt", "slashing", "piercing"];
const ELEMENTAL = ["fire", "cold", "acid", "poison", "sonic", "force", "electricity", "nether"];
const ALL_TYPES = [...PHYSICAL, ...ELEMENTAL, "death"];
/** "Slashing/Piercing", "Sonic or Force", "Fire: Fire; Air: Sonic or Force" -> ["slashing","piercing",...] */
export function splitTypes(str = "") {
  const lower = String(str).toLowerCase();
  return ALL_TYPES.filter(t => new RegExp(`\\b${t}\\b`).test(lower));
}
/** Does a resistance / weakness / immunity entry ("Fire", "Physical", "Elemental") cover this type? */
function covers(entry, type) {
  const e = String(entry).trim().toLowerCase();
  if (!e || !type) return false;
  if (e === type) return true;
  if (e === "physical") return PHYSICAL.includes(type);
  if (e === "elemental") return ELEMENTAL.includes(type);
  return false;
}

/**
 * What the creature's own defenses do to the damage (no changes made). `types` is one type, or several
 * when the damage counts as all of them at once (Morningstar: Blunt AND Piercing).
 * Order: Immunity -> Weakness (+Value) -> Damage Reduction (not Death) -> Resistance (halve, then the pool soaks it).
 * Only the biggest matching weakness counts; a resistance with an empty pool does nothing.
 * Damage that counts as several types: Weakness to any of them adds; Immunity / Resistance only work if they
 * cover every type (with separate pools, the smallest of them is used).
 */
function bodyStep(sys, amount, types) {
  const label = types.join(" + ");
  const out = { type: label, immune: false, weakBonus: 0, weakIndex: null, dr: 0, halved: 0, absorbed: 0, resist: null, final: amount };
  if (amount <= 0) return out;
  const imm = sys.immunityList ?? [];
  if (types.length && types.every(t => imm.some(e => covers(e, t)))) { out.immune = true; out.final = 0; return out; }
  let a = amount;
  const weak = (sys.weaknesses ?? []).map((w, i) => ({ ...w, i }))
    .filter(w => types.some(t => covers(w.type, t))).sort((x, y) => y.value - x.value)[0];
  if (weak) { out.weakBonus = weak.value; out.weakIndex = weak.i; a += weak.value; }
  if (!types.includes("death") && sys.damageReduction) { out.dr = Math.min(a, sys.damageReduction); a -= out.dr; }
  const pools = (sys.resistList ?? []).filter(r => r.value > 0);
  const best = types.map(t => pools.filter(r => covers(r.type, t)).sort((x, y) => y.value - x.value)[0]);
  const res = types.length && best.every(Boolean) ? best.sort((x, y) => x.value - y.value)[0] : null;
  if (res && a > 0) {
    const half = Math.floor(a / 2);
    out.halved = a - half;
    out.absorbed = Math.min(res.value, half);
    out.resist = { index: res.index ?? null, racial: !!res.racial, type: res.type };
    a = half - out.absorbed;
  }
  out.final = a;
  return out;
}

/**
 * Order: worn armor Hardness reduces every hit (a hit always deals at least 1; Death ignores Hardness),
 * then the worn armor's HP, then the creature's Immunity / Weakness / Damage Reduction / Resistance,
 * then natural armor, then hp. Shields only change Defense/Evasion here.
 * A damage type with two options (Slashing/Piercing, Sonic or Force) uses whichever hurts the target most,
 * unless opts.allTypes (Morningstar), where the damage is every listed type at once.
 * opts: hits (landed attacks, Hardness applies to each), damageType, hardnessDown (Falchion 3),
 *       ignoreArmorHP (Warhammer), brittle (Mace adds Brittle to the armor on hit).
 * Returns how much went where, so it can be undone.
 */
export async function applyDamage(target, amount, opts = {}) {
  const { hits = 1, damageType = "", hardnessDown = 0, ignoreArmorHP = false, brittle = 0, allTypes = false, ignoreHardness = false } = opts;
  amount = Math.max(0, Math.floor(amount));
  const sys = target.system;
  const armor = target.items?.get(sys.wornArmorId) ?? null;
  let hardness = 0, blocked = 0;
  const types = splitTypes(damageType);
  const isDeath = types.length === 1 && types[0] === "death";

  // Conditions on the target that change incoming damage (combat info), before armor.
  const cnd = sys.conditions ?? {};
  const condNotes = [], condRemoved = {};
  const has = list => types.some(t => list.includes(t));
  if (amount > 0) {
    if (cnd.frozen && has([...PHYSICAL, "fire"])) { amount *= 2; condRemoved.frozen = cnd.frozen; condNotes.push("Frozen: crit, x2 (Frozen ends)"); }
    if (cnd.doomed) { amount += 2 * cnd.doomed; condNotes.push(`Doomed +${2 * cnd.doomed}`); }
    if (cnd.grimWound && opts.source !== "onFire") {   // attacks (+2x from Bleed / Rotting)
      const g = opts.source === "bleed" || opts.source === "rotting" ? 2 * cnd.grimWound : cnd.grimWound;
      amount += g; condNotes.push(`Grim Wound +${g}`);
    }
    if (has(["fire"])) {
      if (cnd.flammable) { amount += 2 * cnd.flammable; condRemoved.flammable = cnd.flammable; condNotes.push(`Flammable +${2 * cnd.flammable} (removed)`); }
      if (cnd.molten) { const r = await new Roll(`${cnd.molten}d4`).evaluate(); amount += r.total; condNotes.push(`Molten ${cnd.molten}d4 +${r.total}`); }
    }
    if (has(["blunt", "cold"]) && cnd.turnToIce) {
      const r = await new Roll(`${cnd.turnToIce}d4`).evaluate(); amount += r.total; condNotes.push(`Turn to Ice ${cnd.turnToIce}d4 +${r.total}`);
    }
    if (has(["electricity"]) && cnd.electrified && opts.source !== "electrified") {
      const r = await new Roll(`${cnd.electrified}d6`).evaluate(); amount += r.total; condNotes.push(`Electrified ${cnd.electrified}d6 +${r.total}`);
    }
  }
  if (armor && amount > 0 && !isDeath && !ignoreHardness) {
    const vsBonus = armor.system.hardnessVs.some(t => damageType.toLowerCase().includes(t)) ? 1 : 0;
    hardness = Math.max(0, armor.system.hardness + vsBonus - hardnessDown);
    const n = Math.max(1, hits);
    const after = Math.max(n, amount - hardness * n);   // each hit deals at least 1
    blocked = amount - after;
    amount = after;
  }
  let toArmor = 0;
  if (armor && !ignoreArmorHP) {
    toArmor = Math.min(armor.system.hp.value, amount);
    amount -= toArmor;
  }
  // The creature's own defenses: pick the listed type that hurts it most.
  const options = allTypes && types.length > 1 ? [bodyStep(sys, amount, types)]
    : (types.length ? types.map(t => [t]) : [[]]).map(t => bodyStep(sys, amount, t));
  const body = options.sort((x, y) => y.final - x.final)[0];
  amount = body.final;

  const na = sys.naturalArmor?.value ?? 0;
  const toNA = Math.min(na, amount);
  const rest = amount - toNA;
  const hpBefore = sys.hp.value;
  const hpAfter = Math.max(0, hpBefore - rest);
  if (armor && (toArmor || brittle)) {
    await armor.update({ "system.hp.value": armor.system.hp.value - toArmor, "system.brittle": armor.system.brittle + brittle });
  }
  const upd = { "system.naturalArmor.value": na - toNA, "system.hp.value": hpAfter };
  for (const k of Object.keys(condRemoved)) upd[`system.conditions.${k}`] = 0;
  // Resistance pool spent.
  if (body.absorbed && body.resist) {
    if (body.resist.racial) upd["system.racialResistUsed"] = sys.racialResistUsed + body.absorbed;
    else {
      const arr = foundry.utils.deepClone(target.system.toObject().resistances);
      arr[body.resist.index].value -= body.absorbed;
      upd["system.resistances"] = arr;
    }
  }
  // Weakness grows by half the damage dealt.
  const weakGrow = body.weakIndex !== null ? Math.floor((toNA + rest) / 2) : 0;
  if (weakGrow) {
    const arr = foundry.utils.deepClone(target.system.toObject().weaknesses);
    arr[body.weakIndex].value += weakGrow;
    upd["system.weaknesses"] = arr;
  }
  await target.update(upd);
  return { hardness, blocked, toArmor, toNA, toHP: hpBefore - hpAfter, hpAfter,
    armorName: armor?.name, armorId: armor?.id, armorHP: armor ? armor.system.hp.value - toArmor : 0,
    armorMax: armor?.system.hpMax ?? 0, brittle: armor ? brittle : 0,
    type: body.type, immune: body.immune, weakBonus: body.weakBonus, weakIndex: body.weakIndex, weakGrow,
    dr: body.dr, halved: body.halved, absorbed: body.absorbed, resist: body.resist, condNotes, condRemoved };
}
export async function undoDamage(target, r) {
  const armor = r.armorId ? target.items.get(r.armorId) : null;
  if (armor && (r.toArmor || r.brittle)) {
    await armor.update({ "system.hp.value": armor.system.hp.value + r.toArmor, "system.brittle": Math.max(0, armor.system.brittle - r.brittle) });
  }
  const upd = {
    "system.naturalArmor.value": (target.system.naturalArmor?.value ?? 0) + r.toNA,
    "system.hp.value": target.system.hp.value + r.toHP
  };
  for (const [k, v] of Object.entries(r.condRemoved ?? {})) upd[`system.conditions.${k}`] = v;
  if (r.absorbed && r.resist) {
    if (r.resist.racial) upd["system.racialResistUsed"] = Math.max(0, target.system.racialResistUsed - r.absorbed);
    else {
      const arr = foundry.utils.deepClone(target.system.toObject().resistances);
      if (arr[r.resist.index]) arr[r.resist.index].value += r.absorbed;
      upd["system.resistances"] = arr;
    }
  }
  if (r.weakGrow && r.weakIndex !== null) {
    const arr = foundry.utils.deepClone(target.system.toObject().weaknesses);
    if (arr[r.weakIndex]) arr[r.weakIndex].value = Math.max(0, arr[r.weakIndex].value - r.weakGrow);
    upd["system.weaknesses"] = arr;
  }
  await target.update(upd);
}

/** End of scene: Resistance pools refill, Weakness goes back to its base (combat info: both reset at scene end). */
export async function endScene(actor) {
  const sys = actor.system.toObject();
  await actor.update({
    "system.resistances": sys.resistances.map(r => ({ ...r, value: r.max })),
    "system.weaknesses": sys.weaknesses.map(w => ({ ...w, value: w.base })),
    "system.racialResistUsed": 0
  });
}

function describe(r) {
  const parts = [...(r.condNotes ?? [])];
  if (r.blocked) parts.push(`${r.blocked} stopped by Hardness ${r.hardness}`);
  if (r.toArmor) parts.push(`${r.toArmor} to ${r.armorName} (${r.armorHP}/${r.armorMax}${r.armorHP === 0 ? ", broken!" : ""})`);
  const t = (r.type ?? "").replace(/\b\w/g, c => c.toUpperCase());
  if (r.immune) parts.push(`immune to ${t}`);
  if (r.weakBonus) parts.push(`+${r.weakBonus} Weakness ${t}${r.weakGrow ? ` (grows +${r.weakGrow})` : ""}`);
  else if (r.weakGrow) parts.push(`Weakness ${t} grows +${r.weakGrow}`);
  if (r.dr) parts.push(`${r.dr} Damage Reduction`);
  if (r.halved) parts.push(`${r.halved} halved by ${r.resist?.type ?? ""} Resistance`);
  if (r.absorbed) parts.push(`${r.absorbed} soaked by its pool`);
  if (r.brittle) parts.push(`${r.armorName} gains Brittle ${r.brittle}`);
  if (r.toNA) parts.push(`${r.toNA} natural armor`);
  parts.push(`${r.toHP} hp`);
  return parts.join(", ");
}
function appliedLine(tgt, total, r) {
  const copy = tgt.isToken && !tgt.token?.actorLink
    ? ` <span class="hint">(unlinked token: the damage is on this token's own copy, double-click the token to see it)</span>` : "";
  return `<p>Applied ${total} to <strong>${tgt.name}</strong>${copy}: ${describe(r)} &rarr; hp ${r.hpAfter}/${tgt.system.hp.max}${r.hpAfter === 0 ? ` <span class="bad">(0 hp: Soul Critical)</span>` : ""}</p>`;
}
const enc = o => encodeURIComponent(JSON.stringify(o));
const dec = s => JSON.parse(decodeURIComponent(s));
/** Auto-apply to the target when this user may edit it; otherwise leave buttons for the GM. */
export async function autoApply(tgt, total, opts = {}) {
  if (!tgt) return { html: buttons(null, total, opts), applied: false };
  if (!tgt.isOwner) return { html: `<p class="hint">You can't edit ${tgt.name}; the GM can use the buttons.</p>${buttons(tgt, total, opts)}`, applied: false };
  const r = await applyDamage(tgt, total, opts);
  return { html: appliedLine(tgt, total, r) + `<div class="kom-apply">
      <button type="button" data-kom-undo="${enc(r)}" data-uuid="${tgt.uuid}">Undo</button></div>`, applied: true };
}
function buttons(tgt, total, opts = {}) {
  const u = tgt ? `data-uuid="${tgt.uuid}"` : "";
  const o = `data-opts="${enc(opts)}"`;
  return `<div class="kom-apply">
    <button type="button" data-kom-apply="1" data-amount="${total}" ${u} ${o}>Apply ${total}</button>
    <button type="button" data-kom-apply="0.5" data-amount="${total}" ${u} ${o}>Apply half</button>
  </div>${tgt ? "" : `<p class="hint">Buttons apply to whatever tokens you have targeted.</p>`}`;
}

/** Chat card buttons. Called from the renderChatMessageHTML hook. */
export function bindChatButtons(html) {
  html.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-kom-apply], [data-kom-undo]");
    if (!btn) return;
    ev.preventDefault();
    const stored = btn.dataset.uuid ? [await fromUuid(btn.dataset.uuid)].filter(Boolean) : [];
    const targets = stored.length ? stored : [...game.user.targets].map(t => t.actor).filter(Boolean);
    if (!targets.length) return ui.notifications.warn("Target a token first.");
    for (const t of targets) {
      if (!t.isOwner) { ui.notifications.warn(`You can't edit ${t.name}.`); continue; }
      if (btn.dataset.komUndo !== undefined) {
        const r = dec(btn.dataset.komUndo);
        await undoDamage(t, r);
        ui.notifications.info(`Undid the damage to ${t.name}.`);
        btn.disabled = true;
      } else {
        const amount = Math.floor(Number(btn.dataset.amount) * Number(btn.dataset.komApply));
        const r = await applyDamage(t, amount, btn.dataset.opts ? dec(btn.dataset.opts) : {});
        ui.notifications.info(`${t.name} takes ${amount}: ${describe(r)} (hp ${r.hpAfter}).`);
      }
    }
  });
}

/** Basic weapon attack or a martial using a weapon. */
export async function attack(actor, weapon, martial = null) {
  const wi0 = weaponInfo(actor, weapon);
  const ranged = weapon.system.isRanged;
  const tgt = targetActor();
  const vs = tgt ? defenseFor(tgt, ranged) : { key: ranged ? "evasion" : "defense", label: ranged ? "Evasion" : "Defense" };
  // Flail: the target's shield Defense does not apply.
  const flail = weapon.system.skinName === "Flail" && vs.key === "defense" && (tgt?.system?.shieldDefense ?? 0) > 0;
  if (flail) vs.label += " (Flail ignores shield)";
  const prefill = tgt ? (tgt.system[vs.key] + (flail ? tgt.system.shieldDefense : 0)) : "";
  const mi = martial ? martialInfo(actor, martial) : null;
  const cx = martial ? martial.system.totalCx : wi0.baseCx;
  const cost = martial ? martial.system.aura : wi0.baseAura;

  const gripRow = weapon.system.gripEither
    ? `<label>Use stats <select name="grip"><option value="light">Light (Str + Agi)</option><option value="heavy">Heavy (Str + Con)</option></select></label>` : "";
  const extra = `${gripRow}
    <label><input name="stealth" type="checkbox"> Stealth damage (+1 of the largest die)</label>
    <label><input name="spend" type="checkbox" checked> Spend ${cost} aura</label>
    ${soulRow(actor, "aura", cost)}
    ${checkRow(actor, "combat", mi?.over)}`;
  const title = martial ? `${martial.name} (${weapon.name})` : `${weapon.name} attack`;
  const res = await DialogV2.prompt({
    window: { title },
    content: dialogContent({ defLabel: tgt ? `${vs.label} of ${tgt.name}` : vs.label, prefill, extra }),
    ok: { label: "Roll", callback: (ev, btn) => {
      const f = btn.form.elements;
      return { defRaw: f.def.value, def: Number(f.def.value), mod: Number(f.mod.value) || 0, stealth: f.stealth.checked, spend: f.spend.checked, soul: !!f.soul?.checked, check: f.check?.value ?? "", grip: f.grip?.value };
    } },
    rejectClose: false
  });
  if (!res) return;
  if (res.defRaw === "" || !Number.isFinite(res.def)) return ui.notifications.warn("Enter the target's Defense or Evasion.");

  const wi = weaponInfo(actor, weapon, res.grip);
  // Sickened lowers the attacker's Tn; Doomed on the target widens the crit range; Cursed widens the crit-fail range.
  const tn = res.def + wi.accuracy + res.mod - (actor.system.tnPenalty ?? 0);
  const hitInfo = await rollToHit(tn, actor.system.attackCount, weapon.system.critMax + (tgt?.system?.critAgainst ?? 0), actor.system.fumbleMin ?? 95);
  const dice = 1 + hitInfo.extras;
  const rollData = { ...actor.system.stats, ml: mi?.ml ?? wi.talentLevel, level: actor.system.level };
  // Multi Attack Rules: with an attack count of 2 or more, a miss still deals half damage
  // (one die, halved). With an attack count of 1, a miss deals nothing.
  let dmg = null;
  const multiMiss = !hitInfo.hit && actor.system.attackCount >= 2;
  if (hitInfo.hit) {
    const formula = damageFormula(weapon.system.die, dice, wi.damageFlat, martial?.system.damage, {
      stealth: res.stealth, crit: hitInfo.crit, hit: true });
    dmg = await new Roll(formula, rollData).evaluate();
  } else if (multiMiss) {
    const formula = damageFormula(weapon.system.die, 1, wi.damageFlat, martial?.system.damage, {
      stealth: res.stealth, crit: false, hit: true });
    dmg = await new Roll(`floor((${formula}) / 2)`, rollData).evaluate();
  }

  const notes = [];
  const rolls = [];
  // Cursed: damage you deal -2 per point. Furious: +2 per stack on your next melee attack (used up).
  let dmgTotal = dmg?.total ?? 0;
  if (dmg) {
    const cu = actor.system.conditions?.cursed ?? 0;
    const fu = !ranged ? (actor.system.conditions?.furious ?? 0) : 0;
    if (fu) { dmgTotal += 2 * fu; notes.push(`<p>Furious ${fu}: +${2 * fu} damage (used up).</p>`); await actor.update({ "system.conditions.furious": 0 }); }
    if (cu) { dmgTotal = Math.max(0, dmgTotal - 2 * cu); notes.push(`<p class="bad">Cursed ${cu}: -${2 * cu} damage.</p>`); }
  }
  if (res.spend) notes.push(await spend(actor, "aura", cost, res.soul));
  // Attack complexity over the weapon's complexity limit damages the weapon.
  if (weapon.system.complexityLimit !== null && cx > weapon.system.complexityLimit) {
    const hurt = cx - weapon.system.complexityLimit;
    const hp = Math.max(0, weapon.system.hp.value - hurt);
    await weapon.update({ "system.hp.value": hp });
    notes.push(`<p class="bad">Complexity ${cx} is over ${weapon.name}'s limit ${weapon.system.complexityLimit}: weapon takes ${hurt} (HP ${hp}/${weapon.system.hpMax})${hp === 0 ? ", it critically breaks!" : ""}.</p>`);
  }
  if (mi?.tier2Locked) notes.push(`<p class="bad">This martial uses a Tier 2 art, which needs level 11 in ${martial.system.talentName} (you have ${mi.ml}).</p>`);
  if (mi?.over) notes.push(await overMaxCheck(actor, { group: "combat", pool: "aura", cx, maxCx: mi.maxCx, rolls, check: res.check }));
  if (mi?.channel) notes.push(`<p>This martial costs ${martial.system.actions} actions, more than your ${actor.system.actions}: it gains Channel (40 aura per turn).</p>`);

  if (dmg) {
    const skin = weapon.system.skinName;
    const opts = {
      hits: multiMiss ? 1 : 1 + hitInfo.extras,
      damageType: weapon.system.damageType,
      hardnessDown: skin === "Falchion" ? 3 : 0,      // target armor Hardness counts as 3 lower
      ignoreArmorHP: skin === "Warhammer",            // ignores armor durability
      brittle: skin === "Mace" ? 1 : 0,               // target armor gains Brittle 1
      allTypes: skin === "Morningstar"                // counts as Blunt and Piercing at once
    };
    notes.unshift((await autoApply(tgt, dmgTotal, opts)).html);
  }

  const result = hitInfo.crit ? "Critical hit!" : hitInfo.fumble ? "Critical failure" : hitInfo.hit ? "Hit"
    : multiMiss ? `Miss (attack count ${actor.system.attackCount}: half damage)` : "Miss";
  const arts = martial ? `<details><summary>Arts</summary>${martial.system.arts.map(a =>
    `<p><strong>${a.name}</strong> [${a.cx}] (${a.type}${a.school ? `, ${a.school}` : ""}) ${a.text}${a.extra ? `<br><em>${a.extra}</em>` : ""}</p>`).join("")}</details>` : "";
  const flavor = `<div class="kom-chat">
    <h3>${title}</h3>
    <p>Tn ${tn} = target ${tgt ? `${tgt.name} ` : ""}${vs.label} ${res.def} + accuracy ${wi.accuracy} (${wi.accLabel} + weapon ${weapon.system.accuracyMod} + talent ${wi.talentLevel})${res.mod ? ` + ${res.mod}` : ""}</p>
    <p><strong>${result}</strong>: rolled ${hitInfo.r}, margin ${hitInfo.margin}${hitInfo.extras ? `, ${hitInfo.extras} extra attack(s) landed` : ""}</p>
    ${dmg ? `<p>Damage: ${dice} x ${weapon.system.dieLabel} + ${wi.damageFlat} (${wi.dmgLabel}${weapon.system.damageBonus ? ` + ${weapon.system.damageBonus}` : ""})${martial?.system.damage ? ` + ${martial.system.damage}` : ""}${hitInfo.crit ? " x2 (crit)" : ""}${multiMiss ? ", 1 die, halved (miss)" : ""} &rarr; <strong>${dmgTotal} ${weapon.system.damageType}</strong>${dmgTotal !== dmg.total ? ` <small>(rolled ${dmg.total})</small>` : ""}</p>` : `<p>No damage.</p>`}
    ${weapon.system.skinData.effect && weapon.system.skinName !== "Basic" ? `<p><em>${weapon.system.skinName}:</em> ${weapon.system.skinData.effect}</p>` : ""}
    ${arts}${notes.join("")}
  </div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor, rolls: [hitInfo.roll, ...rolls, ...(dmg ? [dmg] : [])] });
}

/** Use a martial: pick one of the equipped weapons of its group. */
export async function useMartial(actor, martial) {
  const mi = martialInfo(actor, martial);
  if (!mi.weapons.length) return ui.notifications.warn(`${martial.name} needs an equipped ${martial.system.groupLabel} weapon.`);
  let weapon = mi.weapons[0];
  if (mi.weapons.length > 1) {
    const opts = mi.weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
    const id = await DialogV2.prompt({
      window: { title: `${martial.name}: choose weapon` },
      content: `<select name="w" style="width:100%">${opts}</select>`,
      ok: { label: "Use", callback: (ev, btn) => btn.form.elements.w.value }, rejectClose: false
    });
    if (!id) return;
    weapon = actor.items.get(id);
  }
  return attack(actor, weapon, martial);
}

/** Cast a spell. */
export async function castSpell(actor, spell) {
  const sp = spell.system;
  const si = spellInfo(actor, spell);
  const tgt = targetActor();
  // Target spells roll against Evasion (Defense if the target is using Stand your ground);
  // the Touch projection rolls against Defense.
  let vs, vsLabel;
  // Touch counts as melee (Defense, or Evasion vs Feint); other target spells count as ranged.
  if (sp.touch) {
    const d = tgt ? defenseFor(tgt, false) : { key: "defense", label: "Defense" };
    vs = d.key; vsLabel = `${d.label}, Touch`;
  } else { const d = tgt ? defenseFor(tgt, true) : { key: "evasion", label: "Evasion" }; vs = d.key; vsLabel = d.label; }
  // The caster picks the damage type when the spell's schools allow more than one (Water: Cold or Force).
  const spellTypes = splitTypes(sp.damageTypes);
  const cap = t => t[0].toUpperCase() + t.slice(1);
  const typeRow = spellTypes.length > 1
    ? `<label>Damage type <select name="dtype">${spellTypes.map(t => `<option value="${cap(t)}">${cap(t)}</option>`).join("")}</select></label>` : "";
  const extra = `
    ${typeRow}
    <label><input name="area" type="checkbox" ${sp.area ? "checked" : ""}> Area spell: no attack roll, each target makes a normal Agi check</label>
    <label><input name="speed" type="checkbox"> Speed up: spend 10 more mana for -1 action</label>
    <label><input name="spend" type="checkbox" checked> Spend ${sp.mana} mana (+10 if sped up)</label>
    ${soulRow(actor, "mana", sp.mana)}
    ${checkRow(actor, "arcane", si.over)}`;
  const res = await DialogV2.prompt({
    window: { title: `Cast ${spell.name}` },
    content: dialogContent({ defLabel: vsLabel, prefill: tgt?.system?.[vs] ?? "", extra }),
    ok: { label: "Cast", callback: (ev, btn) => {
      const f = btn.form.elements;
      return { def: Number(f.def.value) || 0, mod: Number(f.mod.value) || 0, area: f.area.checked, speed: f.speed.checked, spend: f.spend.checked, soul: !!f.soul?.checked, check: f.check?.value ?? "", dtype: f.dtype?.value ?? "" };
    } },
    rejectClose: false
  });
  if (!res) return;

  const notes = [];
  const rolls = [];
  const cost = sp.mana + (res.speed ? 10 : 0);
  const actions = Math.max(sp.cantrip ? 0 : 1, sp.actions - (res.speed ? 1 : 0));
  if (res.spend) notes.push(await spend(actor, "mana", cost, res.soul));
  // No mana regained in the next Prepping Stage after casting.
  if (!sp.cantrip) await actor.setFlag("kingdom-of-monsters", "castSinceRegen", true);
  if (si.tier2Locked.length) notes.push(`<p class="bad">Tier 2 arts need rank 11 in the school's magic talent: ${si.tier2Locked.join(", ")}.</p>`);
  if (si.channel) notes.push(`<p>Costs ${sp.actions} actions, more than your ${actor.system.actions}: it gains Channel (40 mana per turn).</p>`);

  // Over max complexity: hard Arcane check minus the complexity (fail = 10 Death per point over, lose all mana).
  if (si.over) notes.push(await overMaxCheck(actor, { group: "arcane", pool: "mana", cx: sp.totalCx, maxCx: si.maxCx, rolls, check: res.check }));

  let hitLine = "";
  let crit = false;
  let spellHit = false;
  if (!res.area) {
    const tn = res.def + res.mod - (actor.system.tnPenalty ?? 0);
    const h = await rollToHit(tn, 1, 5 + (tgt?.system?.critAgainst ?? 0), actor.system.fumbleMin ?? 95);
    rolls.push(h.roll); crit = h.crit; spellHit = h.hit;
    hitLine = `<p>Tn ${tn} (target ${vsLabel} ${res.def}${res.mod ? ` + ${res.mod}` : ""}): <strong>${h.crit ? "Critical hit!" : h.fumble ? "Critical failure" : h.hit ? "Hit" : "Miss"}</strong>, rolled ${h.r}</p>`;
  } else {
    const agiTn = tgt?.system?.statChecks?.agi?.normal;
    hitLine = `<p>Area spell: no attack roll. Each target makes a normal Agi check (Tn 50 + Agi)${agiTn !== undefined ? `; targeted ${tgt.name} needs under ${agiTn}` : ""}.</p>`;
  }

  let dmgLine = "";
  const dtype = res.dtype || (spellTypes.length === 1 ? cap(spellTypes[0]) : "");
  if (sp.damageFormula) {
    const md = actor.system.magicDamage;
    let f = `(${sp.damageFormula}) + ${md}`;
    if (crit) f = `(${f}) * 2`;
    const rollData = { ...actor.system.stats, sl: si.sl, level: actor.system.level };
    const dmg = await new Roll(f, rollData).evaluate(); rolls.push(dmg);
    const cu = actor.system.conditions?.cursed ?? 0;
    const total = Math.max(0, dmg.total - 2 * cu);
    dmgLine = `<p>Damage: ${sp.damageFormula.replace(/@sl/g, "SL").replace(/@level/g, "Lv")} + ${md} (${KOM.statLabels[actor.system.magicDamageStat]}) &rarr; <strong>${total}</strong> ${dtype ? `${dtype}` : ""}${cu ? ` <small class="bad">(rolled ${dmg.total}, Cursed -${2 * cu})</small>` : ""}</p>`;
    if (res.area) dmgLine += `<p class="hint">Targets that pass their Agi check take half.</p>${buttons(null, total, { hits: 1, damageType: dtype })}`;
    else if (spellHit) dmgLine += (await autoApply(tgt, total, { hits: 1, damageType: dtype })).html;
    else dmgLine += `<p class="hint">Missed: no damage applied.</p>`;
  }

  const flavor = `<div class="kom-chat">
    <h3>${spell.name}</h3>
    <p>${sp.schoolLabel} | SL ${si.sl} | complexity ${sp.baseCx} x${sp.multiplier} = ${sp.totalCx} (max ${si.maxCx}) | ${cost} mana | ${actions} action(s)</p>
    ${hitLine}${dmgLine}
    <details><summary>Parts</summary>${sp.arts.map(a => `<p><strong>${a.name}</strong> [${a.cx}] (${a.school} ${a.type}) ${a.text}</p>`).join("")}</details>
    ${notes.join("")}
  </div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor, rolls });
}
