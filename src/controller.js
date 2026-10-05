// Turn flow: asks the rules what happens, then plays it back through the view.
// The rules result is committed even if an animation fails, and every new
// match bumps `gen`, so stale async work can never touch a fresh game.
import { createGame, resolveRoll, resolveSkip, preview } from './game/rules.js';
import { SNAKES } from './game/board.js';
import { Cancelled } from './anim.js';
import { sfx } from './audio.js';

const KIND_NAME = { bridge: 'Rope bridge', vine: 'Vine swing', zip: 'Zip line' };

export class Controller {
  constructor(view, ui) {
    this.view = view;
    this.ui = ui;
    this.state = createGame('ai');
    this.display = [0, 0];
    this.started = false;
    this.paused = false;
    this.busy = false;
    this.gen = 0;
    this.forced = []; // test hook: queued dice values
    this.errors = [];
    this.rng = Math.random;
    this.ui.renderTrack(this.state);
    this.render();
  }

  get anim() {
    return this.view.anim;
  }

  /* ----------------------------------------------------------- phrasing */
  isYou(i) {
    return this.state.mode === 'ai' && !this.state.players[i].isAI;
  }
  who(i) {
    return this.isYou(i) ? 'You' : this.state.players[i].name;
  }
  /** conjugates a verb for "You" vs a third person: verb(i, 'roll', 'rolls') */
  verb(i, you, other) {
    return `${this.who(i)} ${this.isYou(i) ? you : other}`;
  }

  /* -------------------------------------------------------------- state */
  canRoll() {
    const s = this.state;
    const p = s.players[s.current];
    return this.started && !this.paused && !this.busy && s.winner === null && !p.isAI && !p.skip;
  }

  render() {
    this.ui.render(this.state, this.display, { started: this.started, busy: this.busy, canRoll: this.canRoll() });
  }

  newGame(mode) {
    this.gen++;
    this.state = createGame(mode);
    this.display = this.state.players.map((p) => p.pos);
    this.started = true;
    this.paused = false;
    this.busy = false;
    this.anim.paused = false;
    this.view.reset(this.state);
    this.view.world.rig.setMode('follow');
    this.ui.show('win', false);
    this.ui.show('menu', false);
    this.ui.setResumable(false);
    this.ui.renderTrack(this.state);
    this.ui.clearToast();
    this.ui.setDie(5);
    this.ui.toast(mode === 'ai' ? 'Roll to start your jungle race!' : 'Player 1 rolls first');
    this.beginTurn();
  }

  /** Opens the menu. A running match is paused (not destroyed) so it can be resumed. */
  openMenu() {
    if (this.started && this.state.winner === null) {
      this.paused = true;
      this.anim.paused = true;
      this.ui.setResumable(true);
    } else {
      if (this.state.winner !== null) {
        // leaving during the victory dance: stop it so the win panel can't pop over the menu
        this.gen++;
        this.anim.cancelAll();
        this.busy = false;
      }
      this.started = false;
      this.ui.setResumable(false);
    }
    this.view.hideReach();
    this.prevCamMode = this.view.world.rig.mode === 'menu' ? 'follow' : this.view.world.rig.mode;
    this.view.world.rig.setMode('menu');
    this.ui.show('win', false);
    this.ui.show('menu', true);
    this.render();
  }

  resume() {
    if (!this.started || !this.paused) return;
    this.paused = false;
    this.anim.paused = false;
    this.ui.show('menu', false);
    this.view.world.rig.setMode(this.prevCamMode || 'follow');
    this.render();
    if (!this.busy) this.beginTurn();
  }

  setForced(list) {
    this.forced = list.slice();
  }

  nextRoll() {
    while (this.forced.length) {
      const v = this.forced.shift();
      if (Number.isInteger(v) && v >= 1 && v <= 6) return v;
    }
    return 1 + Math.floor(this.rng() * 6);
  }

  /** Called whenever the turn passes or a game starts. */
  beginTurn() {
    const s = this.state;
    if (!this.started || this.paused || s.winner !== null) return;
    const i = s.current;
    const p = s.players[i];
    this.view.setActive(i);
    this.render();
    if (p.isAI || p.skip) {
      this.view.hideReach();
      this.ui.setReach(null);
      const g = this.gen;
      this.anim.wait(p.skip ? 0.7 : 0.9).then(
        () => g === this.gen && !this.busy && this.playTurn(),
        () => {},
      );
    } else {
      const list = preview(s, i);
      this.view.showReach(list);
      this.ui.setReach(list);
    }
  }

  roll() {
    if (!this.canRoll()) return false;
    sfx.click();
    if (this.view.world.rig.mode === 'free') this.view.world.rig.setMode('follow');
    this.playTurn();
    return true;
  }

  async playTurn() {
    if (this.busy) return;
    const g = this.gen;
    this.busy = true;
    this.view.hideReach();
    this.ui.setReach(null);
    this.render();
    let result = null;
    try {
      const s = this.state;
      result = s.players[s.current].skip ? resolveSkip(s, this.rng) : resolveRoll(s, this.nextRoll(), this.rng);
      for (const ev of result.events) {
        if (g !== this.gen) return;
        await this.present(ev, result.state);
      }
    } catch (e) {
      if (e instanceof Cancelled || g !== this.gen) return;
      // never soft-lock: log, commit the rules outcome and resync the scene
      console.error('[snake-jungle] turn animation failed, recovering', e);
      this.errors.push(String(e && e.stack ? e.stack : e));
      if (result) {
        this.state = result.state;
        this.view.reset(this.state);
      } else {
        this.state.current = 1 - this.state.current; // unreachable in practice; keeps the game moving
      }
    }
    if (g !== this.gen) return;
    if (result) this.state = result.state;
    this.display = this.state.players.map((p) => p.pos);
    this.busy = false;
    this.view.hideDice();
    this.ui.renderTrack(this.state);
    this.render();
    if (this.state.winner !== null) {
      await this.finish(g);
      return;
    }
    this.beginTurn();
  }

  async present(ev, next) {
    const v = this.view;
    const ui = this.ui;
    const i = ev.player;
    switch (ev.type) {
      case 'roll': {
        await v.throwDice(i, ev.value);
        ui.setDie(ev.value);
        ui.bigNumber(ev.value);
        await this.anim.wait(0.3);
        break;
      }
      case 'walk': {
        const { path, bounced } = ev;
        for (let n = 0; n < path.length; n++) {
          if (bounced && n > 0 && path[n - 1] === 100 && path[n] < 100) {
            ui.toast('Too far! Bouncing back', 'bad');
            await v.turnAround(i);
          }
          await v.hop(i, path[n], n + 1, n === path.length - 1);
          this.display[i] = path[n];
          this.render();
        }
        await this.anim.wait(0.15);
        break;
      }
      case 'mango':
        ui.toast(`Golden mango! ${this.verb(i, 'roll', 'rolls')} again`, 'good');
        await v.collectMango(i, ev.tile);
        break;
      case 'shield':
        ui.toast('Shield charm! It blocks the next snake', 'good');
        await v.pickShield(i, ev.tile);
        this.state.players[i].shield = true;
        this.render();
        break;
      case 'sand':
        ui.toast(`Quicksand! ${this.verb(i, 'miss', 'misses')} the next turn`, 'bad');
        await v.sink(i);
        break;
      case 'river':
        ui.toast('River current! Washed back 3 tiles', 'bad');
        await v.river(i, ev.from, ev.to);
        this.display[i] = ev.to;
        this.render();
        break;
      case 'shortcut':
        ui.toast(`${KIND_NAME[ev.kind]}! ${ev.from} → ${ev.to}`, 'good');
        await v.shortcut(i, ev.from);
        this.display[i] = ev.to;
        this.render();
        break;
      case 'block':
        ui.toast('Shield blocked the snake!', 'good');
        await v.block(i, ev.snake);
        this.state.players[i].shield = false;
        this.render();
        break;
      case 'snake':
        ui.toast(`Snake! ${this.verb(i, 'slide', 'slides')} down to ${ev.to}`, 'bad');
        await v.swallow(i, ev.snake);
        this.display[i] = ev.to;
        this.render();
        await v.popOut(i, ev.to);
        break;
      case 'bonusLost':
        ui.toast(`Stuck in quicksand: no ${ev.reason === 'six' ? 'extra roll for that 6' : 'mango bonus'}`, 'bad');
        await this.anim.wait(1.1);
        break;
      case 'extra':
        if (ev.reason === 'six') {
          ui.toast(`Six! ${this.verb(i, 'roll', 'rolls')} again`, 'good');
          sfx.six();
        }
        await this.anim.wait(0.55);
        break;
      case 'skip':
        ui.toast(`${this.verb(i, 'climb', 'climbs')} out of the quicksand: turn skipped`, 'bad');
        this.state.players[i].skip = false;
        this.render();
        await v.climbOut(i);
        await this.anim.wait(0.4);
        break;
      case 'next':
        await this.anim.wait(0.25);
        break;
      case 'snakeMove': {
        const name = SNAKES[ev.snake].name;
        ui.toast(`${name} the snake is on the move!`, 'bad');
        await v.moveSnake(ev.snake, ev.from, ev.to);
        ui.renderTrack({ ...this.state, snakeRoute: next.snakeRoute, shields: next.shields, mangoes: next.mangoes });
        ui.toast(`${name} settled at ${ev.to.head} (tail ${ev.to.tail})`, 'bad');
        await this.anim.wait(0.9);
        break;
      }
      case 'win':
        break;
      default:
        break;
    }
  }

  async finish(g) {
    const s = this.state;
    const w = s.winner;
    this.view.hideTurnRing();
    this.render();
    const humanLost = s.mode === 'ai' && s.players[w].isAI;
    this.ui.toast(humanLost ? 'The computer made it first!' : `${this.who(w)} reached the golden idol!`, 'good');
    humanLost ? sfx.lose() : sfx.win();
    try {
      await this.view.celebrate(w);
      await this.anim.wait(0.4);
    } catch (e) {
      if (e instanceof Cancelled || g !== this.gen) return;
    }
    if (g !== this.gen) return;
    this.started = false;
    this.ui.showWin(s, s.mode === 'ai');
    this.render();
  }
}
