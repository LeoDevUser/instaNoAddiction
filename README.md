# Instagram DMs

A React Native Android app that wraps Instagram and restricts it to Direct Messages only. No feed, no reels, no explore — just DMs.

## What it does

- Opens Instagram locked to the DM inbox
- Blocks navigation to the home feed, reels, explore, and TV
- Hides post feed content (articles/feed sections) on any page
- Removes nav tabs for Reels and Explore
- Blocks access to the blocked users list
- Background polling for unread DMs with rich Android notifications (MessagingStyle, group chat support, per-sender names, emoji reactions)
- Adaptive polling: fast when messages are coming in, backs off when idle
- Unread count badge from page title

## Tech stack

- React Native 0.85.2, New Architecture, Android only
- `react-native-webview` — WebView wrapper
- `@notifee/react-native` — rich notifications
- `react-native-background-fetch` — background polling
- `@react-native-cookies/cookies` — session cookie access for API calls
- `@react-native-async-storage/async-storage` — polling state persistence

## Architecture

### URL filtering (`src/urlFilter.ts`)
Blocklist/allowlist checked by the WebView's `onShouldStartLoadWithRequest`. Blocks home feed, reels, explore, TV, settings, and blocked-users pages. Allows DMs, accounts, challenge/2FA, and story replies.

### DOM injection (`src/injection/domWatcher.js.ts`)
Injected via `injectedJavaScriptBeforeContentLoaded`. Runs before Instagram's JS.
- Redirects to inbox on blocked URLs at page load
- Intercepts `pushState`/`replaceState` to block SPA navigation to blocked routes
- Blocks vertical swipe gestures in reel feeds (touch event interception in capture phase)
- Trims adjacent reel nodes from the DOM so swipe-snap has nothing to snap to
- Strips nav tabs and blocked-list UI elements via MutationObserver
- Detects "Unblock" buttons and redirects immediately
- Posts unread count to React Native via `ReactNativeWebView.postMessage`

### CSS injection (`src/injection/blockReels.css.ts`)
Persistent stylesheet injected into the WebView. Hides reels/explore nav links, inline reel clips, and all `article`/`[role="feed"]` post content.

### Background polling (`src/polling/`)
- `poller.ts` — fetches the Instagram inbox API using session cookies, detects unread threads, fires notifications, schedules next poll
- `notifications.ts` — builds Android MessagingStyle notifications with group/DM support
- `schedule.ts` — exponential backoff schedule (fast → slow as inbox goes quiet)

Polling uses the Instagram private API (`/api/v1/direct_v2/inbox/` + per-thread endpoint for full message history). Session cookies from the WebView are reused so no separate login is needed.

## Building

### Debug (development)
```bash
npm install
npm run android
```

### Release APK
```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### Install via USB
```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

If upgrading from a debug build (different signing key), uninstall first:
```bash
adb uninstall com.dmsonly
adb install android/app/build/outputs/apk/release/app-release.apk
```

### Release signing
The release keystore is stored at `/home/leo/instagram-dms-release.keystore`. Credentials are in `android/gradle.properties`. Keep the keystore backed up — losing it means you can't update the app from the same signing identity.

## Key files

```
src/
  App.tsx                        — WebView setup, message handler, permission requests
  urlFilter.ts                   — URL blocklist/allowlist
  injection/
    domWatcher.js.ts             — injected JS (navigation intercept, reel blocking, DOM cleanup)
    blockReels.css.ts            — injected CSS (hide feed, nav tabs, reel clips)
  polling/
    poller.ts                    — inbox API fetcher, notification trigger, background task handler
    notifications.ts             — notifee notification builder
    schedule.ts                  — adaptive polling intervals
android/
  app/src/main/res/
    mipmap-*/ic_launcher*.png    — launcher icons (all densities)
    drawable/ic_launcher_*.xml   — adaptive icon layers
```
