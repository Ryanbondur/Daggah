import { SETS, computeHero, setCounts } from '../data/gear';
import type { HeroClass, SetId, StatKey } from '../data/types';
import { HERO_CLASSES, STAT_LABEL } from '../data/types';
import { CLASS_BLURB, availableSpeeds, xpToNext } from '../data/xp';
import { CLAN_CREATE_COST, TOKEN_DAY_CAP, TOKEN_LOSS, TOKEN_WIN } from '../game/clan';
import { CLAN_VENDOR, type RunResult } from '../game/game';
import type { PvpResult } from '../game/pvp';
import { BAG_CAP } from '../game/state';
import { formatStat } from '../data/gear';
import { CLASS_PLAYSTYLES } from '../data/skills';
import type { UIContext } from './context';
import { fmt } from './context';
import { CHECK_SVG, cardHtml, slotHtml } from './items';
import { asset, heroSprite } from './assets';

const STAT_ORDER: StatKey[] = [
  'atk',
  'def',
  'hp',
  'critRate',
  'critDmg',
  'skillPower',
  'haste',
  'energyRegen',
];

export function showClassPick(ctx: UIContext): void {
  const cards = HERO_CLASSES.map((c: HeroClass) => {
    const styles = CLASS_PLAYSTYLES[c].join(' / ');
    return `<button class="class-card" data-action="pick-class" data-id="${c}">
      <img src="${heroSprite(c)}" alt="" draggable="false" />
      <b>${c}</b>
      <span>${CLASS_BLURB[c]}</span>
      <small>${styles}</small>
    </button>`;
  }).join('');
  const el = ctx.openModal(
    `<div class="sheet class-pick">
      <h2>Choose Your Class</h2>
      <p>Locked for this season. Reset save to pick again.</p>
      <div class="class-grid">${cards}</div>
    </div>`,
    { className: 'class-pick-dim' },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action="pick-class"]') as HTMLElement | null;
    if (!t) return;
    const id = t.dataset.id as HeroClass;
    if (ctx.game.pickClass(id)) {
      ctx.skillStyle = CLASS_PLAYSTYLES[id][0];
      ctx.closeModal();
      ctx.render();
    }
  });
}

export function showCompare(ctx: UIContext, itemId: string, source: 'pending' | 'bag'): void {
  const g = ctx.game;
  const list = source === 'pending' ? g.save.pending : g.save.bag;
  const item = list.find((i) => i.id === itemId);
  if (!item) return;
  const info = g.compareFor(item);
  let auto = g.save.settings.autoSalvageReplaced;
  const total = source === 'pending' ? g.save.pending.length : 0;

  const left = cardHtml(info.current, { gear: g.save.gear, label: 'Current Gear', assumeEquipped: true });
  const rightFooter = `
    <div class="autochk ${auto ? 'on' : ''}" data-action="auto-toggle">
      <div class="box">${CHECK_SVG}</div><div>Auto-salvage replaced gear</div>
    </div>
    <div class="cmp-btns">
      <button class="btn tan" data-action="cmp-salvage">Salvage</button>
      <button class="btn red ${info.levelOk ? '' : 'disabled'}" data-action="cmp-replace">${
        info.levelOk ? 'Replace' : `Lv.${item.gearLevel}`
      }</button>
    </div>`;
  const right = cardHtml(item, {
    gear: g.save.gear,
    cp: info.cpDelta,
    other: info.current,
    reqLevel: item.gearLevel,
    heroLevel: g.save.level,
    footer: rightFooter,
  });
  const counter =
    source === 'pending'
      ? `Pickup 1/${total}  -  tap outside to keep in bag`
      : 'Tap outside to close';

  const el = ctx.openModal(
    `<div class="cmp-wrap"><div class="cmp">${left}${right}</div><div class="cmp-counter">${counter}</div></div>`,
    {
      onDismiss: () => {
        if (source === 'pending') g.keepInBag(item);
        ctx.closeModal();
      },
    },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'auto-toggle') {
      auto = !auto;
      t.classList.toggle('on', auto);
      g.setAutoSalvageReplaced(auto);
    } else if (action === 'cmp-salvage') {
      g.salvage(item);
      ctx.closeModal();
    } else if (action === 'cmp-replace') {
      if (g.equip(item, auto)) {
        ctx.flashSlot(item.slot);
        ctx.closeModal();
      }
    }
  });
}

export function showItemInfo(ctx: UIContext, slot: string): void {
  const g = ctx.game;
  const item = g.save.gear[slot as keyof typeof g.save.gear];
  if (!item) return;
  ctx.openModal(
    `<div class="cmp" style="justify-content:center"><div style="flex:0 1 58cqw">${cardHtml(item, {
      gear: g.save.gear,
      label: 'Equipped',
      assumeEquipped: true,
    })}</div></div>`,
    { onDismiss: () => ctx.closeModal() },
  );
}

export function showBag(ctx: UIContext): void {
  const g = ctx.game;
  const bag = g.save.bag;
  const cells: string[] = [];
  for (const it of bag) cells.push(slotHtml(it, { action: 'bag-item' }));
  for (let i = bag.length; i < BAG_CAP; i++) cells.push('<div class="bag-empty"></div>');
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Bag <small style="font-size:3.2cqw;font-family:var(--font-ui)">${bag.length}/${BAG_CAP}</small></h2>
      <div class="body"><p>Tap a piece to compare it with what you have equipped.</p><div class="bag-grid">${cells.join('')}</div></div>
      <div class="btns">
        <button class="btn stone" data-action="bag-salvage-commons">Salvage Commons</button>
        <button class="btn gold" data-action="bag-close">Close</button>
      </div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.action === 'bag-item') {
      ctx.closeModal();
      ctx.showCompare(t.dataset.id!, 'bag');
    } else if (t.dataset.action === 'bag-close') {
      ctx.closeModal();
    } else if (t.dataset.action === 'bag-salvage-commons') {
      const commons = g.save.bag.filter((i) => i.rarity === 'common');
      commons.forEach((i) => g.salvage(i));
      ctx.closeModal();
      showBag(ctx);
    }
  });
}

export function showHero(ctx: UIContext): void {
  const g = ctx.game;
  const t = computeHero(g.save.level, g.save.gear, g.save.heroClass);
  const rows = STAT_ORDER.map(
    (k) => `<div class="row"><span>${STAT_LABEL[k]}</span><b>${formatStat(k, Math.round(t.stats[k] * 10) / 10)}</b></div>`,
  ).join('');
  const counts = setCounts(g.save.gear);
  const sets = (Object.keys(SETS) as SetId[])
    .filter((id) => (counts[id] ?? 0) > 0)
    .map((id) => {
      const def = SETS[id];
      const n = counts[id] ?? 0;
      return `<h3>${def.name} (${n}/6)</h3>${def.bonuses
        .map((b) => `<div class="row ${n >= b.pieces ? 'on' : 'off'}"><span>(${b.pieces}) ${b.text}</span></div>`)
        .join('')}`;
    })
    .join('');
  ctx.openModal(
    `<div class="sheet">
      <h2>${g.save.heroClass} - Lv.${g.save.level}</h2>
      <div class="body">
        <div class="row"><span>Combat Power</span><b>${fmt(t.cp)}</b></div>
        ${rows}
        ${sets || '<p style="margin-top:2cqw">Equip 2, 4 or 6 pieces of one set for bonuses.</p>'}
        <h3>Resources</h3>
        <div class="row"><span>Crystals</span><b>${fmt(g.save.crystals)}</b></div>
        <div class="row"><span>Dust</span><b>${fmt(g.save.dust)}</b></div>
        <div class="row"><span>Gold</span><b>${fmt(g.save.gold)}</b></div>
        <div class="row"><span>Dungeon Keys</span><b>${g.save.keys}/8</b></div>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  ).addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-action="close"]')) ctx.closeModal();
  });
}

export function showSettings(ctx: UIContext): void {
  const g = ctx.game;
  const s = g.save.settings;
  const speeds = availableSpeeds(g.save.level);
  const speedChips = [1, 1.5, 2]
    .map((sp) => {
      const ok = speeds.includes(sp);
      const label = `${sp}x${ok ? '' : sp === 1.5 ? ' (Lv5)' : ' (Lv10)'}`;
      return `<button class="btn ${s.speed === sp ? 'gold' : 'stone'} ${ok ? '' : 'disabled'}" data-action="speed" data-v="${sp}" style="font-size:3cqw;padding:1.6cqw .6cqw">${label}</button>`;
    })
    .join('');
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Settings</h2>
      <div class="body">
        <button class="toggle" data-action="set-auto-replaced"><span>Auto-salvage replaced gear<small>Default for the Replace dialog</small></span><i class="sw ${s.autoSalvageReplaced ? 'on' : ''}"></i></button>
        <button class="toggle" data-action="set-auto-worse"><span>Auto-salvage non-upgrades<small>Skip the compare dialog for drops that would lower your CP</small></span><i class="sw ${s.autoSalvageWorse ? 'on' : ''}"></i></button>
        <h3>Battle speed</h3>
        <div class="btns" style="margin-top:0">${speedChips}</div>
        <h3>Playtest tools</h3>
        <div class="chip-row">
          <button class="chip" data-action="dev-xp">+500 XP</button>
          <button class="chip" data-action="dev-lvl">+1 Level</button>
          <button class="chip" data-action="dev-acts">Clear Acts 1-10</button>
          <button class="chip" data-action="dev-res">+Keys +Crystals</button>
          <button class="chip" data-action="dev-loot">Roll 5 drops</button>
        </div>
        <h3>Season</h3>
        <p>Local 30-day season stub. Reset keeps clan membership and opens class pick.</p>
        <button class="chip" data-action="season-reset">Reset season (local)</button>
        <h3>Save</h3>
        <p>Progress saves automatically to this browser.</p>
        <button class="chip" data-action="reset" style="color:#8a281f">Reset save</button>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  let armed = false;
  let seasonArmed = false;
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    switch (t.dataset.action) {
      case 'close':
        ctx.closeModal();
        break;
      case 'set-auto-replaced':
        g.setAutoSalvageReplaced(!g.save.settings.autoSalvageReplaced);
        ctx.closeModal();
        showSettings(ctx);
        break;
      case 'set-auto-worse':
        g.setAutoSalvageWorse(!g.save.settings.autoSalvageWorse);
        ctx.closeModal();
        showSettings(ctx);
        break;
      case 'speed':
        g.setSpeed(Number(t.dataset.v));
        ctx.closeModal();
        showSettings(ctx);
        break;
      case 'dev-xp':
        g.devGrantXp(500);
        break;
      case 'dev-lvl':
        g.devGrantXp(Math.max(1, (g.save.level < 20 ? xpNeeded(g.save.level) - g.save.xp : 0)));
        break;
      case 'dev-acts':
        g.devUnlockThroughAct(10);
        break;
      case 'dev-res':
        g.devGrantResources();
        break;
      case 'dev-loot':
        ctx.closeModal();
        g.devRollLoot(5);
        break;
      case 'season-reset':
        if (!seasonArmed) {
          seasonArmed = true;
          t.textContent = 'Tap again to start next season';
        } else {
          g.resetSeasonLocal();
          ctx.closeModal();
          ctx.skillStyle = 'bladestorm';
          ctx.showClassPick();
        }
        break;
      case 'reset':
        if (!armed) {
          armed = true;
          t.textContent = 'Tap again to erase everything';
        } else {
          g.resetSave();
          ctx.closeModal();
          ctx.skillStyle = 'bladestorm';
          ctx.showClassPick();
        }
        break;
      default:
        break;
    }
  });
}

function xpNeeded(level: number): number {
  return xpToNext(level);
}

export function showChat(ctx: UIContext): void {
  const g = ctx.game;
  const lines = g.chat
    .slice(-14)
    .map((l) => `<div class="row"><span>${l}</span></div>`)
    .join('');
  ctx.openModal(
    `<div class="sheet">
      <h2>Chat</h2>
      <div class="tabs" style="margin-bottom:2cqw"><button class="tb on">System</button><button class="tb" style="opacity:.55">Clan</button></div>
      <div class="body">${lines}</div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  ).addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-action="close"]')) ctx.closeModal();
  });
}

export function showClanHall(ctx: UIContext): void {
  const g = ctx.game;
  g.refreshClanTokenDay();
  const clan = g.clan;
  let body = '';
  if (!clan) {
    body = `<p>Found a clan for ${CLAN_CREATE_COST} crystals, or join with a code (local mock).</p>
      <label class="field">Clan name<input id="clan-name" maxlength="24" placeholder="Nightscar Wolves" /></label>
      <button class="btn red" data-action="clan-create">Create Clan (−${CLAN_CREATE_COST})</button>
      <label class="field">Join code<input id="clan-code" maxlength="8" placeholder="ABC123" style="text-transform:uppercase" /></label>
      <button class="btn gold" data-action="clan-join">Join Clan</button>`;
  } else {
    const missing = g.clanMissingClasses();
    const rows = clan.members
      .map(
        (m) =>
          `<div class="row"><span>${m.isPlayer ? '★ ' : ''}${m.name} <small>${m.role}</small></span><b>${m.heroClass} · CP ${fmt(m.cp)}</b></div>`,
      )
      .join('');
    const classCheck = HERO_CLASSES.map((c) => {
      const ok = clan.members.some((m) => m.heroClass === c);
      return `<span class="class-pip ${ok ? 'on' : ''}">${c[0]}</span>`;
    }).join('');
    body = `<div class="clan-banner"><img src="${asset('ui/clan-hall.webp')}" alt="" /><div><b>${clan.name}</b><span>Code ${clan.code}</span><div class="class-pips">${classCheck}</div></div></div>
      <div class="body-scroll">${rows}</div>
      ${missing.length ? `<p class="warn">Missing: ${missing.join(', ')}. Recruit to fill the 4v4 roster.</p>` : '<p>Roster has one of each class — ready to queue.</p>'}
      <div class="btns" style="flex-wrap:wrap">
        <button class="btn stone" data-action="clan-recruit">Recruit roster</button>
        <button class="btn red ${g.clanRosterReady() ? '' : 'disabled'}" data-action="clan-queue">Queue 4v4</button>
        <button class="btn tan" data-action="clan-leave">Leave</button>
      </div>
      <p class="tagline">Win +${TOKEN_WIN} / Loss +${TOKEN_LOSS} tokens (cap ${TOKEN_DAY_CAP}/day). Uses your gear + skills; allies are local mocks.</p>`;
  }
  const el = ctx.openModal(
    `<div class="sheet clan-sheet">
      <h2>Clan Hall</h2>
      <div class="body">${body}</div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.action!;
    if (act === 'close') {
      ctx.closeModal();
      return;
    }
    if (act === 'clan-create') {
      const name = (el.querySelector('#clan-name') as HTMLInputElement | null)?.value ?? '';
      const err = g.createClan(name);
      if (err) g.toast(err, 'bad');
      else {
        ctx.closeModal();
        showClanHall(ctx);
      }
      return;
    }
    if (act === 'clan-join') {
      const code = (el.querySelector('#clan-code') as HTMLInputElement | null)?.value ?? '';
      const err = g.joinClan(code);
      if (err) g.toast(err, 'bad');
      else {
        ctx.closeModal();
        showClanHall(ctx);
      }
      return;
    }
    if (act === 'clan-recruit') {
      const err = g.recruitClanRoster();
      if (err) g.toast(err, err.includes('already') ? 'info' : 'bad');
      ctx.closeModal();
      showClanHall(ctx);
      return;
    }
    if (act === 'clan-queue') {
      if (!g.clanRosterReady()) {
        g.toast('Need one of each class', 'bad');
        return;
      }
      const err = g.queueClanPvp();
      if (err) g.toast(err, 'bad');
      // pvp modal opened via game event
      return;
    }
    if (act === 'clan-leave') {
      g.leaveClan();
      ctx.closeModal();
      showClanHall(ctx);
    }
  });
}

export function showSeasonBoard(ctx: UIContext): void {
  const g = ctx.game;
  const day = g.seasonDay;
  const remainH = Math.ceil(g.seasonRemainingMs / 3_600_000);
  let armed = false;
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Season ${g.save.season.seasonId}</h2>
      <div class="body">
        <div class="season-hero"><img src="${asset('ui/season-board.webp')}" alt="" />
          <div><b>Day ${day} / 30</b><span>~${remainH}h remaining</span></div>
        </div>
        <div class="row"><span>Clan record</span><b>${g.save.clanWins}W / ${g.save.clanLosses}L</b></div>
        <div class="row"><span>Clan tokens</span><b>${fmt(g.save.clanTokens)}</b></div>
        <div class="row"><span>Tokens today</span><b>${g.save.clanTokensEarnedToday} / ${TOKEN_DAY_CAP}</b></div>
        <p>Participation tiers (Recruit / Campaigner / Warlord / Legend) are design-ready; this build tracks wins and the timer only.</p>
        <p>Local reset wipes level, gear, and currencies; keeps clan membership and re-opens class pick.</p>
        <button class="chip" data-action="season-reset" style="color:#8a281f">Reset season (local)</button>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.action === 'close') ctx.closeModal();
    if (t.dataset.action === 'season-reset') {
      if (!armed) {
        armed = true;
        t.textContent = 'Tap again to confirm season reset';
      } else {
        g.resetSeasonLocal();
        ctx.closeModal();
        ctx.skillStyle = 'bladestorm';
        ctx.showClassPick();
      }
    }
  });
}

export function showClanArmorer(ctx: UIContext): void {
  const g = ctx.game;
  const offers = CLAN_VENDOR.map((o, i) => {
    const afford = g.save.clanTokens >= o.cost;
    return `<button class="vendor-row ${afford ? '' : 'dim'}" data-action="buy" data-i="${i}">
      <img src="${asset(`icons/gear-k/${o.slot}.webp`)}" alt="" />
      <span><b>${o.label}</b><small>Clanforged set · Gear Lv.18–20</small></span>
      <b class="price"><img src="${asset('ui/clan-token.webp')}" alt="" />${o.cost}</b>
    </button>`;
  }).join('');
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Clan Armorer</h2>
      <div class="body">
        <p>Spend Clan Tokens on endgame <b>Clanforged</b> gear. 2pc +8% PvP CP · 4pc +10% token gains.</p>
        <div class="row"><span>Your tokens</span><b>${fmt(g.save.clanTokens)}</b></div>
        <div class="vendor-list">${offers}</div>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.action === 'close') ctx.closeModal();
    if (t.dataset.action === 'buy') {
      const err = g.buyClanVendor(Number(t.dataset.i));
      if (err) g.toast(err, 'bad');
      else {
        ctx.closeModal();
        showClanArmorer(ctx);
      }
    }
  });
}

export function showPvpResult(ctx: UIContext, result: PvpResult, tokens: number): void {
  const ally = result.allyTeam
    .map((f) => `<div class="pvp-f"><b>${f.heroClass}</b><span>${f.name}</span><i>${f.hp}/${f.maxHp}</i></div>`)
    .join('');
  const enemy = result.enemyTeam
    .map((f) => `<div class="pvp-f"><b>${f.heroClass}</b><span>${f.name}</span><i>${f.hp}/${f.maxHp}</i></div>`)
    .join('');
  const log = result.log
    .filter((e) => e.t === 'kill' || e.t === 'end' || e.t === 'skill')
    .slice(-8)
    .map((e) => `<div class="row"><span>${e.text}</span></div>`)
    .join('');
  const el = ctx.openModal(
    `<div class="sheet pvp-sheet">
      <h2>${result.won ? 'Clan Victory' : 'Clan Defeat'}</h2>
      <div class="body">
        <div class="pvp-arena" style="background-image:url('${asset('bg/bg-clan-arena.jpg')}')"></div>
        <div class="row"><span>Score</span><b>${result.allyKills} – ${result.enemyKills}${result.timedOut ? ' (timeout)' : ''}</b></div>
        <div class="row"><span>Duration</span><b>${result.duration}s</b></div>
        <div class="row"><span>Clan Tokens</span><b>+${tokens}</b></div>
        <div class="pvp-teams"><div><h3>Your clan</h3>${ally}</div><div><h3>Rivals</h3>${enemy}</div></div>
        <div class="body-scroll">${log}</div>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">OK</button></div>
    </div>`,
    {},
  );
  el.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-action="close"]')) ctx.closeModal();
  });
}

export function showResult(ctx: UIContext, r: RunResult): void {
  const g = ctx.game;
  let body = '';
  let buttons = '';
  if (r.kind === 'dungeon') {
    const cells = r.loot.map((it) => slotHtml(it, {})).join('');
    body = `<p>${r.success ? 'Boss defeated! Spoils of the vault:' : r.note ?? ''}</p>
      <div class="row"><span>XP gained</span><b>${fmt(r.xp)}</b></div>
      <div class="row"><span>Gear found</span><b>${r.loot.length}</b></div>
      ${r.loot.length ? `<div class="loot-row">${cells}</div>` : ''}
      ${r.success && r.note ? `<p>${r.note}</p>` : ''}`;
    buttons = r.loot.length
      ? `<button class="btn stone" data-action="res-salvage">Salvage Non-Upgrades</button>
         <button class="btn gold" data-action="res-review">Review Gear</button>`
      : `<button class="btn gold" data-action="res-ok">OK</button>`;
  } else {
    body = `<p>${r.note ?? ''}</p>`;
    buttons = `<button class="btn gold" data-action="res-ok">${r.kind === 'actClear' ? 'Onward' : 'Back to Camp'}</button>`;
  }
  const el = ctx.openModal(
    `<div class="sheet"><h2>${r.title}</h2><div class="body">${body}</div><div class="btns">${buttons}</div></div>`,
    {},
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    switch (t.dataset.action) {
      case 'res-ok':
        ctx.closeModal();
        break;
      case 'res-review':
        ctx.closeModal();
        g.queueLoot(r.loot, false);
        break;
      case 'res-salvage':
        ctx.closeModal();
        g.queueLoot(r.loot, true);
        break;
      default:
        break;
    }
  });
}
