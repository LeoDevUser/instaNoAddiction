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

export async function showThreadNotifications(threads: UnreadThread[]) {
  if (threads.length === 0) return;

  for (const thread of threads) {
    const isMulti = thread.messages.length > 1;

    await notifee.displayNotification({
      id: `dm_${thread.id}`,
      title: thread.title,
      body: thread.messages[thread.messages.length - 1]?.text ?? 'New message',
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
        // MessagingStyle shows each message on its own line — great for group chats
        style: isMulti
          ? {
              type: AndroidStyle.MESSAGING,
              person: {name: 'You'},
              ...(thread.isGroup ? {title: thread.title, group: true} : {}),
              messages: thread.messages.map(m => ({
                text: m.text,
                timestamp: m.timestamp,
                person: {name: m.sender},
              })),
            }
          : undefined,
      },
    });
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
