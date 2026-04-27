import React, {useRef, useEffect} from 'react';
import {AppState, BackHandler, StyleSheet, View} from 'react-native';
import WebView, {
  WebViewNavigation,
  WebViewMessageEvent,
} from 'react-native-webview';
import {INBOX_URL, shouldAllowUrl} from './urlFilter';
import {BLOCK_REELS_CSS} from './injection/blockReels.css';
import {DOM_WATCHER_JS} from './injection/domWatcher.js';
import {resetPollStep} from './polling/poller';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const INJECT_CSS = `
(function() {
  function doInject() {
    var parent = document.head || document.documentElement || document.body;
    if (!parent) return false;
    var s = document.createElement('style');
    s.textContent = ${JSON.stringify(BLOCK_REELS_CSS)};
    parent.appendChild(s);
    return true;
  }
  if (!doInject()) {
    document.addEventListener('DOMContentLoaded', doInject);
  }
})();
`;

const INJECTED_JS = INJECT_CSS + '\n' + DOM_WATCHER_JS;

export default function DmsWebView() {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);

  // Android back button → WebView history
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  // Reset poll cadence to fast when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        resetPollStep();
      }
    });
    return () => sub.remove();
  }, []);

  const onNavigationStateChange = (state: WebViewNavigation) => {
    canGoBackRef.current = state.canGoBack;
  };

  const onShouldStartLoadWithRequest = (request: WebViewNavigation) => {
    const allowed = shouldAllowUrl(request.url);
    if (!allowed) {
      webViewRef.current?.injectJavaScript(
        `window.location.replace('${INBOX_URL}'); true;`,
      );
    }
    return allowed;
  };

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'navigation' && !shouldAllowUrl(msg.url)) {
        webViewRef.current?.injectJavaScript(
          `window.location.replace('${INBOX_URL}'); true;`,
        );
        return;
      }

      // Instagram updated the tab title with an unread count — reset to fast polling
      if (msg.type === 'unread') {
        resetPollStep();
      }
    } catch {
      // ignore non-JSON messages from Instagram's own scripts
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{uri: INBOX_URL}}
        userAgent={USER_AGENT}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
        sharedCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  webview: {flex: 1},
});
