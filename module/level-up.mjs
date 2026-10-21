import { KOM } from "./config.mjs";

const { DialogV2 } = foundry.applications.api;
const POOLS = ["hp", "mana", "aura", "soul"];
const POOL_LABEL = { hp: "HP", mana: "Mana", aura: "Aura", soul: "Soul" };

/**
 * Level up (user rulings):
 * roll d6 / d8 / d10 / d12 (min 3 / 4 / 5 / 6) and assign one to each of HP, Mana, Aura, Soul;
 * +1 stat point (race max still applies); talent ranks for the new level's tier (max per talent);
 * a free off-tree rank at levels 3, 6, 9, 14, 19, 24. HP / Mana / Aura also grow by Con / mana stat / End
 * (that part is derived on the sheet, so it recounts when the stat changes).
 */
export async function levelUp(actor) {
  const sys = actor.system;
  const from = sys.level;
  const to = from + 1;
  if (to > KOM.LEVELS.maxLevel) return ui.notifications.warn(`Level ${KOM.LEVELS.maxLevel} is the max.`);
  if (sys.xp < sys.xpNeeded) {
    const go = await DialogV2.confirm({
      window: { title: "Not enough XP" },
      content: `<p>${actor.name} has ${sys.xp} / ${sys.xpNeeded} XP. Level up anyway?</p>`, rejectClose: false
    });
    if (!go) return;
  }
  const tier = KOM.tierOf(to);
  const free = KOM.LEVELS.freeRanks.includes(to) ? 1 : 0;
  const budget = tier.ranks + free;

  // Roll the four dice now so the player can see them before assigning.
  const rolls = [];
  const dice = [];
  for (const d of KOM.LEVELS.dice) {
    const r = await new Roll(`1d${d.faces}`).evaluate();
    rolls.push(r);
    dice.push({ faces: d.faces, rolled: r.total, min: d.min, value: Math.max(r.total, d.min) });
  }
  const defaults = { hp: 3, aura: 2, mana: 1, soul: 0 };   // biggest die to HP by default
  const dieOpt = (sel) => dice.map((d, i) =>
    `<option value="${i}" ${i === sel ? "selected" : ""}>d${d.faces}: ${d.value}${d.rolled < d.min ? ` (rolled ${d.rolled}, min ${d.min})` : ""}</option>`).join("");
  const poolRows = POOLS.map(p => `<label>${POOL_LABEL[p]} <select name="die-${p}">${dieOpt(defaults[p])}</select></label>`).join("");

  const race = actor.items.find(i => i.type === "race")?.system;
  const statOpts = KOM.stats.map(k => {
    const max = race?.maxes?.[k];
    const full = max !== undefined && sys.stats[k] >= max;
    return `<option value="${k}" ${full ? "disabled" : ""}>${KOM.statLabels[k]} ${sys.stats[k]}${max !== undefined ? ` / ${max}` : ""}${full ? " (max)" : ""}</option>`;
  }).join("");

  const talents = actor.items.filter(i => i.type === "talent").sort((a, b) => a.name.localeCompare(b.name));
  const talentRows = talents.map(t => {
    const room = Math.max(0, t.system.maxRank - (t.system.rank + t.system.grantedRank));
    const cap = Math.min(tier.perTalent, room);
    return `<tr><td>${t.name}${t.system.racial ? " <small>(racial)</small>" : ""}</td>
      <td>${t.system.rank}${t.system.grantedRank ? ` + ${t.system.grantedRank}` : ""} / ${t.system.maxRank}</td>
      <td><input name="t-${t.id}" type="number" value="0" min="0" max="${cap}" ${cap ? "" : "disabled"} style="width:50px"></td></tr>`;
  }).join("");

  const evo = KOM.LEVELS.evolutionLevels.includes(to)
    ? `<p class="bad">Level ${to} is an evolution level (tier ${tier.tier}). Evolutions aren't on the sheet yet: add the evolution's stat caps, attributes and racial by hand.</p>` : "";
  const content = `<div class="kom-dialog kom-levelup">
    ${evo}
    <h4>Dice</h4>
    <p class="hint">Assign each die to a different attribute.</p>
    ${poolRows}
    <h4>Stat point</h4>
    <label>+1 to <select name="stat">${statOpts}</select></label>
    <h4>Talent ranks: ${budget}${free ? " (includes 1 free off-tree rank)" : ""}</h4>
    <p class="hint">Max ${tier.perTalent} into one talent this level. Add new talents from the Items sidebar first; unspent ranks stay on the sheet's rank counter.</p>
    <table>${talentRows || `<tr><td class="hint">No talents on the sheet yet.</td></tr>`}</table>
  </div>`;

  const res = await DialogV2.prompt({
    window: { title: `${actor.name}: level ${from} → ${to}` },
    position: { width: 480 },
    content,
    ok: { label: "Level up", callback: (ev, btn) => {
      const f = btn.form.elements;
      const pick = Object.fromEntries(POOLS.map(p => [p, Number(f[`die-${p}`].value)]));
      const ranks = {};
      for (const t of talents) { const n = Number(f[`t-${t.id}`]?.value) || 0; if (n > 0) ranks[t.id] = n; }
      return { pick, stat: f.stat.value, ranks };
    } },
    rejectClose: false
  });
  if (!res) return;

  // Validate.
  if (new Set(Object.values(res.pick)).size !== 4) return ui.notifications.error("Each die has to go to a different attribute. Nothing was changed.");
  const spent = Object.values(res.ranks).reduce((a, b) => a + b, 0);
  if (spent > budget) return ui.notifications.error(`That's ${spent} talent ranks; this level gives ${budget}. Nothing was changed.`);
  for (const [id, n] of Object.entries(res.ranks)) {
    if (n > tier.perTalent) return ui.notifications.error(`Max ${tier.perTalent} ranks into one talent per level. Nothing was changed.`);
  }
  const maxStat = race?.maxes?.[res.stat];
  if (maxStat !== undefined && sys.stats[res.stat] >= maxStat) return ui.notifications.error(`${KOM.statLabels[res.stat]} is at its race max. Nothing was changed.`);

  // Max before, to raise current values by the same amount.
  const before = Object.fromEntries(POOLS.map(p => [p, sys[p].max]));
  const gains = Object.fromEntries(POOLS.map(p => [p, dice[res.pick[p]].value]));
  const update = {
    "system.level": to,
    "system.xp": Math.max(0, sys.xp - sys.xpNeeded),
    [`system.stats.${res.stat}`]: sys.stats[res.stat] + 1
  };
  for (const p of POOLS) update[`system.${p}.levelups`] = sys[p].levelups + gains[p];
  const log = [...sys.levelLog, { from, to, gains, stat: res.stat, ranks: res.ranks, xp: Math.min(sys.xp, sys.xpNeeded) }];
  update["system.levelLog"] = log;
  await actor.update(update);
  for (const [id, n] of Object.entries(res.ranks)) {
    const t = actor.items.get(id);
    if (t) await t.update({ "system.rank": t.system.rank + n });
  }
  // Current HP / Mana / Aura / Soul go up by however much the max went up.
  const cur = {};
  for (const p of POOLS) cur[`system.${p}.value`] = actor.system[p].value + (actor.system[p].max - before[p]);
  await actor.update(cur);

  const lines = POOLS.map(p => {
    const d = dice[res.pick[p]];
    return `<li>${POOL_LABEL[p]}: d${d.faces} ${d.value}${d.rolled < d.min ? ` (rolled ${d.rolled}, min ${d.min})` : ""} &rarr; max ${before[p]} &rarr; <strong>${actor.system[p].max}</strong></li>`;
  }).join("");
  const rankLines = Object.entries(res.ranks).map(([id, n]) => `${actor.items.get(id)?.name} +${n}`).join(", ") || "none yet";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${actor.name} reached level ${to}</strong> (tier ${tier.tier})
      <ul>${lines}</ul>
      <p>+1 ${KOM.statLabels[res.stat]} (${sys.stats[res.stat]} &rarr; ${sys.stats[res.stat] + 1})<br>
      Talent ranks: ${rankLines} (${spent} / ${budget})</p>${evo}`,
    rolls
  });
}

/** Undo the last level-up done with the button. */
export async function undoLevelUp(actor) {
  const sys = actor.system;
  const last = sys.levelLog.at(-1);
  if (!last) return ui.notifications.warn("No level-up to undo (only ones made with the Level up button can be undone).");
  const ok = await DialogV2.confirm({
    window: { title: "Undo level-up" },
    content: `<p>Take ${actor.name} back from level ${last.to} to ${last.from}? This removes that level's dice, stat point and talent ranks.</p>`,
    rejectClose: false
  });
  if (!ok) return;
  const before = Object.fromEntries(POOLS.map(p => [p, sys[p].max]));
  const update = {
    "system.level": last.from,
    "system.xp": sys.xp + (last.xp ?? 0),
    [`system.stats.${last.stat}`]: Math.max(0, sys.stats[last.stat] - 1),
    "system.levelLog": sys.levelLog.slice(0, -1)
  };
  for (const p of POOLS) update[`system.${p}.levelups`] = Math.max(0, sys[p].levelups - (last.gains?.[p] ?? 0));
  await actor.update(update);
  for (const [id, n] of Object.entries(last.ranks ?? {})) {
    const t = actor.items.get(id);
    if (t) await t.update({ "system.rank": Math.max(0, t.system.rank - n) });
  }
  const cur = {};
  for (const p of POOLS) cur[`system.${p}.value`] = Math.max(0, Math.min(actor.system[p].max, actor.system[p].value - (before[p] - actor.system[p].max)));
  await actor.update(cur);
  ui.notifications.info(`${actor.name} is back to level ${last.from}.`);
}
