/**
 * The 8 base races from the Racial doc (Str Con Agi Int Wis Will Spd End).
 * Run `game.kom.importRaces()` from a script macro or the console
 * to create them as Race items in the Items sidebar.
 */
const R = (name, size, m, a, racialTalent, buff) => ({
  name, type: "race",
  system: {
    size,
    maxes: { str: m[0], con: m[1], agi: m[2], int: m[3], wis: m[4], will: m[5], spd: m[6], end: m[7] },
    attributes: { hp: a[0], mana: a[1], aura: a[2], soul: a[3], durability: a[4], reflex: a[5] },
    racialTalent, buff
  }
});

export const BASE_RACES = [
  R("Beast Kin", "medium", [10,10,10,4,4,6,8,8], [15,15,60,20,5,20], "Shapeshifting",
    "One magical weapon you carry can transfer its Attributes to your chosen natural weapon whenever you shapeshift (ranged: natural weapon gains cleave X, X = one-third its range). Your Evasion while not wearing armor is 75 - Modifiers."),
  R("Basilisk", "medium", [7,7,5,10,9,8,6,8], [20,35,25,25,15,15], "Breath Weapon",
    "Whenever you cast a spell whose damage type matches your breath weapon (or your breath is magic), regain mana at the start of your next turn by rolling half the dice of your breath weapon's base form, max half the spell cost. While you have natural armor your Defense is 75 - Modifiers."),
  R("Dhampier", "medium", [8,8,8,6,6,6,8,10], [15,30,30,30,15,15], "Celestial Communion",
    "After you make a bite attack, gain bonus damage for the rest of the turn equal to your bite damage die plus any bleed the target has. Stealth damage you deal has its die size increased by 1."),
  R("Gargoyle", "medium", [3,3,6,14,15,9,5,5], [10,65,10,40,5,5], "Carved Presence",
    "Resistance to physical damage equal to your level in Carved Presence while you have natural armor. Natural armor equal to your max mana divided by 5."),
  R("Goblin", "small", [6,6,12,3,4,14,12,3], [13,30,47,20,5,20], "Entomancy",
    "The longer you have a single insect out, increase its damage/Durability by +3/+2 during the Recovery Stage. One-handed light melee / natural weapons deal Str + (Agi x 1.5) + mods. Goblins are Small but their bite counts as Medium."),
  R("Mandrake", "small", [9,10,3,10,10,6,3,9], [10,50,10,55,5,5], "Cultivation",
    "Spells that provide only Buff effects have dice equal to your level in Cultivation / 3 (min 1) rolled at max. Your mana is equal to 10 + Int + (Wis x 1.5) [creator flagged this number for review]."),
  R("Ogre", "large", [14,14,5,3,3,3,5,13], [30,10,65,10,15,5], "Song of the Forge",
    "While wielding a weapon that deals elemental damage you ignore 5 points of resistance for every 5 points you roll below the target's Defense. Heavy-weapon Accuracy is (Str x 1.5) + Con + mods + Talent level."),
  R("Zombie", "medium", [7,14,3,3,3,14,3,13], [25,10,12,50,25,13], "Undead body",
    "Whenever you are critically hit you may make a Defense roll; on a pass it becomes a normal hit. Gain bonus mana equal to your Con every level.")
];

export async function importRaces() {
  const existing = new Set(game.items.filter(i => i.type === "race").map(i => i.name));
  const toCreate = BASE_RACES.filter(r => !existing.has(r.name));
  if (!toCreate.length) return ui.notifications.info("All 8 base races already exist.");
  await Item.createDocuments(toCreate);
  ui.notifications.info(`Created ${toCreate.length} race item(s).`);
}


/** Import the tier 1 talents (ranks 1-10) parsed from the Talent doc. */
export async function importTalents() {
  const resp = await fetch("systems/kingdom-of-monsters/data/talents-tier1.json");
  const data = await resp.json();
  const existing = new Set(game.items.filter(i => i.type === "talent").map(i => i.name));
  const toCreate = data.filter(t => !existing.has(t.name));
  if (!toCreate.length) return ui.notifications.info("All tier 1 talents already exist.");
  // Put them in a folder per tree for tidiness.
  const folders = {};
  for (const tree of [...new Set(toCreate.map(t => t.system.tree))]) {
    let f = game.folders.find(f => f.type === "Item" && f.name === `Talents: ${tree}`);
    if (!f) f = await Folder.create({ name: `Talents: ${tree}`, type: "Item" });
    folders[tree] = f.id;
  }
  for (const t of toCreate) t.folder = folders[t.system.tree];
  await Item.createDocuments(toCreate);
  ui.notifications.info(`Created ${toCreate.length} talent item(s).`);
}


/** Import the racial talents (8 race talents + Flight). */
export async function importRacialTalents() {
  const resp = await fetch("systems/kingdom-of-monsters/data/talents-racial.json");
  const data = await resp.json();
  const existing = new Set(game.items.filter(i => i.type === "talent").map(i => i.name));
  const toCreate = data.filter(t => !existing.has(t.name));
  if (!toCreate.length) return ui.notifications.info("All racial talents already exist.");
  let f = game.folders.find(f => f.type === "Item" && f.name === "Talents: Racial");
  if (!f) f = await Folder.create({ name: "Talents: Racial", type: "Item" });
  for (const t of toCreate) t.folder = f.id;
  await Item.createDocuments(toCreate);
  ui.notifications.info(`Created ${toCreate.length} racial talent(s).`);
}

/**
 * Make the actor's granted talents match its racial talents:
 * full grant = racial rank, half grant = floor(racial rank / 2).
 * Granted ranks are free (grantedRank); bought ranks stay separate.
 */
export async function syncRacialGrants(actor) {
  if (!actor || actor.type !== "character") return;
  const wanted = {}; // talent name -> granted rank
  for (const rt of actor.items.filter(i => i.type === "talent" && i.system.racial && i.system.pathOrder?.length)) {
    const r = rt.system.rank + rt.system.grantedRank;
    if (r <= 0) continue;
    const full = rt.system.currentFull, half = rt.system.currentHalf;
    if (full) wanted[full] = Math.max(wanted[full] ?? 0, r);
    if (half) wanted[half] = Math.max(wanted[half] ?? 0, Math.floor(r / 2));
  }
  const updates = [], creates = [];
  for (const t of actor.items.filter(i => i.type === "talent")) {
    const g = wanted[t.name] ?? 0;
    if (t.system.grantedRank !== g) updates.push({ _id: t.id, "system.grantedRank": g });
    delete wanted[t.name];
  }
  for (const [name, g] of Object.entries(wanted)) {
    const src = game.items.find(i => i.type === "talent" && i.name === name);
    if (!src) { ui.notifications.warn(`Racial grant: no talent named "${name}" in the Items sidebar (import talents first).`); continue; }
    const data = src.toObject(); delete data._id; delete data.folder;
    data.system.rank = 0; data.system.grantedRank = g;
    creates.push(data);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, { komSync: true });
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates, { komSync: true });
}
