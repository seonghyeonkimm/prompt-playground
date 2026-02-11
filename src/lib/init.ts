/**
 * Server initialization: run initial sync and start file watcher.
 * Called once on first request via lazy initialization.
 */
import { syncAll } from "./sync";
import { startWatching } from "./watcher";

let initialized = false;

export function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // Initial sync of all existing JSONL files
  syncAll();

  // Start watching for real-time changes
  startWatching();
}
