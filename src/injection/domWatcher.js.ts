export const DOM_WATCHER_JS = `
(function() {
  'use strict';

  var INBOX = '/direct/inbox/';
  var INBOX_FULL = 'https://www.instagram.com' + INBOX;

  // Paths that should never be navigated to
  function isBlocked(url) {
    try {
      var path = new URL(url, location.href).pathname;
      return (
        path === '/' ||
        /^\\/reels?\\//.test(path) ||   // /reels/ and /reel/
        /^\\/explore\\//.test(path) ||
        /^\\/tv\\//.test(path)
      );
    } catch(e) { return false; }
  }

  function goInbox() {
    location.replace(INBOX_FULL);
  }

  // Check on first load — if Instagram redirected us to home after login, bounce back
  if (isBlocked(location.href)) {
    goInbox();
    return;
  }

  // Patch pushState / replaceState: intercept BEFORE the navigation happens
  ['pushState', 'replaceState'].forEach(function(method) {
    var orig = history[method];
    history[method] = function(state, title, url) {
      if (url && isBlocked(url)) {
        // Silently rewrite to inbox — the SPA never sees the blocked route
        return orig.call(this, null, '', INBOX);
      }
      return orig.apply(this, arguments);
    };
  });

  // Catch back/forward navigation landing on a blocked page
  window.addEventListener('popstate', function() {
    if (isBlocked(location.href)) {
      goInbox();
    }
  });

  // Intercept clicks on blocked links before Instagram's own handlers see them
  document.addEventListener('click', function(e) {
    var el = e.target;
    // Walk up the DOM to find an enclosing <a>
    while (el && el.tagName !== 'A') { el = el.parentElement; }
    if (el && el.href && isBlocked(el.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      history.replaceState(null, '', INBOX);
    }
  }, true); // capture phase — runs before any of Instagram's listeners

  // ── DOM stripping ──────────────────────────────────────────────────────────
  var HIDE = [
    // Reels tab in bottom nav (href-based — most reliable)
    'a[href="/reels/"]',
    'a[href^="/reels"]',
    // Explore tab
    'a[href="/explore/"]',
    'a[href^="/explore"]',
    // Home feed tab
    'a[href="/"]',
    // aria-label fallbacks (Instagram sometimes adds these)
    '[aria-label="Reels"]',
    '[aria-label="Explore"]',
    // Inline video clips that are Reels (not in DM thread)
    '[data-media-type="2"]',
  ];

  function strip() {
    HIDE.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.style.cssText += 'display:none!important;pointer-events:none!important;';
      });
    });
  }

  strip();
  new MutationObserver(strip).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ── Unread count from title ────────────────────────────────────────────────
  function watchTitle() {
    var titleEl = document.querySelector('title');
    if (!titleEl) return;
    var last = document.title;
    new MutationObserver(function() {
      if (document.title === last) return;
      last = document.title;
      var m = last.match(/^\\((\\d+)\\)/);
      if (m && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'unread',
          count: parseInt(m[1], 10),
        }));
      }
    }).observe(titleEl, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchTitle);
  } else {
    watchTitle();
  }

  true;
})();
`;
