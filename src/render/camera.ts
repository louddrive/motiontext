// 疑似3Dカメラ。文字は z = 0 の平面上にあるものとし、カメラの回転・前後移動を遠近法で投影する。
// Canvas 2D は真の射影変換を持たないため、各グリフ位置での局所アフィン近似で描く（文字単位なら十分自然に見える）。

import { clamp01, lerp } from './easing';
import type { Ctx2D } from './layout';

export const CAMERA_MOVES = ['pushIn', 'pullOut', 'orbit', 'tiltUp', 'drift', 'swing'] as const;
export type CameraMoveType = (typeof CAMERA_MOVES)[number];

/** 字幕1つ分のカメラの動き（director が決める） */
export interface CameraMove {
  type: CameraMoveType;
  /** 左右の向き */
  dir: 1 | -1;
  /** 動きの大きさ（0..1 程度） */
  intensity: number;
}

/** ある時刻のカメラ状態 */
export interface Camera {
  cx: number;
  cy: number;
  focal: number;
  /** ラジアン */
  rotX: number;
  rotY: number;
  roll: number;
  /** 正で奥へ（小さく）、負で手前へ（大きく） */
  dolly: number;
  panX: number;
  panY: number;
}

const DEG = Math.PI / 180;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function identityCamera(width: number, height: number): Camera {
  // 焦点距離は長辺基準にして、縦型でも横型と同程度の遠近感にする
  const focal = Math.max(width, height) * 0.75;
  return { cx: width / 2, cy: height / 2, focal, rotX: 0, rotY: 0, roll: 0, dolly: 0, panX: 0, panY: 0 };
}

/** 字幕内の経過時間 t からカメラ状態を求める */
export function cameraAt(move: CameraMove, t: number, dur: number, width: number, height: number): Camera {
  const cam = identityCamera(width, height);
  const e = easeInOutSine(clamp01(dur > 0 ? t / dur : 1));
  const k = move.intensity;
  const d = move.dir;
  const f = cam.focal;
  switch (move.type) {
    case 'pushIn':
      cam.dolly = lerp(0.04 * f, -0.2 * f, e) * k;
      cam.rotY = d * lerp(14, 3, e) * k * DEG;
      break;
    case 'pullOut':
      cam.dolly = lerp(-0.2 * f, 0.04 * f, e) * k;
      cam.rotY = d * lerp(-3, -14, e) * k * DEG;
      break;
    case 'orbit':
      cam.rotY = d * lerp(-28, 28, e) * k * DEG;
      cam.dolly = -0.05 * f * Math.sin(Math.PI * e) * k;
      break;
    case 'tiltUp':
      // 上側が奥へ倒れた状態から起き上がる
      cam.rotX = -lerp(45, 4, e) * k * DEG;
      cam.dolly = lerp(0.05 * f, -0.04 * f, e) * k;
      break;
    case 'drift':
      cam.rotY = d * lerp(18, -18, e) * k * DEG;
      cam.rotX = lerp(-10, 10, e) * k * DEG;
      cam.panX = d * lerp(40, -40, e) * k;
      break;
    case 'swing':
      cam.roll = d * lerp(-3, 3, e) * k * DEG;
      cam.rotY = d * Math.sin(e * Math.PI * 2) * 10 * k * DEG;
      cam.dolly = -0.05 * f * e * k;
      break;
  }
  return cam;
}

/** ワールド座標（画面ピクセル, z）をスクリーン座標へ投影する */
export function project(cam: Camera, x: number, y: number, z = 0): { x: number; y: number; scale: number } {
  let vx = x - cam.cx;
  let vy = y - cam.cy;
  let vz = z;
  // roll（z軸）
  if (cam.roll) {
    const c = Math.cos(cam.roll);
    const s = Math.sin(cam.roll);
    [vx, vy] = [vx * c - vy * s, vx * s + vy * c];
  }
  // rotX（x軸）: 正で下側が奥へ
  if (cam.rotX) {
    const c = Math.cos(cam.rotX);
    const s = Math.sin(cam.rotX);
    [vy, vz] = [vy * c - vz * s, vy * s + vz * c];
  }
  // rotY（y軸）: 正で右側が手前へ
  if (cam.rotY) {
    const c = Math.cos(cam.rotY);
    const s = Math.sin(cam.rotY);
    [vx, vz] = [vx * c + vz * s, -vx * s + vz * c];
  }
  vz += cam.dolly;
  const scale = cam.focal / Math.max(cam.focal + vz, 1);
  return { x: cam.cx + vx * scale + cam.panX, y: cam.cy + vy * scale + cam.panY, scale };
}

/**
 * 点 (x, y, z) の近傍でワールド → スクリーンの局所アフィン変換を ctx に合成する。
 * 以降はワールド座標のまま描けば、その付近が遠近法で変形されて描かれる。
 */
export function applyCameraAt(ctx: Ctx2D, cam: Camera, x: number, y: number, z = 0): void {
  const E = 20;
  const p = project(cam, x, y, z);
  const px = project(cam, x + E, y, z);
  const py = project(cam, x, y + E, z);
  const a = (px.x - p.x) / E;
  const b = (px.y - p.y) / E;
  const c = (py.x - p.x) / E;
  const d = (py.y - p.y) / E;
  ctx.transform(a, b, c, d, p.x - a * x - c * y, p.y - b * x - d * y);
}
