import notifee, {
  AndroidImportance,
  AndroidGroupAlertBehavior,
  AndroidStyle,
} from '@notifee/react-native';

const CHANNEL_ID = 'dms';
const GROUP_ID = 'ig_dms';

export interface NotifMessage {
  text: string;
  sender: string;
  timestamp: number; // ms epoch
}

export interface UnreadThread {
  id: string;
  title: string;
  itemId: string;
  profilePicUrl?: string;
  timestamp: number;        // ms epoch of latest message
  messages: NotifMessage[]; // oldest → newest
  isGroup?: boolean;
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

function buildMessagingStyle(thread: UnreadThread) {
  const messages = thread.messages.map(m => ({
    text: m.text || 'Sent a message',
    timestamp: m.timestamp || Date.now(),
    person: {name: m.sender || 'Unknown'},
  }));
  const groupTitle = thread.isGroup
    ? String(thread.title || 'Group Chat')
    : null;
  if (groupTitle !== null) {
    return {
      type: AndroidStyle.MESSAGING,
      person: {name: 'You'},
      title: groupTitle,
      group: true,
      messages,
    };
  }
  return {
    type: AndroidStyle.MESSAGING,
    person: {name: 'You'},
    messages,
  };
}

export async function showThreadNotifications(threads: UnreadThread[]) {
  if (threads.length === 0) return;

  for (const thread of threads) {
    try {
      const isMulti = thread.messages.length > 1;
      const title = thread.title || 'Instagram DM';
      const body = thread.messages[thread.messages.length - 1]?.text || 'New message';

      await notifee.displayNotification({
        id: `dm_${thread.id}`,
        title,
        body,
        android: {
          channelId: CHANNEL_ID,
          groupId: GROUP_ID,
          groupAlertBehavior: AndroidGroupAlertBehavior.CHILDREN,
          importance: AndroidImportance.HIGH,
          smallIcon: 'ic_notification',
          largeIcon: thread.profilePicUrl,
          timestamp: thread.timestamp,
          showTimestamp: true,
          pressAction: {id: 'default'},
          style: isMulti ? buildMessagingStyle(thread) : undefined,
        },
      });
    } catch (err) {
      // Skip this thread's notification rather than crashing the whole loop
      console.warn('notifee: failed to display thread', thread.id, err);
    }
  }

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
