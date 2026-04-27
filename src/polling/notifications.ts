import notifee, {
  AndroidImportance,
  AndroidGroupAlertBehavior,
} from '@notifee/react-native';

const CHANNEL_ID = 'dms';
const GROUP_ID = 'ig_dms';

export interface UnreadThread {
  id: string;       // thread_id
  title: string;    // sender name / group name
  preview: string;  // message preview text
  itemId: string;   // latest item id (used for dedup)
}

export async function setupNotifications() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Direct Messages',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

export async function requestNotificationPermission() {
  await notifee.requestPermission();
}

export async function showThreadNotifications(threads: UnreadThread[]) {
  if (threads.length === 0) return;

  for (const thread of threads) {
    await notifee.displayNotification({
      id: `dm_${thread.id}`,
      title: thread.title,
      body: thread.preview,
      android: {
        channelId: CHANNEL_ID,
        groupId: GROUP_ID,
        groupAlertBehavior: AndroidGroupAlertBehavior.CHILDREN,
        importance: AndroidImportance.HIGH,
        smallIcon: 'ic_notification',
        pressAction: {id: 'default'},
        showTimestamp: true,
      },
    });
  }

  // Android requires a summary notification to collapse the group
  if (threads.length > 1) {
    await notifee.displayNotification({
      id: 'dm_summary',
      title: 'Instagram DMs',
      body: `${threads.length} unread conversations`,
      android: {
        channelId: CHANNEL_ID,
        groupId: GROUP_ID,
        groupSummary: true,
        importance: AndroidImportance.HIGH,
        smallIcon: 'ic_notification',
      },
    });
  }
}
