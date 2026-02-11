/**
 * File watcher: monitors ~/.claude/projects/ for JSONL changes.
 * Uses fs.watch with debouncing for efficient real-time sync.
 */
import fs from "fs";
import path from "path";
import { CLAUDE_DIR } from "./parser";
import { syncFile, type SyncEvent } from "./sync";

type EventListener = (event: SyncEvent) => void;

let listeners: EventListener[] = [];
let watching = false;
const watchers: fs.FSWatcher[] = [];
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function addEventListener(listener: EventListener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emit(event: SyncEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

function handleFileChange(jsonlPath: string) {
  // Debounce: JSONL files get many rapid appends
  const existing = debounceTimers.get(jsonlPath);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    jsonlPath,
    setTimeout(() => {
      debounceTimers.delete(jsonlPath);
      try {
        const events = syncFile(jsonlPath);
        for (const event of events) {
          emit(event);
        }
      } catch {
        // File might be in the middle of being written
      }
    }, 500)
  );
}

function watchProjectDir(projectDirPath: string) {
  try {
    const watcher = fs.watch(projectDirPath, (eventType, filename) => {
      if (!filename || !filename.endsWith(".jsonl")) return;
      const jsonlPath = path.join(projectDirPath, filename);
      if (fs.existsSync(jsonlPath)) {
        handleFileChange(jsonlPath);
      }
    });
    watchers.push(watcher);
  } catch {
    // Directory might not be readable
  }
}

export function startWatching() {
  if (watching) return;
  watching = true;

  if (!fs.existsSync(CLAUDE_DIR)) return;

  // Watch each project directory
  for (const dir of fs.readdirSync(CLAUDE_DIR)) {
    const dirPath = path.join(CLAUDE_DIR, dir);
    if (fs.statSync(dirPath).isDirectory()) {
      watchProjectDir(dirPath);
    }
  }

  // Also watch the top-level for new project directories
  try {
    const topWatcher = fs.watch(CLAUDE_DIR, (eventType, filename) => {
      if (!filename) return;
      const dirPath = path.join(CLAUDE_DIR, filename);
      try {
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          watchProjectDir(dirPath);
        }
      } catch {
        // Ignore
      }
    });
    watchers.push(topWatcher);
  } catch {
    // Ignore
  }
}

export function stopWatching() {
  watching = false;
  for (const w of watchers) {
    w.close();
  }
  watchers.length = 0;
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
}
