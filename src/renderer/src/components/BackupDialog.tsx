import { useEffect, useState } from 'react'
import type { BackupCheckResult, Folder, MergeStrategy, RestoreResult, BackupExportResult } from '@shared/types'
import Modal from './Modal'

type Tab = 'export' | 'restore' | 'autoBackup'

export default function BackupDialog({
  folders,
  onClose
}: {
  folders: Folder[]
  onClose: () => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('export')
  const TABS: { key: Tab; label: string }[] = [
    { key: 'export', label: 'Export' },
    { key: 'restore', label: 'Restore' },
    { key: 'autoBackup', label: 'Auto-Backup' }
  ]
  return (
    <Modal title="Backup & Restore" onClose={onClose} width={580}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'export' && <ExportPanel folders={folders} />}
      {tab === 'restore' && <RestorePanel />}
      {tab === 'autoBackup' && <AutoBackupPanel />}
    </Modal>
  )
}

/* ─── EXPORT ─────────────────────────────────────────────── */

function ExportPanel({ folders }: { folders: Folder[] }): JSX.Element {
  const [destPath, setDestPath] = useState<string | null>(null)
  const [scopeMode, setScopeMode] = useState<'all' | 'folders'>('all')
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number | null>>(new Set())
  const [includeRoot, setIncludeRoot] = useState(false)
  const [includeLinkMode, setIncludeLinkMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BackupExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load saved backup folder from settings
  useEffect(() => {
    window.api.settings.get().then((s) => { if (s.defaultBackupFolder) setDestPath(s.defaultBackupFolder) })
  }, [])

  function toggleFolder(id: number | null): void {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run(): Promise<void> {
    if (!destPath) return
    setBusy(true); setError(null); setResult(null)
    try {
      const scope =
        scopeMode === 'all'
          ? ('all' as const)
          : { folderIds: [...selectedFolderIds, ...(includeRoot ? [null] : [])] as (number | null)[] }
      const res = await window.api.backup.export({ destPath, scope, includeLinkMode })
      setResult(res)
      const s = await window.api.settings.get()
      await window.api.settings.set({ ...s, defaultBackupFolder: destPath })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Notice>
        Link-mode attachments are <b>not</b> included by default — only chats imported with
        copy mode have their images backed up. Enable the option below to include them.
      </Notice>

      <Field label="Save backup to">
        <PathRow path={destPath} onPick={async () => { const p = await window.api.dialog.selectBackupDest(); if (p) setDestPath(p) }} busy={busy} />
      </Field>

      <Field label="Scope">
        <div style={{ display: 'flex', gap: 10 }}>
          {(['all', 'folders'] as const).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" checked={scopeMode === m} onChange={() => setScopeMode(m)} />
              {m === 'all' ? 'All chats' : 'Select folders'}
            </label>
          ))}
        </div>
      </Field>

      {scopeMode === 'folders' && (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeRoot} onChange={(e) => setIncludeRoot(e.target.checked)} />
            (root — chats not in any folder)
          </label>
          {folders.filter((f) => !f.is_trashed).map((f) => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', paddingLeft: f.parent_id ? 16 : 0 }}>
              <input type="checkbox" checked={selectedFolderIds.has(f.id)} onChange={() => toggleFolder(f.id)} />
              {f.name}
              {f.chatCount ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({f.chatCount})</span> : null}
            </label>
          ))}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={includeLinkMode} onChange={(e) => setIncludeLinkMode(e.target.checked)} />
        Include link-mode attachment files
      </label>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {result && (
        <SuccessBox>
          <div>Backup created ✓</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
            {result.chatCount} chat(s) · {result.fileCount} file(s)
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, wordBreak: 'break-all' }}>
            {result.path}
          </div>
        </SuccessBox>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="pill-button pill-button--primary" onClick={run} disabled={!destPath || busy}>
          {busy ? 'Creating…' : 'Create Backup'}
        </button>
      </div>
    </div>
  )
}

/* ─── RESTORE ─────────────────────────────────────────────── */

function RestorePanel(): JSX.Element {
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<MergeStrategy>('skip')
  const [check, setCheck] = useState<BackupCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pickSource(): Promise<void> {
        const p = await window.api.dialog.selectBackupFile()
    if (!p) return
    setSourcePath(p); setCheck(null); setResult(null); setError(null)
    setChecking(true)
    try {
      const c = await window.api.backup.check(p)
      setCheck(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  async function run(): Promise<void> {
    if (!sourcePath) return
    setBusy(true); setError(null); setResult(null)
    try {
      setResult(await window.api.backup.restore({ sourcePath, mergeStrategy: strategy }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Backup file (.zip)">
        <PathRow path={sourcePath} onPick={pickSource} busy={busy || checking} placeholder="Choose a backup .zip…" />
      </Field>

      {checking && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Checking backup…</div>}

      {check && (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13 }}>
          {check.valid ? (
            <>
              <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>Backup looks good ✓</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 12 }}>
                <div>Exported: {check.manifest?.exportedAt ? new Date(check.manifest.exportedAt).toLocaleString() : '—'}</div>
                <div>Contains: {check.manifest?.chatCount} chats · {check.manifest?.fileCount} files</div>
                {check.manifest?.hasTags && <div>Tags included ✓</div>}
                {check.manifest?.hasPrompts && <div>Prompts included ✓</div>}
              </div>
              {check.previewTitles.length > 0 && (
                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                  Preview: {check.previewTitles.join(', ')}{(check.manifest?.chatCount ?? 0) > check.previewTitles.length ? '…' : ''}
                </div>
              )}
            </>
          ) : (
            <ErrorMsg>{check.error}</ErrorMsg>
          )}
        </div>
      )}

      <Field label="If a matching chat already exists">
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as MergeStrategy)} style={selectStyle}>
          <option value="skip">Skip — keep existing</option>
          <option value="duplicate">Duplicate — always import as new</option>
          <option value="replace">Replace — delete existing first</option>
        </select>
      </Field>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {result && (
        <SuccessBox>
          <div>Restore complete ✓</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
            {result.chatsImported} imported · {result.chatsSkipped} skipped · {result.chatsReplaced} replaced
            {result.foldersCreated > 0 && ` · ${result.foldersCreated} folder(s) created`}
            {result.tagsRestored > 0 && ` · ${result.tagsRestored} tag(s) restored`}
            {result.promptsImported > 0 && ` · ${result.promptsImported} prompt(s) imported`}
          </div>
        </SuccessBox>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="pill-button pill-button--primary"
          onClick={run}
          disabled={!sourcePath || busy || !check?.valid}
        >
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      </div>
    </div>
  )
}

/* ─── AUTO-BACKUP ─────────────────────────────────────────── */

function AutoBackupPanel(): JSX.Element {
  const [settings, setSettings] = useState<import('@shared/types').Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { window.api.settings.get().then(setSettings) }, [])
  if (!settings) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
  const currentSettings = settings // stable non-null reference for closures below

  const ab = currentSettings.autoBackup

  async function save(patch: Partial<typeof ab>): Promise<void> {
    const next = { ...currentSettings, autoBackup: { ...ab, ...patch } }
    setSaving(true)
    const saved = await window.api.settings.set(next)
    setSettings(saved)
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <input type="checkbox" checked={ab.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        <div>
          <div style={{ fontWeight: 500 }}>Enable automatic backup</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Saves to the backup folder at the chosen interval. Missed backups (e.g. while
            the app was closed) run on next launch.
          </div>
        </div>
      </label>

      <Field label="Backup folder">
        <PathRow
          path={currentSettings.defaultBackupFolder}
          onPick={async () => {
            const p = await window.api.dialog.selectBackupDest()
            if (p) {
              const next = { ...currentSettings, defaultBackupFolder: p }
              const saved = await window.api.settings.set(next)
              setSettings(saved)
            }
          }}
          busy={saving}
          placeholder="No folder set — pick one above"
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Run every">
          <select value={ab.intervalHours} onChange={(e) => save({ intervalHours: Number(e.target.value) })} style={selectStyle}>
            <option value={6}>Every 6 hours</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Daily</option>
            <option value={72}>Every 3 days</option>
            <option value={168}>Weekly</option>
          </select>
        </Field>
        <Field label="Keep last N backups (0 = keep all)">
          <input
            type="number" min={0} max={99}
            value={ab.keepCount}
            onChange={(e) => save({ keepCount: Math.max(0, Number(e.target.value)) })}
            style={{ ...selectStyle, width: '100%' }}
          />
        </Field>
      </div>

      {ab.lastRunAt && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last auto-backup: {new Date(ab.lastRunAt).toLocaleString()}
        </div>
      )}

      {!ab.enabled && (
        <Notice>Auto-backup is off. Enable it above to have backups run automatically.</Notice>
      )}
      {ab.enabled && !settings.defaultBackupFolder && (
        <Notice variant="warn">Set a backup folder — auto-backup won't run without one.</Notice>
      )}
    </div>
  )
}

/* ─── SHARED PRIMITIVES ──────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  )
}

function PathRow({ path, onPick, busy, placeholder }: { path: string | null; onPick: () => void; busy: boolean; placeholder?: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: path ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {path ?? (placeholder ?? 'Choose…')}
      </div>
      <button className="pill-button" onClick={onPick} disabled={busy}>Browse…</button>
    </div>
  )
}

function Notice({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warn' }): JSX.Element {
  const color = variant === 'warn' ? 'var(--warning)' : 'var(--text-secondary)'
  return (
    <div style={{ padding: '9px 12px', background: variant === 'warn' ? 'rgba(245,165,36,0.1)' : 'var(--bg-tertiary)', border: `1px solid ${variant === 'warn' ? 'rgba(245,165,36,0.3)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-sm)', fontSize: 12, color, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }): JSX.Element {
  return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{children}</div>
}

function SuccessBox({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13 }}>
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13
}
