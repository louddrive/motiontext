import { describe, expect, it } from 'vitest';
import { CAMERA_MOVES, cameraAt, identityCamera, project } from '../src/render/camera';

const W = 1920;
const H = 1080;

describe('project', () => {
  it('恒等カメラでは座標も大きさも変わらない', () => {
    const p = project(identityCamera(W, H), 300, 200);
    expect(p.x).toBeCloseTo(300);
    expect(p.y).toBeCloseTo(200);
    expect(p.scale).toBeCloseTo(1);
  });

  it('dolly を手前（負）にすると拡大され、中心から離れる', () => {
    const cam = { ...identityCamera(W, H), dolly: -200 };
    const p = project(cam, 1460, 540);
    expect(p.scale).toBeGreaterThan(1);
    expect(p.x).toBeGreaterThan(1460);
  });

  it('rotY 正で右側が手前（大きく）、左側が奥（小さく）', () => {
    const cam = { ...identityCamera(W, H), rotY: (15 * Math.PI) / 180 };
    expect(project(cam, 1500, 540).scale).toBeGreaterThan(1);
    expect(project(cam, 420, 540).scale).toBeLessThan(1);
  });

  it('rotX 負で上側が奥へ倒れる', () => {
    const cam = { ...identityCamera(W, H), rotX: (-20 * Math.PI) / 180 };
    expect(project(cam, 960, 200).scale).toBeLessThan(1);
    expect(project(cam, 960, 900).scale).toBeGreaterThan(1);
  });
});

describe('cameraAt', () => {
  it('強さ 0 なら恒等カメラと同じ投影になる', () => {
    for (const type of CAMERA_MOVES) {
      const p = project(cameraAt({ type, dir: 1, intensity: 0 }, 1, 2, W, H), 500, 300);
      expect(p.x).toBeCloseTo(500);
      expect(p.y).toBeCloseTo(300);
    }
  });

  it('寄りは時間とともに大きくなる', () => {
    const move = { type: 'pushIn' as const, dir: 1 as const, intensity: 1 };
    const s0 = project(cameraAt(move, 0, 3, W, H), 960, 540).scale;
    const s1 = project(cameraAt(move, 3, 3, W, H), 960, 540).scale;
    expect(s1).toBeGreaterThan(s0);
  });

  it('dir で左右が反転する', () => {
    const a = cameraAt({ type: 'orbit', dir: 1, intensity: 1 }, 0, 2, W, H);
    const b = cameraAt({ type: 'orbit', dir: -1, intensity: 1 }, 0, 2, W, H);
    expect(a.rotY).toBeCloseTo(-b.rotY);
  });
});
