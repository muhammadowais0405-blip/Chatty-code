import { app } from 'electron'
import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FieldMappingsConfig, Settings } from '@shared/types'
import { DEFAULT_FIELD_MAPPINGS } from './import/defaultFieldMappings'
import { readTextFile } from './utils/readTextFile'

const DEFAULT_SETTINGS: Settings = {
  fieldMappings: DEFAULT_FIELD_MAPPINGS,
  defaultBackupFolder: null,
  linkModeDefault: false,
  sillytavernBasePath: null,
  autoBackup: {
    enabled: false,
    intervalHours: 24,
    keepCount: 7,
    lastRunAt: null
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

// Kept as its own file (field-mappings.json) per §4.2, separate from the
// rest of settings.json, since it's meant to be user-editable on its own.
function fieldMappingsPath(): string {
  return join(app.getPath('userData'), 'field-mappings.json')
}

/** Reads JSON; on a parse error keeps the broken file as *.corrupt-<time> and returns null. */
function readJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readTextFile(path)) as T
  } catch (err) {
    console.error(`[settings] could not parse ${path}:`, err)
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`)
    } catch {
      /* ignore */
    }
    return null
  }
}

/** Write to a temp file, then rename, so a crash can't leave a half-written file. */
function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path)
}

/** Fills any missing format entry/keys from the defaults. */
function mergeFieldMappings(saved: Partial<FieldMappingsConfig> | null): FieldMappingsConfig {
  return {
    sillytavern: { ...DEFAULT_FIELD_MAPPINGS.sillytavern, ...(saved?.sillytavern ?? {}) },
    marinara: { ...DEFAULT_FIELD_MAPPINGS.marinara, ...(saved?.marinara ?? {}) },
    flat_v1: { ...DEFAULT_FIELD_MAPPINGS.flat_v1, ...(saved?.flat_v1 ?? {}) }
  }
}

export function loadSettings(): Settings {
  const saved = readJsonSafe<Partial<Settings>>(settingsPath()) ?? {}
  const savedMappings = readJsonSafe<Partial<FieldMappingsConfig>>(fieldMappingsPath())

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    // Deep-merge nested objects so partial files don't wipe out defaults
    autoBackup: { ...DEFAULT_SETTINGS.autoBackup, ...(saved.autoBackup ?? {}) },
    fieldMappings: mergeFieldMappings(savedMappings)
  }

  if (!savedMappings) writeJsonAtomic(fieldMappingsPath(), settings.fieldMappings)

  return settings
}

export function saveSettings(next: Settings): Settings {
  writeJsonAtomic(fieldMappingsPath(), next.fieldMappings)
  const { fieldMappings: _omit, ...rest } = next
  writeJsonAtomic(settingsPath(), rest)
  return next
}