export const DOM_WATCHER_JS = `
(function() {
  'use strict';

  var INBOX = '/direct/inbox/';
  var INBOX_FULL = 'https://www.instagram.com' + INBOX;

  function getPath(url) {
    try { return new URL(url, location.href).pathname; } catch(e) { return ''; }
  }
  function isBlocked(url) {
    var p = getPath(url);
    return p === '/' || /^\\/reels\\//.test(p) || /^\\/explore\\//.test(p) || /^\\/tv\\//.test(p);
  }
  function goInbox() { location.replace(INBOX_FULL); }

  if (isBlocked(location.href)) { goInbox(); return; }

  // ── Reel feed detection ────────────────────────────────────────────────────
  // Reel feed = 3+ full-height videos stacked at viewport-height intervals.
  // This pattern is distinct from video thumbnails in DM conversations.
  function getReelVideos() {
    var videos = Array.from(document.querySelectorAll('video'));
    if (videos.length < 2) return null;
    var rects = videos.map(function(v) {
      return { v: v, r: v.getBoundingClientRect() };
    });
    // Need at least one video near the top (visible)
    var visible = rects.filter(function(x) { return Math.abs(x.r.top) < 120; });
    if (!visible.length) return null;
    var h = visible[0].r.height;
    if (h < 200) return null; // Not full-screen
    // Confirm pattern: another video ~1 height away
    var isReelFeed = rects.some(function(x) {
      return x.v !== visible[0].v && Math.abs(Math.abs(x.r.top) - h) < 100;
    });
    return isReelFeed ? rects : null;
  }

  // ── Layer 1: Touch event interception ─────────────────────────────────────
  // Our handlers are registered BEFORE Instagram's because this script runs
  // via injectedJavaScriptBeforeContentLoaded. Capture phase runs first.
  // stopImmediatePropagation() kills all subsequent handlers on the event.
  var touchStartY = 0;
  var touchStartX = 0;
  var blockingSwipe = false;

  document.addEventListener('touchstart', function(e) {
    blockingSwipe = false;
    if (e.touches[0]) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    }
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!e.touches[0]) return;
    if (!getReelVideos()) return; // Not in a reel feed, don't interfere
    var dy = Math.abs(e.touches[0].clientY - touchStartY);
    var dx = Math.abs(e.touches[0].clientX - touchStartX);
    if (dy > 12 && dy > dx) {
      // Vertical swipe in reel feed — kill it before Instagram sees it
      blockingSwipe = true;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, { capture: true, passive: false });

  document.addEventListener('touchend', function(e) {
    if (blockingSwipe) {
      // Block the touchend too — Instagram triggers the snap animation here
      e.stopImmediatePropagation();
      e.preventDefault();
      blockingSwipe = false;
    }
  }, { capture: true, passive: false });

  document.addEventListener('touchcancel', function() {
    blockingSwipe = false;
  }, { capture: true, passive: true });

  // ── Layer 2: DOM trimming ──────────────────────────────────────────────────
  // Belt-and-suspenders: remove sibling reels so even if a swipe slips
  // through, there is nothing adjacent to snap to.
  function trimReelFeed() {
    var reelRects = getReelVideos();
    if (!reelRects) return;

    // Find the visible (current) reel video
    var current = null;
    var minDist = Infinity;
    reelRects.forEach(function(x) {
      var dist = Math.abs(x.r.top);
      if (dist < minDist) { minDist = dist; current = x.v; }
    });
    if (!current) return;

    // Walk up to the reel item (direct child of feed container)
    var item = current;
    while (item.parentElement) {
      var sibs = Array.from(item.parentElement.children);
      if (sibs.length > 1 && sibs.some(function(s) {
        return s !== item && s.querySelector('video');
      })) { break; }
      item = item.parentElement;
    }
    if (!item.parentElement) return;

    var feed = item.parentElement;
    Array.from(feed.children).forEach(function(c) {
      if (c !== item) c.remove();
    });
  }

  new MutationObserver(trimReelFeed)
    .observe(document.documentElement, { childList: true, subtree: true });
  trimReelFeed();

  // ── Navigation interception ────────────────────────────────────────────────
  ['pushState', 'replaceState'].forEach(function(method) {
    var orig = history[method];
    history[method] = function(state, title, url) {
      if (url && isBlocked(url)) {
        return orig.call(this, null, '', INBOX);
      }
      return orig.apply(this, arguments);
    };
  });

  window.addEventListener('popstate', function() {
    if (isBlocked(location.href)) { goInbox(); }
  });

  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el.tagName !== 'A') { el = el.parentElement; }
    if (el && el.href && isBlocked(el.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      history.replaceState(null, '', INBOX);
    }
  }, true);

  // ── DOM nav-tab stripping ──────────────────────────────────────────────────
  var HIDE = [
    'a[href="/reels/"]', 'a[href^="/reels"]',
    'a[href="/explore/"]', 'a[href^="/explore"]',
    'a[href="/"]',
    '[aria-label="Reels"]', '[aria-label="Explore"]',
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
  new MutationObserver(strip)
    .observe(document.documentElement, { childList: true, subtree: true });

  // ── Unread count from title ────────────────────────────────────────────────
  function watchTitle() {
    var t = document.querySelector('title');
    if (!t) return;
    var last = document.title;
    new MutationObserver(function() {
      if (document.title === last) return;
      last = document.title;
      var m = last.match(/^\\((\\d+)\\)/);
      if (m && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'unread', count: parseInt(m[1], 10) }));
      }
    }).observe(t, { childList: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchTitle);
  } else {
    watchTitle();
  }

  true;
})();
`;
