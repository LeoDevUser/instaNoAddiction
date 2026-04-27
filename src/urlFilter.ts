const BLOCKED: RegExp[] = [
  /instagram\.com\/reels\//,
  /instagram\.com\/explore\//,
  /instagram\.com\/tv\//,
  // Root feed — redirect to DMs instead
  /^https:\/\/www\.instagram\.com\/$/,
  /^https:\/\/www\.instagram\.com\/#/,
];

const ALLOWED: RegExp[] = [
  /instagram\.com\/direct\//,
  /instagram\.com\/accounts\//,
  /instagram\.com\/challenge\//,
  /instagram\.com\/two_factor\//,
  /instagram\.com\/stories\/.+\/\d+/,  // story replies are OK
  /about:blank/,
];

export function shouldAllowUrl(url: string): boolean {
  if (BLOCKED.some(re => re.test(url))) return false;
  if (ALLOWED.some(re => re.test(url))) return true;
  // Default: allow instagram subpages not explicitly blocked
  if (url.includes('instagram.com')) return true;
  // Allow non-instagram URLs (CDN, auth, etc.)
  return true;
}

export const INBOX_URL = 'https://www.instagram.com/direct/inbox/';
