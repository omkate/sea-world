import { rgb } from '../fish/FishMorph';
import type { SquidLook } from './squidMaterial';
import { DUMBO_OCTOPUS, GIANT_SQUID, JEWEL_SQUID, VAMPIRE_SQUID } from './squidGeometry';

/** Cock-eyed (jewel) squid: pink-red, seed-like photophores, one large and one small eye. */
export const JEWEL_LOOK: SquidLook = {
  shape: JEWEL_SQUID,
  body: rgb(0.62, 0.08, 0.1),
  arms: rgb(0.5, 0.06, 0.08),
  seeds: 0.35,
  glow: 0.7,
  leftEye: 0.6,
  rightEye: 0.3,
};

/**
 * Giant squid: reddish-maroon pigment over a reflective skin that reads coppery-silver under
 * lights (as in the first footage of a live adult, Japan 2012); no photophores; the largest
 * eyes of any animal (one each side).
 */
export const GIANT_LOOK: SquidLook = {
  shape: GIANT_SQUID,
  body: rgb(0.62, 0.3, 0.22),
  arms: rgb(0.5, 0.2, 0.15),
  seeds: 0,
  glow: 0,
  leftEye: 0.55,
  rightEye: 0.55,
  sheen: 1,
};

/**
 * Vampire squid: dark reddish-brown with a velvety cloak, large eyes, and blue light organs at
 * the arm tips (it can also flip its cloak inside out: the pineapple posture).
 */
export const VAMPIRE_LOOK: SquidLook = {
  shape: VAMPIRE_SQUID,
  body: rgb(0.3, 0.05, 0.06),
  arms: rgb(0.22, 0.035, 0.045),
  seeds: 0,
  glow: 0,
  leftEye: 0.5,
  rightEye: 0.5,
  tipGlow: 1.2,
};

/** Dumbo octopus: pale, semi-translucent pinkish-white, big eyes, no light organs. */
export const DUMBO_LOOK: SquidLook = {
  shape: DUMBO_OCTOPUS,
  body: rgb(0.85, 0.6, 0.58),
  arms: rgb(0.8, 0.52, 0.5),
  seeds: 0,
  glow: 0,
  leftEye: 0.4,
  rightEye: 0.4,
  sheen: 0.4,
};
