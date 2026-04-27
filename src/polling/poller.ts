import BackgroundFetch from 'react-native-background-fetch';
import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {showThreadNotifications, UnreadThread, NotifMessage} from './notifications';
import {TASK_ID, DELAYS_MS, MAX_STEP} from './schedule';

const INSTAGRAM_URL = 'https://www.instagram.com';
const INBOX_API =
  'https://www.instagram.com/api/v1/direct_v2/inbox/?limit=20&visual_message_return_type=unseen';
const IG_APP_ID = '936619743392459';
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const KEY_STEP = 'poll_step';
const KEY_NOTIFIED = 'notified_items'; // JSON: { thread_id: last_notified_item_id }

// ── Persistence helpers ────────────────────────────────────────────────────

async function getStep(): Promise<number> {
  const v = await AsyncStorage.getItem(KEY_STEP);
  return v !== null ? parseInt(v, 10) : MAX_STEP;
}

async function saveStep(step: number) {
  await AsyncStorage.setItem(KEY_STEP, String(step));
}

async function getNotifiedItems(): Promise<Record<string, string>> {
  const v = await AsyncStorage.getItem(KEY_NOTIFIED);
  try {
    return v ? JSON.parse(v) : {};
  } catch {
    return {};
  }
}

async function saveNotifiedItems(items: Record<string, string>) {
  await AsyncStorage.setItem(KEY_NOTIFIED, JSON.stringify(items));
}

// ── Timestamp helpers ──────────────────────────────────────────────────────

// Instagram timestamps are in microseconds (16-digit). Convert to ms epoch.
function toMs(ts: number): number {
  if (ts > 1e15) return Math.floor(ts / 1000);
  if (ts > 1e12) return ts;
  return ts * 1000;
}

// ── Message preview ────────────────────────────────────────────────────────

function getPreview(item: Record<string, any>): string {
  switch (item.item_type) {
    case 'text':
      return item.text || 'Sent a message';
    case 'reaction': {
      const emoji = item.reaction?.emoji ?? '❤️';
      return `Reacted ${emoji} to your message`;
    }
    case 'like':
      return '❤️ Liked a message';
    case 'media':
    case 'raven_media':
      return '📷 Photo';
    case 'voice_media':
    case 'audio':
      return '🎤 Voice message';
    case 'animated_media':
      return '😄 Sticker';
    case 'reel_share':
    case 'clip':
      return '📹 Reel';
    case 'story_share':
    case 'story_reply':
      return '📖 Story';
    case 'media_share':
    case 'xma_media_share':
      return '📷 Post';
    case 'link':
      return item.link?.text || '🔗 Link';
    case 'location':
      return '📍 Location';
    case 'profile':
      return '👤 Profile';
    case 'placeholder':
      return '⏳ Message expired';
    case 'action_log':
      return item.action_log?.description || 'Sent a message';
    default:
      return 'Sent a message';
  }
}

// ── Build sender name for an item ──────────────────────────────────────────

function getSenderName(item: Record<string, any>, thread: Record<string, any>): string {
  const userId = item.user_id;
  const user = (thread.users ?? []).find((u: any) => String(u.pk) === String(userId));
  return user?.full_name || user?.username || 'Unknown';
}

// ── API fetch ──────────────────────────────────────────────────────────────

async function fetchThreadItems(
  threadId: string,
  headers: Record<string, string>,
): Promise<any[]> {
  try {
    const res = await fetch(
      `${INSTAGRAM_URL}/api/v1/direct_v2/threads/${threadId}/?limit=20`,
      {headers},
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json?.thread?.items ?? [];
  } catch {
    return [];
  }
}

async function fetchUnreadThreads(
  notified: Record<string, string>,
): Promise<UnreadThread[] | null> {
  try {
    const cookies = await CookieManager.get(INSTAGRAM_URL);
    if (!cookies.sessionid?.value) return null;

    const cookieHeader = Object.entries(cookies)
      .map(([k, c]) => `${k}=${c.value}`)
      .join('; ');

    const headers = {
      Cookie: cookieHeader,
      'X-CSRFToken': cookies.csrftoken?.value ?? '',
      'X-IG-App-ID': IG_APP_ID,
      'User-Agent': UA,
      Referer: `${INSTAGRAM_URL}/direct/inbox/`,
      Accept: '*/*',
    };

    const res = await fetch(INBOX_API, {headers});
    if (!res.ok) return null;
    const json = await res.json();
    const threads: any[] = json?.inbox?.threads ?? [];

    const unread: UnreadThread[] = [];
    for (const thread of threads) {
      if (!thread.read_state) continue;

      const isGroup = thread.thread_type === 'group';
      // Group chats have a dedicated image; 1-on-1 uses the other person's profile pic
      const profilePicUrl = isGroup
        ? (thread.image?.uri ?? thread.image?.url ?? thread.users?.[0]?.profile_pic_url)
        : thread.users?.[0]?.profile_pic_url;

      // Inbox API returns only the latest 1-2 items per thread.
      // read_state is the unread count — if we have fewer items, fetch the full thread.
      let items: any[] = thread.items ?? [];
      const unreadCount: number =
        typeof thread.unread_count === 'number'
          ? thread.unread_count
          : thread.read_state;
      if (unreadCount > items.length) {
        const more = await fetchThreadItems(thread.thread_id, headers);
        if (more.length > 0) {
          items = more;
        }
      }

      // items are newest-first; stop at the last item_id we already notified about
      const lastNotifiedId = notified[thread.thread_id];
      const newItems: any[] = [];
      for (const item of items) {
        if (item.item_id === lastNotifiedId) break;
        if (!item.is_sent_by_viewer) {
          newItems.push(item);
        }
      }

      if (newItems.length === 0) continue;

      const latest = newItems[0]; // newest first

      // oldest → newest for MessagingStyle display order
      const messages: NotifMessage[] = newItems
        .slice()
        .reverse()
        .map((item: any) => ({
          text: getPreview(item),
          sender: getSenderName(item, thread),
          timestamp: toMs(Number(item.timestamp)),
        }));

      unread.push({
        id: thread.thread_id,
        title:
          thread.thread_title ||
          thread.users?.[0]?.full_name ||
          thread.users?.[0]?.username ||
          'Instagram DM',
        itemId: latest.item_id,
        profilePicUrl,
        timestamp: toMs(Number(latest.timestamp)),
        messages,
        isGroup,
      });
    }

    return unread;
  } catch {
    return null;
  }
}

// ── Core poll logic ────────────────────────────────────────────────────────

async function runPoll(): Promise<number> {
  const currentStep = await getStep();
  const notified = await getNotifiedItems();
  const threads = await fetchUnreadThreads(notified);

  if (threads === null) {
    return currentStep;
  }

  if (threads.length > 0) {
    await showThreadNotifications(threads);
    const updated = {...notified};
    threads.forEach(t => {
      updated[t.id] = t.itemId;
    });
    await saveNotifiedItems(updated);
    return 0; // New messages — restart fast polling
  }

  return Math.min(currentStep + 1, MAX_STEP);
}

// ── Scheduling ─────────────────────────────────────────────────────────────

async function scheduleNextPoll(step: number) {
  const delay = DELAYS_MS[Math.min(step, MAX_STEP)];
  await BackgroundFetch.scheduleTask({
    taskId: TASK_ID,
    delay,
    stopOnTerminate: false,
    startOnBoot: true,
    forceAlarmManager: false,
  });
}

export async function resetPollStep() {
  await saveStep(0);
  // Clear seen-map so background polls will re-notify about still-unread messages
  await AsyncStorage.removeItem(KEY_NOTIFIED);
  await scheduleNextPoll(0);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function checkAndNotify() {
  const notified = await getNotifiedItems();
  const threads = await fetchUnreadThreads(notified);
  if (!threads || threads.length === 0) return;

  await showThreadNotifications(threads);
  const updated = {...notified};
  threads.forEach(t => {
    updated[t.id] = t.itemId;
  });
  await saveNotifiedItems(updated);
}

export async function handlePollTask(taskId: string) {
  if (taskId !== TASK_ID) {
    BackgroundFetch.finish(taskId);
    return;
  }
  try {
    const nextStep = await runPoll();
    await saveStep(nextStep);
    await scheduleNextPoll(nextStep);
  } finally {
    // Must always be called or Android stops rescheduling the task
    BackgroundFetch.finish(taskId);
  }
}

export async function headlessTask(event: {taskId: string}) {
  try {
    await handlePollTask(event.taskId);
  } catch {
    BackgroundFetch.finish(event.taskId);
  }
}

export async function initPoller() {
  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    handlePollTask,
    (taskId: string) => {
      BackgroundFetch.finish(taskId);
    },
  );

  await scheduleNextPoll(await getStep());
}
