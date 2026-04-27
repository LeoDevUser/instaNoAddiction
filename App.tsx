import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import DmsWebView from './src/DmsWebView';
import {initPoller, checkAndNotify} from './src/polling/poller';
import {setupNotifications, requestNotificationPermission} from './src/polling/notifications';

export default function App() {
  useEffect(() => {
    async function bootstrap() {
      await setupNotifications();
      await requestNotificationPermission();
      await initPoller();
      // Notify about any unread messages immediately on app open
      await checkAndNotify();
    }
    bootstrap();
  }, []);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <DmsWebView />
    </>
  );
}
