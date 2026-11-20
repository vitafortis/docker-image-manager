import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh data folder for the store; imported before anything that reads the config. */
export const dataDir = mkdtempSync(join(tmpdir(), 'wharf-test-'));
process.env.WHARF_DATA_DIR = dataDir;
