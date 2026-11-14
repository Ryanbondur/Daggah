import type { Gear } from '../data/gear';
import { RARITIES, SETS, formatStat, setCounts, statsOrdered } from '../data/gear';
import type { Item, StatKey } from '../data/types';
import { STAT_LABEL } from '../data/types';
import { ICON } from './svg';
import { itemIcon } from './assets';

export function slotHtml(
  item: Item | undefined,
  opts: { area?: string; action?: string; id?: string; locked?: boolean; slot?: string } = {},
): string {
  const area = opts.area ? `grid-area:${opts.area};` : '';
  if (!item) {
    return `<div class="slot" style="${area}opacity:.25"></div>`;
  }
  const cls = [
    'slot',
    `r-${item.rarity}`,
    item.slot === 'weapon' ? 'weapon' : '',
    item.setId ? 'set' : '',
    opts.locked ? 'locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const data = opts.action
    ? ` data-action="${opts.action}" data-id="${item.id}" data-slot="${opts.slot ?? item.slot}"`
    : '';
  return `<button class="${cls}" style="${area}"${data} aria-label="${item.name}">
    <img src="${itemIcon(item)}" alt="" draggable="false" />
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
      const cls = v > o ? 'up' : v < o ? 'down' : '';
      const arrow = v > o ? '<i class="arr"></i>' : v < o ? '<i class="arr down"></i>' : '';
      return `<div class="st ${cls}"><span>${STAT_LABEL[k]}</span><b>${statValue(k, v)}${arrow}</b></div>`;
    })
    .join('');
}

export function setInfoHtml(item: Item, gear: Gear, assumeEquipped: boolean): string {
  if (!item.setId) return '';
  const def = SETS[item.setId];
  const counts = setCounts(gear);
  let have = counts[item.setId] ?? 0;
  if (!assumeEquipped) {
    const cur = gear[item.slot];
    have = have - (cur?.setId === item.setId ? 1 : 0) + 1;
  }
  const lines = def.bonuses
    .map((b) => `<div class="${have >= b.pieces ? 'on' : ''}">(${b.pieces}) ${b.text}</div>`)
    .join('');
  return `<div class="setinfo"><div class="sn">${def.name} (${Math.min(have, 6)}/6)</div>${lines}</div>`;
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
  },
): string {
  if (!item) {
    return `<div class="card">
      <div class="hd"><div><div class="nm">Empty</div><div class="meta">Nothing equipped</div></div></div>
      <div class="sep"></div>
      <div class="band">${o.label ?? 'Current Gear'}</div>
    </div>`;
  }
  const rar = RARITIES[item.rarity];
  const band =
    o.cp !== undefined
      ? `<div class="band"><span class="cp">CP <i class="${o.cp < 0 ? 'neg' : ''}">${o.cp >= 0 ? '+' : ''}${o.cp}</i></span></div>`
      : `<div class="band">${o.label ?? 'Current Gear'}</div>`;
  const req =
    o.reqLevel && o.heroLevel && o.reqLevel > o.heroLevel
      ? `<div class="req">Requires hero Lv.${o.reqLevel}</div>`
      : '';
  return `<div class="card">
    <div class="hd">
      <div>
        <div class="nm">${item.name}</div>
        <div class="meta"><div class="rar" style="color:${item.rarity === 'common' ? '#6f6a5f' : rar.color}">${rarityLabel(item)}</div>
        <div>${slotName(item)}</div><div class="gl">Gear Level ${item.gearLevel}</div></div>
      </div>
      <div class="ic"><img src="${itemIcon(item)}" alt="" draggable="false" /></div>
    </div>
    <div class="sep"></div>
    ${band}
    ${statRows(item, o.other, o.other ? 'compare' : 'plain')}
    ${req}
    ${setInfoHtml(item, o.gear, !!o.assumeEquipped)}
    ${o.footer ?? ''}
  </div>`;
}

function slotName(item: Item): string {
  return item.slot.charAt(0).toUpperCase() + item.slot.slice(1);
}

export const CHECK_SVG = ICON.check;
