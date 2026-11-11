import { useEffect, useState } from 'react'
import type {
  FieldMappingEntry,
  FieldMappingTestResult,
  FieldMappingsConfig,
  Settings,
  SourceFormat
} from '@shared/types'

const FORMATS: { key: keyof FieldMappingsConfig; label: string }[] = [
  { key: 'sillytavern', label: 'SillyTavern' },
  { key: 'marinara', label: 'Marinara Engine' },
  { key: 'flat_v1', label: 'flat_v1' }
]

function toCsv(arr: string[]): string {
  return arr.join(', ')
}
function fromCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export default function FieldMappingsSettings(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  if (!settings) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading settings…</div>
  }

  function updateMapping(key: keyof FieldMappingsConfig, entry: FieldMappingEntry): void {
    setSettings((prev) =>
      prev ? { ...prev, fieldMappings: { ...prev.fieldMappings, [key]: entry } } : prev
    )
  }

  async function save(): Promise<void> {
    if (!settings) return
    setSaveState('saving')
    const saved = await window.api.settings.set(settings)
    setSettings(saved)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Field Mappings</h2>
        <button className="pill-button pill-button--primary" onClick={save}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: -12 }}>
        Controls how each source format&apos;s raw message fields get mapped into text / sender /
        date / attachments during import (§4.2). Stored in{' '}
        <code>field-mappings.json</code> so you can hand-edit it too.
      </p>

      {FORMATS.map(({ key, label }) => (
        <FormatPanel
          key={key}
          format={key}
          label={label}
          entry={settings.fieldMappings[key]}
          onChange={(entry) => updateMapping(key, entry)}
        />
      ))}
    </div>
  )
}

function FormatPanel({
  format,
  label,
  entry,
  onChange
}: {
  format: SourceFormat
  label: string
  entry: FieldMappingEntry
  onChange: (entry: FieldMappingEntry) => void
}): JSX.Element {
  const [testResult, setTestResult] = useState<FieldMappingTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  async function runTest(): Promise<void> {
    const sourcePath = await window.api.dialog.selectSampleFile()
    if (!sourcePath) return
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const result = await window.api.fieldMappings.test({ sourcePath, format, mapping: entry })
      setTestResult(result)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <section
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 16
      }}
    >
      <h3 style={{ margin: '0 0 12px' }}>{label}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TextField
          label="Text fields (first non-empty wins)"
          value={toCsv(entry.textFields)}
          onChange={(v) => onChange({ ...entry, textFields: fromCsv(v) })}
        />
        <TextField
          label="Sender name field"
          value={entry.senderNameField}
          onChange={(v) => onChange({ ...entry, senderNameField: v })}
        />
        <TextField
          label="Is-user field (leave blank to use role field)"
          value={entry.isUserField ?? ''}
          onChange={(v) => onChange({ ...entry, isUserField: v || null })}
        />
        <TextField
          label="Date field"
          value={entry.dateField}
          onChange={(v) => onChange({ ...entry, dateField: v })}
        />
        <TextField
          label="Attachment paths (foo.bar[].baz syntax)"
          value={toCsv(entry.attachmentPaths)}
          onChange={(v) => onChange({ ...entry, attachmentPaths: fromCsv(v) })}
        />
        {!entry.isUserField && (
          <>
            <TextField
              label="Role field"
              value={entry.roleField ?? ''}
              onChange={(v) => onChange({ ...entry, roleField: v || undefined })}
            />
            <TextField
              label="Role: user value"
              value={entry.roleUserValue ?? ''}
              onChange={(v) => onChange({ ...entry, roleUserValue: v || undefined })}
            />
            <TextField
              label="Role: assistant value"
              value={entry.roleAssistantValue ?? ''}
              onChange={(v) => onChange({ ...entry, roleAssistantValue: v || undefined })}
            />
            <TextField
              label="Role: system value"
              value={entry.roleSystemValue ?? ''}
              onChange={(v) => onChange({ ...entry, roleSystemValue: v || undefined })}
            />
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="pill-button" onClick={runTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test against a sample file…'}
        </button>
      </div>

      {testError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{testError}</div>}

      {testResult && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Detected as <strong>{testResult.detectedFormat}</strong> · {testResult.totalLines}{' '}
            message line(s), showing first {testResult.rows.length}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Sender</th>
                  <th style={thStyle}>Text</th>
                  <th style={thStyle}>Attach.</th>
                </tr>
              </thead>
              <tbody>
                {testResult.rows.map((row) => (
                  <tr
                    key={row.seq}
                    style={{
                      borderTop: '1px solid var(--border-subtle)',
                      color: row.unmapped ? 'var(--warning)' : 'var(--text-primary)'
                    }}
                  >
                    <td style={tdStyle}>{row.seq}</td>
                    <td style={tdStyle}>{row.senderName ?? '—'}</td>
                    <td style={{ ...tdStyle, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.text ?? '(unmapped)'}
                    </td>
                    <td style={tdStyle}>{row.attachmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 8px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12
        }}
      />
    </label>
  )
}

const thStyle: React.CSSProperties = { padding: '4px 6px' }
const tdStyle: React.CSSProperties = { padding: '4px 6px' }
