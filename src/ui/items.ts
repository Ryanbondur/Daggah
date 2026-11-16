import type { Gear } from '../data/gear';
import { RARITIES, SETS, formatStat, setCounts, statsOrdered } from '../data/gear';
import { playstyleCommitted } from '../data/skills';
import type { Item, SkillId, StatKey } from '../data/types';
import { STAT_LABEL } from '../data/types';
import { ICON } from './svg';
import { itemIcon } from './assets';
import { escapeHtml } from './escape';

export function slotHtml(
  item: Item | undefined,
  opts: {
    area?: string;
    action?: string;
    id?: string;
    locked?: boolean;
    slot?: string;
    /** BiS / CP-delta badge from lootCompareHighlight (corner, portrait-safe). */
    bisBadge?: string | null;
  } = {},
): string {
  const area = opts.area ? `grid-area:${opts.area};` : '';
  if (!item) {
    const slotAttr = opts.slot ? ` data-slot="${escapeHtml(opts.slot)}"` : '';
    const label = opts.slot ? escapeHtml(opts.slot) : 'Empty slot';
    return `<div class="slot empty-slot" style="${area}"${slotAttr} aria-label="${label}"></div>`;
  }
  const bis = opts.bisBadge ? true : false;
  const cls = [
    'slot',
    `r-${item.rarity}`,
    item.slot === 'weapon' ? 'weapon' : '',
    item.setId ? 'set' : '',
    opts.locked ? 'locked' : '',
    bis ? 'bis' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const data = opts.action
    ? ` data-action="${opts.action}" data-id="${escapeHtml(item.id)}" data-slot="${escapeHtml(opts.slot ?? item.slot)}"`
    : '';
  const badge = opts.bisBadge
    ? `<span class="bis-badge" title="BiS upgrade">${escapeHtml(opts.bisBadge)}</span>`
    : '';
  const label = opts.bisBadge
    ? `${item.name} — BiS upgrade ${opts.bisBadge}`
    : item.name;
  return `<button class="${cls}" style="${area}"${data} aria-label="${escapeHtml(label)}">
    <img src="${itemIcon(item)}" alt="" draggable="false" />
    ${badge}
    <span class="lv">Lv.${item.gearLevel}</span>
  </button>`;
}

export function rarityLabel(item: Item): string {
  return `[${RARITIES[item.rarity].label}]`;
}

export function statValue(key: StatKey, v: number): string {
  return formatStat(key, v);
}

const ORDER: StatKey[] = ['atk', 'def', 'hp', 'critRate', 'critDmg', 'skillPower', 'haste', 'energyRegen'];

/** Signed delta text for compare rows (e.g. +3, −1.5%). */
export function formatStatDelta(key: StatKey, delta: number): string {
  if (delta === 0) return '';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${statValue(key, Math.abs(delta))}`;
}

export function statRows(
  item: Item,
  other?: Item,
  mode: 'plain' | 'compare' = 'plain',
): string {
  const keys = new Set<StatKey>(statsOrdered(item));
  if (mode === 'compare' && other) for (const k of statsOrdered(other)) keys.add(k);
  return ORDER.filter((k) => keys.has(k))
    .map((k) => {
      const v = item.stats[k] ?? 0;
      if (mode === 'plain') {
        return `<div class="st"><span>${STAT_LABEL[k]}</span><b>${statValue(k, v)}</b></div>`;
      }
      const o = other?.stats[k] ?? 0;
      const d = v - o;
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
      const arrow = d > 0 ? '<i class="arr"></i>' : d < 0 ? '<i class="arr down"></i>' : '';
      const delta =
        d !== 0 ? `<em class="delta">${escapeHtml(formatStatDelta(k, d))}</em>` : '';
      return `<div class="st ${cls}"><span>${STAT_LABEL[k]}</span><b>${statValue(k, v)}${delta}${arrow}</b></div>`;
    })
    .join('');
}

export function setInfoHtml(
  item: Item,
  gear: Gear,
  assumeEquipped: boolean,
  loadout?: SkillId[],
): string {
  if (!item.setId) return '';
  const def = SETS[item.setId];
  const counts = setCounts(gear);
  let have = counts[item.setId] ?? 0;
  if (!assumeEquipped) {
    const cur = gear[item.slot];
    have = have - (cur?.setId === item.setId ? 1 : 0) + 1;
  }
  const styleOk = !def.favorsPlaystyle || playstyleCommitted(loadout, def.favorsPlaystyle);
  const lines = def.bonuses
    .map((b) => {
      const active = have >= b.pieces && (b.pieces <= 2 || styleOk);
      return `<div class="${active ? 'on' : ''}">(${b.pieces}) ${escapeHtml(b.text)}</div>`;
    })
    .join('');
  const favor = def.favorsPlaystyle
    ? `<div class="sf ${styleOk ? 'on' : ''}">${escapeHtml(def.favors)}</div>`
    : '';
  return `<div class="setinfo"><div class="sn">${escapeHtml(def.name)} (${Math.min(have, 6)}/6)</div>${favor}${lines}</div>`;
}

export function cardHtml(
  item: Item | undefined,
  o: {
    gear: Gear;
    label?: string;
    cp?: number;
    other?: Item;
    assumeEquipped?: boolean;
    reqLevel?: number;
    heroLevel?: number;
    footer?: string;
    loadout?: SkillId[];
  },
): string {
  if (!item) {
    return `<div class="card">
      <div class="hd"><div><div class="nm">Empty</div><div class="meta">Nothing equipped</div></div></div>
      <div class="sep"></div>
      <div class="band">${o.label ?? 'Current Gear'}</div>
    </div>`;
  }
  const levelLocked =
    o.reqLevel !== undefined && o.heroLevel !== undefined && o.reqLevel > o.heroLevel;
  let band: string;
  if (o.cp !== undefined) {
    const verdict = levelLocked ? 'LOCKED' : o.cp > 0 ? 'BETTER' : o.cp < 0 ? 'WORSE' : 'EVEN';
    const vCls = levelLocked ? 'locked' : o.cp > 0 ? 'better' : o.cp < 0 ? 'worse' : 'even';
    const sign = o.cp > 0 ? '+' : '';
    band = `<div class="band cmp-verdict ${vCls}"><span class="cp"><em class="verdict">${verdict}</em> <i class="${
      o.cp < 0 ? 'neg' : ''
    }">${sign}${o.cp} CP</i>${o.cp > 0 && !levelLocked ? '<em class="bis-tag">BiS</em>' : ''}</span></div>`;
  } else {
    band = `<div class="band">${o.label ?? 'Current Gear'}</div>`;
  }
  const req = levelLocked ? `<div class="req">Requires hero Lv.${o.reqLevel}</div>` : '';
  return `<div class="card ${o.cp !== undefined ? `cmp-side ${levelLocked ? 'locked' : o.cp > 0 ? 'better' : o.cp < 0 ? 'worse' : 'even'}` : ''}">
    <div class="hd">
      <div>
        <div class="nm">${escapeHtml(item.name)}</div>
        <div class="meta"><div class="rar" data-rarity="${item.rarity}">${rarityLabel(item)}</div>
        <div>${slotName(item)}</div><div class="gl">Gear Level ${item.gearLevel}</div></div>
      </div>
      <div class="ic"><img src="${itemIcon(item)}" alt="" draggable="false" /></div>
    </div>
    <div class="sep"></div>
    ${band}
    ${statRows(item, o.other, o.other ? 'compare' : 'plain')}
    ${req}
    ${setInfoHtml(item, o.gear, !!o.assumeEquipped, o.loadout)}
    ${o.footer ?? ''}
  </div>`;
}

function slotName(item: Item): string {
  return item.slot.charAt(0).toUpperCase() + item.slot.slice(1);
}

export const CHECK_SVG = ICON.check;
