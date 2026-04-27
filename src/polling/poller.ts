import BackgroundFetch from 'react-native-background-fetch';
import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {showDmNotification} from './notifications';
import {TASK_ID, DELAYS_MS, MAX_STEP} from './schedule';

const INSTAGRAM_URL = 'https://www.instagram.com';
const INBOX_API =
  'https://www.instagram.com/api/v1/direct_v2/inbox/?limit=1';
const IG_APP_ID = '936619743392459';
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const KEY_STEP = 'poll_step';
const KEY_UNSEEN = 'poll_last_unseen';

async function getStep(): Promise<number> {
  const v = await AsyncStorage.getItem(KEY_STEP);
  return v !== null ? parseInt(v, 10) : MAX_STEP;
}

async function saveStep(step: number) {
  await AsyncStorage.setItem(KEY_STEP, String(step));
}

async function getLastUnseen(): Promise<number> {
  const v = await AsyncStorage.getItem(KEY_UNSEEN);
  return v !== null ? parseInt(v, 10) : 0;
}

async function saveLastUnseen(count: number) {
  await AsyncStorage.setItem(KEY_UNSEEN, String(count));
}

async function fetchUnseenCount(): Promise<number | null> {
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
    return typeof json?.inbox?.unseen_count === 'number'
      ? json.inbox.unseen_count
      : null;
  } catch {
    return null;
  }
}

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

// Called from DmsWebView when app backgrounds or new message detected in DOM
export async function resetPollStep() {
  await saveStep(0);
  await scheduleNextPoll(0);
}

// Core poll logic — returns the next step
async function runPoll(): Promise<number> {
  const currentStep = await getStep();
  const unseen = await fetchUnseenCount();

  if (unseen === null) {
    // API failed (not logged in, network error) — keep same step
    return currentStep;
  }

  const lastUnseen = await getLastUnseen();
  await saveLastUnseen(unseen);

  if (unseen > lastUnseen) {
    await showDmNotification(unseen);
    return 0; // new message — restart fast polling
  }

  return Math.min(currentStep + 1, MAX_STEP);
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
      minimumFetchInterval: 15, // fallback periodic (Android minimum)
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    handlePollTask,
    (taskId: string) => {
      // Timeout — finish immediately
      BackgroundFetch.finish(taskId);
    },
  );

  // Kick off the first one-shot poll cycle
  await scheduleNextPoll(await getStep());
}
