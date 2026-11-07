import { useEffect, useState } from 'react'
import type { Tag } from '@shared/types'
import TagChip from '../TagChip'
import { TAG_COLORS } from '../../utils/tags'

export default function TagsSettings(): JSX.Element {
  const [tags, setTags] = useState<Tag[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  function refresh(): void {
    window.api.tags.list().then(setTags)
  }

  useEffect(() => { refresh() }, [])

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return
    await window.api.tags.create(newName.trim(), newColor)
    setNewName('')
    refresh()
  }

  async function handleRename(tag: Tag): Promise<void> {
    if (editName.trim() && editName !== tag.name) {
      await window.api.tags.rename(tag.id, editName.trim())
      refresh()
    }
    setEditingId(null)
  }

  async function handleSetColor(tag: Tag, color: string): Promise<void> {
    await window.api.tags.setColor(tag.id, color)
    refresh()
  }

  async function handleDelete(tag: Tag): Promise<void> {
    if (!window.confirm(`Delete tag "${tag.name}"? It will be removed from all chats.`)) return
    await window.api.tags.delete(tag.id)
    refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
      <h2 style={{ margin: 0 }}>Tags</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: -8 }}>
        Flat tag list (§9.1). Assign tags to chats from the chat list context menu or the
        viewer header.
      </p>

      {/* Create */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 14
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Create tag</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder="Tag name…"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: c,
                  border: newColor === c ? '2px solid var(--text-primary)' : '1px solid var(--border-strong)',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
          <button className="pill-button pill-button--primary" onClick={handleCreate}>
            Add Tag
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tags.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No tags yet.</div>
        )}
        {tags.map((tag) => (
          <div
            key={tag.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <TagChip tag={tag} />

            {editingId === tag.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(tag)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={() => handleRename(tag)}
                style={{ ...inputStyle, flex: 1 }}
              />
            ) : (
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setEditingId(tag.id); setEditName(tag.name) }}
                  title="Click to rename"
                >
                  {tag.name}
                </span>
              </span>
            )}

            <div style={{ display: 'flex', gap: 3 }}>
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => handleSetColor(tag, c)}
                  title={c}
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: c,
                    border: tag.color === c ? '2px solid var(--text-primary)' : '1px solid var(--border-strong)',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>

            <button
              className="pill-button"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: 12, padding: '3px 8px' }}
              onClick={() => handleDelete(tag)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  minWidth: 160
}
