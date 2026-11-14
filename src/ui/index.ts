import { SKILL_BY_ID } from '../data/skills';
import { defaultPrimary } from '../data/skills';
import type { NodeType } from '../data/acts';
import { xpToNext } from '../data/xp';
import type { Game, RunResult } from '../game/game';
import { asset, navIcon, skillIcon } from './assets';
import type { ModalOpts, Tab, UIContext } from './context';
import { fmt } from './context';
import { CLASS_PLAYSTYLES } from '../data/skills';
import type { PlaystyleId } from '../data/types';
import {
  showBag,
  showChat,
  showClanArmorer,
  showClanHall,
  showClassPick,
  showCompare,
  showHero,
  showItemInfo,
  showPvpResult,
  showResult,
  showSeasonBoard,
  showSettings,
  showTutorialCoach,
} from './modals';
import { escapeHtml } from './escape';
import { renderAdventure, renderCamp, renderSkill, renderTown } from './panes';
import { ICON } from './svg';
import { heroSprite } from './assets';

const NODE_ICON: Record<NodeType, string> = {
  camp: ICON.camp,
  trash: ICON.swords,
  elite: ICON.skull,
  miniboss: ICON.skull,
  boss: ICON.boss,
};

export function mountUI(game: Game, root: HTMLElement): { phaserParent: HTMLElement } {
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
    <section id="pane"></section>
    <nav id="nav">
      <button class="nav-btn" data-tab="camp"><img src="${navIcon('camp')}" alt="" />Camp</button>
      <button class="nav-btn" data-tab="skill"><img src="${navIcon('skill')}" alt="" />Skill<span class="new" id="new-badge" hidden>New</span></button>
      <div></div>
      <button class="nav-btn" data-tab="adventure"><img src="${navIcon('adventure')}" alt="" />Adventure</button>
      <button class="nav-btn" data-tab="town"><img src="${navIcon('town')}" alt="" />Town</button>
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

  const ctx: UIContext = {
    game,
    tab: 'camp',
    skillStyle: CLASS_PLAYSTYLES[game.save.heroClass][0],
    get modalOpen() {
      return !!modalEl;
    },
    setTab(tab: Tab) {
      ctx.tab = tab;
      if (tab === 'skill') game.markSkillsSeen();
      ctx.render();
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
    showChat: () => showChat(ctx),
    showItemInfo: (slot) => showItemInfo(ctx, slot),
    showClassPick: () => showClassPick(ctx),
    showClanHall: () => showClanHall(ctx),
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
    const scroll = pane.querySelector('.pane-inner.scroll')?.scrollTop ?? 0;
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
      case 'town':
        pane.innerHTML = renderTown(ctx);
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
    const html = m ? `${m[1]} ${m[2]}<br />${m[3]}` : title;
    if (titleEl.innerHTML !== html) titleEl.innerHTML = html;
    $('#cp').textContent = fmt(game.cp);
    const av = $('#hero-avatar') as HTMLImageElement | null;
    if (av) {
      const next = heroSprite(game.save.heroClass);
      if (av.getAttribute('src') !== next) av.src = next;
    }

    const nodes = game.trackNodes;
    const cur = game.currentNodeIndex;
    const pct = game.progressPct;
    const key = `${nodes.join(',')}|${cur}|${pct}|${game.inBattle}`;
    if (key === lastTrackKey && !force) return;
    lastTrackKey = key;
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
    const inBattle = game.inBattle && !!b;
    const totals = game.totals;
    const hpMax = inBattle && b ? b.hero.maxHp : totals.stats.hp;
    const hp = inBattle && b ? Math.max(0, b.hero.hp) : hpMax;
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
    $('#new-badge').hidden = !game.newSkillsAvailable;

    const btn = $('#battle-btn');
    btn.classList.toggle('fighting', inBattle);
    const loadout = game.heroInput().loadout;
    const prim = game.save.primary && loadout.includes(game.save.primary) ? game.save.primary : defaultPrimary(loadout);
    if (inBattle && b && prim) {
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
    const lines = game.chat.slice(-5);
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
        const el = document.createElement('div');
        el.className = 'levelup';
        const skills = e.newSkills.map((id) => SKILL_BY_ID[id].name);
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
        if (game.inBattle) {
          if (!game.forceCast()) game.toast('Primary skill not ready', 'info');
        } else {
          game.startBattle();
        }
        break;
      case 'toggle-battle':
        if (game.inBattle) game.retreat();
        else game.startBattle();
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
      case 'toggle-skill': {
        const msg = game.toggleSkill(d.id as never);
        if (msg) game.toast(msg, 'bad');
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
          if (!game.inBattle) game.startBattle();
          ctx.setTab('camp');
        }
        break;
      }
      case 'dungeon-enter':
        if (game.startDungeon(d.id!)) ctx.setTab('camp');
        break;
      case 'dungeon-sweep':
        game.sweepDungeon(d.id!);
        break;
      case 'clan-hall':
        showClanHall(ctx);
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
      const t = pane.querySelector('.res-bar small');
      if (t) t.textContent = `+1 in ${fmtMs(game.nextKeyInMs())}`;
    }
    requestAnimationFrame(frameLoop);
  }
  function fmtMs(ms: number): string {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  renderChat();
  renderNow();
  if (!game.save.classPicked) showClassPick(ctx);
  else if (game.tutorialIsActive) {
    setTimeout(() => {
      if (!ctx.modalOpen) showTutorialCoach(ctx);
    }, 400);
  }
  requestAnimationFrame(frameLoop);

  return { phaserParent: $('#phaser') };
}
