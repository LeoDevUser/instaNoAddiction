export const BLOCK_REELS_CSS = `
  /* Bottom nav: Reels, Explore, and Home tabs */
  a[href="/reels/"],
  a[href^="/reels"],
  a[href="/explore/"],
  a[href^="/explore"],
  a[href="/"],
  [aria-label="Reels"],
  [aria-label="Explore"] {
    display: none !important;
    pointer-events: none !important;
  }

  /* Reels icon wherever it appears */
  svg[aria-label="Reels"] {
    display: none !important;
  }

  /* Inline video clips that are Reels (data attribute set by Instagram) */
  [data-media-type="2"] {
    display: none !important;
  }

  /* ── Hide post feed ────────────────────────────────────────────────────── */
  /* Each post card and the feed scroll container */
  article,
  [role="feed"] {
    display: none !important;
  }
`;
