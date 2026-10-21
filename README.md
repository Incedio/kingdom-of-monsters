# Kingdom of Monsters (Foundry VTT system)

Playtest system for the **Kingdom of Monsters** tabletop RPG, where the players are monsters.

## Install

In Foundry VTT (v13 or newer, verified on 14.365): **Game Systems → Install System**, paste this into **Manifest URL** and click Install:

```
https://github.com/Incedio/kingdom-of-monsters/releases/latest/download/system.json
```

## First-time setup in a world

Run these once from a Script macro (GM):

```
game.kom.importRaces()
game.kom.importTalents()
game.kom.importRacialTalents()
game.kom.importMaterials()
```

## What's in it (tier 1)

- Character creation: 45-point stat buy within race maxes, attributes, skills and skill points, talents and racial grants
- Race formula modifiers (Mandrake, Zombie, Gargoyle, Basilisk, Beast Kin, Goblin, Ogre)
- Weapons with skins, armor and shields, starting gear, crafting materials
- Martials and spells built from the art library, Known Arts tab
- Attacks and spells with Defense/Evasion, attack count, crits, stances, soul spending, over-max complexity checks
- Damage pipeline: Hardness, armor HP, Immunity, Weakness, Damage Reduction, Resistance pools, natural armor
- Conditions with token icons, Prepping / turn / Recovery automation and cure checks
- Level up with dice, stat point, talent ranks, XP and undo
