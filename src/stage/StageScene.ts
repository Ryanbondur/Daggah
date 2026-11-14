import Phaser from 'phaser';
import type { BackgroundId } from '../data/acts';
import type { SkillId } from '../data/types';
import type { BattleEvent, Enemy } from '../game/combat';
import { HERO_X } from '../game/combat';
import type { Game } from '../game/game';
import { ENEMY_SPRITES, SKILL_IDS, asset, heroSprite, skillIcon } from '../ui/assets';
import type { HeroClass } from '../data/types';

const GROUND = 0.86;
const BG_GROUND_LINE = 0.765;
const BG_SRC_H = 720;
const BG_SRC_W = 1280;

interface EnemyView {
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
}

interface BuffChip {
  key: string;
  img: Phaser.GameObjects.Image;
}

export class StageScene extends Phaser.Scene {
  private game_: Game;
  private bgSprites: Partial<Record<BackgroundId, Phaser.GameObjects.TileSprite>> = {};
  private currentBg: BackgroundId | null = null;
  private campProps!: Phaser.GameObjects.Image;
  private fireGlow!: Phaser.GameObjects.Arc;
  private hero!: Phaser.GameObjects.Image;
  private heroSleep!: Phaser.GameObjects.Image;
  private bubble!: Phaser.GameObjects.Arc;
  private fx!: Phaser.GameObjects.Graphics;
  private heroBar!: Phaser.GameObjects.Graphics;
  private tag!: Phaser.GameObjects.Text;
  private enemyViews = new Map<number, EnemyView>();
  private chips: BuffChip[] = [];
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private queue: BattleEvent[] = [];
  private lastEnergyText = 0;
  private bgScroll = 0;
  private lastRunKey = '';
  private unsub: (() => void) | null = null;
  private clock = 0;
  private heroKey = 'hero-warrior';

  constructor(game: Game) {
    super('stage');
    this.game_ = game;
  }

  preload(): void {
    this.load.image('bg-cavern', asset('bg/bg-deep-cavern.jpg'));
    this.load.image('bg-ember', asset('bg/bg-ember-hollow.jpg'));
    this.load.image('bg-bone', asset('bg/bg-bone-gallery.jpg'));
    this.load.image('bg-frost', asset('bg/bg-frostvein.jpg'));
    this.load.image('bg-mire', asset('bg/bg-witchmire.jpg'));
    this.load.image('bg-cinder', asset('bg/bg-cinderreach.jpg'));
    this.load.image('bg-spire', asset('bg/bg-ashen-spire.jpg'));
    this.load.image('bg-echo', asset('bg/bg-echoing-dark.jpg'));
    for (const c of ['Warrior', 'Mage', 'Ranger', 'Rogue'] as HeroClass[]) {
      this.load.image(`hero-${c.toLowerCase()}`, heroSprite(c));
    }
    this.load.image('hero-sleep', asset('sprites/hero-sleeping.webp'));
    this.load.image('camp', asset('sprites/camp-tent-fire.webp'));
    for (const key of ENEMY_SPRITES) this.load.image(key, asset(`sprites/${key}.webp`));
    for (const id of SKILL_IDS) this.load.image(`skill-${id}`, skillIcon(id));
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.makeWideBg('bg-cavern', 'cavern');
    this.makeWideBg('bg-ember', 'ember');
    this.makeWideBg('bg-bone', 'bone');
    this.makeWideBg('bg-frost', 'frost');
    this.makeWideBg('bg-mire', 'mire');
    this.makeWideBg('bg-cinder', 'cinder');
    this.makeWideBg('bg-spire', 'spire');
    this.makeWideBg('bg-echo', 'echo');
    this.heroKey = `hero-${this.game_.save.heroClass.toLowerCase()}`;

    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('spark', 16, 16);
    g.destroy();

    this.campProps = this.add.image(0, 0, 'camp').setOrigin(0.5, 1).setDepth(1);
    this.fireGlow = this.add.circle(0, 0, 40, 0xff8a24, 0.35).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.heroSleep = this.add.image(0, 0, 'hero-sleep').setOrigin(0.5, 1).setDepth(6);
    this.bubble = this.add.circle(0, 0, 10, 0xcfe9ff, 0.55).setDepth(7);
    this.bubble.setStrokeStyle(2, 0xffffff, 0.7);
    this.hero = this.add.image(0, 0, this.heroKey).setOrigin(0.5, 1).setDepth(6);
    this.fx = this.add.graphics().setDepth(10);
    this.heroBar = this.add.graphics().setDepth(11);
    this.tag = this.add
      .text(0, 0, '1P', {
        fontFamily: 'Inter, sans-serif',
        fontStyle: '800',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#2a6fe0',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(12);

    this.embers = this.add
      .particles(0, 0, 'spark', {
        lifespan: { min: 700, max: 1400 },
        speedY: { min: -60, max: -25 },
        speedX: { min: -14, max: 14 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffd36b, 0xff9a2e, 0xff6a1a],
        frequency: 90,
        blendMode: 'ADD',
      })
      .setDepth(3);
    this.burst = this.add
      .particles(0, 0, 'spark', {
        lifespan: { min: 400, max: 900 },
        speed: { min: 60, max: 220 },
        angle: { min: 200, max: 340 },
        gravityY: 360,
        scale: { start: 0.55, end: 0 },
        tint: [0xffe27a, 0xffffff, 0xffb02e],
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(13);

    this.unsub = this.game_.on((e) => {
      if (e.t === 'battle') this.queue.push(e.ev);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsub?.());
  }

  private makeWideBg(texKey: string, id: BackgroundId): void {
    const src = this.textures.get(texKey).getSourceImage() as HTMLImageElement;
    const canvas = this.textures.createCanvas(`${texKey}-wide`, BG_SRC_W * 2, BG_SRC_H);
    if (!canvas) return;
    const ctx = canvas.getContext();
    ctx.drawImage(src, 0, 0, BG_SRC_W, BG_SRC_H);
    ctx.save();
    ctx.translate(BG_SRC_W * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, BG_SRC_W, BG_SRC_H);
    ctx.restore();
    canvas.refresh();
    const sprite = this.add.tileSprite(0, 0, 100, 100, `${texKey}-wide`).setOrigin(0, 0).setDepth(0);
    sprite.setVisible(false);
    this.bgSprites[id] = sprite;
  }

  // ---- frame --------------------------------------------------------------

  override update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.clock += dt;
    this.game_.tick(dt);

    const W = this.scale.width;
    const H = this.scale.height;
    if (W < 10 || H < 10) return;
    const game = this.game_;
    const battle = game.battle;
    const inBattle = game.mode !== 'camp' && !!battle;

    const runKey = battle ? `${battle.run.title}|${game.mode}` : 'camp';
    if (runKey !== this.lastRunKey) {
      this.lastRunKey = runKey;
      this.resetViews();
    }

    this.layoutBg(W, H, game.bg);
    this.fx.clear();
    this.heroBar.clear();

    if (inBattle && battle) this.renderBattle(battle, W, H, dt);
    else this.renderCamp(W, H);

    const q = this.queue;
    this.queue = [];
    for (const ev of q) this.handleEvent(ev, W, H);
  }

  private resetViews(): void {
    for (const v of this.enemyViews.values()) {
      v.sprite.destroy();
      v.bar.destroy();
    }
    this.enemyViews.clear();
    this.queue = [];
    this.bgScroll = 0;
  }

  private layoutBg(W: number, H: number, bg: BackgroundId): void {
    if (this.currentBg !== bg) {
      for (const s of Object.values(this.bgSprites)) s?.setVisible(false);
      this.currentBg = bg;
    }
    const sprite = this.bgSprites[bg];
    if (!sprite) return;
    const scale = (GROUND * H) / (BG_GROUND_LINE * BG_SRC_H);
    sprite.setVisible(true);
    sprite.setSize(W, H);
    sprite.setTileScale(scale, scale);
    sprite.tilePositionX = this.bgScroll / scale;
    sprite.tilePositionY = 0;
  }

  private renderCamp(W: number, H: number): void {
    const groundY = GROUND * H;
    this.hero.setVisible(false);
    this.heroBar.clear();
    this.tag.setVisible(false);
    for (const c of this.chips) c.img.setVisible(false);

    const propW = Math.min(W * 0.78, H * 1.1);
    this.campProps.setVisible(true);
    this.campProps.setDisplaySize(propW, propW * (277 / 520));
    this.campProps.setPosition(W * 0.7, groundY + H * 0.01);

    const fireX = this.campProps.x - propW * 0.5 + propW * 0.2;
    const fireY = this.campProps.y - propW * 0.12;
    this.fireGlow.setVisible(true);
    this.fireGlow.setPosition(fireX, fireY);
    this.fireGlow.setRadius(H * 0.1 * (1 + 0.1 * Math.sin(this.clock * 9)));
    this.fireGlow.setAlpha(0.28 + 0.1 * Math.sin(this.clock * 13));
    this.embers.setPosition(fireX, fireY - H * 0.03).setVisible(true);
    this.embers.emitting = true;

    const sh = H * 0.32;
    this.heroSleep.setVisible(true);
    this.heroSleep.setDisplaySize(sh * (360 / 354), sh);
    const hx = W * 0.26;
    this.heroSleep.setPosition(hx, groundY + H * 0.008);
    this.heroSleep.y += Math.sin(this.clock * 1.6) * 0.8;

    const pulse = 0.7 + 0.3 * Math.sin(this.clock * 1.6);
    this.bubble.setVisible(true);
    this.bubble.setPosition(hx + sh * 0.2, groundY - sh * 0.38);
    this.bubble.setRadius(H * 0.03 * pulse + H * 0.012);
  }

  private renderBattle(b: NonNullable<Game['battle']>, W: number, H: number, dt: number): void {
    const groundY = GROUND * H;
    this.heroSleep.setVisible(false);
    this.bubble.setVisible(false);
    this.hero.setVisible(true);
    const want = `hero-${this.game_.save.heroClass.toLowerCase()}`;
    if (want !== this.heroKey && this.textures.exists(want)) {
      this.heroKey = want;
      this.hero.setTexture(want);
    }

    const walkPx = H * 0.5;
    if (b.state === 'walk') this.bgScroll += walkPx * dt * this.game_.speed;

    const showCamp = b.nodeIndex <= 1 && (b.state === 'rest' || (b.state === 'walk' && b.nodeIndex === 1 && b.run.nodes[0]?.type === 'camp'));
    const propW = Math.min(W * 0.78, H * 1.1);
    if (showCamp) {
      const slide = b.state === 'walk' ? b.stateT * walkPx * this.game_.speed : 0;
      const px = W * 0.7 - slide;
      this.campProps.setVisible(true);
      this.campProps.setDisplaySize(propW, propW * (277 / 520));
      this.campProps.setPosition(px, groundY + H * 0.01);
      const fireX = px - propW * 0.5 + propW * 0.2;
      const fireY = this.campProps.y - propW * 0.12;
      this.fireGlow.setVisible(true).setPosition(fireX, fireY);
      this.fireGlow.setRadius(H * 0.1 * (1 + 0.1 * Math.sin(this.clock * 9)));
      this.fireGlow.setAlpha(0.28 + 0.1 * Math.sin(this.clock * 13));
      this.embers.setPosition(fireX, fireY - H * 0.03).setVisible(true);
      this.embers.emitting = true;
    } else {
      this.campProps.setVisible(false);
      this.fireGlow.setVisible(false);
      this.embers.emitting = false;
      this.embers.setVisible(false);
    }

    const hH = H * 0.34;
    const hW = hH * (360 / 343);
    this.hero.setDisplaySize(hW, hH);
    let hx = HERO_X * W;
    let hy = groundY + H * 0.012;
    let rot = 0;
    if (b.state === 'walk') {
      const t = this.clock * 11 * this.game_.speed;
      hy -= Math.abs(Math.sin(t)) * H * 0.012;
      rot = Math.sin(t) * 0.04;
    } else if (b.state === 'rest') {
      hy -= Math.sin(this.clock * 2) * H * 0.003;
    }
    if (b.heroSwingAnim > 0) {
      const p = 1 - b.heroSwingAnim / 0.3;
      hx += Math.sin(Math.PI * Math.min(1, p)) * W * 0.05;
      rot = Math.sin(Math.PI * Math.min(1, p)) * 0.22;
    }
    if (b.buffs.spinT > 0) rot = this.clock * 18;
    this.hero.setPosition(hx, hy);
    this.hero.setRotation(b.buffs.spinT > 0 ? 0 : rot);
    this.hero.setOrigin(0.5, 1);
    if (b.heroHitFlash > 0) this.hero.setTint(0xff7777);
    else this.hero.clearTint();
    this.hero.setAlpha(b.state === 'defeat' ? 0.5 : 1);

    this.drawHeroBar(b, hx, hy - hH, H);
    this.drawBuffs(b, hx, hy - hH, H);
    this.drawHeroFx(b, hx, hy, hH, W, H);

    this.syncEnemies(b, W, H, groundY);
  }

  private drawHeroBar(b: NonNullable<Game['battle']>, x: number, topY: number, H: number): void {
    const w = H * 0.16;
    const h = H * 0.02;
    const y = topY + H * 0.045;
    const pct = Math.max(0, b.hero.hp / b.hero.maxHp);
    this.heroBar.fillStyle(0x120808, 0.9);
    this.heroBar.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    this.heroBar.fillStyle(0xd23030, 1);
    this.heroBar.fillRect(x - w / 2, y, w * pct, h);
    if (b.buffs.shield > 0) {
      const sp = Math.min(1, b.buffs.shield / b.hero.maxHp);
      this.heroBar.fillStyle(0x6db8ff, 0.95);
      this.heroBar.fillRect(x - w / 2, y - h * 0.5, w * sp, h * 0.5);
    }
    this.heroBar.lineStyle(1, 0xffffff, 0.35);
    for (let i = 1; i < 4; i++) {
      this.heroBar.lineBetween(x - w / 2 + (w * i) / 4, y, x - w / 2 + (w * i) / 4, y + h);
    }
    this.tag.setVisible(true);
    this.tag.setFontSize(Math.max(9, H * 0.04));
    this.tag.setPosition(x, y - H * 0.012);
  }

  private drawBuffs(b: NonNullable<Game['battle']>, x: number, topY: number, H: number): void {
    const active: SkillId[] = [];
    if (b.buffs.bannerT > 0) active.push('war-banner');
    if (b.buffs.shield > 0) active.push(b.buffs.glacial ? 'glacial-armor' : 'iron-skin');
    if (b.buffs.guardT > 0) active.push('executioners-guard');
    if (b.buffs.rallyT > 0) active.push('rally');
    if (b.buffs.cleaveStacks > 0) active.push('cleave');
    if (b.buffs.smokeT > 0) active.push('smoke-bomb');
    if (b.buffs.immuneT > 0) active.push('cloak-of-shadows');
    if (b.buffs.stealthT > 0) active.push('ambush');
    const size = H * 0.055;
    const need = new Set(active);
    for (const c of this.chips) {
      if (!need.has(c.key.slice(0) as SkillId)) c.img.setVisible(false);
    }
    active.forEach((id, i) => {
      let chip = this.chips.find((c) => c.key === id);
      if (!chip) {
        const img = this.add.image(0, 0, `skill-${id}`).setDepth(12);
        chip = { key: id, img };
        this.chips.push(chip);
      }
      chip.img.setVisible(true);
      chip.img.setDisplaySize(size, size);
      chip.img.setPosition(x + H * 0.1 + i * (size + 3), topY + H * 0.06);
    });
  }

  private drawHeroFx(
    b: NonNullable<Game['battle']>,
    hx: number,
    hy: number,
    hH: number,
    W: number,
    H: number,
  ): void {
    const cy = hy - hH * 0.42;
    const g = this.fx;
    if (b.buffs.spinT > 0) {
      const rx = W * 0.2;
      const ry = H * 0.1;
      const t = this.clock * 16;
      for (let k = 0; k < 3; k++) {
        const base = t + (k * Math.PI * 2) / 3;
        for (let s = 0; s < 14; s++) {
          const a0 = base - s * 0.1;
          const a1 = base - (s + 1) * 0.1;
          const alpha = (1 - s / 14) * 0.95;
          g.lineStyle(H * 0.034 * (1 - s / 22), s < 3 ? 0xffe39a : 0xff7a1a, alpha);
          g.lineBetween(
            hx + Math.cos(a0) * rx,
            cy + Math.sin(a0) * ry,
            hx + Math.cos(a1) * rx,
            cy + Math.sin(a1) * ry,
          );
        }
      }
      g.fillStyle(0xff9a2e, 0.14);
      g.fillEllipse(hx, cy, rx * 2, ry * 2);
    }
    if (b.buffs.shield > 0) {
      g.fillStyle(0x66b6ff, 0.16);
      g.fillCircle(hx, cy, hH * 0.55);
      g.lineStyle(2, 0x9fd4ff, 0.7);
      g.strokeCircle(hx, cy, hH * 0.55);
    }
    if (b.buffs.guardT > 0) {
      g.lineStyle(3, 0xf4e07a, 0.6 + 0.3 * Math.sin(this.clock * 12));
      g.strokeCircle(hx, cy, hH * 0.6);
    }
    if (b.buffs.bannerT > 0) {
      g.fillStyle(0xff4a2a, 0.1 + 0.05 * Math.sin(this.clock * 8));
      g.fillCircle(hx, cy, hH * 0.65);
    }
    if (b.buffs.rallyT > 0 && Math.random() < 0.3) {
      this.floatText(hx + (Math.random() - 0.5) * hH * 0.5, cy, '+', {
        color: '#7dff8b',
        size: H * 0.06,
        rise: H * 0.1,
        life: 700,
      });
    }
  }

  private syncEnemies(b: NonNullable<Game['battle']>, W: number, H: number, groundY: number): void {
    const seen = new Set<number>();
    for (const e of b.enemies) {
      seen.add(e.id);
      let view = this.enemyViews.get(e.id);
      if (!view) {
        const sprite = this.add.image(0, 0, e.def.sprite).setOrigin(0.5, 1).setDepth(5);
        sprite.preFX?.addGlow(0xffe0b0, 1.6, 0, false, 0.1, 6);
        const bar = this.add.graphics().setDepth(11);
        view = { sprite, bar };
        this.enemyViews.set(e.id, view);
      }
      this.updateEnemyView(view, e, W, H, groundY);
    }
    for (const [id, view] of this.enemyViews) {
      if (!seen.has(id)) {
        view.sprite.destroy();
        view.bar.destroy();
        this.enemyViews.delete(id);
      }
    }
  }

  private updateEnemyView(view: EnemyView, e: Enemy, W: number, H: number, groundY: number): void {
    const tex = this.textures.get(e.def.sprite).getSourceImage() as HTMLImageElement;
    const h = H * e.def.size;
    const w = h * (tex.width / tex.height);
    let x = e.x * W;
    let y = groundY + H * 0.01;
    if (!e.dead) {
      const walking = e.x > HERO_X + 0.2 && e.stunT <= 0;
      if (walking) y -= Math.abs(Math.sin(this.clock * 12 + e.id)) * H * 0.012;
      else y -= Math.abs(Math.sin(this.clock * 3 + e.id)) * H * 0.003;
      if (e.attackAnim > 0) x -= Math.sin(Math.PI * (1 - e.attackAnim / 0.25)) * W * 0.035;
    }
    const s = view.sprite;
    s.setDisplaySize(w, h);
    s.setPosition(x, y);
    if (e.dead) {
      const p = Math.min(1, e.deathT / 0.7);
      s.setAlpha(1 - p);
      s.setRotation(p * 0.7);
      s.x += p * W * 0.04;
      s.y -= Math.sin(p * Math.PI) * H * 0.03;
      s.setTintFill(0xffffff);
      view.bar.clear();
      return;
    }
    s.setRotation(e.stunT > 0 ? Math.sin(this.clock * 30) * 0.05 : 0);
    if (e.hitFlash > 0) s.setTintFill(0xffffff);
    else if (e.shredT > 0) s.setTint(0xffb0b0);
    else s.clearTint();

    const bar = view.bar;
    bar.clear();
    const bw = Math.max(H * 0.14, w * 0.7);
    const bh = H * (e.def.role === 'trash' ? 0.016 : 0.022);
    const bx = x - bw / 2;
    const by = y - h - H * 0.02;
    bar.fillStyle(0x120808, 0.92);
    bar.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    bar.fillStyle(e.def.role === 'trash' ? 0xd23030 : 0xe8742a, 1);
    bar.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    bar.lineStyle(1, 0xffffff, 0.3);
    for (let i = 1; i < 4; i++) bar.lineBetween(bx + (bw * i) / 4, by, bx + (bw * i) / 4, by + bh);
    if (e.stunT > 0) {
      bar.fillStyle(0xfff27a, 0.9);
      bar.fillCircle(x - h * 0.15, by - H * 0.022, H * 0.011);
      bar.fillCircle(x, by - H * 0.03, H * 0.011);
      bar.fillCircle(x + h * 0.15, by - H * 0.022, H * 0.011);
    }
  }

  // ---- events -------------------------------------------------------------

  private enemyPos(id: number, W: number, H: number): { x: number; y: number } {
    const v = this.enemyViews.get(id);
    const groundY = GROUND * H;
    if (v) return { x: v.sprite.x, y: v.sprite.y - v.sprite.displayHeight * 0.55 };
    return { x: W * 0.5, y: groundY - H * 0.12 };
  }

  private handleEvent(ev: BattleEvent, W: number, H: number): void {
    const b = this.game_.battle;
    const heroX = HERO_X * W;
    const heroTop = GROUND * H - H * 0.34;
    switch (ev.t) {
      case 'hit': {
        const p = this.enemyPos(ev.enemyId, W, H);
        const big = ev.crit || !!ev.skill;
        this.floatText(p.x + (Math.random() - 0.5) * W * 0.05, p.y - H * 0.02, String(ev.dmg), {
          color: ev.crit ? '#ffd23a' : '#ff9a1f',
          size: H * (ev.crit ? 0.1 : big ? 0.085 : 0.07),
          rise: H * 0.16,
          life: 800,
          stroke: '#4a1700',
        });
        if (ev.crit || (ev.skill && !ev.aoe)) this.cameras.main.shake(70, 0.0025);
        break;
      }
      case 'heroHit':
        this.floatText(heroX + W * 0.02, heroTop + H * 0.06, `-${ev.dmg}`, {
          color: ev.absorbed ? '#8fd0ff' : '#ff4b4b',
          size: H * 0.06,
          rise: H * 0.1,
          life: 700,
          stroke: '#240606',
        });
        break;
      case 'skill': {
        const ult = ev.ultimate;
        const t = this.floatText(heroX + W * 0.06, heroTop - H * 0.02, ev.name, {
          color: '#fff6d8',
          size: H * (ult ? 0.13 : 0.065),
          rise: H * 0.05,
          life: ult ? 1300 : 900,
          stroke: '#3a1a08',
          family: '"Playfair Display", serif',
          weight: '900',
          pop: true,
        });
        t.setDepth(25);
        break;
      }
      case 'energy': {
        if (this.clock - this.lastEnergyText < 0.35) break;
        this.lastEnergyText = this.clock;
        this.floatText(heroX - W * 0.07, heroTop + H * 0.2, `+${ev.amount}`, {
          color: '#ff9a1f',
          size: H * 0.06,
          rise: H * 0.07,
          life: 650,
          stroke: '#4a1700',
        });
        break;
      }
      case 'blocked':
        this.floatText(heroX + W * 0.05, heroTop + H * 0.05, 'Blocked!', {
          color: '#bfe6ff',
          size: H * 0.07,
          rise: H * 0.08,
          life: 700,
          stroke: '#10304a',
        });
        break;
      case 'heal':
        this.floatText(heroX, heroTop, `+${ev.amount} HP`, {
          color: '#7dff8b',
          size: H * 0.07,
          rise: H * 0.1,
          life: 900,
          stroke: '#0b3a14',
        });
        break;
      case 'kill': {
        const p = this.enemyPos(ev.enemyId, W, H);
        if (ev.role !== 'trash') {
          this.burst.explode(ev.role === 'boss' ? 34 : 16, p.x, p.y);
          this.cameras.main.shake(140, 0.004);
        }
        this.floatText(p.x, p.y - H * 0.08, `+${ev.xp} XP`, {
          color: '#ffe9a8',
          size: H * 0.045,
          rise: H * 0.07,
          life: 800,
          stroke: '#2a1a00',
        });
        break;
      }
      case 'shout': {
        const t = this.floatText(W * 0.5, H * 0.22, ev.text, {
          color: '#ffb199',
          size: H * 0.11,
          rise: H * 0.03,
          life: 1500,
          stroke: '#3a0a0a',
          family: '"Playfair Display", serif',
          weight: '900',
          pop: true,
        });
        t.setDepth(25);
        break;
      }
      case 'stun': {
        const p = this.enemyPos(ev.enemyId, W, H);
        this.burst.explode(8, p.x, p.y);
        break;
      }
      default:
        break;
    }
    void b;
  }

  private floatText(
    x: number,
    y: number,
    text: string,
    o: {
      color: string;
      size: number;
      rise: number;
      life: number;
      stroke?: string;
      family?: string;
      weight?: string;
      pop?: boolean;
    },
  ): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, text, {
        fontFamily: o.family ?? '"Lilita One", Impact, sans-serif',
        fontStyle: o.weight ?? 'normal',
        fontSize: `${Math.round(o.size)}px`,
        color: o.color,
        stroke: o.stroke ?? '#2a1300',
        strokeThickness: Math.max(3, Math.round(o.size * 0.18)),
      })
      .setOrigin(0.5)
      .setDepth(20);
    if (o.pop) {
      t.setScale(0.4);
      this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
    }
    this.tweens.add({
      targets: t,
      y: y - o.rise,
      alpha: { from: 1, to: 0 },
      duration: o.life,
      delay: o.pop ? 250 : 0,
      ease: 'Cubic.Out',
      onComplete: () => t.destroy(),
    });
    return t;
  }
}
