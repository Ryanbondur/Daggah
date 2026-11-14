# Daggah

Dark-fantasy, portrait (9:16) browser auto-combat RPG. Current slice: four classes (Warrior, Mage, Ranger, Rogue), Acts 1–10 through Nightscar Apex, gear sets, skills, dungeons, **local clans + 4v4 auto-battle PvP**, Clanforged vendor, and a 30-day season stub.

Stack: Vite + TypeScript + Phaser 3. Phaser renders the stage (camp and battle); DOM/CSS renders the HUD, panes and modals.

## Play (Safari / iPhone)

Live app: **https://daggah.apps.grok.bot** (Vite `base` defaults to `/`).

GitHub Pages (optional): **https://ryanbondur.github.io/Daggah/** — workflow builds with `--base /Daggah/`.

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

- **Class pick**: on a new save (or after Reset / season reset), choose Warrior / Mage / Ranger / Rogue. Class is locked for the season.
- **Camp**: 12-slot gear pane, HP and Energy orbs, level/XP track, speed toggle, onboarding quest strip, bag, hero stats and settings.
- **Battle**: auto-combat west→east through stage nodes. Skills fire from the equipped 4-bar; center **Battle** starts a run and force-casts Primary mid-fight.
- **Skill**: each class has 2 playstyles × 4 skills (8 total). Equip freely within class out of combat.
- **Adventure**: Acts 1–10 (through Voidgate and Nightscar Depths), 5 stages each. Dungeons through Gate Reliquary and **Nightscar Apex** (endgame, stingy drops).
- **Sets**: Ember Raider through Nightscar Regalia, plus vendor-only **Clanforged** (2pc +8% PvP CP, 4pc +10% token gains).
- **Town**: Clan Hall (create/join, roster, 4v4 queue), Season Board (30-day timer + local reset), Clan Armorer (token shop). Blacksmith / Quartermaster still stubbed.
- **Clans / 4v4 (client-local)**: create (500 crystals) or join by code; **Fill AI roster** for the other three classes (player stays human); queue when roster has one of each class. Enemy clan is AI with endgame/scaled gear. Auto-battle uses your gear + skills; win 20 / loss 5 tokens (200/day cap). Clear AI badges until live multiplayer.
- **Save**: `daggah.save.v3` (migrates v2 / Warrior v1). Autosaves on change and every 5s.

Out of scope: server seasons / matchmaking / true multiplayer clans.

## Controls

- Bottom nav: Camp · Skill · Battle · Adventure · Town.
- Center **Battle**: start current stage, then force-cast Primary.
- Top-right HUD swords: start or retreat. Speed cycles unlocked multipliers.
- Settings playtest tools: +500 XP, +1 Level, Clear Acts 1–10, +Keys +Crystals +Tokens, Roll 5 drops, **Fill AI roster**, **Queue practice 4v4**, Reset season, Reset save.

## Project layout

```
src/data/    types, XP, skills (all classes), gear/sets/CP, acts 1-10 + enemies, quests
src/game/    combat engine, clan/PvP, Game controller, save, tests
src/stage/   Phaser StageScene
src/ui/      DOM panes, modals (clan/season/vendor/PvP), HUD
scripts/     process-art.py
art-src/     raw generated art → public/assets/
```

## Playtest checklist

1. Fast path: Settings → **Queue practice 4v4** (opens Practice Hall + AI fillers + match), or Town → Clan Hall → Create / Join.
2. Clan Hall → **Fill AI roster** → **Queue 4v4** → result modal shows AI badges and token gain.
3. Clan Armorer → buy Clanforged piece → compare/equip; 2/4pc bonuses show in hero sheet.
4. Season Board → day timer; optional local season reset → class pick returns, clan kept.
5. Reload: clan + tokens persist on `daggah.save.v3`.
