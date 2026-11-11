import { Vector3, type Object3D } from 'three/webgpu';

/**
 * Large animals the dive companion (the scuba diver) gives way to: sharks, mantas, dolphins and
 * whales register their meshes here with a radius.
 */
const BIG = new Map<Object3D, { radius: number; yields: boolean }>();

/** `yields`: the animal itself steers around the companion, so the companion holds its place. */
export function registerBigAnimal(object: Object3D, radius: number, yields = false): void {
  BIG.set(object, { radius, yields });
}

/** Calls `fn` with each visible big animal's world position, radius and whether it yields. */
export function forEachBigAnimal(fn: (position: Vector3, radius: number, yields: boolean) => void): void {
  const p = new Vector3();
  for (const [o, { radius: r, yields }] of BIG) {
    let visible = o.visible;
    for (let a = o.parent; visible && a; a = a.parent) visible = a.visible;
    if (!visible) continue;
    o.getWorldPosition(p);
    fn(p, r * o.scale.x, yields);
  }
}
