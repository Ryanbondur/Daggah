import { ACTS, getAct, stageRecLevel } from '../data/acts';
import { RARITIES, SETS, SLOTS } from '../data/gear';
import { QUESTS } from '../data/quests';
import {
  BAR_SIZE,
  CLASS_PLAYSTYLES,
  PLAYSTYLES,
  SKILL_BY_ID,
  defaultPrimary,
  isUnlocked,
  playstyleCommitted,
  skillsForPlaystyle,
} from '../data/skills';
import type { PlaystyleId, SkillId } from '../data/types';
import {
  ASCENDED_NIGHTSCAR,
  ASCENDED_SEAL_FRAGMENTS_PER_SEAL,
  formatAscendedEntryCost,
} from '../game/ascended';
import { CLAN_CREATE_COST, TOKEN_DAY_CAP, buildClanLeaderboard } from '../game/clan';
import { BRACKET_TOKEN_LOSS, BRACKET_TOKEN_WIN, bracketRangeLabel } from '../game/clanBrackets';
import { CLAN_RAID_WEEKLY_ATTEMPTS } from '../game/clanRaid';
import { NIGHTSCAR_PITY_MAX } from '../game/nightscarPity';
import { DAILY_SHOP_SIZE } from '../game/shop';
import { HERO_CLASSES } from '../data/types';
import {
  KEY_CAP,
  STAGES_PER_ACT,
  SWEEP_UNLOCK_CLEARS,
  dungeonKeyCost,
  formatDungeonKeyCost,
  formatKeyRegenLabel,
} from '../game/state';
import { asset, itemIcon, navIcon, skillIcon } from './assets';
import type { AdventureDiff, CampPane, ClanPane, UIContext } from './context';
import { fmt } from './context';
import { escapeHtml } from './escape';
import { slotHtml } from './items';
import { ICON } from './svg';

/** Shared Gold + Keys + Crystals (+ optional Ascended Seals) strip. */
export function currencyStrip(
  ctx: UIContext,
  opts: { keys?: boolean; dust?: boolean; keyTimer?: boolean; seals?: boolean } = {},
): string {
  const g = ctx.game;
  const s = g.save;
  const showKeys = opts.keys !== false;
  const showDust = !!opts.dust;
  const showSeals = opts.seals !== false;
  let keyChip = '';
  if (showKeys) {
    if (opts.keyTimer !== false) {
      g.refreshKeys();
      const keyLabel = formatKeyRegenLabel(s.keys, g.nextKeyInMs());
      keyChip = `<span class="res res-keys"><img src="${navIcon('key')}" alt="" /><span class="keys-count">${s.keys}/${KEY_CAP}</span><small class="keys-regen">${keyLabel}</small></span>`;
    } else {
      keyChip = `<span class="res"><img src="${navIcon('key')}" alt="" />${s.keys}/${KEY_CAP}</span>`;
    }
  }
  const sealChip = showSeals
    ? `<span class="res res-seals" title="Ascended Seals · ${s.ascendedSealFragments} fragments">${ICON.seal}<b>${s.ascendedSeals}</b><small class="seal-frags">${s.ascendedSealFragments}f</small></span>`
    : '';
  return `<div class="res-bar currency-strip" role="group" aria-label="Currencies">
    <span class="res"><img src="${navIcon('gold')}" alt="" /><b>${fmt(s.gold)}</b></span>
    ${keyChip}
    <span class="res"><img src="${navIcon('crystal')}" alt="" />${fmt(s.crystals)}</span>
    ${sealChip}
    ${showDust ? `<span class="res"><i class="dust"></i>${fmt(s.dust)}</span>` : ''}
  </div>`;
}

function campSubTabs(active: CampPane): string {
  const tabs: { id: CampPane; label: string }[] = [
    { id: 'gear', label: 'Gear' },
    { id: 'shop', label: 'Shop' },
  ];
  return `<div class="camp-subs" role="tablist">${tabs
    .map(
      (t) =>
        `<button type="button" class="camp-sub ${t.id === active ? 'on' : ''}" data-action="camp-pane" data-pane="${t.id}" role="tab" aria-selected="${t.id === active}">${t.label}</button>`,
    )
    .join('')}</div>`;
}

function renderCampGear(ctx: UIContext): string {
  const g = ctx.game;
  const slots = SLOTS.map((slot) => {
    const it = g.save.gear[slot];
    const area = slot;
    return slotHtml(it, {
      area,
      action: 'slot',
      slot,
      locked: !!it && it.gearLevel > g.save.level,
    });
  }).join('');
  const q = g.quest;
  const prog = g.questProgress();
  const ready = g.questReady();
  const reward = q?.reward.crystals ?? q?.reward.dust ?? q?.reward.keys ?? 0;
  const dq = g.dailyQuest;
  const dprog = g.dailyProgress();
  const dready = g.dailyReady();
  const dreward = dq.reward.crystals ?? dq.reward.dust ?? dq.reward.keys ?? 0;
  const quest = q
    ? `<button class="quest ${ready ? 'ready' : ''}" data-action="quest">
        <span class="qi"><img src="${navIcon('crystal')}" alt="" /><b>${fmt(reward)}</b></span>
        <span class="qt">${escapeHtml(q.text)}<em>(${prog}/${q.goal})</em></span>
        ${ready ? '<span class="bang">!</span>' : ''}
      </button>`
    : `<button class="quest ${dready ? 'ready' : ''}" data-action="daily-quest">
        <span class="qi"><img src="${navIcon('crystal')}" alt="" /><b>${fmt(dreward)}</b></span>
        <span class="qt">${escapeHtml(dq.text)}<em>(${dprog}/${dq.goal})</em></span>
        ${dready ? '<span class="bang">!</span>' : g.save.daily.claimed ? '<span class="bang" style="opacity:.4">✓</span>' : ''}
      </button>`;
  const bagBadge = g.save.bag.length ? `<span class="badge">${g.save.bag.length}</span>` : '';
  const tut = g.tutorialIsActive
    ? `<button class="chip tut-chip" data-action="tutorial">Tutorial</button>`
    : '';
  /* Direct pane-inner children (no .camp-gear wrapper / shop CTA) so .gear-grid
     flex:1 fills the parchment like the pre-Daily-Shop layout. */
  return `<div class="gear-grid">${slots}<div class="wing-fill">${ICON.wings}</div></div>
    <div class="bottom-row">
      ${quest}
      <div class="round-btns">
        ${tut}
        <button class="round-btn bag" data-action="bag" aria-label="Bag">${ICON.bag}${bagBadge}</button>
        <button class="round-btn" data-action="hero" aria-label="Hero">${ICON.crown}</button>
        <button class="round-btn" data-action="settings" aria-label="Settings">${ICON.shield}</button>
      </div>
    </div>`;
}

function renderCampShop(ctx: UIContext): string {
  const g = ctx.game;
  const offers = g.dailyShopOffers();
  const left = offers.filter((o) => !o.purchased).length;
  const cards = offers
    .map((o) => {
      const rarity = RARITIES[o.item.rarity];
      const setLabel = o.item.setId ? ` · ${SETS[o.item.setId].name}` : '';
      // Never use class "dim" here — that is the full-screen modal overlay
      // (position:absolute; inset:0) and stacks every unaffordable offer on top of the pane.
      const unaffordable = o.purchased || g.save.gold < o.price;
      const sold = o.purchased;
      const priceHtml = sold
        ? '<span class="sold">Sold</span>'
        : `<span class="shop-offer-price"><img src="${navIcon('gold')}" alt="" />${fmt(o.price)}</span>`;
      return `<div class="shop-offer-cell" role="listitem">
        <div class="shop-offer${unaffordable ? ' is-dim' : ''}${sold ? ' sold-out' : ''}" role="button" tabindex="${sold ? '-1' : '0'}"
          data-action="shop-buy" data-i="${o.index}" ${sold ? 'aria-disabled="true"' : ''}>
          <img class="shop-offer-icon" src="${itemIcon(o.item)}" alt="" />
          <b class="shop-offer-name" style="color:${rarity.color}">${escapeHtml(o.item.name)}</b>
          <small class="shop-offer-meta">${escapeHtml(rarity.label)}${escapeHtml(setLabel)} · Lv.${o.item.gearLevel}</small>
          ${priceHtml}
        </div>
      </div>`;
    })
    .join('');
  return `<div class="camp-shop">
    ${currencyStrip(ctx, { dust: false, keyTimer: false })}
    <div class="shop-hero">
      <b>Daily Merchant</b>
      <span>${left}/${DAILY_SHOP_SIZE} left · gold · resets midnight</span>
    </div>
    <div class="shop-list" role="list">${cards}</div>
  </div>`;
}

export function renderCamp(ctx: UIContext): string {
  const shop = ctx.campPane === 'shop';
  // Shop scrolls inside .shop-list so Gear/Shop tabs stay pinned; gear keeps pane scroll.
  return `<div class="pane-inner${shop ? ' pane-shop' : ' scroll'}">
    ${campSubTabs(ctx.campPane)}
    ${shop ? renderCampShop(ctx) : renderCampGear(ctx)}
  </div>`;
}

export function renderSkill(ctx: UIContext): string {
  const g = ctx.game;
  const lvl = g.save.level;
  const loadout = g.save.loadout.filter((id) => isUnlocked(id, lvl));
  const primary = g.save.primary && loadout.includes(g.save.primary) ? g.save.primary : defaultPrimary(loadout);
  const focus = ctx.skillBarFocus;
  const barFull = loadout.length >= BAR_SIZE;
  const slots: string[] = [];
  for (let i = 0; i < BAR_SIZE; i++) {
    const id = loadout[i];
    const focused = focus === i ? ' focus' : '';
    if (!id) {
      slots.push(
        `<button type="button" class="sb-slot empty${focused}" data-action="skill-slot" data-i="${i}" aria-label="Empty skill slot ${i + 1}"></button>`,
      );
      continue;
    }
    const def = SKILL_BY_ID[id];
    const star = def.passive
      ? ''
      : `<span class="pm ${primary === id ? 'on' : ''}" data-action="primary" data-id="${id}">${ICON.star}</span>`;
    slots.push(
      `<button type="button" class="sb-slot${focused}" data-action="skill-slot" data-i="${i}" aria-label="${def.name}"><img src="${skillIcon(id)}" alt="${def.name}" />${star}<span class="ec">${def.passive ? 'Passive' : def.energy}</span></button>`,
    );
  }
  const styles = CLASS_PLAYSTYLES[g.save.heroClass];
  let style = ctx.skillStyle;
  if (!styles.includes(style)) style = styles[0];
  ctx.skillStyle = style;
  const cards = skillsForPlaystyle(style)
    .map((s) => {
      const unlocked = isUnlocked(s.id, lvl);
      const equipped = loadout.includes(s.id);
      const meta = s.passive ? 'Passive · modifies autos' : `${s.energy} Energy  -  ${s.cd}s CD`;
      const canSwap = !equipped && barFull && focus !== null;
      const label = equipped ? 'Unequip' : canSwap ? 'Swap' : 'Equip';
      return `<div class="skill-card ${unlocked ? '' : 'locked'}${s.passive ? ' passive' : ''}">
        <div class="sicon"><img src="${skillIcon(s.id)}" alt="" />${unlocked ? '' : `<div class="lk">${ICON.lock}</div>`}</div>
        <div class="info">
          <div class="sn">${s.name}${s.ultimate ? '<small>ULTIMATE</small>' : ''}${s.passive ? '<small class="pas">PASSIVE</small>' : ''}</div>
          <div class="sd">${s.desc}</div>
          <div class="sm">${unlocked ? meta : `Unlocks at Lv.${s.unlockLevel}`}</div>
        </div>
        <button type="button" class="eq ${equipped ? 'on' : ''} ${canSwap ? 'swap' : ''}" data-action="toggle-skill" data-id="${s.id}" ${unlocked ? '' : 'disabled style="opacity:.45"'}>${label}</button>
      </div>`;
    })
    .join('');
  const tab = (id: PlaystyleId) =>
    `<button type="button" class="tb ${style === id ? 'on' : ''}" data-action="style" data-id="${id}">${PLAYSTYLES[id].name}</button>`;
  const locked = g.mode !== 'camp' ? '<div class="note">In battle: retreat to camp to swap skills.</div>' : '';
  const committed = playstyleCommitted(loadout, style);
  const identity = committed
    ? `<div class="note good">Playstyle locked in — ${PLAYSTYLES[style].name} set bonuses at full power.</div>`
    : `<div class="note">Equip ≥3 ${PLAYSTYLES[style].name} skills to unlock that set's 4/6 bonuses (beats raw CP).</div>`;
  const swapHint = barFull
    ? focus !== null
      ? `<div class="tagline" style="text-align:center">Slot ${focus + 1} selected — tap Equip/Swap on a skill (including passives) to replace it.</div>`
      : `<div class="tagline" style="text-align:center">Bar full: tap a slot above, then Equip to swap. Equipping the other playstyle passive replaces the current one.</div>`
    : `<div class="tagline" style="text-align:center">Star = Primary. Each class has 2 passives (one per playstyle) — Equip swaps between them.</div>`;
  return `<div class="pane-inner scroll">
    <div class="tab-title">Skills <small>${g.save.heroClass}  -  ${loadout.length}/${BAR_SIZE} equipped</small></div>
    <div class="skillbar">${slots.join('')}</div>
    ${swapHint}
    ${identity}
    ${locked}
    <div class="tabs">${styles.map(tab).join('')}</div>
    <div class="tagline">${PLAYSTYLES[style].tagline}</div>
    ${cards}
  </div>`;
}

function fmtSeasonRemain(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${d}d ${h}h`;
}

function renderAscendedNightscarRow(ctx: UIContext): string {
  const g = ctx.game;
  const s = g.save;
  const d = ASCENDED_NIGHTSCAR;
  const open = g.ascendedUnlocked();
  const clears = s.dungeons[d.id]?.clears ?? 0;
  const sweepReady = g.dungeonSweepUnlocked(d);
  const afford = open && g.canAffordAscendedEntry();
  const costLabel = formatAscendedEntryCost();
  const pityHint = open
    ? ` <small style="font-weight:600;color:#6b655a">Pity ${s.ascendedPity ?? 0}/${NIGHTSCAR_PITY_MAX}</small>`
    : '';
  const sweepHint = open
    ? sweepReady
      ? ''
      : `  -  Sweep at ${SWEEP_UNLOCK_CLEARS} clears (${clears}/${SWEEP_UNLOCK_CLEARS})`
    : '';
  const enterTitle = afford
    ? `Enter Ascended for ${costLabel}`
    : `Need ${costLabel} (you have ${s.ascendedSeals} seals)`;
  const sweepTitle = !sweepReady
    ? `Clear ${SWEEP_UNLOCK_CLEARS} times to unlock Sweep (${clears}/${SWEEP_UNLOCK_CLEARS})`
    : afford
      ? `Sweep Ascended for ${costLabel}`
      : `Need ${costLabel} (you have ${s.ascendedSeals} seals)`;
  const buttons = open
    ? `<button class="btn red ascended-btn ${afford ? '' : 'disabled'}" data-action="dungeon-enter" data-id="${d.id}" title="${escapeHtml(enterTitle)}" ${afford ? '' : 'aria-disabled="true"'}>Enter<br /><small style="font-size:2cqw">${costLabel}</small></button>
       <button class="btn gold ascended-btn ${sweepReady && afford ? '' : 'disabled'}" data-action="dungeon-sweep" data-id="${d.id}" title="${escapeHtml(sweepTitle)}" ${sweepReady && afford ? '' : 'aria-disabled="true"'}>Sweep<br /><small style="font-size:2cqw">${costLabel}</small></button>`
    : `<div style="width:9cqw;height:9cqw">${ICON.lock}</div>`;
  return `<div class="dg ascended ${open ? '' : 'locked'}">
    <div class="dn"><b>${ICON.seal} Ascended Nightscar · Harder</b><span>${
      open
        ? `${d.floors} floors  -  Gear Lv.${d.glBand[0]}-${d.glBand[1]}  -  ${clears} clears${sweepHint}  -  better BiS odds${pityHint}`
        : 'Clear Nightscar Depths to unlock'
    }</span><br /><span>Costs ${costLabel}. Clearable without BiS — BiS is lucky upside.</span></div>
    ${buttons}
  </div>`;
}

function adventureDiffTabs(active: AdventureDiff): string {
  const tabs: { id: AdventureDiff; label: string }[] = [
    { id: 'normal', label: 'Normal' },
    { id: 'ascended', label: 'Ascended' },
  ];
  return `<div class="diff-row" role="tablist" aria-label="Adventure difficulty">${tabs
    .map(
      (t) =>
        `<button type="button" class="chip ${t.id === active ? 'on' : ''}" data-action="adventure-diff" data-diff="${t.id}" role="tab" aria-selected="${t.id === active}">${t.label}</button>`,
    )
    .join('')}</div>`;
}

function renderSealCraftPanel(ctx: UIContext): string {
  const g = ctx.game;
  const s = g.save;
  const canCraft = s.ascendedSealFragments >= ASCENDED_SEAL_FRAGMENTS_PER_SEAL;
  return `<div class="seal-panel" data-seal-panel>
    <div class="seal-panel-head">
      <span class="seal-ico">${ICON.seal}</span>
      <div>
        <b>Ascended Seals</b>
        <span>${s.ascendedSeals} seals · ${s.ascendedSealFragments} fragments (${ASCENDED_SEAL_FRAGMENTS_PER_SEAL} → 1)</span>
      </div>
    </div>
    <button type="button" class="btn stone ${canCraft ? '' : 'disabled'}" data-action="craft-seal" ${canCraft ? '' : 'aria-disabled="true"'} title="Craft Ascended Seal from fragments">Craft Seal</button>
  </div>`;
}

function renderNormalAdventureActs(ctx: UIContext): string {
  const g = ctx.game;
  const s = g.save;
  return ACTS.map((act) => {
    const base = (act.id - 1) * STAGES_PER_ACT;
    const chips = Array.from({ length: STAGES_PER_ACT }, (_, i) => {
      const idx = base + i;
      const cleared = idx < s.stagesCleared;
      const unlocked = idx <= s.stagesCleared;
      const cur = idx === s.currentStage;
      const frontier = idx === s.stagesCleared && idx < ACTS.length * STAGES_PER_ACT;
      return `<button class="stg ${cleared ? 'cleared' : ''} ${cur ? 'cur' : ''} ${unlocked ? '' : 'lock'}" data-action="stage" data-i="${idx}">
        ${frontier ? '<span class="frontier">PUSH</span>' : ''}${act.id}-${i + 1}${cleared ? `<span class="tick">${ICON.check}</span>` : ''}
      </button>`;
    }).join('');
    const d = act.dungeon!;
    const open = g.dungeonUnlocked(d);
    const clears = s.dungeons[d.id]?.clears ?? 0;
    const sweepReady = g.dungeonSweepUnlocked(d);
    const keysOk = open && g.canAffordDungeonKeys(act.id);
    const keyCost = dungeonKeyCost(act.id);
    const keyCostLabel = formatDungeonKeyCost(keyCost);
    const lo = stageRecLevel(act.id, 1);
    const hi = stageRecLevel(act.id, 5);
    const pityHint =
      d.endgame && open
        ? ` <small style="font-weight:600;color:#6b655a">Pity ${s.nightscarPity ?? 0}/${NIGHTSCAR_PITY_MAX}</small>`
        : '';
    const sweepHint = open
      ? sweepReady
        ? ''
        : `  -  Sweep at ${SWEEP_UNLOCK_CLEARS} clears (${clears}/${SWEEP_UNLOCK_CLEARS})`
      : '';
    const enterTitle = keysOk
      ? `Enter for ${keyCostLabel}`
      : `Out of Keys — buy with Crystals (${keyCostLabel}; you have ${s.keys})`;
    const sweepTitle = !sweepReady
      ? `Clear ${SWEEP_UNLOCK_CLEARS} times to unlock Sweep (${clears}/${SWEEP_UNLOCK_CLEARS})`
      : keysOk
        ? `Sweep for ${keyCostLabel}`
        : `Out of Keys — buy with Crystals (${keyCostLabel}; you have ${s.keys})`;
    // Enter stays clickable when short on keys (opens crystal buy confirm). Sweep stays locked until unlock.
    const buttons = open
      ? `<button class="btn red" data-action="dungeon-enter" data-id="${d.id}" title="${escapeHtml(enterTitle)}">Enter<br /><small style="font-size:2.2cqw">${keyCostLabel}</small></button>
         <button class="btn gold ${sweepReady ? '' : 'disabled'}" data-action="dungeon-sweep" data-id="${d.id}" title="${escapeHtml(sweepTitle)}" ${sweepReady ? '' : 'aria-disabled="true"'}>Sweep<br /><small style="font-size:2.2cqw">${keyCostLabel}</small></button>`
      : `<div style="width:9cqw;height:9cqw">${ICON.lock}</div>`;
    return `<div class="act-card">
      <div class="act-head"><span>Act ${act.id}: ${act.name}</span><small>Rec. Lv.${lo}-${hi}</small></div>
      <div class="stage-row">${chips}</div>
      <div class="dg ${open ? '' : 'locked'}">
        <div class="dn"><b>${d.name}${d.endgame ? ' · Endgame' : ''}</b><span>${open ? `${d.floors} floors  -  Gear Lv.${d.glBand[0]}-${d.glBand[1]}  -  ${clears} clears${sweepHint}${d.endgame ? '  -  stingy drops' : ''}${pityHint}` : `Clear Act ${act.id} to unlock`}</span><br /><span>Sets: ${d.sets.map((x) => x.replace(/-/g, ' ')).join(', ')}</span></div>
        ${buttons}
      </div>
    </div>`;
  }).join('');
}

export function renderAdventure(ctx: UIContext): string {
  const g = ctx.game;
  const s = g.save;
  const diff = ctx.adventureDiff === 'ascended' ? 'ascended' : 'normal';
  const res = currencyStrip(ctx, { dust: true, keyTimer: true, seals: true });
  const power = g.stagePowerReadout(s.currentStage);
  const powerCls = power.underpowered ? 'low' : 'ok';
  const body =
    diff === 'ascended'
      ? `<div class="act-card ascended-only">
          <div class="act-head"><span>Ascended</span><small>Seal-gated endgame</small></div>
          ${renderAscendedNightscarRow(ctx)}
        </div>`
      : renderNormalAdventureActs(ctx);
  const titleLabel = diff === 'ascended' ? 'Ascended' : 'Normal';
  return `<div class="pane-inner scroll">
    <div class="tab-title">Adventure <small>[${titleLabel}]</small></div>
    ${res}
    ${renderSealCraftPanel(ctx)}
    <div class="cp-vs-stage ${powerCls}">
      <span>Your CP <b>${fmt(power.yourCp)}</b></span>
      <span>Stage rec <b>${fmt(power.recCp)}</b></span>
      <span class="delta">${power.underpowered ? 'Farm gear' : 'Ready to push'}</span>
    </div>
    ${adventureDiffTabs(diff)}
    ${body}
  </div>`;
}

function clanSubTabs(active: ClanPane): string {
  const tabs: { id: ClanPane; label: string }[] = [
    { id: 'hall', label: 'Hall' },
    { id: 'board', label: 'Leaderboard' },
    { id: 'town', label: 'Town' },
  ];
  return `<div class="clan-subs" role="tablist">${tabs
    .map(
      (t) =>
        `<button type="button" class="clan-sub ${t.id === active ? 'on' : ''}" data-action="clan-pane" data-pane="${t.id}" role="tab" aria-selected="${t.id === active}">${t.label}</button>`,
    )
    .join('')}</div>`;
}

function renderClanHallPane(ctx: UIContext): string {
  const g = ctx.game;
  const clan = g.clan;
  if (!clan) {
    return `<div class="clan-panel">
      <p class="ai-banner">Solo playtest: create or join a clan, fill AI teammates, then queue 4v4. Live multiplayer is not online yet.</p>
      <div class="clan-forms">
        <section class="clan-form">
          <h3>Create a clan</h3>
          <p>Found your banner for <b>${CLAN_CREATE_COST}</b> crystals. You become leader.</p>
          <label class="field">Clan name<input id="clan-name" maxlength="24" placeholder="Nightscar Wolves" autocomplete="off" /></label>
          <button type="button" class="btn red" data-action="clan-create">Create (−${CLAN_CREATE_COST} crystals)</button>
        </section>
        <section class="clan-form">
          <h3>Join a clan</h3>
          <p>Enter a code to join a local mock hall.</p>
          <label class="field">Join code<input id="clan-code" maxlength="8" placeholder="ABC123" style="text-transform:uppercase" autocomplete="off" /></label>
          <button type="button" class="btn gold" data-action="clan-join">Join with code</button>
        </section>
      </div>
      <button type="button" class="btn stone clan-practice-cta" data-action="clan-practice">Queue practice 4v4 (AI)</button>
    </div>`;
  }

  const missing = g.clanMissingClasses();
  const rows = clan.members
    .map((m) => {
      const badge = m.isPlayer ? '<span class="ai-pill you">YOU</span>' : '<span class="ai-pill">AI</span>';
      return `<div class="clan-member"><span>${badge} ${escapeHtml(m.name)} <small>${escapeHtml(m.role)}</small></span><b>${m.heroClass} · ${fmt(m.cp)} CP</b></div>`;
    })
    .join('');
  const classCheck = HERO_CLASSES.map((c) => {
    const ok = clan.members.some((m) => m.heroClass === c);
    return `<span class="class-pip ${ok ? 'on' : ''}" title="${c}">${c[0]}</span>`;
  }).join('');
  const ready = g.clanRosterReady();
  const bracket = g.clanBracketStatus();
  const win = BRACKET_TOKEN_WIN[bracket.bracket];
  const loss = BRACKET_TOKEN_LOSS[bracket.bracket];
  const floorBlock = !bracket.floorMet
    ? `<p class="clan-warn">${escapeHtml(bracket.floorMessage)}</p>`
    : '';
  const challengeBtn =
    bracket.canChallengeUp && bracket.nextLabel
      ? `<button type="button" class="btn gold ${ready ? '' : 'disabled'}" data-action="clan-queue-challenge">Challenge up → ${escapeHtml(bracket.nextLabel)}</button>`
      : '';

  const raid = g.clanRaidStatus();
  const raidReady = raid.unlocked && raid.attemptsLeft > 0;
  const raidLockNote = !raid.unlocked
    ? 'Clear Nightscar Depths (Act 10) to unlock Clan Raid.'
    : raid.attemptsLeft <= 0
      ? `No attempts left this week (${CLAN_RAID_WEEKLY_ATTEMPTS}/${CLAN_RAID_WEEKLY_ATTEMPTS}).`
      : 'Solo AI boss stub — seals & fragments only (no marks / chests / bracket bonus).';

  return `<div class="clan-panel">
    <div class="clan-banner clan-banner-pane">
      <img src="${asset('ui/clan-hall.webp')}" alt="" />
      <div>
        <b>${escapeHtml(clan.name)}</b>
        <span>Code <em class="clan-code">${escapeHtml(clan.code)}</em> · ${clan.members.length} members</span>
        <div class="class-pips">${classCheck}</div>
      </div>
    </div>
    <div class="clan-bracket-card">
      <span class="clan-bracket-pill ${bracket.bracket}">${escapeHtml(bracket.label)}</span>
      <div>
        <b>Team CP ${fmt(bracket.teamCp)}</b>
        <span>${escapeHtml(bracketRangeLabel(bracket.bracket))} · Challenge-up ${bracket.challengeUpLeft}/1 today</span>
      </div>
    </div>
    <div class="clan-raid-card">
      <div class="clan-raid-head">
        <span class="seal-ico">${ICON.seal}</span>
        <div>
          <b>Clan Raid</b>
          <span>${raid.attemptsLeft}/${raid.attemptsMax} attempts · Seals ${raid.seals} · Fragments ${raid.fragments}</span>
        </div>
      </div>
      <p class="tagline">${escapeHtml(raidLockNote)}</p>
      <button type="button" class="btn red ${raidReady ? '' : 'disabled'}" data-action="clan-raid" ${raidReady ? '' : 'aria-disabled="true"'}>Start Clan Raid</button>
    </div>
    <p class="ai-banner">AI teammates &amp; rivals until live multiplayer. Your class stays human.</p>
    <div class="clan-roster">${rows}</div>
    ${
      missing.length
        ? `<p class="clan-warn">Missing ${missing.join(', ')}. Fill AI roster for 4v4.</p>`
        : `<p class="clan-ok">Roster ready — one of each class.</p>`
    }
    ${floorBlock}
    <div class="clan-actions-row">
      <button type="button" class="btn stone" data-action="clan-recruit">Fill AI roster</button>
      <button type="button" class="btn red ${ready && bracket.floorMet ? '' : 'disabled'}" data-action="clan-queue">Queue 4v4</button>
      ${challengeBtn}
      <button type="button" class="btn tan" data-action="clan-leave">Leave clan</button>
    </div>
    <p class="tagline">${escapeHtml(bracket.label)} payout Win +${win} / Loss +${loss} (cap ${TOKEN_DAY_CAP}/day). Scout ${BRACKET_TOKEN_WIN.scout}/${BRACKET_TOKEN_LOSS.scout} · Veteran ${BRACKET_TOKEN_WIN.veteran}/${BRACKET_TOKEN_LOSS.veteran} · Nightscar ${BRACKET_TOKEN_WIN.nightscar}/${BRACKET_TOKEN_LOSS.nightscar}.</p>
  </div>`;
}

function renderClanBoardPane(ctx: UIContext): string {
  const g = ctx.game;
  const clan = g.clan;
  const board = buildClanLeaderboard(
    g.save.season.seasonId,
    clan
      ? {
          name: clan.name,
          wins: g.save.clanWins,
          losses: g.save.clanLosses,
          tokens: g.save.clanTokens,
          members: clan.members.length,
        }
      : null,
  );
  const you = board.find((e) => e.isPlayer);
  const rows = board
    .slice(0, 10)
    .map((e) => {
      const mine = e.isPlayer ? ' mine' : '';
      return `<div class="lb-row${mine}" data-rank="${e.rank}">
        <span class="lb-rank">#${e.rank}</span>
        <span class="lb-name">${escapeHtml(e.name)}${e.isPlayer ? ' <em>you</em>' : ''}</span>
        <span class="lb-meta">${e.wins}W · ${e.members}</span>
        <b class="lb-score">${fmt(e.score)}</b>
      </div>`;
    })
    .join('');
  const standings = you
    ? `<p class="lb-you">Your clan ranks <b>#${you.rank}</b> with <b>${fmt(you.score)}</b> season score.</p>`
    : `<p class="lb-you">Create or join a clan to appear on the board.</p>`;

  return `<div class="clan-panel">
    <div class="lb-hero">
      <img src="${asset('ui/season-board.webp')}" alt="" />
      <div>
        <b>Clan Leaderboard</b>
        <span>Season ${g.save.season.seasonId} · local stub rivals</span>
      </div>
    </div>
    ${standings}
    <div class="lb-list">
      <div class="lb-head"><span>#</span><span>Clan</span><span>Record</span><span>Score</span></div>
      ${rows}
    </div>
    <p class="tagline">Score = wins×100 + tokens + members×8 − losses×12. Live rankings arrive with multiplayer.</p>
  </div>`;
}

function renderClanTownPane(ctx: UIContext): string {
  const g = ctx.game;
  const day = g.seasonDay;
  const remain = fmtSeasonRemain(g.seasonRemainingMs);
  const tokens = g.save.clanTokens;
  const quests = QUESTS.map((q, i) => {
    const state = i < g.save.questIndex ? 'on' : i === g.save.questIndex ? '' : 'off';
    return `<div class="row ${state}"><span>${i < g.save.questIndex ? '[x] ' : '[ ] '}${escapeHtml(q.text)}</span></div>`;
  }).join('');
  const dq = g.dailyQuest;
  const dprog = g.dailyProgress();
  const dailyRow = `<div class="row ${g.save.daily.claimed ? 'on' : g.dailyReady() ? '' : 'off'}"><span>${g.save.daily.claimed ? '[x] ' : '[ ] '}${escapeHtml(dq.text)} (${dprog}/${dq.goal})</span></div>`;

  const shopLeft = DAILY_SHOP_SIZE - g.save.shop.purchased.length;
  return `<div class="clan-panel">
    ${currencyStrip(ctx, { dust: false, keyTimer: false })}
    <div class="town-grid">
      <button type="button" class="town-card clickable shop-featured" data-action="open-daily-shop">
        <img src="${navIcon('gold')}" alt="" />
        <b>Daily Shop</b>
        <span>Rotating gear &amp; set pieces for Gold. Fresh each day.</span>
        <span class="live">${shopLeft} left · ${fmt(g.save.gold)} gold</span>
      </button>
      <div class="town-card"><img src="${asset('icons/gear-a/weapon.webp')}" alt="" /><b>Blacksmith</b><span>Dust to Gear Level upgrades.</span><span class="soon">Coming soon</span></div>
      <div class="town-card"><img src="${navIcon('crystal')}" alt="" /><b>Quartermaster</b><span>Spend crystals on keys and bag space.</span><span class="soon">Coming soon</span></div>
      <button type="button" class="town-card clickable" data-action="season-board">
        <img src="${asset('ui/season-board.webp')}" alt="" />
        <b>Season Board</b>
        <span>30-day timer, local milestones, reset.</span>
        <span class="live">Day ${day}/30 · ${remain}</span>
      </button>
      <button type="button" class="town-card clickable" data-action="clan-armorer">
        <img src="${asset('icons/gear-k/weapon.webp')}" alt="" />
        <b>Clan Armorer</b>
        <span>Spend Clan Tokens on Clanforged gear.</span>
        <span class="live">${fmt(tokens)} tokens</span>
      </button>
    </div>
    <h3 class="pane-h">Daily</h3>
    <div class="sheet-lite">${dailyRow}</div>
    <h3 class="pane-h">Campaign quests</h3>
    <div class="sheet-lite">${quests}</div>
    <button type="button" class="chip" data-action="settings" style="align-self:flex-start">Settings</button>
    <div class="tagline">Class locked for the season: ${g.save.heroClass}. Reset season to re-pick.</div>
  </div>`;
}

/** Clan tab — Hall / Leaderboard / Town services. */
export function renderClan(ctx: UIContext): string {
  const g = ctx.game;
  g.refreshClanTokenDay();
  const day = g.seasonDay;
  const remain = fmtSeasonRemain(g.seasonRemainingMs);
  const tokens = g.save.clanTokens;
  const earned = g.save.clanTokensEarnedToday;
  const pane =
    ctx.clanPane === 'board'
      ? renderClanBoardPane(ctx)
      : ctx.clanPane === 'town'
        ? renderClanTownPane(ctx)
        : renderClanHallPane(ctx);

  return `<div class="pane-inner scroll clan-tab">
    <div class="tab-title">Clan <small>Season ${g.save.season.seasonId} · Day ${day}/30 · ${remain}</small></div>
    <div class="res-bar">
      <span class="res"><img src="${asset('ui/clan-token.webp')}" alt="" />${fmt(tokens)} <small>${earned}/${TOKEN_DAY_CAP} today</small></span>
      <span class="res"><img src="${navIcon('crystal')}" alt="" />${fmt(g.save.crystals)}</span>
      <span class="res">${g.save.clanWins}W / ${g.save.clanLosses}L</span>
    </div>
    ${clanSubTabs(ctx.clanPane)}
    ${pane}
  </div>`;
}


export function actName(id: number): string {
  return getAct(id).name;
}

export function skillName(id: SkillId): string {
  return SKILL_BY_ID[id].name;
}
