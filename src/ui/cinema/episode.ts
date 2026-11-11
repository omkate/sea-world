/**
 * The site is told as a series of short films; this is the one on screen. The opening title card,
 * the end card and the page title all read from here, so the next episode changes one place.
 */
export const EPISODE = {
  series: 'ABYSS',
  number: 1,
  title: 'The Sunken Crown',
  /** One line under the opening title. */
  logline: 'One dive off Guam. A wreck, a drowned castle, and a crown that chooses its king.',
  /** The end card's promise of what comes next. */
  next: 'Episode 2 is coming soon',
} as const;

export const EPISODE_LABEL = `Episode ${EPISODE.number}`;
