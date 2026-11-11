import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Folder } from '@shared/types'
import { getFolderIcon } from './icons'

export default function FolderRow({
  folder, depth, hasChildren, expanded, selected, isRenaming,
  onToggleExpand, onSelect, onContextMenu, onRenameCommit, onRenameCancel
}: {
  folder: Folder
  depth: number
  hasChildren: boolean
  expanded: boolean
  selected: boolean
  isRenaming: boolean
  onToggleExpand: () => void
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onRenameCommit: (name: string) => void
  onRenameCancel: () => void
}): JSX.Element {
  const dragId = `folder-${folder.id}`
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: dragId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId })

  const Icon = getFolderIcon(folder.icon)
  const [draftName, setDraftName] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      setDraftName(folder.name)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [isRenaming, folder.name])

  const accentColor = folder.color ?? 'var(--accent)'

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 8px',
        paddingLeft: 8 + depth * 16,
        borderRadius: 'var(--radius-sm)',
        fontSize: 13,
        cursor: 'default',
        opacity: isDragging ? 0.4 : 1,
        transition: 'background 0.1s',
        background: isOver
          ? 'var(--bg-hover)'
          : selected
          ? `${accentColor}18`
          : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${accentColor}` : 'none',
        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)'
      }}
    >
      <span
        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand() }}
        style={{
          width: 14, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)',
          visibility: hasChildren ? 'visible' : 'hidden'
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>

      <Icon size={13} color={folder.color ?? (selected ? 'var(--accent)' : 'var(--text-muted)')} />

      {isRenaming ? (
        <input
          ref={inputRef}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit(draftName)
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={() => onRenameCommit(draftName)}
          style={{
            flex: 1, background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 5px', fontSize: 12, outline: 'none'
          }}
        />
      ) : (
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13
        }}>
          {folder.name}
        </span>
      )}

      {typeof folder.chatCount === 'number' && folder.chatCount > 0 && !isRenaming && (
        <span style={{
          color: 'var(--text-muted)', fontSize: 10, fontWeight: 500,
          background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-pill)',
          padding: '1px 5px', flexShrink: 0
        }}>
          {folder.chatCount}
        </span>
      )}
    </div>
  )
}
