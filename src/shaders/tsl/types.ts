/**
 * TSL's published typings cannot follow swizzles and implicit type promotion through a
 * dynamically built graph, so shader-construction code uses this loose alias. Keep it
 * confined to code that builds node graphs; CPU-side code stays strictly typed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShaderNode = any;

/** A uniform node whose CPU-side value is strongly typed. */
export type Uniform<T> = ShaderNode & { value: T };
