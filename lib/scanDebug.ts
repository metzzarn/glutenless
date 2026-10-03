import { Storage } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import type { PhotoScan, ScanMode } from './ocr';

/** A finished scan plus the photo it came from, for the scan debug screen. */
export type DebugScan = PhotoScan & {
  mode: ScanMode;
  photo: { uri: string; width: number; height: number };
  durationMs: number;
};

const STORAGE_KEY = 'scanDebug';

let enabled = false;
const listeners = new Set<() => void>();

try {
  enabled = Storage.getItemSync(STORAGE_KEY) === 'on';
} catch {
  // Unreadable storage just means debug mode starts off.
}

/**
 * Scan debug mode: after each photo the camera opens a screen showing what
 * ML Kit read and why beers did or didn't match. Toggled by long-pressing the
 * shutter, so it's reachable in release builds without cluttering the UI.
 */
export function setScanDebugEnabled(next: boolean) {
  enabled = next;
  listeners.forEach((listener) => listener());
  try {
    Storage.setItemSync(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // The choice still applies for this session.
  }
}

export function useScanDebugEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabled,
  );
}

// Held in memory rather than passed as route params: OCR blocks for a menu
// photo are far too large for a URL.
let lastScan: DebugScan | null = null;

export function setLastScan(scan: DebugScan) {
  lastScan = scan;
}

export function getLastScan(): DebugScan | null {
  return lastScan;
}
