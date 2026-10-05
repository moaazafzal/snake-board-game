import './style.css';
import { canUseWebGL } from './view/world.js';
import { GameView } from './view/index.js';
import { Controller } from './controller.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const SPEED_KEY = 'snakejungle.fast';
const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";

const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.message ? e.reason.message : e.reason)));

async function boot() {
  const ui = new UI();
  const fatal = () => {
    ui.el.menu.classList.add('hidden'); // keep the HUD hidden (body stays in-menu)
    ui.show('fatal', true);
  };
  if (!canUseWebGL()) return fatal();
  // wait briefly for the display font so the painted board uses it
  try {
    await Promise.race([document.fonts.load(`700 50px Fredoka`), new Promise((r) => setTimeout(r, 1500))]);
  } catch {}

  let view;
  try {
    view = new GameView($('scene'), FONT);
  } catch (e) {
    console.error(e);
    return fatal();
  }
  const game = new Controller(view, ui);
  view.startWander(); // the main menu comes alive: snakes roam the board

  /* ---------------------------------------------------------- toggles */
  const followBtn = $('followBtn');
  const mapBtn = $('mapBtn');
  const rig = view.world.rig;
  const syncCam = (mode) => {
    followBtn.setAttribute('aria-pressed', String(mode === 'follow'));
    mapBtn.setAttribute('aria-pressed', String(mode === 'map'));
  };
  rig.onModeChange = syncCam;
  followBtn.onclick = () => rig.setMode('follow');
  mapBtn.onclick = () => rig.setMode(rig.mode === 'map' ? 'follow' : 'map');

  const speedBtn = $('speedBtn');
  let fast = false;
  try {
    fast = localStorage.getItem(SPEED_KEY) === '1';
  } catch {}
  const syncSpeed = () => {
    view.setSpeed(fast);
    speedBtn.setAttribute('aria-pressed', String(fast));
    speedBtn.setAttribute('aria-label', fast ? 'Normal speed' : 'Speed up animations');
  };
  speedBtn.onclick = () => {
    fast = !fast;
    try {
      localStorage.setItem(SPEED_KEY, fast ? '1' : '0');
    } catch {}
    syncSpeed();
  };
  syncSpeed();

  const soundBtn = $('soundBtn');
  const syncSound = () => {
    soundBtn.setAttribute('aria-pressed', String(sfx.muted));
    soundBtn.setAttribute('aria-label', sfx.muted ? 'Turn sound on' : 'Mute sound');
    soundBtn.classList.toggle('muted', sfx.muted);
  };
  soundBtn.onclick = () => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    syncSound();
    sfx.click();
  };
  syncSound();

  /* ------------------------------------------------------------ menus */
  $('playAI').onclick = () => game.newGame('ai');
  $('play2').onclick = () => game.newGame('pvp');
  $('resumeBtn').onclick = () => game.resume();
  $('againBtn').onclick = () => game.newGame(game.state.mode);
  $('homeBtn').onclick = () => game.openMenu();
  $('menuBtn').onclick = () => game.openMenu();
  $('helpBtn').onclick = () => ui.show('help', true);
  $('helpClose').onclick = () => ui.show('help', false);
  $('rollBtn').onclick = () => game.roll();

  // Buttons clicked with a mouse/finger drop focus, so Space/Enter keep rolling
  // instead of re-triggering the last button. Keyboard users keep normal focus.
  for (const b of document.querySelectorAll('button')) {
    b.addEventListener('click', (e) => {
      if (e.detail > 0) b.blur();
    });
  }
  // the first interaction unlocks audio
  const unlock = () => sfx.unlock();
  addEventListener('pointerdown', unlock, { passive: true });
  addEventListener('keydown', unlock);

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('help').classList.contains('hidden')) ui.show('help', false);
      else if (game.started && !game.paused) game.openMenu();
      else if (game.paused) game.resume();
      return;
    }
    const rollKey = e.code === 'Space' || e.key === 'Enter' || e.key === 'r' || e.key === 'R';
    if (!rollKey) return;
    const el = document.activeElement;
    const onButton = el && el.tagName === 'BUTTON' && el.id !== 'rollBtn';
    if (onButton && (e.code === 'Space' || e.key === 'Enter')) return; // let the focused button work
    if (!document.body.classList.contains('in-menu')) {
      e.preventDefault();
      if (!e.repeat) game.roll();
    }
  });

  syncCam(rig.mode);
  document.body.classList.add('ready');

  // test/debug hook: ?test exposes a small API for automated play-testing
  if (new URLSearchParams(location.search).has('test')) {
    window.__game = {
      game,
      view,
      errors,
      get state() {
        return game.state;
      },
      force: (list) => game.setForced(list),
      get busy() {
        return game.busy;
      },
      get fps() {
        return view.world.fps;
      },
      get quality() {
        return view.world.quality.level;
      },
    };
  }
}

boot();
