# Daggah

Dark-fantasy, portrait (9:16) browser auto-combat RPG. Current slice: four classes (Warrior, Mage, Ranger, Rogue), Acts 1–6, gear sets, skills, dungeons and local save.

Stack: Vite + TypeScript + Phaser 3. Phaser renders the stage (camp and battle); DOM/CSS renders the HUD, panes and modals.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (open in a phone-sized window or devtools mobile view)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # unit tests + headless balance simulation
npm run art        # re-slice generated art from art-src/ into public/assets/ (needs python3 + Pillow/numpy/scipy)
```

## What is in this slice

- **Class pick**: on a new save (or after Reset), choose Warrior / Mage / Ranger / Rogue. Class is locked for the season; reset to pick again.
- **Camp**: 12-slot gear pane, HP and Energy orbs, level/XP track, speed toggle, onboarding quest strip, bag, hero stats and settings.
- **Battle**: auto-combat west→east through stage nodes. Skills fire from the equipped 4-bar; center **Battle** starts a run and force-casts Primary mid-fight.
- **Skill**: each class has 2 playstyles × 4 skills (8 total). Equip freely within class out of combat.
- **Adventure**: Acts 1–6 (Ember Hollow, Deep Cavern, Bone Gallery, Frostvein, Witchmire, Cinderreach), 5 stages each. Dungeons: Hollow Crypt, Cavern Vault, Ossuary, Rime Vault, Mire Sanctum, Cinder Forge. Keys regenerate over time; sweep after first clear.
- **Sets**: Ember Raider, Cavern Cleaver/Bulwark, Gravemarch, Ashen Codex, Rime Circlet, Quillstorm, Deadeye, Cinderstride (2/4/6-piece bonuses).
- **Gear compare**: CP + per-stat deltas; Replace / Salvage / bag keep. Auto-salvage options in Settings.
- **Town**: stub cards + onboarding quests + Settings.
- **Save**: `daggah.save.v2` (migrates readable Warrior v1 saves). Autosaves on change and every 5s.

Out of scope: Acts 7–10, Nightscar, clans/4v4, seasons server.

## Controls

- Bottom nav: Camp · Skill · Battle · Adventure · Town.
- Center **Battle**: start current stage, then force-cast Primary.
- Top-right HUD swords: start or retreat. Speed cycles unlocked multipliers.
- Settings playtest tools: +500 XP, +1 Level, Clear Acts 1–6, +Keys +Crystals, Roll 5 drops, Reset save (reopens class pick).

## Project layout

```
src/data/    types, XP, skills (all classes), gear/sets/CP, acts 1-6 + enemies, quests
src/game/    combat engine, Game controller, save, tests
src/stage/   Phaser StageScene
src/ui/      DOM panes, modals (incl. class pick), HUD
scripts/     process-art.py
art-src/     raw generated art → public/assets/
```

`src/game/sim.test.ts` auto-plays a Warrior through all 30 stages and smoke-clears Act 1 on Mage/Ranger/Rogue.

## Design assumptions

- CP uses the GDD formula (smaller than the reference "+167" scale).
- Quest 1 pays 300 crystals.
- Mid/late enemy growth softens after Act 2 and again after Act 4 so Acts 5–6 stay clearable with dungeon farming.
- Art is best-effort dark-fantasy cartoon (Sonnet 5.5 unavailable for GenerateImage this run); chroma-keyed via `npm run art`.

## Playtest checklist

1. Fresh load → class pick → pick each class once (reset between) and confirm hero sprite + default loadout.
2. Warrior: Battle 1-1, loot compare, salvage 5, claim quest.
3. Skill pane: switch both playstyles, equip 4 skills, set Primary star.
4. Adventure: push into Act 5 Witchmire and Act 6 Cinderreach; enter Mire Sanctum / Cinder Forge.
5. Settings → Clear Acts 1–6, farm a dungeon, Review Gear.
6. Reload: progress persists. Reset: class pick returns.
