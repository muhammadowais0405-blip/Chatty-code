import { useEffect, useState } from 'react'
import type { Folder, ImportProgress, ImportResult } from '@shared/types'
import Modal from './Modal'

const PHASE_LABEL: Record<ImportProgress['phase'], string> = {
  reading: 'Reading export…',
  parsing: 'Detecting format…',
  attachments: 'Importing messages & attachments…',
  done: 'Done',
  error: 'Error'
}

export default function ImportDialog({
  folders,
  onClose,
  onImported
}: {
  folders: Folder[]
  onClose: () => void
  onImported: (result: ImportResult) => void
}): JSX.Element {
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [stBasePath, setStBasePath] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Pre-populate the ST base path from saved settings
  useEffect(() => {
    window.api.settings.get().then((s) => {
      if (s.sillytavernBasePath) setStBasePath(s.sillytavernBasePath)
    })
    const unsubscribe = window.api.import.onProgress(setProgress)
    return unsubscribe
  }, [])

  async function pickSource(): Promise<void> {
    const path = await window.api.dialog.selectImportSource()
    if (path) setSourcePath(path)
  }

  async function pickStDir(): Promise<void> {
    const path = await window.api.dialog.selectFolder('Select your SillyTavern installation folder')
    if (path) setStBasePath(path)
  }

  async function runImport(forceDuplicate = false): Promise<void> {
    if (!sourcePath) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await window.api.import.start({
        sourcePath,
        targetFolderId,
        linkMode,
        sillytavernBasePath: stBasePath,
        forceDuplicate
      })
      // Save back so next import is pre-filled
      if (stBasePath) {
        const settings = await window.api.settings.get()
        await window.api.settings.set({ ...settings, sillytavernBasePath: stBasePath })
      }
      setResult(res)
      if (res.imported) onImported(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Import Chat(s)" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Source — pick a .jsonl file OR the folder that contains it">
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: sourcePath ? 'var(--text-primary)' : 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {sourcePath ?? 'e.g. select aria.jsonl, or the folder containing it'}
            </div>
            <button className="pill-button" onClick={pickSource} disabled={submitting}>
              Browse…
            </button>
          </div>
        </Field>

        <Field label="Target folder">
          <select
            value={targetFolderId ?? ''}
            onChange={(e) => setTargetFolderId(e.target.value ? Number(e.target.value) : null)}
            disabled={submitting}
            style={selectStyle}
          >
            <option value="">(root — no folder)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={linkMode}
            onChange={(e) => setLinkMode(e.target.checked)}
            disabled={submitting}
          />
          Link to original files instead of copying (attachments won&apos;t be included in
          backups — see §8)
        </label>

        <Field label="SillyTavern directory (needed to load images)">
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: stBasePath ? 'var(--text-primary)' : 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {stBasePath ?? 'e.g. C:\\SillyTavern  — needed for /user/images/... refs'}
            </div>
            <button className="pill-button" onClick={pickStDir} disabled={submitting}>
              Browse…
            </button>
            {stBasePath && (
              <button
                className="pill-button"
                onClick={() => setStBasePath(null)}
                disabled={submitting}
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </Field>

        {progress && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {PHASE_LABEL[progress.phase]}
            {progress.total > 0 && ` (${progress.current}/${progress.total})`}
          </div>
        )}

        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        {result && !result.imported && result.duplicateOf && (
          <div
            style={{
              background: 'rgba(245,165,36,0.1)',
              border: '1px solid rgba(245,165,36,0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              fontSize: 13
            }}
          >
            <div style={{ color: 'var(--warning)', fontWeight: 500 }}>
              This looks like a duplicate
            </div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 12 }}>
              An existing chat &ldquo;{result.duplicateOf.title}&rdquo; already matches this
              one on title, character, and message count ({result.messageCount} messages).
              Nothing was imported.
            </div>
          </div>
        )}

        {result && result.imported && (
          <div
            style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              fontSize: 13
            }}
          >
            <div>
              Detected format: <strong>{result.detectedFormat}</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              Imported <strong>{result.messageCount}</strong> messages,{' '}
              <strong>{result.attachmentCount}</strong> attachments
              {result.missingCount > 0 && (
                <span style={{ color: 'var(--warning)' }}> ({result.missingCount} missing)</span>
              )}
              .
            </div>
            {result.unmappedFieldWarning && (
              <div style={{ color: 'var(--warning)', marginTop: 6 }}>
                Some messages couldn&apos;t be mapped to text — check Settings → Field Mappings.
              </div>
            )}
            {result.sampleMissingAttachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: 'var(--warning)', marginBottom: 4 }}>
                  Tried all these paths and found nothing — showing first {result.sampleMissingAttachments.length} missing attachment(s):
                </div>
                {result.sampleMissingAttachments.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg-app)',
                      borderRadius: 4,
                      padding: '6px 8px',
                      marginTop: 6,
                      fontFamily: 'monospace',
                      fontSize: 10,
                      wordBreak: 'break-all',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>ref: {m.ref}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>tried:{'\n  → '}{m.checkedPath}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button className="pill-button" onClick={onClose}>
            {result?.imported ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              className="pill-button pill-button--primary"
              onClick={() => runImport(false)}
              disabled={!sourcePath || submitting}
            >
              {submitting ? 'Importing…' : 'Import'}
            </button>
          )}
          {result && !result.imported && result.duplicateOf && (
            <button
              className="pill-button pill-button--primary"
              onClick={() => runImport(true)}
              disabled={submitting}
            >
              {submitting ? 'Importing…' : 'Import Anyway'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13
}
