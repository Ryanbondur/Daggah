/**
 * Condensed Arsenal hub chrome — Loadouts / Craft / Sets under one sheet.
 * Gated by settings.simplifiedMenus; openers live in modals.ts (avoid cycles).
 */

export type GearHubTab = 'loadouts' | 'craft' | 'sets';

export function isGearHubTab(v: string | undefined): v is GearHubTab {
  return v === 'loadouts' || v === 'craft' || v === 'sets';
}

export function gearHubTabRow(active: GearHubTab): string {
  const tabs: { id: GearHubTab; label: string }[] = [
    { id: 'loadouts', label: 'Loadouts' },
    { id: 'craft', label: 'Craft' },
    { id: 'sets', label: 'Sets' },
  ];
  return `<div class="gear-hub-tabs" role="tablist" aria-label="Arsenal">
    ${tabs
      .map(
        (t) =>
          `<button type="button" class="gear-hub-tab${t.id === active ? ' on' : ''}" role="tab" aria-selected="${t.id === active}" data-action="gear-hub-tab" data-tab="${t.id}">${t.label}</button>`,
      )
      .join('')}
  </div>`;
}
