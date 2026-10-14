import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, getDatabase } from "../dist/index.js";

/** Point the Synapse singleton at a brand-new database in a temp directory */
export function useFreshDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "synapse-test-"));
  const dbPath = join(dir, "brain.db");
  closeDatabase();
  getDatabase(dbPath);
  return {
    dir,
    dbPath,
    cleanup() {
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
