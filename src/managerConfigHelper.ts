/**
 * WinCC OA Manager Configuration Helper
 *
 * Reads and writes manager entries in the WinCC OA config/progs file.
 * PMON's SINGLE_MGR:INS only modifies runtime state, so persistent
 * changes must be written directly to config/progs.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { log } from './extensionOutput.js';

export interface ManagerEntry {
  component: string;
  startMode: 'manual' | 'once' | 'always';
  secKill: number;
  restartCount: number;
  resetMin: number;
  options: string;
}

/**
 * Check whether a manager with the given component and options substring
 * already exists in config/progs.
 */
export async function managerExists(
  projectDir: string,
  component: string,
  optionsSubstring: string,
): Promise<boolean> {
  const progsPath = path.join(projectDir, 'config', 'progs');
  let content: string;
  try {
    content = await fs.readFile(progsPath, 'utf8');
  } catch {
    return false;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('version') || trimmed.startsWith('auth')) {
      continue;
    }
    if (line.includes(component) && line.includes(optionsSubstring)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the next free manager number by scanning `-num X` patterns
 * in config/progs.
 */
export async function getNextFreeManagerNumber(projectDir: string): Promise<number> {
  const progsPath = path.join(projectDir, 'config', 'progs');
  let content: string;
  try {
    content = await fs.readFile(progsPath, 'utf8');
  } catch {
    return 1;
  }

  const used = new Set<number>();
  for (const line of content.split('\n')) {
    const m = line.match(/-num\s+(\d+)/);
    if (m) {
      used.add(parseInt(m[1], 10));
    }
  }

  let next = 1;
  while (used.has(next)) {
    next++;
  }
  return next;
}

/**
 * Append a manager entry to config/progs.
 */
export async function addManager(projectDir: string, entry: ManagerEntry): Promise<void> {
  const progsPath = path.join(projectDir, 'config', 'progs');

  let content: string;
  try {
    content = await fs.readFile(progsPath, 'utf8');
  } catch {
    throw new Error(`progs file not found: ${progsPath}`);
  }

  const lines = content.split('\n');

  // Find insertion point — before trailing comments / empty lines
  let insertIndex = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith('#')) {
      insertIndex = i + 1;
      break;
    }
  }

  const startMode = entry.startMode.padEnd(6);
  const secKill = entry.secKill.toString().padStart(8);
  const restartCount = entry.restartCount.toString().padStart(8);
  const resetMin = entry.resetMin.toString().padStart(8);

  const managerLine =
    `${entry.component.padEnd(16)} | ${startMode} |${secKill} |${restartCount} |${resetMin} |${entry.options}`;

  lines.splice(insertIndex, 0, managerLine);

  await fs.writeFile(progsPath, lines.join('\n'), 'utf8');
  log(`Added manager to ${progsPath}: ${managerLine}`);
}
