// Static scenery: terrain, the painted board, jungle props and the finish idol.
import * as THREE from 'three';
import { TILE, HALF, tilePos, PALETTE } from './layout.js';
import { LAST, SHORTCUTS, SPECIALS, tileRowCol } from '../game/board.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function noise2(x, z) {
  return Math.sin(x * 0.11 + Math.cos(z * 0.07) * 1.7) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5;
}

export function buildDecor(scene, fontFamily) {
  const r = rng(1234);
  const updaters = [];

  // ---- terrain -------------------------------------------------------------
  const ground = new THREE.PlaneGeometry(640, 640, 80, 80);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position;
  const gcol = [];
  const cA = new THREE.Color(PALETTE.grass);
  const cB = new THREE.Color(PALETTE.grassDark);
  const cC = new THREE.Color('#9ccc63');
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const n = noise2(x, z);
    const y = groundHeight(x, z);
    const lift = y + 1.6;
    gp.setY(i, y);
    const c = cA.clone().lerp(cB, (n + 1) * 0.35).lerp(cC, THREE.MathUtils.smoothstep(lift, 4, 11) * 0.6);
    gcol.push(c.r, c.g, c.b);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
  ground.computeVertexNormals();
  const groundMesh = new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // ---- board ---------------------------------------------------------------
  const frame = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 2.4, 1.7, HALF * 2 + 2.4), lambert(PALETTE.woodDark));
  frame.position.y = -0.95;
  frame.receiveShadow = true;
  frame.castShadow = false;
  scene.add(frame);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 1.2, 1.7, HALF * 2 + 1.2), lambert(PALETTE.wood));
  rim.position.y = -0.87;
  rim.receiveShadow = true;
  scene.add(rim);

  const boardCanvas = paintBoard(fontFamily);
  const tex = new THREE.CanvasTexture(boardCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: tex }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0;
  top.receiveShadow = true;
  scene.add(top);

  // start pad in front of tile 1
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.5, 18), lambert('#d9c08a'));
  pad.position.copy(tilePos(0)).add(new THREE.Vector3(0, -0.2, 0.2));
  pad.receiveShadow = true;
  scene.add(pad);
  addSign(scene, tilePos(0).add(new THREE.Vector3(-2.4, 0, 0.6)), 'START', fontFamily);

  // ---- tile effects: river water and quicksand swirls -------------------------
  const waterTex = makeWaterTexture();
  const waterMat = new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.92 });
  const sandTex = makeSwirlTexture();
  const sandMat = new THREE.MeshLambertMaterial({ map: sandTex, transparent: true });
  for (const [t, kind] of Object.entries(SPECIALS)) {
    const p = tilePos(+t);
    if (kind === 'river') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92), waterMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.03, p.z);
      m.receiveShadow = true;
      scene.add(m);
      for (let k = 0; k < 3; k++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + r() * 0.18, 0), lambert('#8f8b80'));
        const a = r() * Math.PI * 2;
        rock.position.set(p.x + Math.cos(a) * 1.5, 0.08, p.z + Math.sin(a) * 1.5);
        rock.castShadow = true;
        scene.add(rock);
      }
    } else if (kind === 'sand') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(TILE * 0.43, 32), sandMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.03, p.z);
      m.receiveShadow = true;
      scene.add(m);
      updaters.push((dt) => (m.rotation.z += dt * 0.35));
    }
  }
  updaters.push((dt) => {
    waterTex.offset.y -= dt * 0.18;
    waterTex.offset.x += dt * 0.03;
  });

  // ---- finish idol on tile 100 -------------------------------------------------
  addFinish(scene, tilePos(LAST), updaters);

  // ---- jungle props (instanced) -----------------------------------------------
  let margin = 3.5;
  const keepClear = (x, z) => {
    if (Math.abs(x) < HALF + margin && Math.abs(z) < HALF + margin) return true; // board
    if (z > HALF && z < HALF + 26 && Math.abs(x) < HALF + 8) return true; // camera corridor in front of the board
    return false;
  };
  const place = (n, rMin, rMax, ok = () => true) => {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 40) {
      const a = r() * Math.PI * 2;
      const d = rMin + Math.sqrt(r()) * (rMax - rMin);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (keepClear(x, z) || !ok(x, z)) continue;
      out.push({ x, z, y: groundHeight(x, z), s: 0.75 + r() * 0.6, rot: r() * Math.PI * 2, v: r() });
    }
    return out;
  };

  margin = 8; // tall props stay back so they never cover the board
  const trees = place(150, 30, 120);
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 4.2, 6).translate(0, 2.1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const crown2Geo = new THREE.IcosahedronGeometry(1.7, 0);
  instanced(scene, trunkGeo, lambert('#7a5232'), trees, (o, m) => m.compose(v3(o.x, o.y, o.z), quatY(o.rot), v3(o.s, o.s * (0.9 + o.v * 0.5), o.s)), { castShadow: true });
  const leafCols = ['#3f9a4a', '#4fae4f', '#2f8a46', '#69b84a', '#3a8f5c'].map((c) => new THREE.Color(c));
  instanced(scene, crownGeo, lambert('#ffffff'), trees, (o, m) => m.compose(v3(o.x, o.y + 4.6 * o.s * (0.9 + o.v * 0.5), o.z), quatY(o.rot), v3(o.s * 1.1, o.s * 0.95, o.s * 1.1)), { castShadow: true, colors: trees.map((o) => leafCols[Math.floor(o.v * leafCols.length)]) });
  instanced(scene, crown2Geo, lambert('#ffffff'), trees, (o, m) => m.compose(v3(o.x + 0.8 * o.s, o.y + 6.4 * o.s * (0.9 + o.v * 0.5), o.z - 0.4 * o.s), quatY(o.rot + 1), v3(o.s, o.s, o.s)), { colors: trees.map((o) => leafCols[Math.floor(((o.v * 3) % 1) * leafCols.length)]) });

  const palms = place(16, 29, 44);
  for (const o of palms) addPalm(scene, o, r);

  margin = 3.5;
  const bushes = place(110, 23.5, 70);
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  instanced(scene, bushGeo, lambert('#ffffff'), bushes, (o, m) => m.compose(v3(o.x, o.y + 0.35 * o.s, o.z), quatY(o.rot), v3(o.s * 1.3, o.s * 0.85, o.s * 1.2)), { colors: bushes.map((o) => leafCols[Math.floor(o.v * leafCols.length)].clone().offsetHSL(0, 0, 0.05)) });

  const rocks = place(45, 23, 80);
  instanced(scene, new THREE.DodecahedronGeometry(0.8, 0), lambert('#a9a497'), rocks, (o, m) => m.compose(v3(o.x, o.y + 0.2, o.z), quatY(o.rot), v3(o.s, o.s * 0.65, o.s * 1.1)), { castShadow: true });

  // flowers ring the board, including the open front
  const flowers = [];
  for (let i = 0; i < 110; i++) {
    const side = Math.floor(r() * 4);
    const t = (r() - 0.5) * (HALF * 2 + 8);
    const off = HALF + 2.2 + r() * 6;
    const [x, z] = side === 0 ? [t, off] : side === 1 ? [t, -off] : side === 2 ? [off, t] : [-off, t];
    flowers.push({ x, z, y: groundHeight(x, z), s: 0.45 + r() * 0.35, rot: r() * 6, v: r() });
  }
  const petal = ['#ff7aa8', '#ffd447', '#ffffff', '#b58cff', '#ff9b4a'].map((c) => new THREE.Color(c));
  instanced(scene, new THREE.OctahedronGeometry(0.22, 0), lambert('#ffffff'), flowers, (o, m) => m.compose(v3(o.x, o.y + 0.3, o.z), quatY(o.rot), v3(o.s, o.s * 0.7, o.s)), { colors: flowers.map((o) => petal[Math.floor(o.v * petal.length)]) });
  instanced(scene, new THREE.ConeGeometry(0.28, 0.9, 4).translate(0, 0.45, 0), lambert('#5fae46'), place(260, 22.5, 60), (o, m) => m.compose(v3(o.x, o.y, o.z), quatY(o.rot), v3(o.s, o.s, o.s)));

  // soft blob shadows under the canopy (cheaper than real tree shadows)
  const blobTex = makeBlobTexture();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5, color: '#1f3a14' });
  instanced(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMat, trees, (o, m) => m.compose(v3(o.x + 1, o.y + 0.05, o.z + 0.6), quatY(0), v3(6 * o.s, 1, 6 * o.s)));

  // drifting clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false, emissive: '#dfefff', emissiveIntensity: 0.35 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + r() * 3, 0), cloudMat);
      b.position.set(k * 4 - 6, r() * 2, r() * 3);
      b.scale.y = 0.6;
      c.add(b);
    }
    const a = r() * Math.PI * 2;
    c.position.set(Math.cos(a) * (110 + r() * 60), 55 + r() * 25, Math.sin(a) * (110 + r() * 60));
    clouds.add(c);
  }
  scene.add(clouds);
  updaters.push((dt) => (clouds.rotation.y += dt * 0.006));

  return { update: (dt) => updaters.forEach((f) => f(dt)) };
}

export function groundHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const n = noise2(x, z);
  return -1.6 + THREE.MathUtils.smoothstep(d, 34, 120) * (6 + n * 5) + THREE.MathUtils.smoothstep(d, 30, 44) * n * 0.6;
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const quatY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

function instanced(scene, geo, mat, items, compose, { castShadow = false, colors = null } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  items.forEach((o, i) => {
    compose(o, m);
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, colors[i]);
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = !mat.transparent;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

function addPalm(scene, o, r) {
  const g = new THREE.Group();
  const trunkMat = lambert('#9a7448');
  let y = 0;
  let x = 0;
  const lean = (r() - 0.5) * 0.5;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - i * 0.02, 0.34 - i * 0.02, 1.1, 6), trunkMat);
    seg.position.set(x, y + 0.55, 0);
    seg.rotation.z = -lean;
    g.add(seg);
    y += 1.05;
    x += lean * 0.9;
  }
  const leafMat = lambert('#4caf50', { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 3).rotateZ(Math.PI / 2).translate(1.7, 0, 0), leafMat);
    leaf.position.set(x, y, 0);
    leaf.rotation.y = (i / 7) * Math.PI * 2;
    leaf.rotation.z = -0.45;
    leaf.scale.set(1, 1, 0.35);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(o.x, o.y, o.z);
  g.scale.setScalar(o.s * 1.2);
  g.rotation.y = o.rot;
  scene.add(g);
}

function addSign(scene, pos, text, font) {
  const g = new THREE.Group();
  const wood = lambert(PALETTE.wood);
  for (const dx of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), wood);
    post.position.set(dx, 1.1, 0);
    post.castShadow = true;
    g.add(post);
  }
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#b9824a';
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#5a3417';
  x.font = `700 54px ${font}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 0.16), [wood, wood, wood, wood, new THREE.MeshLambertMaterial({ map: t }), wood]);
  board.position.y = 1.85;
  board.castShadow = true;
  g.add(board);
  g.position.copy(pos);
  g.rotation.y = 0.35;
  scene.add(g);
}

function addFinish(scene, p, updaters) {
  const g = new THREE.Group();
  const stone = lambert('#d8cfb4');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.5, 8), stone);
  base.position.y = 0.25;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.9, 8), stone);
  column.position.y = 0.95;
  const gold = new THREE.MeshPhongMaterial({ color: '#ffc83a', emissive: '#a86400', emissiveIntensity: 0.35, shininess: 90, flatShading: true });
  const idol = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), gold);
  idol.position.y = 2.35;
  idol.scale.set(1, 1.3, 1);
  for (const m of [base, column, idol]) { m.castShadow = true; g.add(m); }
  // offset to the tile corner so pawns can still stand on 100
  g.position.set(p.x - 1.15, 0, p.z - 1.15);
  g.scale.setScalar(0.85);
  scene.add(g);
  // flags at the corners
  const flagCols = ['#ff5f6d', '#ffc83a', '#3c86e8', '#53c26a'];
  [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]].forEach(([dx, dz], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), lambert('#f4efe2'));
    pole.position.set(p.x + dx, 1.2, p.z + dz);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), lambert(flagCols[i], { side: THREE.DoubleSide }));
    flag.position.set(p.x + dx + 0.4, 2.1, p.z + dz);
    scene.add(pole, flag);
    updaters.push((dt, t = performance.now() / 1000) => { flag.rotation.y = Math.sin(t * 2.4 + i) * 0.35; });
  });
  updaters.push((dt) => {
    idol.rotation.y += dt * 0.9;
    idol.position.y = 2.35 + Math.sin(performance.now() / 600) * 0.12;
  });
}

// ---- textures -----------------------------------------------------------------

function paintBoard(font) {
  const S = 2048;
  const T = S / 10;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#7a5530';
  x.fillRect(0, 0, S, S);
  const tones = [['#f1e2b4', '#e6d39d'], ['#cfe6a4', '#bcd98d']];
  const starts = new Map(SHORTCUTS.map((s) => [s.from, s]));
  const ends = new Map(SHORTCUTS.map((s) => [s.to, s]));
  for (let n = 1; n <= LAST; n++) {
    const { row, col } = tileRowCol(n);
    const px = col * T;
    const py = (9 - row) * T;
    const pair = tones[(row + col) % 2];
    const kind = SPECIALS[n];
    let fill = pair[0];
    let fill2 = pair[1];
    if (kind === 'sand') [fill, fill2] = ['#d9b277', '#c79b5c'];
    if (kind === 'river') [fill, fill2] = ['#8fd3ea', '#5fb6d6'];
    if (n === LAST) [fill, fill2] = ['#ffe17a', '#ffc83a'];
    const grd = x.createRadialGradient(px + T / 2, py + T / 2, T * 0.1, px + T / 2, py + T / 2, T * 0.75);
    grd.addColorStop(0, fill);
    grd.addColorStop(1, fill2);
    x.fillStyle = grd;
    roundRect(x, px + 5, py + 5, T - 10, T - 10, 22);
    x.fill();
    x.strokeStyle = 'rgba(90,60,30,0.25)';
    x.lineWidth = 4;
    x.stroke();

    if (starts.has(n)) {
      x.strokeStyle = '#e8a417';
      x.lineWidth = 10;
      roundRect(x, px + 14, py + 14, T - 28, T - 28, 18);
      x.stroke();
      arrow(x, px + T - 44, py + T - 46, '#e8a417');
    }
    if (ends.has(n)) {
      x.fillStyle = 'rgba(232,164,23,0.55)';
      x.beginPath();
      x.arc(px + T - 34, py + 34, 13, 0, Math.PI * 2);
      x.fill();
    }
    if (kind === 'shield') shieldIcon(x, px + T - 44, py + T - 48);
    if (kind === 'river') waves(x, px, py, T);

    x.fillStyle = kind === 'river' ? '#0f4560' : '#4a3520';
    x.textAlign = 'left';
    x.textBaseline = 'top';
    x.font = `700 ${n === LAST ? 64 : 50}px ${font}`;
    x.fillText(String(n), px + 18, py + 14);
  }
  return c;
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

function arrow(x, cx, cy, color) {
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(cx, cy - 22);
  x.lineTo(cx + 20, cy + 2);
  x.lineTo(cx + 8, cy + 2);
  x.lineTo(cx + 8, cy + 22);
  x.lineTo(cx - 8, cy + 22);
  x.lineTo(cx - 8, cy + 2);
  x.lineTo(cx - 20, cy + 2);
  x.closePath();
  x.fill();
}

function shieldIcon(x, cx, cy) {
  x.fillStyle = '#3d8fe0';
  x.beginPath();
  x.moveTo(cx, cy - 26);
  x.lineTo(cx + 22, cy - 16);
  x.quadraticCurveTo(cx + 22, cy + 14, cx, cy + 28);
  x.quadraticCurveTo(cx - 22, cy + 14, cx - 22, cy - 16);
  x.closePath();
  x.fill();
  x.fillStyle = '#bfe3ff';
  x.fillRect(cx - 3, cy - 16, 6, 30);
}

function waves(x, px, py, T) {
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.lineWidth = 5;
  for (let k = 0; k < 3; k++) {
    const y = py + T * (0.45 + k * 0.17);
    x.beginPath();
    for (let i = 0; i <= 20; i++) {
      const xx = px + 26 + (i / 20) * (T - 52);
      const yy = y + Math.sin(i * 0.9 + k) * 6;
      i ? x.lineTo(xx, yy) : x.moveTo(xx, yy);
    }
    x.stroke();
  }
}

function makeWaterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#4fb4dd';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    x.beginPath();
    for (let i = 0; i <= 32; i++) {
      const xx = (i / 32) * 128;
      const yy = k * 21 + 8 + Math.sin((i / 32) * Math.PI * 4 + k) * 4;
      i ? x.lineTo(xx, yy) : x.moveTo(xx, yy);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSwirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, '#8c6236');
  g.addColorStop(0.75, '#c99a5c');
  g.addColorStop(1, 'rgba(201,154,92,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(90,58,28,0.55)';
  x.lineWidth = 6;
  for (let arm = 0; arm < 3; arm++) {
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 3 + (arm * Math.PI * 2) / 3;
      const rr = 8 + i * 1.8;
      const xx = 128 + Math.cos(a) * rr;
      const yy = 128 + Math.sin(a) * rr;
      i ? x.lineTo(xx, yy) : x.moveTo(xx, yy);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
