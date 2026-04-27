// Injected as a <style> tag via injectedJavaScript.
// Targets aria-labels and structural selectors rather than minified class names
// since Instagram rotates those with each deploy.
export const BLOCK_REELS_CSS = `
  /* Bottom nav: Reels and Explore tabs */
  [aria-label="Reels"],
  [aria-label="Explore"],
  a[href="/reels/"],
  a[href*="/reels"],
  a[href="/explore/"] {
    display: none !important;
  }

  /* Reels clips inline in feed */
  [data-media-type="2"],
  article:has(video[playsinline]) {
    display: none !important;
  }

  /* Reels button in top bar */
  svg[aria-label="Reels"] {
    display: none !important;
  }

  /* Stories bar Reels highlight */
  [aria-label="Reels Highlights"] {
    display: none !important;
  }
`;
