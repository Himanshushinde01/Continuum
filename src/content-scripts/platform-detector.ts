/**
 * Platform detector — ONE job: identify which AI platform the current tab is on.
 * Returns a typed platform string or 'unknown'.
 */
export type DetectedPlatform = 'claude' | 'chatgpt' | 'gemini' | 'unknown';

const PLATFORM_PATTERNS: Array<{ platform: DetectedPlatform; pattern: RegExp }> = [
  { platform: 'claude', pattern: /^https:\/\/claude\.ai\// },
  { platform: 'chatgpt', pattern: /^https:\/\/chatgpt\.com\// },
  { platform: 'gemini', pattern: /^https:\/\/gemini\.google\.com\// },
];

export function detectPlatform(url: string = window.location.href): DetectedPlatform {
  for (const { platform, pattern } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return 'unknown';
}
