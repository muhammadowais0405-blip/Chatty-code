import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Clipboard,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2
} from 'lucide-react'
import type { PromptBlock, PromptRole, PromptSet } from '@shared/types'

const ROLE_COLORS: Record<PromptRole, string> = {
  system: '#8b5cf6',
  user: '#4a6fc2',
  assistant: '#2d7a5e'
}

export default function PromptsLibrary(): JSX.Element {
  const [sets, setSets] = useState<PromptSet[]>([])
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null)
  const [renamingSetId, setRenamingSetId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function refreshSets(): void {
    window.api.promptSets.list().then((list) => {
      setSets(list)
      if (selectedSetId === null && list.length > 0) setSelectedSetId(list[0].id)
    })
  }

  useEffect(() => { refreshSets() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateSet(): Promise<void> {
    const set = await window.api.promptSets.create({ name: 'New Prompt Set' })
    setSets((prev) => [...prev, set])
    setSelectedSetId(set.id)
    setRenamingSetId(set.id)
    setRenameValue(set.name)
  }

  async function commitRename(id: number): Promise<void> {
    const name = renameValue.trim()
    setRenamingSetId(null)
    if (name) {
      const updated = await window.api.promptSets.rename({ id, name })
      setSets((prev) => prev.map((s) => (s.id === id ? updated : s)))
    }
  }

  async function handleDeleteSet(id: number): Promise<void> {
    if (!window.confirm('Delete this prompt set and all its blocks?')) return
    await window.api.promptSets.delete(id)
    const remaining = sets.filter((s) => s.id !== id)
    setSets(remaining)
    if (selectedSetId === id) setSelectedSetId(remaining[0]?.id ?? null)
  }

  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: sets list */}
      <div style={{
        width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border-subtle)', overflowY: 'auto'
      }}>
        <div style={{ padding: '12px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Prompt Sets</span>
          <button className="icon-btn" onClick={handleCreateSet} title="New prompt set" style={{ width: 26, height: 26 }}>
            <Plus size={14} />
          </button>
        </div>

        {sets.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            No prompt sets yet. A "set" mirrors a SillyTavern completion preset — an ordered
            stack of named blocks. Click + to create one.
          </div>
        )}

        {sets.map((set) => (
          <div
            key={set.id}
            onClick={() => setSelectedSetId(set.id)}
            onDoubleClick={() => { setRenamingSetId(set.id); setRenameValue(set.name) }}
            style={{
              padding: '8px 12px', cursor: 'default', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6,
              background: selectedSetId === set.id ? 'var(--bg-selected)' : 'transparent',
              boxShadow: selectedSetId === set.id ? 'inset 3px 0 0 var(--accent)' : 'none',
              color: selectedSetId === set.id ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            {renamingSetId === set.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(set.id); if (e.key === 'Escape') setRenamingSetId(null) }}
                onBlur={() => commitRename(set.id)}
                style={{
                  flex: 1, padding: '2px 4px', fontSize: 12,
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  border: '1px solid var(--accent)', borderRadius: 4, outline: 'none'
                }}
              />
            ) : (
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {set.name}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Right: blocks for selected set */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {selectedSet ? (
          <BlockEditor set={selectedSet} onDeleteSet={() => handleDeleteSet(selectedSet.id)} />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, color: 'var(--text-muted)'
          }}>
            <Clipboard size={32} strokeWidth={1.5} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>No prompt set selected</div>
              <div style={{ fontSize: 12 }}>Create one on the left to start adding blocks.</div>
            </div>
            <button className="pill-button pill-button--primary" onClick={handleCreateSet}>
              <Plus size={13} /> New Prompt Set
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function BlockEditor({ set, onDeleteSet }: { set: PromptSet; onDeleteSet: () => void }): JSX.Element {
  const [blocks, setBlocks] = useState<PromptBlock[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function refreshBlocks(): void {
    window.api.promptBlocks.list(set.id).then((list) => {
      setBlocks(list)
      setSelectedBlockId((prev) => (prev && list.some((b) => b.id === prev) ? prev : (list[0]?.id ?? null)))
    })
  }

  useEffect(() => { refreshBlocks() }, [set.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddBlock(): Promise<void> {
    const block = await window.api.promptBlocks.create({
      setId: set.id, name: 'New Block', role: 'system', content: ''
    })
    setBlocks((prev) => [...prev, block])
    setSelectedBlockId(block.id)
  }

  async function handleDeleteBlock(id: number): Promise<void> {
    if (!window.confirm('Delete this block?')) return
    await window.api.promptBlocks.delete(id)
    const remaining = blocks.filter((b) => b.id !== id)
    setBlocks(remaining)
    if (selectedBlockId === id) setSelectedBlockId(remaining[0]?.id ?? null)
  }

  async function handleToggleEnabled(block: PromptBlock): Promise<void> {
    const updated = await window.api.promptBlocks.setEnabled({ id: block.id, enabled: !block.enabled })
    setBlocks((prev) => prev.map((b) => (b.id === block.id ? updated : b)))
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex((b) => b.id === active.id)
    const newIndex = blocks.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(blocks, oldIndex, newIndex)
    setBlocks(reordered)
    await window.api.promptBlocks.reorder({ setId: set.id, orderedIds: reordered.map((b) => b.id) })
  }

  async function copyAssembled(): Promise<void> {
    const text = blocks
      .filter((b) => b.enabled)
      .map((b) => b.content)
      .filter(Boolean)
      .join('\n\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null
  const enabledCount = blocks.filter((b) => b.enabled).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0
      }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{set.name}</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {enabledCount}/{blocks.length} enabled
        </span>
        <button className="pill-button" onClick={copyAssembled} disabled={blocks.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          {copied ? <Check size={12} color="var(--success)" /> : <Clipboard size={12} />}
          {copied ? 'Copied!' : 'Copy Assembled'}
        </button>
        <button className="icon-btn" title="Delete set" onClick={onDeleteSet} style={{ width: 28, height: 28, color: 'var(--danger)' }}>
          <Trash2 size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Block list (draggable) */}
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map((block) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    selected={block.id === selectedBlockId}
                    onSelect={() => setSelectedBlockId(block.id)}
                    onToggleEnabled={() => handleToggleEnabled(block)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          <button
            className="pill-button"
            onClick={handleAddBlock}
            style={{ margin: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={13} /> Add Block
          </button>
        </div>

        {/* Block content editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedBlock ? (
            <BlockContentEditor
              key={selectedBlock.id}
              block={selectedBlock}
              onSave={async (patch) => {
                const updated = await window.api.promptBlocks.update({ id: selectedBlock.id, ...patch })
                // The block may have been deleted while an autosave was pending.
                if (!updated) return
                setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
              }}
              onDelete={() => handleDeleteBlock(selectedBlock.id)}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
              {blocks.length === 0 ? 'Add a block to get started.' : 'Select a block to edit.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BlockRow({
  block, selected, onSelect, onToggleEnabled
}: {
  block: PromptBlock
  selected: boolean
  onSelect: () => void
  onToggleEnabled: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const color = ROLE_COLORS[block.role]

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : block.enabled ? 1 : 0.5
      }}
      onClick={onSelect}
      className="prompt-block-row"
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px',
        borderRadius: 6, cursor: 'default', marginBottom: 2,
        background: selected ? 'var(--bg-selected)' : 'transparent',
        boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : 'none'
      }}>
        <span {...attributes} {...listeners} style={{ display: 'flex', color: 'var(--text-muted)', cursor: 'grab', touchAction: 'none' }}>
          <GripVertical size={13} />
        </span>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0
        }} title={block.role} />
        <span style={{
          flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: selected ? 'var(--text-primary)' : 'var(--text-secondary)'
        }}>
          {block.name}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); onToggleEnabled() }}
          style={{ display: 'flex', color: block.enabled ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: 'pointer' }}
          title={block.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        >
          {block.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
        </span>
      </div>
    </div>
  )
}

function BlockContentEditor({
  block, onSave, onDelete
}: {
  block: PromptBlock
  onSave: (patch: { name: string; role: PromptRole; content: string }) => Promise<void>
  onDelete: () => void
}): JSX.Element {
  const [name, setName] = useState(block.name)
  const [role, setRole] = useState<PromptRole>(block.role)
  const [content, setContent] = useState(block.content)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Always-current values, used by the autosave timer and the unmount flush.
  const latest = useRef({ name, role, content, dirty, onSave })
  latest.current = { name, role, content, dirty, onSave }

  function mark<T>(setter: (v: T) => void): (v: T) => void {
    return (v) => { setter(v); setDirty(true) }
  }

  async function save(): Promise<void> {
    const snap = latest.current
    setSaving(true)
    try {
      await snap.onSave({ name: snap.name, role: snap.role, content: snap.content })
      const cur = latest.current
      // only clear "dirty" if nothing was typed while the save was running
      if (cur.name === snap.name && cur.role === snap.role && cur.content === snap.content) {
        setDirty(false)
      }
    } finally {
      setSaving(false)
    }
  }

  // Autosave 0.8s after the last keystroke.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => { void save() }, 800)
    return () => clearTimeout(t)
  }, [name, role, content, dirty]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending edits when switching blocks/sets or leaving the view.
  useEffect(() => {
    return () => {
      const l = latest.current
      if (l.dirty) void l.onSave({ name: l.name, role: l.role, content: l.content })
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={(e) => mark(setName)(e.target.value)}
          placeholder="Block name"
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <select value={role} onChange={(e) => mark(setRole)(e.target.value as PromptRole)} style={{ ...inputStyle, minWidth: 110 }}>
          <option value="system">System</option>
          <option value="user">User</option>
          <option value="assistant">Assistant</option>
        </select>
      </div>

      <textarea
        className="selectable"
        value={content}
        onChange={(e) => mark(setContent)(e.target.value)}
        placeholder="Block content…"
        style={{
          flex: 1, padding: '10px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
          fontSize: 13, lineHeight: 1.6, resize: 'none', outline: 'none', fontFamily: 'var(--font-sans)'
        }}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{content.length} chars</span>
        <div style={{ flex: 1 }} />
        <button className="pill-button" onClick={onDelete} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Delete block">
          <Trash2 size={13} />
        </button>
        <button className="pill-button pill-button--primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none'
}
