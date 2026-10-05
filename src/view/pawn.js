// Jungle buddy pawns: round explorers with a leaf hat (P1) or flower crown (P2).
import * as THREE from 'three';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export class Pawn {
  constructor(scene, color, variant) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // squash & stretch pivot at the feet
    this.root.add(this.body);
    const skin = lambert(color);
    const belly = lambert(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55));
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), skin);
    torso.scale.set(1, 1.05, 0.95);
    torso.position.y = 0.78;
    torso.castShadow = true;
    const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10), belly);
    tummy.scale.set(1, 1.05, 0.55);
    tummy.position.set(0, 0.68, 0.36);
    this.body.add(torso, tummy);

    // eyes
    const white = lambert('#ffffff');
    const dark = new THREE.MeshBasicMaterial({ color: '#1c1c1c' });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), dark);
      pupil.position.z = 0.1;
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      glint.position.set(0.03, 0.04, 0.18);
      eye.add(ball, pupil, glint);
      eye.position.set(s * 0.22, 1.02, 0.47);
      this.body.add(eye);
      this.eyes.push({ eye, pupil });
    }
    // cheeks
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lambert('#ff8fa3'));
      c.scale.set(1, 0.6, 0.4);
      c.position.set(s * 0.38, 0.86, 0.47);
      this.body.add(c);
    }
    // arms & legs
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.58, 0.88, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 3, 8).translate(0, -0.22, 0), skin);
      arm.castShadow = true;
      pivot.add(arm);
      pivot.rotation.z = s * 0.25;
      this.body.add(pivot);
      this.arms.push({ pivot, s });
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.25, 0.3, 0);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lambert(new THREE.Color(color).multiplyScalar(0.7)));
      foot.scale.set(1, 0.7, 1.4);
      foot.position.set(0, -0.2, 0.06);
      foot.castShadow = true;
      pivot.add(foot);
      this.body.add(pivot);
      this.legs.push(pivot);
    }
    // headwear
    if (variant === 0) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), lambert('#4fb54a', { flatShading: true }));
      leaf.scale.set(1.25, 0.25, 0.7);
      leaf.position.set(0.05, 1.47, 0);
      leaf.rotation.z = -0.25;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5), lambert('#3c7a2f'));
      stem.position.set(-0.05, 1.42, 0);
      this.body.add(leaf, stem);
      this.hat = leaf;
    } else {
      const crown = new THREE.Group();
      const cols = ['#ffd447', '#ff7aa8', '#ffffff', '#ffd447', '#ff7aa8'];
      cols.forEach((c, i) => {
        const a = (i / cols.length) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), lambert(c));
        f.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.3);
        crown.add(f);
      });
      crown.position.y = 1.36;
      this.body.add(crown);
      this.hat = crown;
    }
    // shield bubble
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 20, 14),
      new THREE.MeshLambertMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.28, depthWrite: false, emissive: '#2c7fc0', emissiveIntensity: 0.4 }),
    );
    this.bubble.position.y = 0.85;
    this.bubble.visible = false;
    this.root.add(this.bubble);

    // ground blob shadow keeps the pawn readable when shadows are off
    scene.add(this.root);
    this.t = Math.random() * 5;
    this.blinkIn = 2 + Math.random() * 2;
    this.mood = 'normal';
    this.moodTime = 0;
    this.idle = true;
    this.squash = 0;
    this.facing = 0;
    this.targetFacing = 0;
    this.onStep = null;
  }

  faceDir(dir) {
    if (Math.abs(dir.x) + Math.abs(dir.z) < 1e-4) return;
    this.targetFacing = Math.atan2(dir.x, dir.z);
  }

  faceInstant(dir) {
    this.faceDir(dir);
    this.facing = this.targetFacing;
    this.root.rotation.y = this.facing;
  }

  setArms(a) {
    for (const { pivot, s } of this.arms) {
      pivot.rotation.x = a;
      pivot.rotation.z = s * (0.25 + Math.max(0, -a) * 0.05);
    }
  }

  legSwing(a) {
    this.legs[0].rotation.x = a;
    this.legs[1].rotation.x = -a;
  }

  walkCycle(phase) {
    const a = Math.sin(phase) * 0.6;
    this.legSwing(a);
    this.arms[0].pivot.rotation.x = -a * 0.6;
    this.arms[1].pivot.rotation.x = a * 0.6;
  }

  setMood(mood, seconds = 1.5) {
    this.mood = mood;
    this.moodTime = seconds;
  }

  update(dt) {
    this.t += dt;
    // smooth turning
    let d = this.targetFacing - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-dt * 10));
    this.root.rotation.y = this.facing;
    // breathing + squash
    const breathe = this.idle ? Math.sin(this.t * 2.6) * 0.025 : 0;
    this.squash *= Math.exp(-dt * 9);
    const sy = 1 + breathe - this.squash;
    this.body.scale.set(1 + this.squash * 0.6 - breathe * 0.5, sy, 1 + this.squash * 0.6 - breathe * 0.5);
    if (this.hat) this.hat.rotation.y = Math.sin(this.t * 1.7) * 0.15;
    // blinking & moods
    this.blinkIn -= dt;
    let eyeY = 1;
    if (this.blinkIn < 0) {
      eyeY = 0.12 + 0.88 * Math.abs(Math.cos((this.blinkIn / 0.16) * Math.PI));
      if (this.blinkIn < -0.16) this.blinkIn = 2 + Math.random() * 3;
    }
    if (this.moodTime > 0) {
      this.moodTime -= dt;
      if (this.moodTime <= 0) this.mood = 'normal';
    }
    let pupil = 1;
    if (this.mood === 'happy') eyeY = Math.min(eyeY, 0.35);
    if (this.mood === 'scared') pupil = 0.55;
    if (this.mood === 'wow') pupil = 1.25;
    for (const { eye, pupil: p } of this.eyes) {
      eye.scale.set(1, eyeY, 1);
      p.scale.setScalar(pupil);
      if (this.mood === 'dizzy') p.position.set(Math.cos(this.t * 12) * 0.05, Math.sin(this.t * 12) * 0.05, 0.1);
      else p.position.set(0, 0, 0.1);
    }
    if (this.bubble.visible) {
      this.bubble.rotation.y += dt;
      this.bubble.scale.setScalar(1 + Math.sin(this.t * 3) * 0.03);
    }
  }
}
