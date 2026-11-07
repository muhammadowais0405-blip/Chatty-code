import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { DEFAULT_FIELD_MAPPINGS } from './import/defaultFieldMappings'

export { DEFAULT_FIELD_MAPPINGS }

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
// rest of settings.json, since it's meant to be user-editable/inspectable
// on its own.
function fieldMappingsPath(): string {
  return join(app.getPath('userData'), 'field-mappings.json')
}

export function loadSettings(): Settings {
  const saved: Partial<Settings> = existsSync(settingsPath())
    ? JSON.parse(readFileSync(settingsPath(), 'utf-8'))
    : {}

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    // Deep-merge nested objects so partial files don't wipe out defaults
    autoBackup: { ...DEFAULT_SETTINGS.autoBackup, ...(saved.autoBackup ?? {}) }
  }

  settings.fieldMappings = existsSync(fieldMappingsPath())
    ? JSON.parse(readFileSync(fieldMappingsPath(), 'utf-8'))
    : DEFAULT_FIELD_MAPPINGS

  if (!existsSync(fieldMappingsPath())) {
    writeFileSync(fieldMappingsPath(), JSON.stringify(DEFAULT_FIELD_MAPPINGS, null, 2))
  }

  return settings
}

export function saveSettings(next: Settings): Settings {
  writeFileSync(fieldMappingsPath(), JSON.stringify(next.fieldMappings, null, 2))
  const { fieldMappings: _omit, ...rest } = next
  writeFileSync(settingsPath(), JSON.stringify(rest, null, 2))
  return next
}
