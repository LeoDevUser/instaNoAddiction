import BackgroundFetch from 'react-native-background-fetch';
import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {showThreadNotifications, UnreadThread} from './notifications';
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

// ── Message preview ────────────────────────────────────────────────────────

function getPreview(item: Record<string, any>): string {
  switch (item.item_type) {
    case 'text':
      return item.text || 'Sent a message';
    case 'media':
    case 'raven_media':
      return '📷 Photo';
    case 'voice_media':
      return '🎤 Voice message';
    case 'reel_share':
    case 'clip':
      return '📹 Reel';
    case 'story_share':
      return '📖 Story';
    case 'media_share':
      return '📷 Post';
    case 'like':
      return '❤️ Liked a message';
    case 'link':
      return '🔗 Link';
    case 'location':
      return '📍 Location';
    default:
      return 'Sent a message';
  }
}

// ── API fetch ──────────────────────────────────────────────────────────────

async function fetchUnreadThreads(): Promise<UnreadThread[] | null> {
  try {
    const cookies = await CookieManager.get(INSTAGRAM_URL);
    if (!cookies.sessionid?.value) return null;

    const cookieHeader = Object.entries(cookies)
      .map(([k, c]) => `${k}=${c.value}`)
      .join('; ');

    const res = await fetch(INBOX_API, {
      headers: {
        Cookie: cookieHeader,
        'X-CSRFToken': cookies.csrftoken?.value ?? '',
        'X-IG-App-ID': IG_APP_ID,
        'User-Agent': UA,
        Referer: `${INSTAGRAM_URL}/direct/inbox/`,
        Accept: '*/*',
      },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const threads: any[] = json?.inbox?.threads ?? [];

    const unread: UnreadThread[] = [];
    for (const thread of threads) {
      // read_state > 0 means there are unseen messages
      if (!thread.read_state) continue;
      const items: any[] = thread.items ?? [];
      const latest = items[0];
      if (!latest || latest.is_sent_by_viewer) continue;

      unread.push({
        id: thread.thread_id,
        title:
          thread.thread_title ||
          thread.users?.[0]?.full_name ||
          thread.users?.[0]?.username ||
          'Instagram DM',
        preview: getPreview(latest),
        itemId: latest.item_id,
      });
    }

    return unread;
  } catch {
    return null;
  }
}

// ── Core poll logic ────────────────────────────────────────────────────────

// Returns the next backoff step
async function runPoll(): Promise<number> {
  const currentStep = await getStep();
  const threads = await fetchUnreadThreads();

  if (threads === null) {
    // Not logged in or network error — keep same step
    return currentStep;
  }

  const notified = await getNotifiedItems();

  // Find threads with messages we haven't notified about yet
  const fresh = threads.filter(t => notified[t.id] !== t.itemId);

  if (fresh.length > 0) {
    await showThreadNotifications(fresh);
    const updated = {...notified};
    fresh.forEach(t => {
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

// Called when app backgrounds or new message detected in DOM
export async function resetPollStep() {
  await saveStep(0);
  await scheduleNextPoll(0);
}

// ── Public API ─────────────────────────────────────────────────────────────

// Called on app open — checks immediately and notifies about anything unread
export async function checkAndNotify() {
  const threads = await fetchUnreadThreads();
  if (!threads || threads.length === 0) return;

  const notified = await getNotifiedItems();
  const fresh = threads.filter(t => notified[t.id] !== t.itemId);
  if (fresh.length === 0) return;

  await showThreadNotifications(fresh);
  const updated = {...notified};
  fresh.forEach(t => {
    updated[t.id] = t.itemId;
  });
  await saveNotifiedItems(updated);
}

// Foreground + background handler
export async function handlePollTask(taskId: string) {
  if (taskId !== TASK_ID) {
    BackgroundFetch.finish(taskId);
    return;
  }
  const nextStep = await runPoll();
  await saveStep(nextStep);
  await scheduleNextPoll(nextStep);
  BackgroundFetch.finish(taskId);
}

// Headless handler — runs when app is fully killed
export async function headlessTask(event: {taskId: string}) {
  await handlePollTask(event.taskId);
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
