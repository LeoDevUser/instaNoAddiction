// Injected into the WebView before content loads.
// Uses MutationObserver to strip Reels elements on every SPA re-render,
// and patches history API to catch pushState navigation before the URL
// change event fires in React Native.
export const DOM_WATCHER_JS = `
(function() {
  'use strict';

  const SELECTORS = [
    '[aria-label="Reels"]',
    '[aria-label="Explore"]',
    'a[href="/reels/"]',
    'a[href*="/reels"]',
    'a[href="/explore/"]',
    '[data-media-type="2"]',
  ];

  function stripReels() {
    SELECTORS.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.style.display = 'none';
      });
    });
  }

  // Run immediately and on every DOM mutation
  stripReels();
  const observer = new MutationObserver(stripReels);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Patch pushState / replaceState so SPA navigation is caught
  // and sent back to React Native via window.ReactNativeWebView.postMessage
  ['pushState', 'replaceState'].forEach(function(method) {
    const original = history[method];
    history[method] = function() {
      original.apply(this, arguments);
      const url = arguments[2] || location.href;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'navigation', url: url }));
      }
    };
  });

  // Watch document.title for unread count — Instagram sets it to "(3) Instagram" etc.
  var lastTitle = document.title;
  var titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(function() {
      var title = document.title;
      if (title !== lastTitle) {
        lastTitle = title;
        var match = title.match(/^\((\d+)\)/);
        if (match && window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'unread',
            count: parseInt(match[1], 10),
          }));
        }
      }
    }).observe(titleEl, { childList: true });
  }

  true; // required by react-native-webview
})();
`;
