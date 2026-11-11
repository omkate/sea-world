import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import {
  CAMERA_KEYS, CASTLE_BASE_Y, CASTLE_UNIT, CHEST_AT, COURTYARD_FLOOR_Y, CUT_T, DIVER_KEYS, FINALE_FISH, TARGET_KEYS, WHALE_PASS, WRECK_BASE_Y,
  castleToWorld, finaleFloorY, finaleToWorld, finaleWeights, hullToWorld, overCourtyard, sampleKeys, worldToCastle,
} from '../../src/environments/finale/finalePath';
import { CASTLE_SITE, WRECK_SITE, reefFloorY } from '../../src/environments/reef/ReefSite';

const placed = (x: number, y: number, z: number, yaw: number, scale = 1) => {
  const o = new Object3D();
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  o.scale.setScalar(scale);
  o.updateMatrixWorld();
  return o;
};

describe('finale', () => {
  it('leaves everything above 130 m alone (no weight at the hand-over)', () => {
    const w = finaleWeights(0);
    for (const k of ['camera', 'diver', 'letterbox', 'fade', 'lid', 'glow', 'endCard'] as const) expect(w[k], k).toBe(0);
    expect(finaleWeights(1).camera).toBe(1);
    expect(finaleWeights(1).endCard).toBe(1);
    expect(finaleWeights(1).lid).toBe(1);
  });

  it('keys are ordered in t and cover the finale; camera and target share keys', () => {
    for (const keys of [DIVER_KEYS, CAMERA_KEYS, TARGET_KEYS]) {
      for (let i = 1; i < keys.length; i++) expect(keys[i]![0]).toBeGreaterThan(keys[i - 1]![0]);
      expect(keys.at(-1)![0]).toBe(1);
    }
    expect(CAMERA_KEYS.map((k) => k[0])).toEqual(TARGET_KEYS.map((k) => k[0]));
    expect(WHALE_PASS.t[0]).toBeLessThan(WHALE_PASS.t[1]);
  });

  it('hull and castle frames match the placed models (three.js rotation.y)', () => {
    const hull = placed(WRECK_SITE.x, WRECK_BASE_Y, WRECK_SITE.z, WRECK_SITE.yaw);
    const castle = placed(CASTLE_SITE.x, CASTLE_BASE_Y, CASTLE_SITE.z, CASTLE_SITE.yaw, CASTLE_UNIT);
    for (const p of [new Vector3(3, 1, -10), new Vector3(-2, 4, 12)]) {
      expect(hullToWorld(p, WRECK_BASE_Y, new Vector3()).distanceTo(p.clone().applyMatrix4(hull.matrixWorld))).toBeLessThan(1e-9);
      const c = castleToWorld(p, new Vector3());
      expect(c.distanceTo(p.clone().applyMatrix4(castle.matrixWorld))).toBeLessThan(1e-9);
      expect(worldToCastle(c, new Vector3()).distanceTo(p)).toBeLessThan(1e-9);
    }
  });

  it('the cut is hidden: black covers it, and no track interpolates across it', () => {
    expect(finaleWeights(CUT_T).fade).toBe(1);
    const before = sampleKeys(DIVER_KEYS, CUT_T - 1e-6, new Vector3());
    const after = sampleKeys(DIVER_KEYS, CUT_T + 1e-6, new Vector3());
    // The diver jumps through the gatehouse wall during the black, not on screen.
    expect(before.distanceTo(after)).toBeGreaterThan(3);
    for (const t of [0.6, 0.65]) expect(finaleWeights(t).fade).toBe(0);
  });

  it('camera and diver stay above the seabed for the whole finale', () => {
    const w = new Vector3();
    for (const keys of [DIVER_KEYS, CAMERA_KEYS]) {
      for (let t = 0; t <= 1; t += 0.002) {
        sampleKeys(keys, t, w);
        expect(w.y - reefFloorY(w.x, w.z), `t ${t.toFixed(3)}`).toBeGreaterThan(1.2);
      }
    }
  });

  it('the whale passes overhead, well above the diver', () => {
    const d = new Vector3();
    const wp = new Vector3();
    for (let t = WHALE_PASS.t[0]; t < WHALE_PASS.t[1]; t += 0.005) {
      sampleKeys(DIVER_KEYS, t, d);
      wp.lerpVectors(WHALE_PASS.from, WHALE_PASS.to, (t - WHALE_PASS.t[0]) / (WHALE_PASS.t[1] - WHALE_PASS.t[0]));
      expect(wp.y - reefFloorY(wp.x, wp.z)).toBeGreaterThan(9);
      expect(wp.distanceTo(d)).toBeGreaterThan(5);
    }
  });

  it('the courtyard has its own floor: the chest stands on it, the wreck is on sand', () => {
    expect(overCourtyard(CHEST_AT)).toBe(true);
    expect(finaleFloorY(CHEST_AT)).toBe(COURTYARD_FLOOR_Y);
    const wreck = new Vector3(WRECK_SITE.x, 0, WRECK_SITE.z);
    expect(overCourtyard(wreck)).toBe(false);
    expect(finaleFloorY(wreck)).toBe(reefFloorY(wreck.x, wreck.z));
  });

  it('the crown flies to his head, then the change sweeps down him and the trident forms', () => {
    const at = (t: number) => finaleWeights(t);
    // The lid is open before the crown leaves the chest.
    expect(at(0.892).lid).toBe(1);
    expect(at(0.89).crownFly).toBe(0);
    expect(at(0.927).crownFly).toBe(1);
    expect(at(1).crownFly).toBe(1);
    // The change starts only once the crown is on, and is complete before the end card.
    expect(at(0.927).sweep).toBe(0);
    expect(at(0.962).sweep).toBe(1);
    expect(at(0.97).trident).toBeGreaterThan(0.8);
    expect(at(0.975).endCard).toBe(0);
    expect(at(1).sweep).toBe(1);
  });

  it('finale fish live above their floor, inside their band', () => {
    const home = new Vector3();
    for (const g of FINALE_FISH) {
      finaleToWorld(g.frame, ...g.at, home);
      expect(home.y - finaleFloorY(home), g.species).toBeGreaterThan(0.6);
      expect(g.band[0]).toBeLessThan(g.at[1]);
      expect(g.band[1]).toBeGreaterThan(g.at[1]);
    }
  });
});
