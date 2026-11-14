import { SETS, computeHero, setCounts } from '../data/gear';
import type { HeroClass, SetId, StatKey } from '../data/types';
import { HERO_CLASSES, STAT_LABEL } from '../data/types';
import { CLASS_BLURB, availableSpeeds, xpToNext } from '../data/xp';
import type { RunResult } from '../game/game';
import { BAG_CAP } from '../game/state';
import { formatStat } from '../data/gear';
import { CLASS_PLAYSTYLES } from '../data/skills';
import type { UIContext } from './context';
import { fmt } from './context';
import { CHECK_SVG, cardHtml, slotHtml } from './items';
import { heroSprite } from './assets';

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
        <h3>Save</h3>
        <p>Progress saves automatically to this browser.</p>
        <button class="chip" data-action="reset" style="color:#8a281f">Reset save</button>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  let armed = false;
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
      <div class="tabs" style="margin-bottom:2cqw"><button class="tb on">System</button><button class="tb" style="opacity:.5">Clan (soon)</button></div>
      <div class="body">${lines}</div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  ).addEventListener('click', (ev) => {
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
