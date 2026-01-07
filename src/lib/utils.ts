import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Adds alpha channel to a hex color based on opacity percentage
 * @param color - Hex color string (e.g., '#000', '#000000', '#000000ff')
 * @param opacity - Opacity value from 0-100
 * @returns Hex color with alpha channel (e.g., '#00000080' for 50%)
 */
export function addAlphaToHex(color: string, opacity: number): string {
  // Normalize the color by removing the # prefix
  let hex = color.startsWith('#') ? color.slice(1) : color;

  // Expand shorthand hex (#fff -> #ffffff)
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }

  // If already has alpha channel, strip it
  if (hex.length === 8) {
    hex = hex.slice(0, 6);
  }

  // If opacity is 100%, return the base color without alpha
  if (opacity >= 100) return `#${hex}`;

  // Calculate alpha value and append
  const alpha = Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');
  return `#${hex}${alpha}`;
}

// Fast, deterministic string hash (32-bit unsigned)
export function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

// Small PRNG used for deterministic jitter
export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Converts hyphenated text to title case
 * @param text - Text with hyphens (e.g., 'color-dodge')
 * @returns Title case text (e.g., 'Color Dodge')
 */
export function titleCase(text: string): string {
  return text
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}


export function randomId(): string {
  return Math.random().toString(36).slice(2);
}

export function arrayShallowEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}