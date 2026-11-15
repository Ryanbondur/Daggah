import { getDungeon } from '../data/acts';
import { RARITIES, SETS, computeHero, lootCompareHighlight, setCounts } from '../data/gear';
import type { HeroClass, RarityId, SetId, StatKey } from '../data/types';
import { HERO_CLASSES, STAT_LABEL } from '../data/types';
import { CLASS_BLURB, availableSpeeds, xpToNext } from '../data/xp';
import { CLAN_CREATE_COST, TOKEN_DAY_CAP } from '../game/clan';
import {
  changePassword,
  loginAccount,
  logoutAccount,
  markGuestPlay,
  readAuthSession,
  registerAccount,
  shouldShowLoginGate,
} from '../game/authSession';
import { normalizeUsername, validatePassword } from '../lib/authValidation';
import {
  applyCloudSave,
  ensureAccountCode,
  getCloudLinkStatus,
  linkAccountCode,
  pushCloudSave,
  syncCloudSave,
  unlinkAccountCode,
} from '../game/cloudSave';
import {
  BRACKET_TOKEN_LOSS,
  BRACKET_TOKEN_WIN,
  CLAN_BRACKET_LABEL,
  bracketRangeLabel,
} from '../game/clanBrackets';
import { CLAN_VENDOR, type RunResult } from '../game/game';
import type { PvpResult } from '../game/pvp';
import {
  BAG_CAP,
  DUNGEON_CRYSTAL_COST_PER_KEY,
  KEY_CAP,
  dungeonCrystalCost,
  dungeonKeyCost,
  formatDungeonKeyCost,
} from '../game/state';
import { formatStat } from '../data/gear';
import { CLASS_PLAYSTYLES } from '../data/skills';
import type { UIContext } from './context';
import { fmt } from './context';
import { CHECK_SVG, cardHtml, slotHtml } from './items';
import { asset, heroSprite, navIcon } from './assets';
import { escapeHtml } from './escape';
import { copyTextToClipboard } from './clipboard';
import { SEASON_MILESTONES } from '../data/season';
import { TUTORIAL_STEPS } from '../data/tutorial';
import { WHATS_NEW } from '../data/whatsNew';
import { playstyleCommitted } from '../data/skills';

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

function friendlyAuthError(code: string): string {
  switch (code) {
    case 'username_taken':
      return 'That username is taken';
    case 'invalid_credentials':
      return 'Wrong username or password';
    case 'invalid_username':
      return 'Username: 3–24 letters, digits, _ or - (no spaces)';
    case 'weak_password':
      return 'Password must be at least 8 characters';
    case 'rate_limited':
      return 'Too many tries — wait a minute';
    case 'unreachable':
      return 'Server unreachable — progress stays on this device';
    case 'database_unavailable':
    case 'schema_missing':
      return 'Cloud login is temporarily unavailable. Try guest play for now.';
    case 'server_error':
    case 'internal':
    case 'http_500':
    case 'http 500':
      return 'Server error — try again, or continue as guest.';
    default:
      // Hints are already human sentences; codes become spaced words.
      if (code.includes(' ') || code.includes('—')) return code;
      return code.replace(/_/g, ' ');
  }
}

async function afterAuthSync(ctx: UIContext): Promise<void> {
  const g = ctx.game;
  g.persist();
  g.toast('Syncing cloud save…', 'info');
  const { save, result } = await syncCloudSave(g.storage, g.save, Date.now(), { askOnConflict: true });
  if (result.status === 'conflict') {
    const cloudNewer = (result.cloud.savedAt ?? 0) >= (result.local.savedAt ?? 0);
    const takeCloud = window.confirm(
      cloudNewer
        ? 'Cloud save is newer. Use cloud progress? (Cancel keeps this device and uploads it.)'
        : 'This device is newer than cloud. Keep this device and upload? (Cancel downloads cloud.)',
    );
    const wantCloud = cloudNewer ? takeCloud : !takeCloud;
    if (wantCloud) {
      g.save = applyCloudSave(g.storage, result.cloud);
      g.emit({ t: 'change' });
      g.toast('Restored from cloud', 'good');
    } else {
      await pushCloudSave(result.local, g.storage, { force: true });
      g.toast('Uploaded this device to cloud', 'good');
    }
  } else if (result.status === 'pulled') {
    g.save = save;
    g.emit({ t: 'change' });
    g.toast('Restored from cloud', 'good');
  } else if (result.status === 'pushed') {
    g.toast('Progress linked to your account', 'good');
  } else if (result.status === 'skipped') {
    g.toast(`Cloud sync: ${result.reason}`, 'info');
  }
}

/**
 * Portrait parchment login/register gate over Camp.
 * Guest skip stays local-only until they register or link an account code.
 */
export function showLogin(ctx: UIContext, opts: { allowGuest?: boolean } = {}): void {
  const allowGuest = opts.allowGuest !== false;
  const g = ctx.game;
  let mode: 'login' | 'register' = 'login';

  const el = ctx.openModal(
    `<div class="sheet login-sheet" role="dialog" aria-labelledby="login-title">
      <div class="login-stone-bar" aria-hidden="true"></div>
      <h2 id="login-title">Daggah</h2>
      <p class="login-tag">Save progress to your account across devices.</p>
      <div class="body">
        <div class="login-tabs" role="tablist">
          <button type="button" class="chip on" data-action="mode-login" role="tab" aria-selected="true">Log in</button>
          <button type="button" class="chip" data-action="mode-register" role="tab" aria-selected="false">Register</button>
        </div>
        <label class="tagline" for="login-username">Username</label>
        <input id="login-username" class="login-input" type="text" autocomplete="username" maxlength="24" spellcheck="false" placeholder="hero_name (no spaces)" />
        <label class="tagline" for="login-password">Password</label>
        <input id="login-password" class="login-input" type="password" autocomplete="current-password" maxlength="128" placeholder="••••••••" />
        <p class="tagline login-hint" id="login-hint">Username: letters, digits, _ or -. Password: 8+ characters.</p>
        <p class="login-error" id="login-error" hidden></p>
      </div>
      <div class="btns login-btns">
        <button type="button" class="btn gold" data-action="submit" id="login-submit">Log in</button>
        ${
          allowGuest
            ? `<button type="button" class="btn stone" data-action="guest">Continue as guest</button>`
            : `<button type="button" class="btn stone" data-action="close">Close</button>`
        }
      </div>
    </div>`,
    {
      className: 'login-dim',
      // Block dim-tap dismiss on the boot gate so guests must choose explicitly.
      onDismiss: allowGuest ? undefined : () => ctx.closeModal(),
    },
  );

  const errEl = () => el.querySelector('#login-error') as HTMLElement | null;
  const hintEl = () => el.querySelector('#login-hint') as HTMLElement | null;
  const submitBtn = () => el.querySelector('#login-submit') as HTMLButtonElement | null;
  const userInput = () => el.querySelector('#login-username') as HTMLInputElement | null;
  const passInput = () => el.querySelector('#login-password') as HTMLInputElement | null;

  const setError = (msg: string | null) => {
    const node = errEl();
    if (!node) return;
    if (!msg) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.textContent = msg;
  };

  const refreshMode = () => {
    el.querySelectorAll('.login-tabs .chip').forEach((chip) => {
      const btn = chip as HTMLElement;
      const on =
        (btn.dataset.action === 'mode-login' && mode === 'login') ||
        (btn.dataset.action === 'mode-register' && mode === 'register');
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const submit = submitBtn();
    if (submit) submit.textContent = mode === 'login' ? 'Log in' : 'Create account';
    const pass = passInput();
    if (pass) pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    const hint = hintEl();
    if (hint) {
      hint.textContent =
        mode === 'register'
          ? 'Username: 3–24 letters/digits/_/- (no spaces). Password: 8+ chars.'
          : 'Username: letters, digits, _ or -. Password: 8+ characters.';
    }
    setError(null);
  };

  const finishGate = () => {
    ctx.closeModal();
    if (!g.save.classPicked) ctx.showClassPick();
  };

  const runAuth = async () => {
    const username = userInput()?.value ?? '';
    const password = passInput()?.value ?? '';
    setError(null);
    // Validate locally so bad usernames (e.g. spaces) never hit the API as a confusing 500.
    if (!normalizeUsername(username)) {
      setError(friendlyAuthError('invalid_username'));
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(friendlyAuthError('weak_password'));
      return;
    }
    const submit = submitBtn();
    if (submit) submit.disabled = true;
    const result =
      mode === 'register'
        ? await registerAccount(g.storage, username, password)
        : await loginAccount(g.storage, username, password);
    if (submit) submit.disabled = false;
    if (!result.ok) {
      setError(friendlyAuthError(result.error));
      return;
    }
    g.toast(mode === 'register' ? `Welcome, ${result.session.username}` : `Signed in as ${result.session.username}`, 'good');
    ctx.closeModal();
    await afterAuthSync(ctx);
    if (!g.save.classPicked) ctx.showClassPick();
  };

  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    switch (t.dataset.action) {
      case 'mode-login':
        mode = 'login';
        refreshMode();
        break;
      case 'mode-register':
        mode = 'register';
        refreshMode();
        break;
      case 'submit':
        void runAuth();
        break;
      case 'guest':
        markGuestPlay(g.storage);
        g.toast('Playing as guest — progress stays on this device until you log in', 'info');
        finishGate();
        break;
      case 'close':
        ctx.closeModal();
        break;
      default:
        break;
    }
  });

  el.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const target = ev.target as HTMLElement;
    if (target.tagName === 'INPUT') {
      ev.preventDefault();
      void runAuth();
    }
  });

  queueMicrotask(() => userInput()?.focus());
}

/** Show the boot login gate when appropriate; returns true if shown. */
export function maybeShowLoginGate(ctx: UIContext): boolean {
  if (!shouldShowLoginGate(ctx.game.storage)) return false;
  showLogin(ctx, { allowGuest: true });
  return true;
}

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
      // Boot only opens class pick when unset; coach must start after the pick.
      if (ctx.game.tutorialIsActive) {
        setTimeout(() => {
          if (!ctx.modalOpen) showTutorialCoach(ctx);
        }, 400);
      }
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

  const left = cardHtml(info.current, {
    gear: g.save.gear,
    label: 'Current Gear',
    assumeEquipped: true,
    loadout: g.save.loadout,
  });
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
    loadout: g.save.loadout,
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
      loadout: g.save.loadout,
    })}</div></div>`,
    { onDismiss: () => ctx.closeModal() },
  );
}

const BAG_BULK_CEILINGS: RarityId[] = ['rare', 'epic', 'legendary'];
let bagBulkCeiling: RarityId = 'rare';

export function showBag(ctx: UIContext): void {
  const g = ctx.game;
  const bag = g.save.bag;
  const cells: string[] = [];
  for (const it of bag) cells.push(slotHtml(it, { action: 'bag-item' }));
  for (let i = bag.length; i < BAG_CAP; i++) cells.push('<div class="bag-empty"></div>');
  const ceil = bagBulkCeiling;
  const ceilChips = BAG_BULK_CEILINGS.map(
    (r) =>
      `<button class="chip ${ceil === r ? 'on' : ''}" data-action="bag-ceil" data-r="${r}">Below ${RARITIES[r].label}</button>`,
  ).join('');
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Bag <small style="font-size:3.2cqw;font-family:var(--font-ui)">${bag.length}/${BAG_CAP}</small></h2>
      <div class="body">
        <p>Tap a piece to compare it with what you have equipped.</p>
        <div class="bag-grid">${cells.join('')}</div>
        <h3>Clear overflow</h3>
        <div class="chip-row bag-ceil-row">${ceilChips}</div>
        <p class="tagline">Salvage → dust/crystals. Sell → gold. Both target items strictly below the chip rarity.</p>
      </div>
      <div class="btns">
        <button class="btn stone" data-action="bag-salvage-below">Salvage all below</button>
        <button class="btn stone" data-action="bag-sell-below">Sell all below</button>
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
    } else if (t.dataset.action === 'bag-ceil') {
      bagBulkCeiling = t.dataset.r as RarityId;
      ctx.closeModal();
      showBag(ctx);
    } else if (t.dataset.action === 'bag-salvage-below') {
      g.salvageBagBelow(bagBulkCeiling);
      ctx.closeModal();
      showBag(ctx);
    } else if (t.dataset.action === 'bag-sell-below') {
      g.sellBagBelow(bagBulkCeiling);
      ctx.closeModal();
      showBag(ctx);
    }
  });
}

export function showHero(ctx: UIContext): void {
  const g = ctx.game;
  const t = computeHero(g.save.level, g.save.gear, g.save.heroClass, g.save.loadout);
  const rows = STAT_ORDER.map(
    (k) => `<div class="row"><span>${STAT_LABEL[k]}</span><b>${formatStat(k, Math.round(t.stats[k] * 10) / 10)}</b></div>`,
  ).join('');
  const counts = setCounts(g.save.gear);
  const sets = (Object.keys(SETS) as SetId[])
    .filter((id) => (counts[id] ?? 0) > 0)
    .map((id) => {
      const def = SETS[id];
      const n = counts[id] ?? 0;
      const styleOk = !def.favorsPlaystyle || playstyleCommitted(g.save.loadout, def.favorsPlaystyle);
      const styleNote = def.favorsPlaystyle
        ? `<div class="row ${styleOk ? 'on' : 'off'}"><span>${styleOk ? 'Playstyle active' : 'Equip ≥3 ' + def.favorsPlaystyle + ' skills'}</span></div>`
        : '';
      return `<h3>${escapeHtml(def.name)} (${n}/6)</h3>${styleNote}${def.bonuses
        .map((b) => `<div class="row ${n >= b.pieces && (b.pieces <= 2 || styleOk) ? 'on' : 'off'}"><span>(${b.pieces}) ${escapeHtml(b.text)}</span></div>`)
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
  const rarityMax = s.autoSalvageRarityMax;
  const rarityChips = (['off', 'common', 'rare', 'epic'] as const)
    .map((r) => {
      const on = r === 'off' ? rarityMax === null : rarityMax === r;
      const label = r === 'off' ? 'Off' : `≤ ${RARITIES[r].label}`;
      return `<button class="chip ${on ? 'on' : ''}" data-action="set-rarity-max" data-r="${r}">${label}</button>`;
    })
    .join('');
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Settings</h2>
      <div class="body">
        <button class="toggle" data-action="set-mute"><span>Mute combat SFX<small>Hit and skill sounds (persists)</small></span><i class="sw ${s.muted ? 'on' : ''}"></i></button>
        <button class="toggle" data-action="set-auto-replaced"><span>Auto-salvage replaced gear<small>Default for the Replace dialog</small></span><i class="sw ${s.autoSalvageReplaced ? 'on' : ''}"></i></button>
        <button class="toggle" data-action="set-auto-worse"><span>Auto-salvage non-upgrades<small>Skip the compare dialog for drops that would lower your CP</small></span><i class="sw ${s.autoSalvageWorse ? 'on' : ''}"></i></button>
        <h3>Auto-salvage rarity</h3>
        <p class="tagline">Loot at or below this rarity is salvaged on pickup (bag overflow relief).</p>
        <div class="chip-row">${rarityChips}</div>
        <h3>Battle speed</h3>
        <div class="btns" style="margin-top:0">${speedChips}</div>
        <h3>Playtest tools</h3>
        <div class="chip-row">
          <button class="chip" data-action="dev-xp">+500 XP</button>
          <button class="chip" data-action="dev-lvl">+1 Level</button>
          <button class="chip" data-action="dev-acts">Clear Acts 1-10</button>
          <button class="chip" data-action="dev-res">+Keys +Crystals</button>
          <button class="chip" data-action="dev-loot">Roll 5 drops</button>
          <button class="chip" data-action="dev-fill-ai">Fill AI roster</button>
          <button class="chip" data-action="dev-practice-4v4">Queue practice 4v4</button>
        </div>
        <p class="tagline">AI fillers keep solo 4v4 playable until live multiplayer. Practice queue opens a free Practice Hall if needed.</p>
        <h3>Season</h3>
        <p>Local 30-day season stub. Reset wipes level, gear, currencies, acts, and dungeon progress; keeps clan membership and opens class pick.</p>
        <button class="chip" data-action="season-reset">Reset season (local)</button>
        <h3>Account</h3>
        ${
          (() => {
            const session = readAuthSession(g.storage);
            if (session) {
              return `<p>Signed in as <b id="account-username">${escapeHtml(session.username)}</b>. Progress auto-syncs to this account.</p>
        <div class="chip-row">
          <button class="chip" data-action="account-logout">Log out</button>
          <button class="chip" data-action="account-change-password">Change password</button>
          <button class="chip" data-action="cloud-sync-now">Sync now</button>
        </div>
        <div id="change-password-box" hidden>
          <label class="tagline" for="pw-current">Current password</label>
          <input id="pw-current" class="login-input" type="password" autocomplete="current-password" maxlength="128" />
          <label class="tagline" for="pw-new">New password</label>
          <input id="pw-new" class="login-input" type="password" autocomplete="new-password" maxlength="128" />
          <button class="chip" data-action="account-change-password-submit">Save new password</button>
        </div>`;
            }
            return `<p>Not signed in — progress stays on this device (and optional account code below) until you log in.</p>
        <div class="chip-row">
          <button class="chip" data-action="account-open-login">Log in / Register</button>
          <button class="chip" data-action="cloud-sync-now">Sync now</button>
        </div>`;
          })()
        }
        <h3>Cloud sync (account code)</h3>
        <p>Optional alternate key if you prefer not to use a username. Cursor sign-in is used automatically when available. Keep Export/Import as a backup.</p>
        <p class="tagline" id="cloud-sync-status">${escapeHtml(
          (() => {
            const st = getCloudLinkStatus(g.storage);
            if (st.username) return `Logged in as ${st.username}`;
            if (st.accountCode) return `Code linked · ends …${st.accountCode.slice(-6)}`;
            return 'Not linked — log in or paste a code to sync';
          })(),
        )}</p>
        <div class="chip-row">
          <button class="chip" data-action="cloud-create">Create / show code</button>
          <button class="chip" data-action="cloud-copy">Copy sync code</button>
          <button class="chip" data-action="cloud-link">Paste code to restore</button>
          <button class="chip" data-action="cloud-unlink">Unlink code</button>
        </div>
        <label class="tagline" for="account-code-box">Account code</label>
        <textarea id="account-code-box" rows="2" spellcheck="false" placeholder="DGAC.…." style="width:100%;box-sizing:border-box;margin:1cqw 0 2cqw;padding:2cqw;font:600 2.8cqw/1.35 ui-monospace,Menlo,Consolas,monospace;border:1px solid #c9c0b2;border-radius:1.2cqw;background:#f7f3ea;color:#2a241c;resize:vertical">${escapeHtml(
          getCloudLinkStatus(g.storage).accountCode ?? '',
        )}</textarea>
        <h3>Save</h3>
        <p>Progress autosaves in this browser (survives refresh on the same site). Export a code before switching devices or if a republish ever changes origin.</p>
        <div class="chip-row">
          <button class="chip" data-action="export-save">Export save code</button>
          <button class="chip" data-action="import-save">Import save code</button>
        </div>
        <label class="tagline" for="save-code-box">Save code</label>
        <textarea id="save-code-box" rows="3" spellcheck="false" placeholder="DAG1.…." style="width:100%;box-sizing:border-box;margin:1cqw 0 2cqw;padding:2cqw;font:600 2.8cqw/1.35 ui-monospace,Menlo,Consolas,monospace;border:1px solid #c9c0b2;border-radius:1.2cqw;background:#f7f3ea;color:#2a241c;resize:vertical"></textarea>
        <button class="chip" data-action="reset" style="color:#8a281f">Reset save</button>
      </div>
      <div class="btns"><button class="btn gold" data-action="close">Close</button></div>
    </div>`,
    { onDismiss: () => ctx.closeModal() },
  );
  let armed = false;
  let seasonArmed = false;
  let importArmed = false;
  let unlinkArmed = false;
  let logoutArmed = false;
  const codeBox = () => el.querySelector('#save-code-box') as HTMLTextAreaElement | null;
  const accountBox = () => el.querySelector('#account-code-box') as HTMLTextAreaElement | null;
  const refreshCloudStatus = () => {
    const statusEl = el.querySelector('#cloud-sync-status');
    const st = getCloudLinkStatus(g.storage);
    if (statusEl) {
      if (st.username) statusEl.textContent = `Logged in as ${st.username}`;
      else if (st.accountCode) statusEl.textContent = `Code linked · ends …${st.accountCode.slice(-6)}`;
      else statusEl.textContent = 'Not linked — log in or paste a code to sync';
    }
    const box = accountBox();
    if (box && st.accountCode && !box.value.trim()) box.value = st.accountCode;
  };
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    switch (t.dataset.action) {
      case 'close':
        ctx.closeModal();
        break;
      case 'account-open-login':
        ctx.closeModal();
        showLogin(ctx, { allowGuest: false });
        break;
      case 'account-logout': {
        if (!logoutArmed) {
          logoutArmed = true;
          t.textContent = 'Tap again to log out';
          break;
        }
        logoutArmed = false;
        void (async () => {
          await logoutAccount(g.storage);
          g.toast('Logged out — local save kept on this device', 'info');
          ctx.closeModal();
          showSettings(ctx);
        })();
        break;
      }
      case 'account-change-password': {
        const box = el.querySelector('#change-password-box') as HTMLElement | null;
        if (box) box.hidden = !box.hidden;
        break;
      }
      case 'account-change-password-submit': {
        const current = (el.querySelector('#pw-current') as HTMLInputElement | null)?.value ?? '';
        const next = (el.querySelector('#pw-new') as HTMLInputElement | null)?.value ?? '';
        void (async () => {
          const result = await changePassword(g.storage, current, next);
          if (!result.ok) {
            g.toast(friendlyAuthError(result.error), 'bad');
            return;
          }
          g.toast('Password updated', 'good');
          ctx.closeModal();
          showSettings(ctx);
        })();
        break;
      }
      case 'cloud-create': {
        const code = ensureAccountCode(g.storage);
        const box = accountBox();
        if (code && box) box.value = code;
        refreshCloudStatus();
        if (!code) {
          g.toast('Could not store account code', 'bad');
          break;
        }
        void (async () => {
          const copied = await copyTextToClipboard(code, box);
          if (copied) {
            g.toast('Copied sync code', 'good');
          } else {
            box?.focus();
            box?.select();
            g.toast('Sync code ready — select & copy from the box', 'info');
          }
        })();
        break;
      }
      case 'cloud-copy': {
        const box = accountBox();
        const code = (box?.value.trim() || getCloudLinkStatus(g.storage).accountCode || ensureAccountCode(g.storage) || '');
        if (!code) {
          g.toast('Create an account code first', 'info');
          break;
        }
        if (box) box.value = code;
        void (async () => {
          const copied = await copyTextToClipboard(code, box);
          if (copied) {
            g.toast('Copied sync code', 'good');
          } else {
            box?.focus();
            box?.select();
            g.toast('Select & copy from the sync code box', 'info');
          }
        })();
        break;
      }
      case 'cloud-link': {
        const box = accountBox();
        const raw = box?.value ?? '';
        const linked = linkAccountCode(g.storage, raw);
        if (!linked) {
          g.toast('Paste a valid DGAC.… account code', 'bad');
          break;
        }
        refreshCloudStatus();
        void (async () => {
          g.toast('Pulling cloud save…', 'info');
          const { save, result } = await syncCloudSave(g.storage, g.save, Date.now(), { askOnConflict: true });
          if (result.status === 'conflict') {
            const cloudNewer = (result.cloud.savedAt ?? 0) >= (result.local.savedAt ?? 0);
            const takeCloud = window.confirm(
              cloudNewer
                ? 'Cloud save is newer. Use cloud progress? (Cancel keeps this device and uploads it.)'
                : 'This device is newer than cloud. Keep this device and upload? (Cancel downloads cloud.)',
            );
            const wantCloud = cloudNewer ? takeCloud : !takeCloud;
            if (wantCloud) {
              g.save = applyCloudSave(g.storage, result.cloud);
              g.emit({ t: 'change' });
              g.toast('Restored from cloud', 'good');
            } else {
              await pushCloudSave(result.local, g.storage, { force: true });
              g.toast('Uploaded this device to cloud', 'good');
            }
            ctx.closeModal();
            if (!g.save.classPicked) ctx.showClassPick();
            return;
          }
          if (result.status === 'pulled') {
            g.save = save;
            g.emit({ t: 'change' });
            g.toast('Restored from cloud', 'good');
            ctx.closeModal();
            if (!g.save.classPicked) ctx.showClassPick();
            return;
          }
          if (result.status === 'pushed') {
            g.toast('Linked — progress uploaded', 'good');
            return;
          }
          g.toast(`Link saved (${result.status === 'skipped' ? result.reason : result.status})`, 'info');
        })();
        break;
      }
      case 'cloud-sync-now': {
        void (async () => {
          g.persist();
          const { save, result } = await syncCloudSave(g.storage, g.save, Date.now(), { askOnConflict: true });
          if (result.status === 'conflict') {
            const cloudNewer = (result.cloud.savedAt ?? 0) > (result.local.savedAt ?? 0);
            const takeCloud = window.confirm(
              cloudNewer
                ? 'Cloud is newer. Download cloud save? (Cancel keeps local and uploads.)'
                : 'Local is newer. Keep local and upload? (Cancel downloads cloud.)',
            );
            const wantCloud = cloudNewer ? takeCloud : !takeCloud;
            if (wantCloud) {
              g.save = applyCloudSave(g.storage, result.cloud);
              g.emit({ t: 'change' });
              g.toast('Using cloud save', 'good');
            } else {
              await pushCloudSave(result.local, g.storage, { force: true });
              g.toast('Uploaded local save', 'good');
            }
            refreshCloudStatus();
            return;
          }
          if (result.status === 'pulled') {
            g.save = save;
            g.emit({ t: 'change' });
            g.toast('Pulled newer cloud save', 'good');
          } else if (result.status === 'pushed') {
            g.toast('Pushed to cloud', 'good');
          } else if (result.status === 'unchanged') {
            g.toast('Already in sync', 'info');
          } else {
            g.toast(`Sync skipped: ${result.reason}`, 'info');
          }
          refreshCloudStatus();
        })();
        break;
      }
      case 'cloud-unlink': {
        if (!unlinkArmed) {
          unlinkArmed = true;
          t.textContent = 'Tap again to unlink';
          break;
        }
        unlinkAccountCode(g.storage);
        const box = accountBox();
        if (box) box.value = '';
        unlinkArmed = false;
        t.textContent = 'Unlink';
        refreshCloudStatus();
        g.toast('Cloud unlinked on this device', 'info');
        break;
      }
      case 'set-mute':
        g.setMuted(!g.save.settings.muted);
        ctx.closeModal();
        showSettings(ctx);
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
      case 'set-rarity-max': {
        const r = t.dataset.r;
        g.setAutoSalvageRarityMax(r === 'off' || !r ? null : (r as RarityId));
        ctx.closeModal();
        showSettings(ctx);
        break;
      }
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
      case 'dev-fill-ai': {
        if (!g.clan) {
          g.toast('Create or join a clan first (or use Queue practice 4v4)', 'info');
          break;
        }
        const err = g.fillAiClanRoster();
        if (err) g.toast(err, err.includes('already') ? 'info' : 'bad');
        break;
      }
      case 'dev-practice-4v4': {
        ctx.closeModal();
        void ctx.ensureStage().then(() => {
          const err = g.queuePractice4v4();
          if (err) g.toast(err, 'bad');
        });
        break;
      }
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
      case 'export-save': {
        const code = g.exportSaveCode();
        const box = codeBox();
        if (box) box.value = code;
        void (async () => {
          const copied = await copyTextToClipboard(code, box);
          if (copied) {
            g.toast('Save code copied', 'good');
          } else {
            box?.focus();
            box?.select();
            g.toast('Save code ready — copy from the box', 'info');
          }
        })();
        break;
      }
      case 'import-save': {
        const box = codeBox();
        const code = box?.value ?? '';
        if (!code.trim()) {
          g.toast('Paste a save code into the box first', 'info');
          break;
        }
        if (!importArmed) {
          importArmed = true;
          t.textContent = 'Tap again to overwrite save';
          break;
        }
        const err = g.importSaveCode(code);
        if (err) {
          importArmed = false;
          t.textContent = 'Import save code';
          g.toast(err, 'bad');
          break;
        }
        ctx.closeModal();
        ctx.skillStyle = 'bladestorm';
        if (!g.save.classPicked) ctx.showClassPick();
        break;
      }
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
    .map((l) => `<div class="row"><span>${escapeHtml(l)}</span></div>`)
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

export type DungeonKeyBuyIntent = 'enter' | 'sweep';

/**
 * Confirm spending Crystals to buy dungeon Keys when Enter/Sweep is short on keys.
 * Bulk qty buys multiple Keys into the pouch (capped); then optionally continues Enter/Sweep once.
 */
export function showDungeonKeyBuy(
  ctx: UIContext,
  opts: { dungeonId: string; intent: DungeonKeyBuyIntent },
): void {
  const g = ctx.game;
  const d = getDungeon(opts.dungeonId);
  const keysNeeded = dungeonKeyCost(d.actId);
  const runCrystalCost = dungeonCrystalCost(d.actId);
  const actionLabel = opts.intent === 'sweep' ? 'Sweep' : 'Enter';

  const paint = (qty: number): void => {
    g.refreshKeys();
    const s = g.save;
    const room = g.dungeonKeyRoom();
    const shortfall = Math.max(0, keysNeeded - s.keys);
    const qtyMax = Math.max(0, room);
    const q = qtyMax === 0 ? 0 : Math.max(1, Math.min(qtyMax, Math.floor(qty)));
    const cost = g.crystalCostForDungeonKeys(q);
    const canAfford = q >= 1 && q <= room && s.crystals >= cost;
    const afterPreview = s.keys + q;
    const runsAfter = keysNeeded > 0 ? Math.floor(afterPreview / keysNeeded) : 0;

    const presetNums: number[] = [];
    const addPreset = (n: number) => {
      if (n >= 1 && n <= room && !presetNums.includes(n)) presetNums.push(n);
    };
    addPreset(1);
    addPreset(shortfall);
    for (const runs of [1, 2, 3, 5]) addPreset(runs * keysNeeded);
    addPreset(room);
    const presetChips = presetNums
      .slice(0, 6)
      .map((n) => {
        const label =
          n === shortfall && shortfall > 0
            ? `${n} · cover ${actionLabel}`
            : n % keysNeeded === 0
              ? `${n} · ${n / keysNeeded} run${n / keysNeeded === 1 ? '' : 's'}`
              : n === room
                ? `Max ${n}`
                : `${n}`;
        return `<button type="button" class="chip key-buy-preset ${n === q ? 'on' : ''}" data-action="qty-set" data-n="${n}">${escapeHtml(label)}</button>`;
      })
      .join('');

    const warn =
      room === 0
        ? `<p class="key-buy-warn">Key pouch is full (${s.keys}/${KEY_CAP}).</p>`
        : !canAfford
          ? `<p class="key-buy-warn">Need ${fmt(cost)} Crystals (you have ${fmt(s.crystals)}).</p>`
          : '';

    const confirmLabel = canAfford
      ? `Confirm — spend ${fmt(cost)} Crystals`
      : `Can't afford (${fmt(cost)} Crystals)`;

    const html = `<div class="sheet key-buy-sheet" role="dialog" aria-labelledby="key-buy-title">
      <h2 id="key-buy-title">Buy Keys with Crystals</h2>
      <div class="body">
        <p class="key-buy-lead"><b>This spends Crystals.</b> ${escapeHtml(actionLabel)} is not free — you are buying Keys for <b>${escapeHtml(d.name)}</b>.</p>
        <div class="row"><span>${escapeHtml(actionLabel)} cost</span><b>${escapeHtml(formatDungeonKeyCost(keysNeeded))} <small>(${fmt(runCrystalCost)} Crystals / run)</small></b></div>
        <div class="row"><span>Your Keys</span><b><img class="inline-ico" src="${navIcon('key')}" alt="" /> ${s.keys}/${KEY_CAP}</b></div>
        <div class="row"><span>Your Crystals</span><b><img class="inline-ico" src="${navIcon('crystal')}" alt="" /> ${fmt(s.crystals)}</b></div>
        <h3>How many Keys?</h3>
        <div class="key-buy-stepper">
          <button type="button" class="btn stone key-buy-step" data-action="qty-dec" ${q <= 1 ? 'disabled' : ''} aria-label="Fewer keys">−</button>
          <b class="key-buy-qty" aria-live="polite">${q}</b>
          <button type="button" class="btn stone key-buy-step" data-action="qty-inc" ${q >= qtyMax ? 'disabled' : ''} aria-label="More keys">+</button>
        </div>
        <div class="key-buy-presets">${presetChips}</div>
        <div class="row on"><span>Total Crystal cost</span><b><img class="inline-ico" src="${navIcon('crystal')}" alt="" /> ${fmt(cost)}</b></div>
        <div class="row"><span>After purchase</span><b>${afterPreview}/${KEY_CAP} Keys · ${runsAfter} ${actionLabel}${runsAfter === 1 ? '' : 's'}</b></div>
        <p class="tagline">${DUNGEON_CRYSTAL_COST_PER_KEY} Crystals per Key. Bulk buys fill your pouch; ${escapeHtml(actionLabel)} still spends Keys after Confirm.</p>
        ${warn}
      </div>
      <div class="btns">
        <button type="button" class="btn stone" data-action="cancel">Cancel</button>
        <button type="button" class="btn gold ${canAfford ? '' : 'disabled'}" data-action="confirm" ${canAfford ? '' : 'disabled aria-disabled="true"'}>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;

    // Re-open in place so qty changes keep a single dim layer.
    const el = ctx.openModal(html, { onDismiss: () => ctx.closeModal() });
    el.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!t) return;
      const action = t.dataset.action;
      if (action === 'cancel') {
        ctx.closeModal();
        return;
      }
      if (action === 'qty-dec') {
        paint(q - 1);
        return;
      }
      if (action === 'qty-inc') {
        paint(q + 1);
        return;
      }
      if (action === 'qty-set') {
        paint(Number(t.dataset.n));
        return;
      }
      if (action === 'confirm') {
        if (!canAfford) {
          g.toast(`Need ${fmt(cost)} Crystals to buy Keys`, 'bad');
          return;
        }
        const err = g.buyDungeonKeys(q);
        if (err) {
          g.toast(err, 'bad');
          paint(q);
          return;
        }
        ctx.closeModal();
        if (opts.intent === 'enter' && g.canAffordDungeonKeys(d.actId)) {
          void ctx.ensureStage().then(() => {
            if (g.startDungeon(opts.dungeonId)) ctx.setTab('camp');
          });
        } else if (opts.intent === 'sweep' && g.canAffordDungeonKeys(d.actId)) {
          g.sweepDungeon(opts.dungeonId);
        } else {
          ctx.render();
        }
      }
    });
  };

  g.refreshKeys();
  const shortfall0 = Math.max(0, keysNeeded - g.save.keys);
  const room0 = g.dungeonKeyRoom();
  paint(room0 === 0 ? 0 : Math.max(1, Math.min(Math.max(shortfall0, 1), room0)));
}

export function showClanHall(ctx: UIContext): void {
  const g = ctx.game;
  g.refreshClanTokenDay();
  const clan = g.clan;
  let body = '';
  if (!clan) {
    body = `<p class="ai-banner">Solo playtest: create or join, then fill AI teammates for the other three classes. Live multiplayer is not online yet.</p>
      <p>Found a clan for ${CLAN_CREATE_COST} crystals, or join with a code (local mock).</p>
      <label class="field">Clan name<input id="clan-name" maxlength="24" placeholder="Nightscar Wolves" /></label>
      <div class="clan-actions">
        <button class="btn red" data-action="clan-create">Create Clan (−${CLAN_CREATE_COST})</button>
      </div>
      <label class="field">Join code<input id="clan-code" maxlength="8" placeholder="ABC123" style="text-transform:uppercase" /></label>
      <div class="clan-actions">
        <button class="btn gold" data-action="clan-join">Join Clan</button>
        <button class="btn stone" data-action="clan-practice">Queue practice 4v4 (AI)</button>
      </div>`;
  } else {
    const missing = g.clanMissingClasses();
    const rows = clan.members
      .map((m) => {
        const badge = m.isPlayer ? '<span class="ai-pill you">YOU</span>' : '<span class="ai-pill">AI</span>';
        return `<div class="row"><span>${badge} ${escapeHtml(m.name)} <small>${escapeHtml(m.role)}</small></span><b>${m.heroClass} · CP ${fmt(m.cp)}</b></div>`;
      })
      .join('');
    const classCheck = HERO_CLASSES.map((c) => {
      const ok = clan.members.some((m) => m.heroClass === c);
      return `<span class="class-pip ${ok ? 'on' : ''}">${c[0]}</span>`;
    }).join('');
    const bracket = g.clanBracketStatus();
    const win = BRACKET_TOKEN_WIN[bracket.bracket];
    const loss = BRACKET_TOKEN_LOSS[bracket.bracket];
    const floorBlock = !bracket.floorMet
      ? `<p class="warn">${escapeHtml(bracket.floorMessage)}</p>`
      : '';
    const challengeBtn =
      bracket.canChallengeUp && bracket.nextLabel
        ? `<button class="btn gold ${g.clanRosterReady() ? '' : 'disabled'}" data-action="clan-queue-challenge">Challenge up → ${escapeHtml(bracket.nextLabel)}</button>`
        : '';
    body = `<div class="clan-banner"><img src="${asset('ui/clan-hall.webp')}" alt="" /><div><b>${escapeHtml(clan.name)}</b><span>Code ${escapeHtml(clan.code)}</span><div class="class-pips">${classCheck}</div></div></div>
      <div class="clan-bracket-card"><span class="clan-bracket-pill ${bracket.bracket}">${escapeHtml(bracket.label)}</span><div><b>Team CP ${fmt(bracket.teamCp)}</b><span>${escapeHtml(bracketRangeLabel(bracket.bracket))} · Challenge-up ${bracket.challengeUpLeft}/1 today</span></div></div>
      <p class="ai-banner">AI teammates &amp; rivals until full live multiplayer. Your class stays human.</p>
      <div class="body-scroll">${rows}</div>
      ${missing.length ? `<p class="warn">Missing: ${missing.join(', ')}. Fill AI roster for 4v4.</p>` : '<p>Roster has one of each class — ready to queue (AI practice).</p>'}
      ${floorBlock}
      <div class="btns" style="flex-wrap:wrap">
        <button class="btn stone" data-action="clan-recruit">Fill AI roster</button>
        <button class="btn red ${g.clanRosterReady() && bracket.floorMet ? '' : 'disabled'}" data-action="clan-queue">Queue 4v4</button>
        ${challengeBtn}
        <button class="btn tan" data-action="clan-leave">Leave</button>
      </div>
      <p class="tagline">${escapeHtml(bracket.label)} Win +${win} / Loss +${loss} (cap ${TOKEN_DAY_CAP}/day).</p>`;
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
      const err = g.fillAiClanRoster();
      if (err) g.toast(err, err.includes('already') ? 'info' : 'bad');
      ctx.closeModal();
      showClanHall(ctx);
      return;
    }
    if (act === 'clan-practice') {
      ctx.closeModal();
      void ctx.ensureStage().then(() => {
        const err = g.queuePractice4v4();
        if (err) g.toast(err, 'bad');
        // Stage fight plays, then existing pvp breakdown modal via game event
      });
      return;
    }
    if (act === 'clan-queue') {
      if (!g.clanRosterReady()) {
        g.toast('Need one of each class — Fill AI roster', 'bad');
        return;
      }
      ctx.closeModal();
      void ctx.ensureStage().then(() => {
        const err = g.queueClanPvp();
        if (err) g.toast(err, 'bad');
      });
      return;
    }
    if (act === 'clan-queue-challenge') {
      if (!g.clanRosterReady()) {
        g.toast('Need one of each class — Fill AI roster', 'bad');
        return;
      }
      ctx.closeModal();
      void ctx.ensureStage().then(() => {
        const err = g.queueClanPvp({ challengeUp: true });
        if (err) g.toast(err, 'bad');
      });
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
  g.refreshDaily();
  g.noteSeasonLogin();
  const day = g.seasonDay;
  const remainMs = g.seasonRemainingMs;
  const remainD = Math.floor(remainMs / 86_400_000);
  const remainH = Math.floor((remainMs % 86_400_000) / 3_600_000);
  const input = g.seasonProgressInput();
  const miles = SEASON_MILESTONES.map((m) => {
    const prog = m.progress(input);
    const claimed = g.save.seasonClaimed.includes(m.id);
    const ready = !claimed && prog >= m.goal;
    const state = claimed ? 'on' : ready ? 'ready' : 'off';
    return `<button class="milestone ${state}" data-action="claim-mile" data-id="${m.id}" ${ready ? '' : 'disabled'}>
      <span>${escapeHtml(m.text)} <em>(${Math.min(prog, m.goal)}/${m.goal})</em></span>
      <b>${claimed ? 'Claimed' : ready ? 'Claim' : `Day ~${m.dayHint}`}</b>
    </button>`;
  }).join('');
  let armed = false;
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Season ${g.save.season.seasonId}</h2>
      <div class="body">
        <div class="season-hero"><img src="${asset('ui/season-board.webp')}" alt="" />
          <div><b>Day ${day} / 30</b><span>${remainD}d ${remainH}h remaining</span>
          <div class="season-timer"><i style="width:${Math.min(100, (day / 30) * 100)}%"></i></div></div>
        </div>
        <div class="row"><span>Clan record</span><b>${g.save.clanWins}W / ${g.save.clanLosses}L</b></div>
        <div class="row"><span>Clan tokens</span><b>${fmt(g.save.clanTokens)}</b></div>
        <div class="row"><span>Tokens today</span><b>${g.save.clanTokensEarnedToday} / ${TOKEN_DAY_CAP}</b></div>
        <div class="row"><span>Login days</span><b>${g.save.seasonLoginDays.length}</b></div>
        <h3>Local milestones</h3>
        <div class="milestone-list">${miles}</div>
        <p>Local reset wipes level, gear, currencies, acts, and dungeon progress; keeps clan membership and re-opens class pick.</p>
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
    if (t.dataset.action === 'claim-mile') {
      const err = g.claimSeasonMilestone(t.dataset.id!);
      if (err) g.toast(err, 'info');
      else {
        ctx.closeModal();
        showSeasonBoard(ctx);
      }
    }
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
  const nightscarOk = g.save.clanNightscarUnlocked;
  const offers = CLAN_VENDOR.map((o, i) => {
    const locked = !!o.nightscarOnly && !nightscarOk;
    const afford = !locked && g.save.clanTokens >= o.cost;
    const note = locked
      ? 'Nightscar bracket unlock'
      : 'Clanforged set · Gear Lv.18–20';
    // Avoid class "dim" (modal overlay). Use is-dim for unaffordable rows.
    return `<div class="vendor-row${afford ? '' : ' is-dim'}${locked ? ' locked' : ''}" role="button" tabindex="${locked ? '-1' : '0'}"
      data-action="buy" data-i="${i}" ${locked ? 'aria-disabled="true"' : ''}>
      <img src="${asset(`icons/gear-k/${o.slot}.webp`)}" alt="" />
      <span><b>${escapeHtml(o.label)}</b><small>${escapeHtml(note)}${o.nightscarOnly ? ' · Nightscar exclusive' : ''}</small></span>
      <b class="price"><img src="${asset('ui/clan-token.webp')}" alt="" />${o.cost}</b>
    </div>`;
  }).join('');
  const el = ctx.openModal(
    `<div class="sheet">
      <h2>Clan Armorer</h2>
      <div class="body">
        <p>Spend Clan Tokens on endgame <b>Clanforged</b> gear. 2pc +8% PvP CP · 4pc +10% token gains. Legendaries need a Nightscar-bracket match unlock.</p>
        <div class="row"><span>Your tokens</span><b>${fmt(g.save.clanTokens)}</b></div>
        <div class="row"><span>Nightscar shop</span><b>${nightscarOk ? 'Unlocked' : 'Locked'}</b></div>
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
  const row = (f: { name: string; heroClass: HeroClass; hp: number; maxHp: number; isAi: boolean }) =>
    `<div class="pvp-f"><b>${f.heroClass}</b><span>${f.isAi ? '<span class="ai-pill">AI</span> ' : '<span class="ai-pill you">YOU</span> '}${escapeHtml(f.name)}</span><i>${f.hp}/${f.maxHp}</i></div>`;
  const ally = result.allyTeam.map(row).join('');
  const enemy = result.enemyTeam.map(row).join('');
  const stripEvents = result.log.filter((e) => e.t === 'skill' || e.t === 'kill');
  const strip = stripEvents
    .map((e) => {
      const side = e.team === 'enemy' ? 'foe' : 'ally';
      if (e.t === 'kill') {
        return `<div class="replay-chip kill ${side}" title="${escapeHtml(e.text)}">
          <b>${escapeHtml(e.target ?? '?')}</b><span>fallen</span><i>${e.time.toFixed(1)}s</i>
        </div>`;
      }
      return `<div class="replay-chip skill ${side}" title="${escapeHtml(e.text)}">
        <b>${escapeHtml(e.actor ?? '?')}</b><span>${escapeHtml(e.skillName ?? 'skill')}</span><i>${e.dmg ?? ''}${e.crit ? '!' : ''}</i>
      </div>`;
    })
    .join('');
  const log = result.log
    .filter((e) => e.t === 'kill' || e.t === 'end' || e.t === 'skill')
    .slice(-10)
    .map((e) => `<div class="row"><span>${escapeHtml(e.text)}</span></div>`)
    .join('');
  const tier = CLAN_BRACKET_LABEL[result.bracket] ?? result.bracket;
  const el = ctx.openModal(
    `<div class="sheet pvp-sheet">
      <h2>${result.won ? 'Clan Victory' : 'Clan Defeat'}</h2>
      <div class="body">
        <div class="pvp-arena" style="background-image:url('${asset('bg/bg-clan-arena.jpg')}')"></div>
        ${result.practiceAi ? '<p class="ai-banner">AI practice match — live multiplayer not online yet.</p>' : ''}
        <div class="clan-bracket-card"><span class="clan-bracket-pill ${result.bracket}">${escapeHtml(tier)}</span><div><b>Team CP ${fmt(result.teamCp)}</b><span>${result.challengeUp ? 'Challenge-up match' : 'Bracket match'}</span></div></div>
        <div class="row"><span>Score</span><b>${result.allyKills} – ${result.enemyKills}${result.timedOut ? ' (timeout)' : ''}</b></div>
        <div class="row"><span>Duration</span><b>${result.duration}s</b></div>
        <div class="row"><span>Clan Tokens</span><b>+${tokens}</b></div>
        <div class="pvp-teams"><div><h3>Your clan</h3>${ally}</div><div><h3>AI rivals</h3>${enemy}</div></div>
        <h3>Replay strip</h3>
        <div class="replay-strip">${strip || '<span class="tagline">No casts recorded.</span>'}</div>
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

export function showTutorialCoach(ctx: UIContext): void {
  const g = ctx.game;
  const step = g.tutorialStep;
  if (!step) return;
  const idx = g.save.tutorial.step;
  const skip = g.canSkipTutorial()
    ? '<button class="chip" data-action="tut-skip">Skip tutorial</button>'
    : '';
  const el = ctx.openModal(
    `<div class="sheet tutorial-sheet">
      <h2>Tutorial ${idx + 1}/${TUTORIAL_STEPS.length}</h2>
      <div class="body">
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
        <p class="tagline">Hint: ${escapeHtml(step.tab ?? 'camp')} tab</p>
        ${skip}
      </div>
      <div class="btns">
        <button class="btn gold" data-action="tut-go">Got it</button>
      </div>
    </div>`,
    { className: 'tutorial-dim', onDismiss: () => ctx.closeModal() },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.action === 'tut-skip') {
      g.skipTutorial();
      ctx.closeModal();
      maybeShowWhatsNew(ctx);
      return;
    }
    if (t.dataset.action === 'tut-go') {
      ctx.closeModal();
      if (step.tab === 'skill' || step.tab === 'adventure' || step.tab === 'clan' || step.tab === 'camp') {
        ctx.setTab(step.tab);
      }
    }
  });
}

/** Dismissible release notes — once per APP_CONTENT_VERSION (stored on save). */
export function showWhatsNew(ctx: UIContext): void {
  const g = ctx.game;
  if (!g.shouldShowWhatsNew()) return;
  const bullets = WHATS_NEW.bullets
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join('');
  const el = ctx.openModal(
    `<div class="sheet tutorial-sheet whats-new-sheet">
      <h2>${escapeHtml(WHATS_NEW.title)}</h2>
      <div class="body">
        <p class="tagline">Since your last visit</p>
        <ul class="whats-new-list">${bullets}</ul>
      </div>
      <div class="btns">
        <button class="btn gold" data-action="whats-new-ok">Got it</button>
      </div>
    </div>`,
    {
      className: 'tutorial-dim',
      onDismiss: () => {
        g.dismissWhatsNew();
        ctx.closeModal();
      },
    },
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.action === 'whats-new-ok') {
      g.dismissWhatsNew();
      ctx.closeModal();
    }
  });
}

export function maybeShowWhatsNew(ctx: UIContext): void {
  if (!ctx.game.shouldShowWhatsNew() || ctx.modalOpen) return;
  setTimeout(() => {
    if (!ctx.modalOpen) showWhatsNew(ctx);
  }, 400);
}

export function showResult(ctx: UIContext, r: RunResult): void {
  const g = ctx.game;
  let body = '';
  let buttons = '';
  if (r.kind === 'clanRaid') {
    const seals = r.ascendedSeals ?? 0;
    const frags = r.ascendedSealFragments ?? 0;
    body = `<p>${r.success ? 'Raid boss defeated!' : escapeHtml(r.note ?? '')}</p>
      <div class="row"><span>XP gained</span><b>${fmt(r.xp)}</b></div>
      ${seals ? `<div class="row"><span>Ascended Seals</span><b>+${seals}</b></div>` : ''}
      ${frags ? `<div class="row"><span>Seal Fragments</span><b>+${frags}</b></div>` : ''}
      <div class="row"><span>Seals owned</span><b>${g.save.ascendedSeals}</b></div>
      ${r.success && r.note ? `<p>${escapeHtml(r.note)}</p>` : ''}
      <p class="tagline">No gear, marks, or participation chests — seals feed Ascended Nightscar.</p>`;
    buttons = `<button class="btn gold" data-action="res-ok">OK</button>`;
  } else if (r.kind === 'dungeon') {
    const highlights = r.loot.map((it) =>
      lootCompareHighlight(g.save.level, g.save.gear, it, g.save.heroClass, g.save.loadout),
    );
    const cells = r.loot
      .map((it, i) => slotHtml(it, { bisBadge: highlights[i]!.badge }))
      .join('');
    const upgrades = highlights.filter((h) => h.upgrade).length;
    body = `<p>${r.success ? 'Boss defeated! Spoils of the vault:' : escapeHtml(r.note ?? '')}</p>
      <div class="row"><span>XP gained</span><b>${fmt(r.xp)}</b></div>
      <div class="row"><span>Gear found</span><b>${r.loot.length}</b></div>
      ${upgrades ? `<div class="row"><span>BiS upgrades</span><b class="bis-count">${upgrades}</b></div>` : ''}
      ${r.loot.length ? `<div class="loot-row">${cells}</div>` : ''}
      ${r.success && r.note ? `<p>${escapeHtml(r.note)}</p>` : ''}`;
    buttons = r.loot.length
      ? `<button class="btn stone" data-action="res-salvage">Salvage Non-Upgrades</button>
         <button class="btn gold" data-action="res-review">Review Gear</button>`
      : `<button class="btn gold" data-action="res-ok">OK</button>`;
  } else if (r.kind === 'stageFailed') {
    const your = r.yourCp ?? g.cp;
    const rec = r.recCp ?? your;
    const low = your < rec;
    body = `<p>${escapeHtml(r.note ?? '')}</p>
      <div class="cp-tension ${low ? 'low' : 'ok'}">
        <div class="row"><span>Your CP</span><b>${fmt(your)}</b></div>
        <div class="row"><span>Stage rec. CP</span><b>${fmt(rec)}</b></div>
        <div class="row"><span>Delta</span><b class="${low ? 'bad' : 'good'}">${low ? '' : '+'}${fmt(your - rec)}</b></div>
      </div>
      <p class="farm-nudge">${escapeHtml(r.farmHint ?? 'Farm gear → retry.')}</p>`;
    buttons = `<button class="btn stone" data-action="res-farm">Farm Dungeon</button>
      <button class="btn gold" data-action="res-retry">Retry Stage</button>`;
  } else {
    body = `<p>${escapeHtml(r.note ?? '')}</p>`;
    buttons = `<button class="btn gold" data-action="res-ok">${r.kind === 'actClear' ? 'Onward' : 'Back to Camp'}</button>`;
  }
  const el = ctx.openModal(
    `<div class="sheet"><h2>${escapeHtml(r.title)}</h2><div class="body">${body}</div><div class="btns">${buttons}</div></div>`,
    {},
  );
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    switch (t.dataset.action) {
      case 'res-ok':
        ctx.closeModal();
        break;
      case 'res-farm':
        ctx.closeModal();
        ctx.setTab('adventure');
        break;
      case 'res-retry':
        ctx.closeModal();
        ctx.setTab('camp');
        void ctx.ensureStage().then(() => g.startBattle());
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
