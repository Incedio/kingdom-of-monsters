import { getTalentLevel } from "./combat.mjs";

const { DialogV2 } = foundry.applications.api;

/** Weapon combat talents -> the base weapon they start with (Talent doc "Starting gear (Draft)"). */
const WEAPON_TALENTS = {
  "Archery": "bow", "Axe Combat": "axe", "Dagger Combat": "dagger", "Hammer Combat": "hammer",
  "Polearm Combat": "polearm", "Sword Combat": "sword", "Unarmed Combat": "unarmed"
};
/** Crafting talents -> which list their 2 Common tier 1 picks come from ("Starting materials (Draft)"). */
const CRAFT_TALENTS = {
  "Alchemy": "alchemy", "Blacksmithing": "blacksmithing", "Construct-ion": "blacksmithing",
  "Magical Recipes": "cooking", "Rune Smithing": "blacksmithing"
};
/** Ogre: Song of the Forge path -> its special material (Racial doc). */
const SONG_MATERIAL = { "Song of the Sky": "Electrum", "Song of the Sea": "Condensed Rain", "Song of the Mountain": "Condensed Fire" };

let MATERIALS = null;
async function materials() {
  if (!MATERIALS) MATERIALS = await (await fetch("systems/kingdom-of-monsters/data/materials.json")).json();
  return MATERIALS;
}
const common = (list, craft) => list.filter(m => m.system.craft === craft
  && m.system.rarity.toLowerCase() === "common" && (m.system.tier ?? 1) === 1);

/** Create the 230 materials / reagents / ingredients as world items, in folders. */
export async function importMaterials() {
  const list = await materials();
  const existing = new Set(game.items.filter(i => i.type === "material").map(i => i.name));
  const toCreate = list.filter(m => !existing.has(m.name)).map(m => foundry.utils.deepClone(m));
  if (!toCreate.length) return ui.notifications.info("All materials already exist.");
  const names = { blacksmithing: "Materials: Blacksmithing", alchemy: "Materials: Alchemy reagents", cooking: "Materials: Cooking ingredients" };
  const folders = {};
  for (const [craft, name] of Object.entries(names)) {
    let f = game.folders.find(f => f.type === "Item" && f.name === name);
    if (!f) f = await Folder.create({ name, type: "Item" });
    folders[craft] = f.id;
  }
  for (const m of toCreate) m.folder = folders[m.system.craft];
  await Item.createDocuments(toCreate);
  ui.notifications.info(`Created ${toCreate.length} material item(s).`);
}

function picker(name, options) {
  const opts = options.map(m => `<option value="${m.name}">${m.name} (${m.system.category}) - ${m.system.summary}</option>`).join("");
  return `<select name="${name}">${opts}</select>`;
}

/** Character-creation starting gear from the character's talents. */
export async function startingGear(actor) {
  if (actor.getFlag("kingdom-of-monsters", "startingGear")) {
    const again = await DialogV2.confirm({
      window: { title: "Starting gear already taken" },
      content: `<p>${actor.name} already took starting gear. Take it again anyway?</p>`
    });
    if (!again) return;
  }
  const list = await materials();
  const pools = { blacksmithing: common(list, "blacksmithing"), alchemy: common(list, "alchemy"), cooking: common(list, "cooking") };
  const hasBS = getTalentLevel(actor, "Blacksmithing") >= 1;
  const sections = [];

  for (const [talent, base] of Object.entries(WEAPON_TALENTS)) {
    if (getTalentLevel(actor, talent) < 1) continue;
    const key = base;
    const label = base[0].toUpperCase() + base.slice(1);
    if (hasBS) {
      sections.push(`<fieldset><legend>${talent}</legend>
        <label><input type="radio" name="w_${key}" value="weapon" checked> ${label} base weapon (Basic skin)</label>
        <label><input type="radio" name="w_${key}" value="materials"> 2 Common tier 1 materials instead (you have Blacksmithing):</label>
        ${picker(`w_${key}_1`, pools.blacksmithing)} ${picker(`w_${key}_2`, pools.blacksmithing)}
      </fieldset>`);
    } else {
      sections.push(`<fieldset><legend>${talent}</legend><p>${label} base weapon (Basic skin)</p>
        <input type="hidden" name="w_${key}" value="weapon"></fieldset>`);
    }
  }
  const crafts = [];
  for (const [talent, pool] of Object.entries(CRAFT_TALENTS)) {
    if (getTalentLevel(actor, talent) < 1) continue;
    const k = talent.replace(/[^a-z]/gi, "");
    crafts.push({ talent, pool, k });
    const what = pool === "alchemy" ? "reagents" : pool === "cooking" ? "ingredients" : "materials";
    sections.push(`<fieldset><legend>${talent}: 2 Common tier 1 ${what}</legend>
      ${picker(`c_${k}_1`, pools[pool])} ${picker(`c_${k}_2`, pools[pool])}</fieldset>`);
  }
  const song = actor.items.find(i => i.type === "talent" && i.name === "Song of the Forge");
  const songMat = song?.system.path ? SONG_MATERIAL[song.system.path] : null;
  if (song) sections.push(`<fieldset><legend>Song of the Forge (Ogre)</legend><p>${songMat
    ? `1 ${songMat} (${song.system.path})` : `<span class="bad">Pick a Song path on the racial talent first.</span>`}</p></fieldset>`);

  if (!sections.length) return ui.notifications.warn("No weapon combat or crafting talents yet. Set talents first.");

  const res = await DialogV2.prompt({
    window: { title: `Starting gear: ${actor.name}` },
    position: { width: 640 },
    content: `<div class="kom-gear-pick">${sections.join("")}</div>`,
    ok: { label: "Take", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object },
    rejectClose: false
  });
  if (!res) return;

  const weapons = [];
  const picked = [];
  for (const [talent, base] of Object.entries(WEAPON_TALENTS)) {
    if (getTalentLevel(actor, talent) < 1) continue;
    if (res[`w_${base}`] === "materials") picked.push(res[`w_${base}_1`], res[`w_${base}_2`]);
    else weapons.push({ name: base[0].toUpperCase() + base.slice(1), type: "weapon",
      system: { base, skin: "Basic", wielderSize: actor.system.size, equipped: true } });
  }
  for (const c of crafts) picked.push(res[`c_${c.k}_1`], res[`c_${c.k}_2`]);
  if (songMat) picked.push(songMat);

  // Stack duplicates into quantities, and add to materials the character already has.
  const counts = {};
  for (const n of picked.filter(Boolean)) counts[n] = (counts[n] ?? 0) + 1;
  const creates = [...weapons];
  const updates = [];
  for (const [n, q] of Object.entries(counts)) {
    const have = actor.items.find(i => i.type === "material" && i.name === n);
    if (have) { updates.push({ _id: have.id, "system.quantity": have.system.quantity + q }); continue; }
    const src = list.find(m => m.name === n);
    if (!src) continue;
    const data = foundry.utils.deepClone(src);
    data.system.quantity = q;
    creates.push(data);
  }
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates);
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  await actor.setFlag("kingdom-of-monsters", "startingGear", true);

  const lines = [...weapons.map(w => `${w.name} (Basic skin)`), ...Object.entries(counts).map(([n, q]) => `${q} x ${n}`)];
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="kom-chat"><h3>Starting gear</h3><p>${lines.join("<br>")}</p></div>` });
}
