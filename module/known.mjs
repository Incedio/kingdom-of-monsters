import { getTalentLevel } from "./combat.mjs";
import { MARTIAL_GROUPS, SPELL_SCHOOLS } from "./weapons-data.mjs";

/**
 * What a character knows (Talent doc learn schedule, same for every weapon / magic talent):
 * weapon talents: rank 1 = one whole school; individual arts (from any school of that weapon)
 *   at ranks 2 (+2), 4, 5, 7, 8 (+1 each) and 10 (+5) = 11 by rank 10.
 * magic talents: arts from that school at ranks 1, 2, 4, 5, 7, 8 (+1 each) and 10 (+2) = 8 by rank 10.
 * Generic spell arts belong to no school and are always available.
 */
const ART_BY_RANK   = [0, 0, 2, 2, 3, 4, 4, 5, 6, 6, 11];   // index = rank (capped at 10)
const SPELL_BY_RANK = [0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 8];
const cap = r => Math.max(0, Math.min(10, r));

let ARTS = null;
export async function loadArts() {
  ARTS ??= await (await fetch("systems/kingdom-of-monsters/data/arts.json")).json();
  return ARTS;
}
export const schoolKey = (group, school) => `${group}|${school}`;
export const martialKey = a => `m|${a.group}|${a.school}|${a.name}`;
export const spellKey = a => `s|${a.school}|${a.name}`;

/** Is this library art usable by the actor (known school, picked art, or Generic)? */
export function knows(actor, a) {
  const sys = actor.system;
  if (a.kind === "spell") return a.school === "Generic" || sys.knownArts.includes(spellKey(a));
  return sys.knownSchools.includes(schoolKey(a.group, a.school)) || sys.knownArts.includes(martialKey(a));
}

/** Everything the Known Arts tab needs. */
export async function knownContext(actor) {
  const arts = await loadArts();
  const sys = actor.system;
  const weapons = [];
  for (const [group, g] of Object.entries(MARTIAL_GROUPS)) {
    const rank = getTalentLevel(actor, g.talent);
    if (rank < 1) continue;
    const pool = arts.martial.filter(a => a.group === group);
    const schools = [...new Set(pool.map(a => a.school))];
    const knownSchools = schools.filter(s => sys.knownSchools.includes(schoolKey(group, s)));
    const pickedArts = pool.filter(a => sys.knownArts.includes(martialKey(a)) && !knownSchools.includes(a.school));
    const artAllow = ART_BY_RANK[cap(rank)];
    weapons.push({
      group, label: g.label, talent: g.talent, rank,
      schoolAllow: 1, schoolsUsed: knownSchools.length, schoolsOver: knownSchools.length > 1,
      artAllow, artsUsed: pickedArts.length, artsOver: pickedArts.length > artAllow,
      schools: schools.map(s => {
        const viaSchool = knownSchools.includes(s);
        return {
          name: s, key: schoolKey(group, s), known: viaSchool,
          arts: pool.filter(a => a.school === s).map(a => ({
            ...a, key: martialKey(a), viaSchool,
            picked: !viaSchool && sys.knownArts.includes(martialKey(a)),
            locked: a.tier === 2 && rank < 11
          }))
        };
      })
    });
  }
  const magic = [];
  for (const [school, sc] of Object.entries(SPELL_SCHOOLS)) {
    if (!sc.talent) continue;
    const rank = getTalentLevel(actor, sc.talent);
    if (rank < 1) continue;
    const pool = arts.spell.filter(a => a.school === school);
    const picked = pool.filter(a => sys.knownArts.includes(spellKey(a)));
    const allow = SPELL_BY_RANK[cap(rank)];
    magic.push({
      school, talent: sc.talent, rank, allow, used: picked.length, over: picked.length > allow,
      arts: pool.map(a => ({ ...a, key: spellKey(a), picked: sys.knownArts.includes(spellKey(a)), locked: a.tier === 2 && rank < 11 }))
    });
  }
  // Picks past a talent's allowance are paid from Extra known (Memory, Demon evolution...).
  const excess = [...weapons.map(w => Math.max(0, w.artsUsed - w.artAllow)), ...magic.map(m => Math.max(0, m.used - m.allow))]
    .reduce((a, b) => a + b, 0);
  const extraOver = excess > sys.extraKnown;
  for (const w of weapons) w.artsOver = extraOver && w.artsUsed > w.artAllow;
  for (const m of magic) m.over = extraOver && m.used > m.allow;
  const generic = arts.spell.filter(a => a.school === "Generic");
  return { weapons, magic, generic, extra: sys.extraKnown, extraUsed: excess, extraOver };
}
