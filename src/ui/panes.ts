import { ACTS, getAct, stageRecLevel } from '../data/acts';
import { SLOTS } from '../data/gear';
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
import { CLAN_CREATE_COST, TOKEN_DAY_CAP } from '../game/clan';
import { KEY_CAP, STAGES_PER_ACT } from '../game/state';
import { asset, navIcon, skillIcon } from './assets';
import type { UIContext } from './context';
import { fmt } from './context';
import { escapeHtml } from './escape';
import { slotHtml } from './items';
import { ICON } from './svg';

export function renderCamp(ctx: UIContext): string {
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
  return `<div class="pane-inner">
    <div class="gear-grid">${slots}<div class="wing-fill">${ICON.wings}</div></div>
    <div class="bottom-row">
      ${quest}
      <div class="round-btns">
        ${tut}
        <button class="round-btn bag" data-action="bag" aria-label="Bag">${ICON.bag}${bagBadge}</button>
        <button class="round-btn" data-action="hero" aria-label="Hero">${ICON.crown}</button>
        <button class="round-btn" data-action="settings" aria-label="Settings">${ICON.shield}</button>
      </div>
    </div>
  </div>`;
}

export function renderSkill(ctx: UIContext): string {
  const g = ctx.game;
  const lvl = g.save.level;
  const loadout = g.save.loadout.filter((id) => isUnlocked(id, lvl));
  const primary = g.save.primary && loadout.includes(g.save.primary) ? g.save.primary : defaultPrimary(loadout);
  const slots: string[] = [];
  for (let i = 0; i < BAR_SIZE; i++) {
    const id = loadout[i];
    if (!id) {
      slots.push('<div class="sb-slot empty"></div>');
      continue;
    }
    const def = SKILL_BY_ID[id];
    const star = def.passive
      ? ''
      : `<span class="pm ${primary === id ? 'on' : ''}" data-action="primary" data-id="${id}">${ICON.star}</span>`;
    slots.push(
      `<button class="sb-slot" data-action="toggle-skill" data-id="${id}"><img src="${skillIcon(id)}" alt="${def.name}" />${star}<span class="ec">${def.passive ? 'Passive' : def.energy}</span></button>`,
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
      const meta = s.passive ? 'Passive' : `${s.energy} Energy  -  ${s.cd}s CD`;
      return `<div class="skill-card ${unlocked ? '' : 'locked'}">
        <div class="sicon"><img src="${skillIcon(s.id)}" alt="" />${unlocked ? '' : `<div class="lk">${ICON.lock}</div>`}</div>
        <div class="info">
          <div class="sn">${s.name}${s.ultimate ? '<small>ULTIMATE</small>' : ''}</div>
          <div class="sd">${s.desc}</div>
          <div class="sm">${unlocked ? meta : `Unlocks at Lv.${s.unlockLevel}`}</div>
        </div>
        <button class="eq ${equipped ? 'on' : ''}" data-action="toggle-skill" data-id="${s.id}" ${unlocked ? '' : 'disabled style="opacity:.45"'}>${equipped ? 'Unequip' : 'Equip'}</button>
      </div>`;
    })
    .join('');
  const tab = (id: PlaystyleId) =>
    `<button class="tb ${style === id ? 'on' : ''}" data-action="style" data-id="${id}">${PLAYSTYLES[id].name}</button>`;
  const locked = g.mode !== 'camp' ? '<div class="note">In battle: retreat to camp to swap skills.</div>' : '';
  const committed = playstyleCommitted(loadout, style);
  const identity = committed
    ? `<div class="note good">Playstyle locked in — ${PLAYSTYLES[style].name} set bonuses at full power.</div>`
    : `<div class="note">Equip ≥3 ${PLAYSTYLES[style].name} skills to unlock that set's 4/6 bonuses (beats raw CP).</div>`;
  return `<div class="pane-inner scroll">
    <div class="tab-title">Skills <small>${g.save.heroClass}  -  ${loadout.length}/${BAR_SIZE} equipped</small></div>
    <div class="skillbar">${slots.join('')}</div>
    <div class="tagline" style="text-align:center">Star = Primary skill (center Battle button). Loadout swaps beat mismatched high-CP gear.</div>
    ${identity}
    ${locked}
    <div class="tabs">${styles.map(tab).join('')}</div>
    <div class="tagline">${PLAYSTYLES[style].tagline}</div>
    ${cards}
  </div>`;
}

function fmtTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function fmtSeasonRemain(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${d}d ${h}h`;
}

export function renderAdventure(ctx: UIContext): string {
  const g = ctx.game;
  const s = g.save;
  g.refreshKeys();
  const keyTimer = s.keys < KEY_CAP ? ` <small style="font-weight:600;color:#6b655a">+1 in ${fmtTime(g.nextKeyInMs())}</small>` : '';
  const res = `<div class="res-bar">
    <span class="res"><img src="${navIcon('key')}" alt="" />${s.keys}/${KEY_CAP}${keyTimer}</span>
    <span class="res"><img src="${navIcon('crystal')}" alt="" />${fmt(s.crystals)}</span>
    <span class="res"><i class="dust"></i>${fmt(s.dust)}</span>
  </div>`;
  const acts = ACTS.map((act) => {
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
    const cleared = g.dungeonCleared(d);
    const clears = s.dungeons[d.id]?.clears ?? 0;
    const lo = stageRecLevel(act.id, 1);
    const hi = stageRecLevel(act.id, 5);
    const buttons = open
      ? `<button class="btn red" data-action="dungeon-enter" data-id="${d.id}">Enter<br /><small style="font-size:2.2cqw">1 Key</small></button>
         <button class="btn gold ${cleared ? '' : 'disabled'}" data-action="dungeon-sweep" data-id="${d.id}">Sweep<br /><small style="font-size:2.2cqw">1 Key</small></button>`
      : `<div style="width:9cqw;height:9cqw">${ICON.lock}</div>`;
    return `<div class="act-card">
      <div class="act-head"><span>Act ${act.id}: ${act.name}</span><small>Rec. Lv.${lo}-${hi}</small></div>
      <div class="stage-row">${chips}</div>
      <div class="dg ${open ? '' : 'locked'}">
        <div class="dn"><b>${d.name}${d.endgame ? ' · Endgame' : ''}</b><span>${open ? `${d.floors} floors  -  Gear Lv.${d.glBand[0]}-${d.glBand[1]}  -  ${clears} clears${d.endgame ? '  -  stingy drops' : ''}` : `Clear Act ${act.id} to unlock`}</span><br /><span>Sets: ${d.sets.map((x) => x.replace(/-/g, ' ')).join(', ')}</span></div>
        ${buttons}
      </div>
    </div>`;
  }).join('');
  return `<div class="pane-inner scroll">
    <div class="tab-title">Adventure <small>[Normal]</small></div>
    ${res}
    <div class="diff-row"><button class="chip" style="background:#3a3644;color:#ffe9a8">Normal</button><button class="chip" style="opacity:.5">Hard (soon)</button><button class="chip" style="opacity:.5">Torment (soon)</button></div>
    ${acts}
  </div>`;
}

export function renderTown(ctx: UIContext): string {
  const g = ctx.game;
  g.refreshClanTokenDay();
  const day = g.seasonDay;
  const remain = fmtSeasonRemain(g.seasonRemainingMs);
  const clan = g.clan;
  const tokens = g.save.clanTokens;
  const earned = g.save.clanTokensEarnedToday;
  const quests = QUESTS.map((q, i) => {
    const state = i < g.save.questIndex ? 'on' : i === g.save.questIndex ? '' : 'off';
    return `<div class="row ${state}"><span>${i < g.save.questIndex ? '[x] ' : '[ ] '}${escapeHtml(q.text)}</span></div>`;
  }).join('');
  const dq = g.dailyQuest;
  const dprog = g.dailyProgress();
  const dailyRow = `<div class="row ${g.save.daily.claimed ? 'on' : g.dailyReady() ? '' : 'off'}"><span>${g.save.daily.claimed ? '[x] ' : '[ ] '}${escapeHtml(dq.text)} (${dprog}/${dq.goal})</span></div>`;
  const clanHint = clan
    ? `${escapeHtml(clan.name)} · ${clan.members.length} (AI OK) · ${g.clanRosterReady() ? 'Roster ready' : 'Fill AI roster'}`
    : `Create (${CLAN_CREATE_COST} crystals) or practice 4v4 vs AI`;
  return `<div class="pane-inner scroll">
    <div class="tab-title">Town <small>Season ${g.save.season.seasonId}  -  Day ${day}/30 · ${remain}</small></div>
    <div class="res-bar">
      <span class="res"><img src="${asset('ui/clan-token.webp')}" alt="" />${fmt(tokens)} <small>${earned}/${TOKEN_DAY_CAP} today</small></span>
      <span class="res"><img src="${navIcon('crystal')}" alt="" />${fmt(g.save.crystals)}</span>
      <span class="res">${g.save.clanWins}W / ${g.save.clanLosses}L</span>
    </div>
    <div class="town-grid">
      <div class="town-card"><img src="${asset('icons/gear-a/weapon.webp')}" alt="" /><b>Blacksmith</b><span>Dust to Gear Level upgrades.</span><span class="soon">Coming soon</span></div>
      <div class="town-card"><img src="${navIcon('crystal')}" alt="" /><b>Quartermaster</b><span>Spend crystals on keys and bag space.</span><span class="soon">Coming soon</span></div>
      <button class="town-card clickable" data-action="clan-hall">
        <img src="${asset('ui/clan-hall.webp')}" alt="" />
        <b>Clan Hall</b>
        <span>4v4 auto-battles with AI fillers until live MP.</span>
        <span class="live">${clanHint}</span>
      </button>
      <button class="town-card clickable" data-action="season-board">
        <img src="${asset('ui/season-board.webp')}" alt="" />
        <b>Season Board</b>
        <span>30-day timer, local milestones, reset.</span>
        <span class="live">Day ${day}/30 · ${remain}</span>
      </button>
      <button class="town-card clickable" data-action="clan-armorer">
        <img src="${asset('icons/gear-k/weapon.webp')}" alt="" />
        <b>Clan Armorer</b>
        <span>Spend Clan Tokens on Clanforged gear.</span>
        <span class="live">${fmt(tokens)} tokens</span>
      </button>
    </div>
    <h3 style="margin:1cqw 0 0;font-family:var(--font-title);font-size:3.6cqw">Daily</h3>
    <div class="sheet-lite">${dailyRow}</div>
    <h3 style="margin:1cqw 0 0;font-family:var(--font-title);font-size:3.6cqw">Campaign quests</h3>
    <div class="sheet-lite">${quests}</div>
    <button class="chip" data-action="settings" style="align-self:flex-start">Settings</button>
    <div class="tagline">Class locked for the season: ${g.save.heroClass}. Reset season (or save) to re-pick. Clan 4v4 uses your equipped gear and skill bar.</div>
  </div>`;
}

export function actName(id: number): string {
  return getAct(id).name;
}

export function skillName(id: SkillId): string {
  return SKILL_BY_ID[id].name;
}
