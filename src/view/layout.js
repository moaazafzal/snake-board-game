import * as THREE from 'three';
import { tileRowCol, LAST } from '../game/board.js';

export const TILE = 4; // world units per tile
export const HALF = (TILE * 10) / 2; // 20
export const BOARD_TOP = 0;

/** World position of a tile centre (tile 0 = the start pad in front of tile 1). */
export function tilePos(n, out = new THREE.Vector3()) {
  if (n <= 0) return out.set(-HALF + TILE * 0.5, BOARD_TOP, HALF + TILE * 0.85);
  const { row, col } = tileRowCol(Math.min(n, LAST));
  return out.set((col - 4.5) * TILE, BOARD_TOP, (4.5 - row) * TILE);
}

/** Per-player offset so two pawns sharing a tile stay visible. */
export const PAWN_OFFSET = [new THREE.Vector3(-0.75, 0, 0.55), new THREE.Vector3(0.75, 0, -0.55)];

export function pawnSpot(n, player, out = new THREE.Vector3()) {
  return tilePos(n, out).add(PAWN_OFFSET[player]);
}

export const PALETTE = {
  sky: '#9fd8f0',
  skyLow: '#e8f6e6',
  grass: '#79b955',
  grassDark: '#5c9c43',
  board: '#c9a46e',
  wood: '#8a5a32',
  woodDark: '#5e3a1e',
  stone: '#b7b2a3',
  leaf: '#3f9a4a',
  leafLight: '#6cc25a',
  p0: '#3c86e8',
  p1: '#f0703c',
};
