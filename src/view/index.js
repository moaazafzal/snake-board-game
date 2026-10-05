// GameView: owns the 3D world and turns rule events into animations.
import * as THREE from 'three';
import { World } from './world.js';
import { buildDecor } from './decor.js';
import { SnakeView, spineFor } from './snake.js';
import { planCrawl, cruise } from './slither.js';
import { buildShortcut } from './shortcuts.js';
import { Pawn } from './pawn.js';
import { Dice, Collectible, ReachMarkers, Particles } from './props.js';
import { tilePos, pawnSpot, PALETTE } from './layout.js';
import { Animator, ease, span } from '../anim.js';
import { SNAKES, SHORTCUTS, SPECIALS, MANGOES } from '../game/board.js';
import { sfx, vibrate } from '../audio.js';

const CONFETTI = ['#ff5f6d', '#ffc83a', '#3c86e8', '#53c26a', '#b58cff', '#ffffff'];
const LEAVES = ['#5fb04a', '#8fd16a', '#c9a46e'];

export class GameView {
  constructor(canvas, font) {
    this.world = new World(canvas);
    this.anim = new Animator();
    const scene = this.world.scene;
    this.scene = scene;
    this.decor = buildDecor(scene, font);
    this.snakes = SNAKES.map((def, i) => new SnakeView(scene, def, def.routes[0], i));
    this.shortcuts = new Map(SHORTCUTS.map((sc) => [sc.from, buildShortcut(scene, sc)]));
    this.pawns = [new Pawn(scene, PALETTE.p0, 0), new Pawn(scene, PALETTE.p1, 1)];
    this.pawns.forEach((p) => (p.onStep = () => sfx.step()));
    this.dice = new Dice(scene);
    this.mangoes = new Map(MANGOES.map((t) => [t, new Collectible(scene, t, 'mango')]));
    this.shieldItems = new Map(
      Object.keys(SPECIALS).filter((t) => SPECIALS[t] === 'shield').map((t) => [+t, new Collectible(scene, +t, 'shield')]),
    );
    this.reach = new ReachMarkers(scene, font);
    this.particles = new Particles(scene);
    this.sunk = [false, false];
    this.active = 0;

    // pulsing ring under the pawn whose turn it is
    this.turnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.98, 36).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.turnRing.visible = false;
    scene.add(this.turnRing);

    const tmp = new THREE.Vector3();
    this.world.onUpdate((dt) => {
      this.anim.update(dt);
      const t = this.anim.time;
      this.decor.update(dt);
      for (const s of this.snakes) s.update(dt);
      for (const sc of this.shortcuts.values()) sc.update?.(dt);
      for (const p of this.pawns) p.update(dt);
      for (const c of this.mangoes.values()) c.update(dt);
      for (const c of this.shieldItems.values()) c.update(dt);
      this.reach.update(dt);
      this.particles.update(dt);
      const ap = this.pawns[this.active].root.position;
      this.world.rig.followTarget.lerp(tmp.copy(ap), 1 - Math.exp(-dt * 6));
      this.turnRing.visible = this.ringOn && this.pawns[this.active].root.visible;
      if (this.turnRing.visible) {
        this.turnRing.position.set(ap.x, Math.max(0.03, ap.y + 0.03), ap.z);
        this.turnRing.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      }
    });
    this.world.start();
  }

  setSpeed(fast) {
    this.anim.speed = fast ? 1.9 : 1;
  }

  /** Snap every object to match a game state (used for new games and recovery). */
  reset(state) {
    this.epoch = (this.epoch || 0) + 1; // cleanups of cancelled animations must not touch the new scene
    this.anim.cancelAll();
    this.world.rig.focus = null;
    this.world.rig.shake = 0;
    this.particles.clear();
    this.dice.reset();
    this.reach.hide();
    this.snakes.forEach((s, i) => s.setRoute(SNAKES[i].routes[state.snakeRoute[i]]));
    for (const [t, c] of this.mangoes) (state.mangoes.includes(t) ? c.reset() : ((c.taken = true), (c.g.visible = false)));
    for (const [t, c] of this.shieldItems) (state.shields.includes(t) ? c.reset() : ((c.taken = true), (c.g.visible = false)));
    for (const sc of this.shortcuts.values()) sc.reset?.();
    state.players.forEach((p, i) => {
      const pawn = this.pawns[i];
      pawn.root.position.copy(pawnSpot(p.pos, i));
      pawn.root.rotation.set(0, 0, 0);
      pawn.root.scale.setScalar(1);
      pawn.body.position.set(0, 0, 0);
      pawn.body.rotation.set(0, 0, 0);
      pawn.setArms(0);
      pawn.legSwing(0);
      pawn.setMood('normal', 0);
      pawn.bubble.visible = p.shield;
      pawn.bubble.scale.setScalar(1);
      pawn.root.visible = true;
      this.sunk[i] = false;
      if (p.skip) this.setSunk(i, true);
      pawn.faceInstant(new THREE.Vector3(0, 0, -1));
    });
    this.world.rig.followTarget.copy(this.pawns[state.current].root.position);
    this.setActive(state.current);
  }

  setActive(i, ring = true) {
    this.active = i;
    this.ringOn = ring;
    this.turnRing.material.color.set(i === 0 ? '#7fc0ff' : '#ffb48a');
  }

  hideTurnRing() {
    this.ringOn = false;
  }

  setSunk(i, on) {
    this.sunk[i] = on;
    this.pawns[i].body.position.y = on ? -0.45 : 0;
  }

  showReach(list) { this.reach.show(list); }
  hideReach() { this.reach.hide(); }

  focusOn(target, dist = 14) {
    this.world.rig.focus = { target, dist };
  }
  unfocus() {
    this.world.rig.focus = null;
  }

  /* ------------------------------------------------------------ actions */

  async throwDice(i, value) {
    const pawn = this.pawns[i];
    const from = pawn.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const ahead = new THREE.Vector3(Math.sin(pawn.facing), 0, Math.cos(pawn.facing));
    const side = new THREE.Vector3(ahead.z, 0, -ahead.x);
    const to = pawn.root.position.clone().addScaledVector(ahead, 1.6).addScaledVector(side, i === 0 ? -1.3 : 1.3);
    sfx.roll();
    const a = this.anim;
    a.fx(0.25, (k) => pawn.setArms(-2.2 * Math.sin(Math.PI * k)));
    await this.dice.throw(a, from, to, value);
    sfx.diceLand();
    this.particles.emit(to.clone().setY(0.1), 6, ['#e9dcc0', '#c9b48e'], { speed: 1.2, up: 1.2, life: 0.5, size: 0.7 });
  }

  hideDice() {
    this.dice.hide(this.anim);
  }

  async hop(i, tile, n, last) {
    const pawn = this.pawns[i];
    const from = pawn.root.position.clone();
    const to = pawnSpot(tile, i);
    pawn.faceDir(to.clone().sub(from));
    pawn.idle = false;
    sfx.hop(n);
    await this.anim.tween(last ? 0.36 : 0.3, (k) => {
      pawn.root.position.lerpVectors(from, to, k);
      pawn.root.position.y += Math.sin(Math.PI * k) * (last ? 1.05 : 0.75);
      pawn.squash = -0.12 * Math.sin(Math.PI * k);
      pawn.setArms(-0.6 * Math.sin(Math.PI * k));
    }, ease.inOutSine);
    pawn.squash = last ? 0.28 : 0.16;
    pawn.idle = true;
    sfx.land();
    this.particles.emit(to.clone().setY(0.1), last ? 6 : 2, LEAVES, { speed: 1, up: 1, life: 0.4, size: 0.6 });
  }

  async turnAround(i) {
    const pawn = this.pawns[i];
    pawn.setMood('wow', 1.2);
    sfx.bounce();
    await this.anim.tween(0.45, (k) => {
      pawn.body.position.y = Math.sin(Math.PI * k) * 0.5;
    }, ease.outQuad);
  }

  async collectMango(i, tile) {
    const pawn = this.pawns[i];
    const c = this.mangoes.get(tile);
    pawn.setMood('happy', 1.6);
    sfx.mango();
    if (c && !c.taken) await c.collect(this.anim, pawn.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    this.particles.emit(pawn.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 26, ['#ffc83a', '#ff9a10', '#fff3c4'], { speed: 2.4, up: 2.6, life: 0.9 });
    await this.anim.tween(0.4, (k) => (pawn.body.position.y = Math.sin(Math.PI * k) * 0.6), ease.outQuad);
  }

  async pickShield(i, tile) {
    const pawn = this.pawns[i];
    const c = this.shieldItems.get(tile);
    pawn.setMood('wow', 1.5);
    sfx.shield();
    if (c && !c.taken) await c.collect(this.anim, pawn.root.position.clone().add(new THREE.Vector3(0, 1, 0)));
    pawn.bubble.visible = true;
    await this.anim.tween(0.45, (k) => pawn.bubble.scale.setScalar(Math.max(0.01, ease.outBack(k))));
  }

  async sink(i) {
    const pawn = this.pawns[i];
    pawn.setMood('scared', 30);
    sfx.sand();
    const at = pawn.root.position.clone();
    await this.anim.tween(1.3, (k) => {
      pawn.body.position.y = -0.45 * ease.inOutSine(k);
      pawn.body.rotation.z = Math.sin(k * 16) * 0.08 * (1 - k);
      pawn.setArms(-2.4 * k);
      if (Math.random() < 0.3) this.particles.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.15, (Math.random() - 0.5) * 1.4)), 1, ['#a57c47', '#c99a5c'], { speed: 0.4, up: 0.9, life: 0.5, size: 0.8 });
    });
    pawn.body.rotation.z = 0;
    this.sunk[i] = true;
  }

  async climbOut(i) {
    const pawn = this.pawns[i];
    sfx.pop();
    await this.anim.tween(0.9, (k) => {
      pawn.body.position.y = -0.45 * (1 - ease.outBack(k));
      pawn.setArms(-2.4 * (1 - k));
    });
    pawn.body.position.y = 0;
    pawn.setMood('normal', 0);
    this.sunk[i] = false;
    this.particles.emit(pawn.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 10, ['#a57c47', '#c99a5c'], { speed: 1.4, up: 1.4, life: 0.6 });
  }

  async river(i, from, to) {
    const pawn = this.pawns[i];
    pawn.setMood('dizzy', 3);
    sfx.splash();
    const pts = [];
    for (let t = from; t >= to; t--) pts.push(pawnSpot(t, i));
    const curve = new THREE.CatmullRomCurve3(pts.length > 1 ? pts : [pts[0], pts[0].clone()]);
    const spin = pawn.facing;
    let last = 0;
    await this.anim.tween(2.0, (k) => {
      const p = curve.getPointAt(ease.inOutSine(k));
      pawn.root.position.copy(p);
      pawn.root.position.y += Math.sin(k * Math.PI * 6) * 0.08 - 0.2 * Math.sin(Math.PI * k);
      pawn.facing = pawn.targetFacing = spin + k * Math.PI * 4;
      pawn.setArms(-1.6 + Math.sin(k * 30) * 0.4);
      if (k - last > 0.06) {
        last = k;
        this.particles.emit(p.clone().setY(0.25), 2, ['#e8fbff', '#9fe3f5', '#ffffff'], { speed: 1.2, up: 2.2, life: 0.6, size: 0.8 });
      }
    });
    pawn.setArms(0);
    pawn.squash = 0.25;
  }

  async shortcut(i, from) {
    const sc = this.shortcuts.get(from);
    const pawn = this.pawns[i];
    pawn.setMood('wow', 4);
    sfx.good();
    const later = (sec, fn) => this.anim.wait(sec).then(fn, () => {});
    if (sc.sc.kind === 'zip') later(1.85, () => sfx.zip(1.4 / this.anim.speed));
    if (sc.sc.kind === 'vine') later(0.95, () => sfx.whoosh(1.2 / this.anim.speed));
    if (sc.sc.kind === 'bridge') sfx.creak();
    this.focusOn(pawn.root.position, sc.sc.kind === 'bridge' ? 13 : 17);
    try {
      await sc.ride(pawn, this.anim, i);
    } finally {
      this.unfocus();
      pawn.setArms(0);
      pawn.legSwing(0);
      pawn.root.rotation.x = pawn.root.rotation.z = 0;
    }
    pawn.squash = 0.3;
    pawn.setMood('happy', 1.5);
    this.particles.emit(pawn.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 14, ['#ffc83a', '#ffffff', '#8fd16a'], { speed: 2, up: 2.2, life: 0.7 });
  }

  async swallow(i, si) {
    const pawn = this.pawns[i];
    const snake = this.snakes[si];
    const a = this.anim;
    const target = pawn.root.position.clone();
    const focus = target.clone();
    this.focusOn(focus, 12);
    pawn.setMood('scared', 10);
    snake.look = target.clone().add(new THREE.Vector3(0, 0.6, 0));
    snake.strikeTarget.copy(target);
    sfx.hiss();
    vibrate([40, 30, 120]);
    try {
      // 1. rise up and draw back into an S, mouth parting
      await a.tween(0.55, (k) => {
        snake.rear = k;
        snake.jaw = k * 0.35;
        pawn.body.rotation.z = Math.sin(k * 20) * 0.06;
      }, ease.outCubic);
      pawn.body.rotation.z = 0;
      await a.wait(0.12);
      // 2. strike: fast thrust with the mouth wide open
      await a.tween(0.17, (k) => {
        snake.strike = k;
        snake.rear = 1 - k * 0.55;
        snake.jaw = 0.35 + k * 0.65;
      }, ease.inQuad);
      sfx.gulp();
      this.world.rig.shake = 0.35;
      // 3. pawn is pulled into the mouth
      const mouth = new THREE.Vector3();
      const p0 = pawn.root.position.clone();
      await a.tween(0.2, (k) => {
        snake.head.getWorldPosition(mouth);
        pawn.root.position.lerpVectors(p0, mouth.setY(Math.max(0, mouth.y - 0.6)), k);
        pawn.root.scale.setScalar(Math.max(0.01, 1 - k));
      }, ease.inQuad);
      pawn.root.visible = false;
      // 4. recoil to rest, mouth closing
      await a.tween(0.45, (k) => {
        snake.strike = 1 - k;
        snake.rear = 0.45 * (1 - k);
        snake.jaw = 1 - k;
      }, ease.outCubic);
      snake.look = null;
      // 5. the gulp travels down the body; the camera rides along
      const dur = THREE.MathUtils.clamp(snake.len / 11, 1.3, 2.4);
      sfx.slide(dur);
      await a.tween(dur, (k) => {
        snake.bulge = 0.05 + k * 0.91;
        snake.pointAt(snake.bulge, focus);
      }, ease.inOutSine);
    } finally {
      snake.bulge = -1;
      snake.strike = 0;
      snake.rear = 0;
      snake.jaw = 0;
      snake.look = null;
      pawn.body.rotation.z = 0;
    }
  }

  async popOut(i, tile) {
    const pawn = this.pawns[i];
    const spot = pawnSpot(tile, i);
    pawn.root.position.copy(spot);
    pawn.root.visible = true;
    pawn.setMood('dizzy', 2.5);
    sfx.pop();
    this.particles.emit(spot.clone().add(new THREE.Vector3(0, 0.5, 0)), 16, LEAVES, { speed: 2, up: 2.5, life: 0.8 });
    await this.anim.tween(0.5, (k) => {
      pawn.root.scale.setScalar(Math.max(0.01, ease.outBack(k)));
      pawn.root.position.y = spot.y + Math.sin(Math.PI * k) * 0.8;
    });
    pawn.root.scale.setScalar(1);
    this.unfocus();
    await this.anim.wait(0.35);
  }

  async block(i, si) {
    const pawn = this.pawns[i];
    const snake = this.snakes[si];
    const a = this.anim;
    const target = pawn.root.position.clone();
    const epoch = this.epoch;
    this.focusOn(target.clone(), 12);
    snake.look = target.clone().add(new THREE.Vector3(0, 0.6, 0));
    // the strike stops at the bubble's surface
    const away = new THREE.Vector3().subVectors(snake.base[0], target).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    snake.strikeTarget.copy(target).addScaledVector(away.normalize(), 1.15);
    sfx.hiss();
    try {
      await a.tween(0.5, (k) => { snake.rear = k; snake.jaw = k * 0.5; }, ease.outCubic);
      await a.wait(0.1);
      await a.tween(0.16, (k) => { snake.strike = k; snake.rear = 1 - k * 0.5; snake.jaw = 0.5 + k * 0.5; }, ease.inQuad);
      sfx.block();
      this.world.rig.shake = 0.25;
      pawn.setMood('wow', 2);
      this.particles.emit(target.clone().add(new THREE.Vector3(0, 1, 0)), 36, ['#7fd7ff', '#ffffff', '#ffd36a'], { speed: 3.2, up: 2.6, life: 0.9 });
      // knocked back with a springy wobble, bubble pops
      await a.tween(0.75, (k) => {
        snake.strike = Math.max(0, 1 - ease.outElastic(Math.min(1, k * 1.2)));
        snake.rear = 0.5 * (1 - k);
        snake.jaw = 1 - k;
        const kb = Math.min(1, k * 2);
        pawn.bubble.scale.setScalar(1 + kb * 0.7);
        pawn.bubble.material.opacity = 0.28 * (1 - kb);
      });
    } finally {
      if (epoch === this.epoch) pawn.bubble.visible = false;
      pawn.bubble.scale.setScalar(1);
      pawn.bubble.material.opacity = 0.28;
      snake.strike = 0;
      snake.rear = 0;
      snake.jaw = 0;
      snake.look = null;
      this.unfocus();
    }
  }

  /** The snake crawls head-first to its new lair; every part of the body follows the head's path. */
  async moveSnake(si, fromRoute, toRoute) {
    const snake = this.snakes[si];
    const epoch = this.epoch;
    const oldBody = snake.base.map((p) => p.clone());
    const newBody = snake.spineOf(toRoute);
    const avoid = this.pawns.filter((p) => p.root.visible).map((p) => p.root.position.clone());
    const plan = planCrawl(oldBody, newBody, { avoid });
    const travel = plan.s1 - plan.s0;
    const dur = THREE.MathUtils.clamp(travel / 9.5, 2.2, 5.5);
    const body = oldBody.map((p) => p.clone());
    const focus = snake.head.position.clone();
    this.focusOn(focus, 19);
    sfx.hiss();
    const jumping = new Set();
    try {
      // wake up: lift the head and look toward the destination
      snake.look = newBody[0].clone().add(new THREE.Vector3(0, 0.5, 0));
      await this.anim.tween(0.5, (k) => (snake.crawlLift = 0.35 * k), ease.outCubic);
      snake.look = null;
      snake.flick = 0; // no idle tail swish while travelling
      snake.crawling = true;
      sfx.slither(dur / this.anim.speed);
      await this.anim.tween(dur, (k) => {
        const sHead = plan.s0 + travel * cruise(k);
        const L = THREE.MathUtils.lerp(plan.L0, plan.L1, cruise(k));
        plan.track.sampleBody(sHead, L, body);
        snake.setBody(body);
        focus.lerp(body[0], 0.25);
        // pawns hop over the passing body instead of being crawled through
        this.pawns.forEach((pw, pi) => {
          if (!pw.root.visible || this.sunk[pi] || jumping.has(pi)) return;
          const at = pw.root.position;
          for (let r = 0; r < body.length; r += 3) {
            if (Math.hypot(body[r].x - at.x, body[r].z - at.z) < 1.05) {
              jumping.add(pi);
              pw.setMood('scared', 1.2);
              this.anim.tween(0.62, (q) => (pw.body.position.y = Math.sin(Math.PI * q) * 1.35), ease.linear)
                .catch(() => {})
                .finally(() => { jumping.delete(pi); if (!this.sunk[pi]) pw.body.position.y = 0; });
              break;
            }
          }
        });
      });
      snake.crawling = false;
      await this.anim.tween(0.45, (k) => (snake.crawlLift = 0.35 * (1 - k)), ease.inOutSine);
    } finally {
      if (epoch === this.epoch) {
        snake.setRoute(toRoute);
      }
    }
    await this.anim.wait(0.3);
    this.unfocus();
  }

  async celebrate(i) {
    const pawn = this.pawns[i];
    pawn.setMood('happy', 60);
    vibrate([60, 40, 60, 40, 200]);
    const base = pawn.root.position.clone();
    const spin0 = pawn.facing;
    this.focusOn(base.clone(), 16);
    for (let n = 0; n < 4; n++) {
      this.particles.emit(base.clone().add(new THREE.Vector3(0, 2.2, 0)), 50, CONFETTI, { speed: 3.2, up: 4.2, gravity: 3, life: 2.2, flat: true, size: 0.8 });
      this.world.rig.shake = 0.1;
      await this.anim.tween(0.45, (k) => {
        pawn.root.position.y = base.y + Math.sin(Math.PI * k) * 0.9;
        pawn.facing = pawn.targetFacing = spin0 + (n + k) * Math.PI * 0.5;
        pawn.setArms(-2.6 * Math.sin(Math.PI * k));
      });
    }
    pawn.setArms(0);
  }
}
