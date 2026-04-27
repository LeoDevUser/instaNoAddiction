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

  function isReelViewer(url) {
    return /^\\/reel\\//.test(getPath(url || location.href));
  }

  function goInbox() { location.replace(INBOX_FULL); }

  if (isBlocked(location.href)) { goInbox(); return; }

  // ── Reel scroll lock ──────────────────────────────────────────────────────
  // Strategy: find Instagram's scroll-snap feed container, remove every reel
  // except the current one, and lock the scroll position.
  // With no adjacent reels in the DOM there is nothing to swipe to.
  var reelLockStyle = null;
  var reelLockObserver = null;
  var scrollLocks = []; // { el, savedTop }

  function findScrollSnapContainers() {
    var found = [];
    document.querySelectorAll('*').forEach(function(el) {
      if (el.__dmLocked) return;
      var cs = window.getComputedStyle(el);
      var snap = cs.scrollSnapType;
      var oy = cs.overflowY;
      if (
        (snap && snap !== 'none' && snap !== '') ||
        oy === 'scroll' ||
        (oy === 'auto' && el.scrollHeight > el.clientHeight + 10)
      ) {
        found.push(el);
      }
    });
    return found;
  }

  // Walk up from a video element to find its immediate child of the feed container
  function getReelItemFromVideo(video, feedEl) {
    var node = video;
    while (node && node.parentElement && node.parentElement !== feedEl) {
      node = node.parentElement;
    }
    return (node && node.parentElement === feedEl) ? node : null;
  }

  // Remove every reel from the feed container except the visible one
  function stripSiblingReels(feedEl) {
    var videos = feedEl.querySelectorAll('video');
    if (!videos.length) return;

    // Find which reel item is currently visible (closest to top of viewport)
    var best = null;
    var bestDist = Infinity;
    Array.from(feedEl.children).forEach(function(child) {
      var rect = child.getBoundingClientRect();
      var dist = Math.abs(rect.top);
      if (dist < bestDist) { bestDist = dist; best = child; }
    });

    if (!best) return;
    Array.from(feedEl.children).forEach(function(child) {
      if (child !== best) { child.remove(); }
    });
  }

  // Lock the scrollTop of a container so it cannot scroll
  function lockScrollEl(el) {
    if (el.__dmLocked) return;
    el.__dmLocked = true;
    var saved = el.scrollTop;
    el.addEventListener('scroll', function() {
      el.scrollTop = saved; // immediately snap back
    }, { passive: false });
    scrollLocks.push({ el: el, saved: saved });
  }

  function applyReelLock() {
    if (reelLockStyle) return;

    // CSS: disable touch-action so our JS has authority to preventDefault
    reelLockStyle = document.createElement('style');
    reelLockStyle.id = '__dm_reel_lock';
    reelLockStyle.textContent =
      'html,body{overflow:hidden!important;}' +
      '*{touch-action:none!important;}' +
      'video,button,[role="button"],input{touch-action:manipulation!important;}';
    (document.head || document.documentElement).appendChild(reelLockStyle);

    function processContainers() {
      findScrollSnapContainers().forEach(function(el) {
        stripSiblingReels(el);
        lockScrollEl(el);
      });
    }

    processContainers();

    // Watch for containers Instagram adds lazily after initial render
    reelLockObserver = new MutationObserver(processContainers);
    reelLockObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function removeReelLock() {
    if (reelLockStyle) { reelLockStyle.remove(); reelLockStyle = null; }
    if (reelLockObserver) { reelLockObserver.disconnect(); reelLockObserver = null; }
    scrollLocks.forEach(function(lock) { lock.el.__dmLocked = false; });
    scrollLocks = [];
  }

  if (isReelViewer()) { applyReelLock(); }

  // ── Navigation interception ───────────────────────────────────────────────
  ['pushState', 'replaceState'].forEach(function(method) {
    var orig = history[method];
    history[method] = function(state, title, url) {
      if (url) {
        var onReel = isReelViewer(location.href);
        var toReel = isReelViewer(url);

        // Swipe to next reel while already on one → swallow entirely
        if (onReel && toReel) { return; }

        // Blocked route → inbox
        if (isBlocked(url)) {
          return orig.call(this, null, '', INBOX);
        }

        var result = orig.apply(this, arguments);

        if (!onReel && isReelViewer(location.href)) { applyReelLock(); }
        if (onReel && !isReelViewer(location.href)) { removeReelLock(); }

        return result;
      }
      return orig.apply(this, arguments);
    };
  });

  window.addEventListener('popstate', function() {
    if (isBlocked(location.href)) { goInbox(); return; }
    if (isReelViewer()) { applyReelLock(); } else { removeReelLock(); }
  });

  // Click guard for nav links
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el.tagName !== 'A') { el = el.parentElement; }
    if (el && el.href && isBlocked(el.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      history.replaceState(null, '', INBOX);
    }
  }, true);

  // ── DOM element stripping (nav tabs, explore, etc.) ───────────────────────
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
  new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });

  // ── Unread count from title ───────────────────────────────────────────────
  function watchTitle() {
    var t = document.querySelector('title');
    if (!t) return;
    var last = document.title;
    new MutationObserver(function() {
      if (document.title === last) return;
      last = document.title;
      var m = last.match(/^\\((\\d+)\\)/);
      if (m && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'unread', count: parseInt(m[1], 10) })
        );
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
