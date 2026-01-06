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
