# Daggah

Dark-fantasy, portrait (9:16) browser auto-combat RPG. This is the first vertical slice: one class (Warrior), Acts 1-2, gear, skills, dungeons and local save.

Stack: Vite + TypeScript + Phaser 3. Phaser renders the stage (camp and battle); DOM/CSS renders the HUD, panes and modals.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (open in a phone-sized window or devtools mobile view)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # unit tests + headless balance simulation
npm run art        # re-slice generated art from art-src/ into public/assets/ (needs python3 + Pillow)
```

## What is in the slice

- **Camp**: 12-slot gear pane (weapon, chest, helmet, shoulders, belt, gloves, bracers, legs, boots, amulet, medal, ring), HP and Energy orbs, level/XP track, speed toggle, onboarding quest strip, bag, hero stats and settings.
- **Battle**: heroes auto-attack west to east through a chain of stage nodes (normal, elite, mini-boss, boss). Energy skills fire automatically from the equipped bar; the center **Battle** button starts a run and, during a fight, force-casts your primary skill.
- **Skill**: Warrior with two playstyles, **Bladestorm** (AoE cleave, Cleave stacks into Whirlwind and Bladestorm) and **Ironclad** (guard, Shield Bash, Iron Skin, Rally, War Banner, Executioner's Guard). 8 skills, 4 bar slots, one primary (star). Unlock levels follow the GDD (Bladestorm is Lv7).
- **Adventure**: Act 1 (Ember Hollow) and Act 2 (Deep Cavern), 5 stages each with replay. Each act has a dungeon (Hollow Crypt, Cavern Vault) that costs a key, drops set gear and can be swept after the first clear. Keys regenerate over time.
- **Gear compare**: every drop opens a compare modal with per-stat deltas and a CP delta. **Replace**, **Salvage**, or tap outside to keep it in the bag. "Auto-salvage replaced gear" and "auto-salvage non-upgrades" live in Settings.
- **Town**: stub with "coming soon" cards, the onboarding quest list and Settings.
- **Progression**: XP table and Warrior stats from the GDD, Lv1-20, 1.5x speed at Lv5, 2x at Lv10.
- **Save**: localStorage key `daggah.save.v1` (class, level, XP, gear, bag, currencies, act/dungeon progress, loadout, settings). Autosaves on change and every 5 seconds.

Out of scope here: other classes, Acts 3-10, Nightscar, clans/4v4, seasons server.

## Controls

- Tap the bottom nav to switch Camp, Skill, Adventure and Town.
- Center **Battle**: start a run from the current stage, then tap to force-cast the primary skill.
- Top-right HUD button: start or retreat. Speed button cycles unlocked speeds.
- Settings (Camp quest strip or Town) has playtest tools: +500 XP, +1 Level, Clear Acts 1-2, +Keys +Crystals, Roll 5 drops, Reset save.

## Project layout

```
src/data/    types, XP table, skills, gear/rarity/sets/CP, acts and enemies, quests
src/game/    pure combat engine (fixed step, seeded RNG), Game controller, save, tests
src/stage/   Phaser StageScene (parallax, camp props, sprites, FX, damage text)
src/ui/      DOM panes, modals, HUD, inline SVG icons
scripts/     process-art.py (chroma-key + slice generated sheets)
art-src/     raw generated art; public/assets/ holds the processed sprites and UI
```

The combat engine has no Phaser or DOM dependency, so `src/game/sim.test.ts` runs a whole auto-played campaign headlessly and asserts the 10 playable stages are clearable at a sane pace.

## Design assumptions

- CP uses the GDD formula, so its numbers are smaller than the reference screenshots' "+167" scale.
- Quest 1 reward is 300 crystals (matches the reference).
- "Battle" has no separate pane: it is the center button plus the live stage view.
- Dev/playtest tools are in Settings rather than behind a flag, to make review quick.
- Art was generated against the reference images, chroma-keyed and sliced by `scripts/process-art.py`.

## Playtest checklist

1. Fresh load: Camp shows 12 common Lv.1 slots, sleeping hero by the fire, quest "Salvage 5 pcs of Gear".
2. Press **Battle**: clear Stage 1-1, watch loot compare modals. Replace, Salvage and tap-outside all behave.
3. Settings > +1 Level a few times to Lv7, open Skill, switch playstyle, equip Bladestorm and watch the swirl FX.
4. Adventure: clear Act 1 and Act 2 stages, enter and sweep a dungeon, review the result modal.
5. Salvage 5 items and claim the first quest.
6. Reload the page: progress, gear and settings persist. Reset save returns to a fresh start.

## Next PR

Mage / Ranger / Rogue class data and skills, Acts 3-4 content and sets, then Nightscar and meta systems.
