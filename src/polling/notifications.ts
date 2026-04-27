import notifee, {AndroidImportance} from '@notifee/react-native';

const CHANNEL_ID = 'dms';

export async function setupNotifications() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'New DMs',
    importance: AndroidImportance.HIGH,
  });
}

export async function requestNotificationPermission() {
  await notifee.requestPermission();
}

export async function showDmNotification(unseenCount: number) {
  await notifee.displayNotification({
    title: 'New message',
    body:
      unseenCount > 1
        ? `You have ${unseenCount} unread messages`
        : 'You have a new DM',
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      pressAction: {id: 'default'},
      smallIcon: 'ic_notification',
    },
  });
}
