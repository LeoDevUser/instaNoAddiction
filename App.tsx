import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import DmsWebView from './src/DmsWebView';
import {initPoller} from './src/polling/poller';
import {setupNotifications, requestNotificationPermission} from './src/polling/notifications';

export default function App() {
  useEffect(() => {
    async function bootstrap() {
      await setupNotifications();
      await requestNotificationPermission();
      await initPoller();
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
