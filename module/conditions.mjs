import { KOM } from "./config.mjs";
import { autoApply } from "./combat.mjs";

const C = () => KOM.CONDITIONS;
const statusId = key => `kom-cond-${key}`;
const cap = (v, max) => Math.max(0, Math.min(max, v));

/** Register every condition as a token status icon. */
export function registerConditionStatuses() {
  for (const [key, c] of Object.entries(C())) {
    const id = statusId(key);
    if (!CONFIG.statusEffects.some(e => e.id === id)) CONFIG.statusEffects.push({ id, name: c.label, img: c.img });
  }
}

/** Set a condition's value and keep the token icon in step. */
export async function setCondition(actor, key, value) {
  if (!(key in C())) return;
  const v = Math.max(0, Math.floor(Number(value) || 0));
  // Token icons follow through the updateActor hook (kom.mjs).
  const upd = {};
  if ((actor.system.conditions?.[key] ?? 0) !== v) upd[`system.conditions.${key}`] = v;
  // Furious 10 or more gives Enraged.
  if (key === "furious" && v >= 10 && !actor.system.conditions.enraged) upd["system.conditions.enraged"] = 1;
  if (Object.keys(upd).length) await actor.update(upd);
}
export async function addCondition(actor, key, delta) {
  await setCondition(actor, key, (actor.system.conditions?.[key] ?? 0) + delta);
}
async function syncIcon(actor, key) {
  const on = (actor.system.conditions?.[key] ?? 0) > 0;
  if (actor.statuses?.has(statusId(key)) !== on) await actor.toggleStatusEffect(statusId(key), { active: on });
}
/** After any update to conditions (typed into the sheet), bring the icons in line. */
const syncQueue = new Map();
export function syncAllIcons(actor) {
  // One sync at a time per actor, so quick changes can't create the same icon twice.
  const prev = syncQueue.get(actor.uuid) ?? Promise.resolve();
  const next = prev.then(async () => { for (const key of Object.keys(C())) await syncIcon(actor, key); }).catch(console.error);
  syncQueue.set(actor.uuid, next);
  return next;
}
/** Token HUD toggled an icon: mirror it onto the value (on = at least 1). */
export async function fromStatus(actor, statusIdOn, active) {
  const key = Object.keys(C()).find(k => statusId(k) === statusIdOn);
  if (!key) return;
  const cur = actor.system.conditions?.[key] ?? 0;
  if (active && cur === 0) await actor.update({ [`system.conditions.${key}`]: 1 });
  if (!active && cur > 0) await actor.update({ [`system.conditions.${key}`]: 0 });
}

/** Active conditions for the sheet. */
export function activeConditions(actor) {
  const v = actor.system.conditions ?? {};
  return Object.entries(C()).filter(([k]) => v[k] > 0).map(([key, c]) => ({
    key, ...c, amount: v[key], cureLabel: c.cure ? cureLabel(actor, c.cure) : ""
  }));
}
function cureStat(actor, cure) {
  const s = actor.system.stats;
  return cure.stats.reduce((best, k) => (s[k] > s[best] ? k : best), cure.stats[0]);
}
function cureBand(actor, cure) {
  return cure.undeadNormal && actor.system.raceName === "Zombie" ? "normal" : cure.band;
}
function cureLabel(actor, cure) {
  const k = cureStat(actor, cure);
  return `${cureBand(actor, cure)} ${KOM.statLabels[k]} ${actor.system.statChecks[k][cureBand(actor, cure)] - (actor.system.tnPenalty ?? 0)}`;
}

async function post(actor, title, lines, rolls = []) {
  if (!lines.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<div class="kom-chat"><h3>${title}</h3>${lines.map(l => l.startsWith("<") ? l : `<p>${l}</p>`).join("")}</div>`,
    rolls
  });
}

/** Cure check (Recovery Stage): d100 under the band + stat. Per-five conditions drop 1 per 5 under; others end. */
export async function cure(actor, key) {
  const c = C()[key];
  if (!c?.cure) return ui.notifications.warn(`${c?.label ?? key} has no cure check written.`);
  const stat = cureStat(actor, c.cure);
  const band = cureBand(actor, c.cure);
  const tn = actor.system.statChecks[stat][band] - (actor.system.tnPenalty ?? 0);
  const roll = await new Roll("1d100").evaluate();
  const r = roll.total;
  const pass = r <= 5 || (r < 95 && r <= tn);
  const cur = actor.system.conditions[key];
  let line;
  if (!pass) line = `Rolled ${r} vs Tn ${tn}: failed. ${c.label} stays at ${cur}.`;
  else if (c.cure.perFive) {
    const drop = Math.floor((tn - r) / 5);
    await setCondition(actor, key, cur - drop);
    line = `Rolled ${r} vs Tn ${tn}: ${drop} under-fives, ${c.label} ${cur} &rarr; ${Math.max(0, cur - drop)}.`;
  } else { await setCondition(actor, key, 0); line = `Rolled ${r} vs Tn ${tn}: ${c.label} ends.`; }
  await post(actor, `${c.label}: ${band} ${KOM.statLabels[stat]} check`, [line], [roll]);
}

/** Bleed, each time the creature takes an action (movement included). */
export async function bleedTick(actor) {
  const sys = actor.system;
  if (!sys.conditions.bleed) return;
  // Grim Wound: +2x its Value each time Bleed deals damage.
  const x = sys.conditions.bleed + 2 * (sys.conditions.grimWound ?? 0);
  const idx = sys.resistances.findIndex(r => /bleed/i.test(r.type) && r.value > 0);
  const res = idx >= 0 ? sys.resistances[idx].value : 0;
  if (res > x) {
    const arr = foundry.utils.deepClone(sys.toObject().resistances);
    arr[idx].value -= x;
    await actor.update({ "system.resistances": arr });
    return post(actor, "Bleed", [`Bleed ${x}: Bleed resistance ${res} &rarr; ${res - x}, no hp lost.`]);
  }
  if (sys.hp.value <= 0) {
    await actor.update({ "system.aura.value": Math.max(0, sys.aura.value - x) });
    return post(actor, "Bleed", [`Bleed ${x} at 0 hp: aura ${sys.aura.value} &rarr; ${Math.max(0, sys.aura.value - x)}.`]);
  }
  // Bleed is hp loss, so it skips armor and natural armor.
  const hp = Math.max(0, sys.hp.value - x);
  await actor.update({ "system.hp.value": hp });
  await post(actor, "Bleed", [`Bleed ${x}: hp ${sys.hp.value} &rarr; ${hp}.`]);
}

async function onFire(actor, when, lines, rolls) {
  const v = actor.system.conditions.onFire;
  if (!v) return;
  const roll = await new Roll(`2d6 + ${v}d4`).evaluate(); rolls.push(roll);
  lines.push(`On Fire ${v} (${when}): 2d6 + ${v}d4 = ${roll.total} fire.`);
  lines.push((await autoApply(actor, roll.total, { hits: 1, damageType: "Fire", source: "onFire" })).html);
}
async function naturalArmorRegen(actor, lines) {
  const sys = actor.system;
  const na = sys.naturalArmor;
  if (!na.max || na.value <= 0 || na.value >= na.max) return;          // doesn't regenerate at 0
  if (sys.conditions.corroded) { lines.push("Natural armor can't regenerate (Corroded)."); return; }
  const to = Math.min(na.max, na.value + sys.stats.con);
  await actor.update({ "system.naturalArmor.value": to });
  lines.push(`Natural armor +${to - na.value} (Con) &rarr; ${to}/${na.max}.`);
}

/** Prepping Stage: regain aura and mana, natural armor regenerates, conditions trigger. */
export async function prepping(actor) {
  const sys = actor.system;
  const lines = [], rolls = [];
  const aura = cap(sys.aura.value + sys.auraRegen, sys.aura.max);
  const upd = { "system.aura.value": aura };
  lines.push(`Aura ${sys.aura.value} &rarr; ${aura} (${sys.auraRegen >= 0 ? "+" : ""}${sys.auraRegen}${sys.conditions.exhausted ? `, Exhausted ${sys.conditions.exhausted}` : ""}).`);
  if (actor.getFlag("kingdom-of-monsters", "castSinceRegen")) {
    lines.push("No mana regained: cast a spell last turn.");
    await actor.unsetFlag("kingdom-of-monsters", "castSinceRegen");
  } else {
    const mana = cap(sys.mana.value + sys.manaRegen, sys.mana.max);
    upd["system.mana.value"] = mana;
    lines.push(`Mana ${sys.mana.value} &rarr; ${mana} (+${sys.manaRegen}).`);
  }
  await actor.update(upd);
  await naturalArmorRegen(actor, lines);
  await onFire(actor, "Prepping Stage", lines, rolls);
  await post(actor, "Prepping Stage", lines, rolls);
}

/** Start of the creature's turn. */
export async function startTurn(actor) {
  const sys = actor.system;
  const lines = [], rolls = [];
  await naturalArmorRegen(actor, lines);
  await onFire(actor, "start of turn", lines, rolls);
  const co = sys.conditions.corroded;
  if (co) {
    const r = await new Roll(`${co}d4`).evaluate(); rolls.push(r);
    const na = actor.system.naturalArmor.value;
    if (na > 0) {
      const to = Math.max(0, na - r.total);
      await actor.update({ "system.naturalArmor.value": to });
      lines.push(`Corroded ${co}: natural armor loses ${co}d4 = ${r.total} (${na} &rarr; ${to}).`);
    } else {
      const armor = actor.items.get(sys.wornArmorId);
      if (armor) {
        const to = Math.max(0, armor.system.hp.value - r.total);
        await armor.update({ "system.hp.value": to });
        lines.push(`Corroded ${co}: ${armor.name} loses ${r.total} HP (${to}/${armor.system.hpMax}).`);
      }
    }
  }
  if (sys.conditions.turbulence) lines.push("Turbulence: ends now if you're on the ground (height stage 0 or lower).");
  await post(actor, `${actor.name}: start of turn`, lines, rolls);
}

/** End of the creature's turn. */
export async function endTurn(actor) {
  const sys = actor.system;
  const cn = sys.conditions;
  const lines = [], rolls = [], upd = {};
  if (cn.rotting) {
    const dice = Math.max(1, Math.floor(cn.rotting / 3));
    const r = await new Roll(`${dice}d6`).evaluate(); rolls.push(r);
    lines.push(`Rotting ${cn.rotting}: ${dice}d6 = ${r.total} Death, then Rotting ${cn.rotting + 1}.`);
    lines.push((await autoApply(actor, r.total, { hits: 1, damageType: "Death", source: "rotting" })).html);
    upd["system.conditions.rotting"] = actor.system.conditions.rotting + 1;
  }
  // Blind, Electrified, Show: remove half (rounded down); 2 or less ends.
  for (const k of ["blind", "electrified", "show"]) {
    const v = cn[k];
    if (!v) continue;
    const left = v - Math.floor(v / 2);
    const to = left <= 2 ? 0 : left;
    upd[`system.conditions.${k}`] = to;
    lines.push(`${C()[k].label} ${v} &rarr; ${to}.`);
  }
  if (cn.flow) { upd["system.conditions.flow"] = 0; lines.push(`Flow ${cn.flow} &rarr; 0.`); }
  if (Object.keys(upd).length) await actor.update(upd);
  await post(actor, `${actor.name}: end of turn`, lines, rolls);
}

/** Recovery Stage: Bleed changes, then the cure checks the player can make. */
export async function recovery(actor) {
  const sys = actor.system;
  const cn = sys.conditions;
  const lines = [];
  if (cn.bleed) {
    const br = sys.resistances.filter(r => /bleed/i.test(r.type)).reduce((t, r) => t + r.value, 0);
    const to = br > 0 ? Math.max(0, cn.bleed - br) : cn.bleed + 1;
    await setCondition(actor, "bleed", to);
    lines.push(br > 0 ? `Bleed ${cn.bleed} - Bleed resistance ${br} &rarr; ${to}.` : `Bleed ${cn.bleed} &rarr; ${to} (no Bleed resistance).`);
  }
  const curable = activeConditions(actor).filter(c => c.cure);
  if (curable.length) lines.push(`<p>Cure checks (normal unless noted): ${curable.map(c =>
    `<button type="button" data-kom-cure="${c.key}" data-uuid="${actor.uuid}">${c.label} ${c.amount} (${c.cureLabel})</button>`).join(" ")}</p>`);
  await post(actor, "Recovery Stage", lines);
}

/** Chat buttons for cure checks. */
export function bindCureButtons(html) {
  html.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-kom-cure]");
    if (!btn) return;
    ev.preventDefault();
    const actor = await fromUuid(btn.dataset.uuid);
    if (!actor?.isOwner) return ui.notifications.warn("You can't roll for that creature.");
    await cure(actor, btn.dataset.komCure);
    btn.disabled = true;
  });
}

/* ---------------- combat tracker automation (GM only) ---------------- */
const combatActors = combat => combat.combatants.map(c => c.actor).filter(a => a?.type === "character");

export function registerCombatHooks() {
  game.settings.register("kingdom-of-monsters", "automatePhases", {
    name: "Automate combat phases",
    hint: "Run the Prepping Stage, start/end of turn and Recovery Stage automatically as the combat tracker advances.",
    scope: "world", config: true, type: Boolean, default: true
  });
  const on = () => game.user.isGM && game.settings.get("kingdom-of-monsters", "automatePhases");

  Hooks.on("combatStart", async combat => {
    if (!on()) return;
    for (const a of combatActors(combat)) await prepping(a);
  });
  Hooks.on("combatTurnChange", async (combat, prior, current) => {
    if (!on()) return;
    const prev = combat.combatants.get(prior?.combatantId)?.actor;
    const next = combat.combatants.get(current?.combatantId)?.actor;
    if (prev?.type === "character" && prior.round > 0) await endTurn(prev);
    if (current.round > (prior?.round ?? 0) && prior?.round > 0) {
      for (const a of combatActors(combat)) await recovery(a);
      for (const a of combatActors(combat)) await prepping(a);
    }
    if (next?.type === "character") await startTurn(next);
  });
}
