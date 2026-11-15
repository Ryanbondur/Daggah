import { SKILL_BY_ID } from '../data/skills';
import { defaultPrimary } from '../data/skills';
import { getDungeon, type NodeType } from '../data/acts';
import { xpToNext } from '../data/xp';
import { playSfx, unlockAudio } from '../game/audio';
import type { Game, RunResult } from '../game/game';
import { formatKeyRegenLabel } from '../game/state';
import { asset, navIcon, skillIcon } from './assets';
import type { CampPane, ClanPane, ModalOpts, Tab, UIContext } from './context';
import { fmt } from './context';
import { CLASS_PLAYSTYLES } from '../data/skills';
import type { PlaystyleId } from '../data/types';
import {
  showBag,
  showChat,
  showClanArmorer,
  showClassPick,
  showCompare,
  showDungeonKeyBuy,
  showHero,
  showItemInfo,
  showLogin,
  showPvpResult,
  showResult,
  showSeasonBoard,
  showSettings,
  showTutorialCoach,
  maybeShowLoginGate,
  maybeShowWhatsNew,
} from './modals';
import { escapeHtml } from './escape';
import { renderAdventure, renderCamp, renderClan, renderSkill } from './panes';
import { ICON } from './svg';
import { heroSprite } from './assets';

const NODE_ICON: Record<NodeType, string> = {
  camp: ICON.camp,
  trash: ICON.swords,
  elite: ICON.skull,
  miniboss: ICON.skull,
  boss: ICON.boss,
};

export function mountUI(
  game: Game,
  root: HTMLElement,
  opts: { ensureStage: () => Promise<void> },
): { phaserParent: HTMLElement } {
  root.innerHTML = `
  <div id="frame">
    <section id="stage">
      <div id="phaser"></div>
      <div class="stage-vignette"></div>
      <div class="stage-chrome">
        <div class="plate">
          <div class="avatar"><img id="hero-avatar" src="${heroSprite(game.save.heroClass)}" alt="" draggable="false" /></div>
          <div class="name">Adventurer I</div>
          <div class="power">${ICON.star}<span id="cp">0</span></div>
          <div class="cp-rec" id="cp-rec"></div>
        </div>
        <div class="stage-title" id="stage-title"></div>
        <div class="track" id="track"></div>
      </div>
    </section>
    <section id="hud">
      <button class="hud-btn chat" data-action="chat" aria-label="Chat">${ICON.chat}</button>
      <button class="hud-btn fight" id="fight-toggle" data-action="toggle-battle" aria-label="Battle">${ICON.swords}</button>
      <div class="chat-log" id="chat-log"></div>
      <div class="orb hp"><div class="ring"><div class="liquid"><div class="fill" id="hp-fill"></div></div></div><span class="val" id="hp-val"></span><img class="guard" src="${asset('ui/gargoyle.webp')}" alt="" draggable="false" /></div>
      <div class="orb en"><div class="ring"><div class="liquid"><div class="fill" id="en-fill"></div></div></div><span class="val" id="en-val"></span><img class="guard" src="${asset('ui/hooded-statue.webp')}" alt="" draggable="false" /></div>
      <div class="lvl-badge">${ICON.hex}<span id="lvl">1</span></div>
      <div class="xpbar"><div class="fill" id="xp-fill"></div><i class="notch" style="left:33%"></i><i class="notch" style="left:66%"></i><div class="txt" id="xp-txt"></div></div>
      <button class="speed-btn" id="speed" data-action="speed">1x</button>
    </section>
    <div class="crystal-wallet" id="crystal-wallet" aria-live="polite" title="Crystals">
      <img src="${navIcon('crystal')}" alt="" draggable="false" />
      <b id="crystal-val">0</b>
    </div>
    <section id="pane"></section>
    <nav id="nav">
      <button class="nav-btn" data-tab="camp"><img src="${navIcon('camp')}" alt="" />Camp</button>
      <button class="nav-btn" data-tab="skill"><img src="${navIcon('skill')}" alt="" />Skill<span class="new" id="new-badge" hidden>New</span></button>
      <div></div>
      <button class="nav-btn" data-tab="adventure"><img src="${navIcon('adventure')}" alt="" />Adventure</button>
      <button class="nav-btn" data-tab="clan"><img src="${navIcon('clan')}" alt="" />Clan</button>
      <button class="battle-btn" id="battle-btn" data-action="battle" aria-label="Battle">
        <img class="frame-img" src="${asset('ui/battle-button.webp')}" alt="" draggable="false" />
        <span class="skill-face"><img id="battle-skill" src="" alt="" draggable="false" /></span>
        <span class="cost" id="battle-cost">Battle</span>
      </button>
    </nav>
    <div id="toasts"></div>
    <div id="modal-root"></div>
  </div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const frame = $('#frame');
  const pane = $('#pane');
  const modalRoot = $('#modal-root');
  const toasts = $('#toasts');

  let modalEl: HTMLElement | null = null;
  let modalOpts: ModalOpts = {};
  const resultQueue: RunResult[] = [];
  let flash: string | null = null;
  let renderQueued = false;
  /** Only preserve scroll when re-rendering the same tab (equip/swap), not across tab switches. */
  let scrollTab: Tab | null = null;

  const ctx: UIContext = {
    game,
    tab: 'camp',
    clanPane: 'hall',
    campPane: 'gear',
    skillStyle: CLASS_PLAYSTYLES[game.save.heroClass][0],
    skillBarFocus: null,
    get modalOpen() {
      return !!modalEl;
    },
    setTab(tab: Tab) {
      ctx.tab = tab;
      if (tab !== 'skill') ctx.skillBarFocus = null;
      if (tab === 'skill') game.markSkillsSeen();
      // Adventure often leads to dungeon/stage combat — warm Phaser early.
      if (tab === 'adventure') void opts.ensureStage();
      // Battle / Adventure loop lands on gear; Shop stays sticky until left intentionally.
      if (tab !== 'camp') ctx.campPane = 'gear';
      ctx.render();
    },
    ensureStage: () => opts.ensureStage(),
    openDailyShop() {
      ctx.campPane = 'shop';
      ctx.setTab('camp');
    },
    render() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        renderNow();
      });
    },
    openModal(html, opts = {}) {
      if (modalEl) closeModalInternal(false);
      // Level-up banners sit under the dim and read as garbled overlays on compare/sheets.
      frame.querySelectorAll('.levelup').forEach((el) => el.remove());
      const dim = document.createElement('div');
      dim.className = `dim ${opts.className ?? ''}`;
      dim.innerHTML = html;
      dim.addEventListener('click', (ev) => {
        if (ev.target === dim || (ev.target as HTMLElement).classList.contains('cmp') || (ev.target as HTMLElement).classList.contains('cmp-wrap')) {
          opts.onDismiss?.();
        }
      });
      modalRoot.appendChild(dim);
      modalEl = dim;
      modalOpts = opts;
      game.paused = true;
      return dim;
    },
    closeModal() {
      closeModalInternal(true);
    },
    showCompare: (id, src) => showCompare(ctx, id, src),
    showBag: () => showBag(ctx),
    showHero: () => showHero(ctx),
    showSettings: () => showSettings(ctx),
    showLogin: (opts) => showLogin(ctx, opts),
    showChat: () => showChat(ctx),
    showItemInfo: (slot) => showItemInfo(ctx, slot),
    showClassPick: () => showClassPick(ctx),
    showClanHall: () => {
      ctx.clanPane = 'hall';
      ctx.setTab('clan');
    },
    showSeasonBoard: () => showSeasonBoard(ctx),
    showClanArmorer: () => showClanArmorer(ctx),
    flashSlot(slot) {
      flash = slot;
    },
  };

  function closeModalInternal(resume: boolean): void {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    modalOpts.onClose?.();
    modalOpts = {};
    if (resume) game.paused = false;
    ctx.render();
  }

  // ---- rendering ----------------------------------------------------------

  function renderNow(): void {
    const wide = ctx.tab !== 'camp';
    pane.classList.toggle('wide', wide);
    const keepScroll = scrollTab === ctx.tab;
    const scroll = keepScroll ? (pane.querySelector('.pane-inner.scroll')?.scrollTop ?? 0) : 0;
    scrollTab = ctx.tab;
    switch (ctx.tab) {
      case 'camp':
        pane.innerHTML = renderCamp(ctx);
        break;
      case 'skill':
        pane.innerHTML = renderSkill(ctx);
        break;
      case 'adventure':
        pane.innerHTML = renderAdventure(ctx);
        break;
      case 'clan':
        pane.innerHTML = renderClan(ctx);
        break;
    }
    const sc = pane.querySelector('.pane-inner.scroll');
    if (sc) sc.scrollTop = scroll;
    if (flash) {
      pane.querySelector(`.slot[data-slot="${flash}"]`)?.classList.add('flash');
      flash = null;
    }
    root.querySelectorAll<HTMLElement>('.nav-btn[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === ctx.tab);
    });
    updateStageChrome(true);
  }

  let lastTrackKey = '';
  function updateStageChrome(force = false): void {
    const title = game.title;
    const titleEl = $('#stage-title');
    const m = title.match(/^(\[[^\]]+\])\s+(.*?)\s+(\d+-\d+)$/);
    const html = m
      ? `${escapeHtml(m[1]!)} ${escapeHtml(m[2]!)}<br />${escapeHtml(m[3]!)}`
      : escapeHtml(title);
    if (titleEl.innerHTML !== html) titleEl.innerHTML = html;
    $('#cp').textContent = fmt(game.cp);
    const power = game.stagePowerReadout();
    const recEl = $('#cp-rec');
    const recHtml = `vs ${fmt(power.recCp)}${power.underpowered ? ' · farm' : ''}`;
    if (recEl.textContent !== recHtml) {
      recEl.textContent = recHtml;
      recEl.classList.toggle('low', power.underpowered);
    }
    const av = $('#hero-avatar') as HTMLImageElement | null;
    if (av) {
      const next = heroSprite(game.save.heroClass);
      if (av.getAttribute('src') !== next) av.src = next;
    }

    const nodes = game.trackNodes;
    const cur = game.currentNodeIndex;
    const pct = game.progressPct;
    const pb = game.pvpPlayback;
    const pvpScore = pb ? `${pb.result.allyKills}-${pb.result.enemyKills}@${pb.nextIdx}` : '';
    const key = `${nodes.join(',')}|${cur}|${pct}|${game.inBattle}|${game.mode}|${pvpScore}`;
    if (key === lastTrackKey && !force) return;
    lastTrackKey = key;
    if (game.mode === 'pvp' && pb) {
      // Count kills already applied in playback for a live score pip.
      let allyK = 0;
      let enemyK = 0;
      for (let i = 0; i < pb.nextIdx; i++) {
        const ev = pb.result.playback[i];
        if (ev?.t !== 'kill') continue;
        if (ev.team === 'ally') allyK += 1;
        else enemyK += 1;
      }
      $('#track').innerHTML = `<span class="portal">${ICON.swords}</span><span class="pvp-score">${allyK}–${enemyK}</span>`;
      return;
    }
    const portal = game.inBattle ? `<span class="portal">${ICON.portal}</span>` : '';
    $('#track').innerHTML =
      portal +
      nodes
        .map((n, i) => {
          const cls = ['node', n === 'boss' ? 'boss' : '', i === cur && game.inBattle ? 'cur' : '', i < cur ? 'done' : '']
            .filter(Boolean)
            .join(' ');
          const showPct = n === 'boss' && pct > 0 && pct < 100;
          return `<span class="${cls}">${NODE_ICON[n]}${showPct ? `<span class="pct">${pct}%</span>` : ''}</span>`;
        })
        .join('');
  }

  function updateHud(): void {
    const b = game.battle;
    const inPvp = game.mode === 'pvp';
    const inBattle = (game.inBattle && !!b) || inPvp;
    const totals = game.totals;
    const playerF = inPvp ? game.pvpPlayback?.fighters.find((f) => f.isPlayer) : null;
    const hpMax = inBattle && b ? b.hero.maxHp : playerF ? playerF.maxHp : totals.stats.hp;
    const hp = inBattle && b ? Math.max(0, b.hero.hp) : playerF ? Math.max(0, playerF.hp) : hpMax;
    const enMax = inBattle && b ? b.hero.maxEnergy : 500 + game.save.level * 10;
    const en = inBattle && b ? b.hero.energy : enMax * 0.5;
    $('#hp-fill').style.height = `${(hp / hpMax) * 100}%`;
    $('#en-fill').style.height = `${(en / enMax) * 100}%`;
    setText('#hp-val', fmt(hp));
    setText('#en-val', fmt(en));
    const need = xpToNext(game.save.level);
    setText('#lvl', String(game.save.level));
    setText('#xp-txt', need ? `${fmt(game.save.xp)}/${fmt(need)}` : 'MAX');
    $('#xp-fill').style.width = need ? `${(game.save.xp / need) * 100}%` : '100%';
    $('#fight-toggle').classList.toggle('on', inBattle);
    setText('#speed', `${game.speed}x`);
    setText('#crystal-val', fmt(game.save.crystals));
    $('#new-badge').hidden = !game.newSkillsAvailable;

    const btn = $('#battle-btn');
    btn.classList.toggle('fighting', inBattle);
    const loadout = game.heroInput().loadout;
    const prim = game.save.primary && loadout.includes(game.save.primary) ? game.save.primary : defaultPrimary(loadout);
    if (inPvp) {
      btn.classList.remove('ready');
      btn.style.setProperty('--cd', '0%');
      const costEl = $('#battle-cost');
      if (costEl.textContent !== 'Skip') costEl.textContent = 'Skip';
    } else if (inBattle && b && prim) {
      const img = $('#battle-skill') as unknown as HTMLImageElement;
      const src = skillIcon(prim);
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      const cost = b.skillCost(prim);
      setText('#battle-cost', '');
      const costEl = $('#battle-cost');
      const html = `${ICON.droplet}${cost}`;
      if (costEl.innerHTML !== html) costEl.innerHTML = html;
      const cd = b.cdFraction(prim);
      btn.style.setProperty('--cd', `${cd * 100}%`);
      btn.classList.toggle('ready', cd === 0 && b.hero.energy >= cost && b.state === 'fight');
    } else {
      btn.classList.remove('ready');
      btn.style.setProperty('--cd', '0%');
      const costEl = $('#battle-cost');
      if (costEl.textContent !== 'Battle') costEl.textContent = 'Battle';
      btn.classList.remove('fighting');
    }
    updateStageChrome();
  }

  const textCache = new Map<string, string>();
  function setText(sel: string, v: string): void {
    if (textCache.get(sel) === v) return;
    textCache.set(sel, v);
    $(sel).textContent = v;
  }

  function renderChat(): void {
    // HUD band only fits ~2 lines at 390×844; more stacks into unreadable overlap.
    const lines = game.chat.slice(-2);
    $('#chat-log').innerHTML = lines.map((l) => `<div><b>System:</b> ${escapeHtml(l)}</div>`).join('');
  }

  // ---- events -------------------------------------------------------------

  game.on((e) => {
    switch (e.t) {
      case 'change':
      case 'run':
        ctx.render();
        break;
      case 'chat':
        renderChat();
        break;
      case 'battle': {
        const ev = e.ev;
        if (ev.t === 'hit') playSfx(ev.crit ? 'crit' : 'hit', game.muted);
        else if (ev.t === 'skill') playSfx('skill', game.muted);
        else if (ev.t === 'heroHit') playSfx('heroHit', game.muted);
        break;
      }
      case 'pvpFx': {
        if (e.ev.t === 'skill') playSfx('skill', game.muted);
        else if (e.ev.t === 'hit' || e.ev.t === 'kill') playSfx(e.ev.crit ? 'crit' : 'hit', game.muted);
        break;
      }
      case 'toast': {
        const t = document.createElement('div');
        t.className = `toast ${e.kind}`;
        t.textContent = e.text;
        toasts.appendChild(t);
        setTimeout(() => t.remove(), 2700);
        while (toasts.children.length > 3) toasts.firstElementChild?.remove();
        break;
      }
      case 'levelUp': {
        if (modalEl) break;
        const el = document.createElement('div');
        el.className = 'levelup';
        const skills = e.newSkills.map((id) => escapeHtml(SKILL_BY_ID[id].name));
        el.innerHTML = `<b>Level ${e.level}!</b>${skills.length ? `<span>New skill: ${skills.join(', ')}</span>` : ''}`;
        frame.appendChild(el);
        setTimeout(() => el.remove(), 3300);
        break;
      }
      case 'result':
        resultQueue.push(e.result);
        break;
      case 'pvp':
        if (modalEl) closeModalInternal(false);
        showPvpResult(ctx, e.result, e.tokens);
        break;
      default:
        break;
    }
  });

  // ---- input --------------------------------------------------------------

  /** Await Phaser boot before combat; toast if the chunk is still downloading. */
  async function withStage(run: () => void): Promise<void> {
    const tip = window.setTimeout(() => game.toast('Loading combat…', 'info'), 180);
    try {
      await opts.ensureStage();
    } finally {
      window.clearTimeout(tip);
    }
    run();
  }

  frame.addEventListener('pointerdown', () => unlockAudio(), { once: true });

  frame.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    if (target.closest('#modal-root')) return;
    const tabBtn = target.closest('[data-tab]') as HTMLElement | null;
    if (tabBtn) {
      ctx.setTab(tabBtn.dataset.tab as Tab);
      return;
    }
    const el = target.closest('[data-action]') as HTMLElement | null;
    if (!el) return;
    const d = el.dataset;
    switch (d.action) {
      case 'battle':
        if (game.mode === 'pvp') {
          game.finishPvpPlayback();
        } else if (game.inBattle) {
          if (!game.forceCast()) game.toast('Primary skill not ready', 'info');
        } else {
          void withStage(() => {
            game.startBattle();
            // Wide tabs cover the HUD; Camp gear restores HP/EN orbs + retreat.
            ctx.campPane = 'gear';
            if (ctx.tab !== 'camp') ctx.setTab('camp');
            else ctx.render();
          });
        }
        break;
      case 'toggle-battle':
        if (game.inBattle) game.retreat();
        else {
          void withStage(() => {
            game.startBattle();
            ctx.campPane = 'gear';
            if (ctx.tab !== 'camp') ctx.setTab('camp');
            else ctx.render();
          });
        }
        break;
      case 'chat':
        showChat(ctx);
        break;
      case 'speed':
        if (game.save.level < 5) game.toast('1.5x speed unlocks at Lv.5', 'info');
        else game.cycleSpeed();
        break;
      case 'slot':
        showItemInfo(ctx, d.slot!);
        break;
      case 'bag':
        showBag(ctx);
        break;
      case 'hero':
        showHero(ctx);
        break;
      case 'settings':
        showSettings(ctx);
        break;
      case 'quest':
        if (!game.claimQuest()) game.toast(`${game.quest?.text ?? ''} (${game.questProgress()}/${game.quest?.goal ?? 0})`, 'info');
        break;
      case 'daily-quest':
        if (!game.claimDaily()) {
          const dq = game.dailyQuest;
          game.toast(`${dq.text} (${game.dailyProgress()}/${dq.goal})`, 'info');
        }
        break;
      case 'tutorial':
        showTutorialCoach(ctx);
        break;
      case 'style':
        ctx.skillStyle = d.id as PlaystyleId;
        ctx.render();
        break;
      case 'skill-slot': {
        const i = Number(d.i);
        if (!Number.isFinite(i) || i < 0 || i >= 4) break;
        ctx.skillBarFocus = ctx.skillBarFocus === i ? null : i;
        ctx.render();
        break;
      }
      case 'toggle-skill': {
        const id = d.id as never;
        const equipped = game.save.loadout.includes(id);
        const replace =
          !equipped && game.save.loadout.length >= 4 && ctx.skillBarFocus !== null
            ? ctx.skillBarFocus
            : undefined;
        const msg = game.toggleSkill(id, replace);
        if (msg) game.toast(msg, 'bad');
        else ctx.skillBarFocus = null;
        break;
      }
      case 'primary': {
        ev.stopPropagation();
        const cur = game.save.primary;
        const msg = game.setPrimary(cur === d.id ? null : (d.id as never));
        if (msg) game.toast(msg, 'bad');
        break;
      }
      case 'stage': {
        const i = Number(d.i);
        if (game.selectStage(i)) {
          void withStage(() => {
            if (!game.inBattle) game.startBattle();
            ctx.setTab('camp');
          });
        }
        break;
      }
      case 'dungeon-enter': {
        const id = d.id!;
        const dungeon = getDungeon(id);
        if (game.canAffordDungeonKeys(dungeon.actId)) {
          void withStage(() => {
            if (game.startDungeon(id)) ctx.setTab('camp');
          });
        } else {
          showDungeonKeyBuy(ctx, { dungeonId: id, intent: 'enter' });
        }
        break;
      }
      case 'dungeon-sweep': {
        const id = d.id!;
        const dungeon = getDungeon(id);
        if (!game.dungeonSweepUnlocked(dungeon)) {
          game.sweepDungeon(id);
          break;
        }
        if (game.canAffordDungeonKeys(dungeon.actId)) {
          game.sweepDungeon(id);
        } else {
          showDungeonKeyBuy(ctx, { dungeonId: id, intent: 'sweep' });
        }
        break;
      }
      case 'craft-seal': {
        const err = game.craftAllAscendedSeals();
        if (err) game.toast(err, 'info');
        ctx.render();
        break;
      }
      case 'clan-raid': {
        void withStage(() => {
          const err = game.startClanRaid();
          if (err) game.toast(err, 'bad');
          else ctx.setTab('camp');
        });
        break;
      }
      case 'camp-pane': {
        const paneId = d.pane as CampPane;
        if (paneId === 'gear' || paneId === 'shop') {
          ctx.campPane = paneId;
          ctx.render();
        }
        break;
      }
      case 'open-daily-shop':
        ctx.openDailyShop();
        break;
      case 'shop-buy': {
        const err = game.buyDailyShop(Number(d.i));
        if (err) game.toast(err, 'bad');
        else ctx.render();
        break;
      }
      case 'clan-pane': {
        const paneId = d.pane as ClanPane;
        if (paneId === 'hall' || paneId === 'board' || paneId === 'town') {
          ctx.clanPane = paneId;
          ctx.render();
        }
        break;
      }
      case 'clan-hall':
        ctx.clanPane = 'hall';
        ctx.setTab('clan');
        break;
      case 'clan-create': {
        const name = (pane.querySelector('#clan-name') as HTMLInputElement | null)?.value ?? '';
        const err = game.createClan(name);
        if (err) game.toast(err, 'bad');
        else {
          ctx.clanPane = 'hall';
          ctx.render();
        }
        break;
      }
      case 'clan-join': {
        const code = (pane.querySelector('#clan-code') as HTMLInputElement | null)?.value ?? '';
        const err = game.joinClan(code);
        if (err) game.toast(err, 'bad');
        else {
          ctx.clanPane = 'hall';
          ctx.render();
        }
        break;
      }
      case 'clan-recruit': {
        const err = game.fillAiClanRoster();
        if (err) game.toast(err, err.includes('already') ? 'info' : 'bad');
        ctx.render();
        break;
      }
      case 'clan-practice': {
        void withStage(() => {
          const err = game.queuePractice4v4();
          if (err) game.toast(err, 'bad');
        });
        break;
      }
      case 'clan-queue': {
        if (!game.clanRosterReady()) {
          game.toast('Need one of each class — Fill AI roster', 'bad');
          break;
        }
        void withStage(() => {
          const err = game.queueClanPvp();
          if (err) game.toast(err, 'bad');
        });
        break;
      }
      case 'clan-queue-challenge': {
        if (!game.clanRosterReady()) {
          game.toast('Need one of each class — Fill AI roster', 'bad');
          break;
        }
        void withStage(() => {
          const err = game.queueClanPvp({ challengeUp: true });
          if (err) game.toast(err, 'bad');
        });
        break;
      }
      case 'clan-leave':
        game.leaveClan();
        ctx.clanPane = 'hall';
        ctx.render();
        break;
      case 'season-board':
        showSeasonBoard(ctx);
        break;
      case 'clan-armorer':
        showClanArmorer(ctx);
        break;
      default:
        break;
    }
  });

  // dim background dismissal for the modal is handled in openModal

  // Pending pickups and queued results open as modals when nothing else is up.
  setInterval(() => {
    if (modalEl) return;
    const r = resultQueue.shift();
    if (r) {
      showResult(ctx, r);
      return;
    }
    const next = game.save.pending[0];
    if (next) showCompare(ctx, next.id, 'pending');
  }, 120);

  let keyTick = 0;
  function frameLoop(): void {
    updateHud();
    keyTick += 1;
    if (keyTick % 30 === 0 && ctx.tab === 'adventure' && !modalEl) {
      const before = game.save.keys;
      game.refreshKeys();
      if (game.save.keys !== before) {
        game.changed();
      } else {
        const regen = pane.querySelector('.res-keys .keys-regen');
        if (regen) regen.textContent = formatKeyRegenLabel(game.save.keys, game.nextKeyInMs());
      }
    }
    requestAnimationFrame(frameLoop);
  }

  renderChat();
  renderNow();
  if (maybeShowLoginGate(ctx)) {
    // Class pick / tutorial / what's-new run after login or guest continue.
  } else if (!game.save.classPicked) showClassPick(ctx);
  else if (game.tutorialIsActive) {
    setTimeout(() => {
      if (!ctx.modalOpen) showTutorialCoach(ctx);
    }, 400);
  } else {
    maybeShowWhatsNew(ctx);
  }
  requestAnimationFrame(frameLoop);

  return { phaserParent: $('#phaser') };
}
