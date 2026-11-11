import { useDraggable } from '@dnd-kit/core'
import { CheckSquare, Folder as FolderIcon, MessageSquare, Square, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChatSummary, Folder, Tag } from '@shared/types'
import ContextMenu, { type MenuItem } from '../sidebar/ContextMenu'
import TagChip from '../TagChip'
import EmptyState from '../EmptyState'
import { parseChatTagSummary } from '../../utils/tags'
import { avatarColor, initials } from '../../utils/avatar'

export default function ChatList({
  chats,
  folders,
  selectedChatId,
  onOpenChat,
  emptyLabel,
  emptyIcon,
  isTrashView,
  onTrash,
  onRestore,
  onDeletePermanent,
  onChatsChanged,
  onBulkChanged,
  onImportClick
}: {
  chats: ChatSummary[]
  folders: Folder[]
  selectedChatId: number | null
  onOpenChat: (chatId: number) => void
  emptyLabel: string
  emptyIcon?: React.ReactNode
  isTrashView: boolean
  onTrash: (chatId: number) => void
  onRestore: (chatId: number) => void
  onDeletePermanent: (chatId: number) => void
  onChatsChanged: () => void
  onBulkChanged: () => void
  onImportClick?: () => void
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; chat: ChatSummary } | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkMenu, setBulkMenu] = useState<{ x: number; y: number; kind: 'move' | 'tag' } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    window.api.tags.list().then(setAllTags)
  }, [])

  // Reset selection when the underlying list changes context (folder/tag/search switch)
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [isTrashView])

  // Drop selected ids that are no longer in the visible list (folder/search/tag switch, etc.)
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(chats.map((c) => c.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [chats])

  function toggleSelected(id: number): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectionMode(): void {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  async function bulkMoveTo(folderId: number | null): Promise<void> {
    setBulkBusy(true)
    setBulkMenu(null)
    try {
      await Promise.all(
        [...selectedIds].map((id) => window.api.chats.move({ chatId: id, targetFolderId: folderId }))
      )
    } finally {
      setBulkBusy(false)
      exitSelectionMode()
      onBulkChanged()
    }
  }

  async function bulkTag(tagId: number): Promise<void> {
    setBulkBusy(true)
    setBulkMenu(null)
    try {
      await Promise.all([...selectedIds].map((id) => window.api.tags.assign(id, tagId)))
    } finally {
      setBulkBusy(false)
      onChatsChanged()
      // keep selection active so multiple tags can be applied in a row
    }
  }

  async function bulkTrash(): Promise<void> {
    setBulkBusy(true)
    try {
      await Promise.all([...selectedIds].map((id) => window.api.chats.trash(id)))
    } finally {
      setBulkBusy(false)
      exitSelectionMode()
      onBulkChanged()
    }
  }

  async function bulkRestore(): Promise<void> {
    setBulkBusy(true)
    try {
      await Promise.all([...selectedIds].map((id) => window.api.chats.restore(id)))
    } finally {
      setBulkBusy(false)
      exitSelectionMode()
      onBulkChanged()
    }
  }

  async function bulkDeletePermanent(): Promise<void> {
    if (!window.confirm(`Permanently delete ${selectedIds.size} chat(s)? This can't be undone.`)) return
    setBulkBusy(true)
    try {
      await Promise.all([...selectedIds].map((id) => window.api.chats.deletePermanent(id)))
    } finally {
      setBulkBusy(false)
      exitSelectionMode()
      onBulkChanged()
    }
  }

  function buildMenuItems(chat: ChatSummary): MenuItem[] {
    const chatTags = parseChatTagSummary(chat.tagSummary)
    const chatTagIds = new Set(chatTags.map((t) => t.id))
    const tagItems: MenuItem[] = allTags.map((tag) => ({
      key: `tag-${tag.id}`,
      label: chatTagIds.has(tag.id) ? `✓ ${tag.name}` : tag.name,
      onClick: async () => {
        if (chatTagIds.has(tag.id)) await window.api.tags.unassign(chat.id, tag.id)
        else await window.api.tags.assign(chat.id, tag.id)
        onChatsChanged()
      }
    }))

    if (isTrashView) {
      return [
        { key: 'restore', label: 'Restore', onClick: () => onRestore(chat.id) },
        {
          key: 'delete-permanent', label: 'Delete Permanently', danger: true,
          onClick: () => {
            if (window.confirm(`Permanently delete "${chat.title}"? This can't be undone.`))
              onDeletePermanent(chat.id)
          }
        }
      ]
    }
    return [
      { key: 'select', label: 'Select…', onClick: () => { setSelectionMode(true); toggleSelected(chat.id) } },
      { key: 'rename', label: 'Rename', onClick: () => { setRenamingId(chat.id); setRenameValue(chat.title) } },
      { key: 'tags', label: 'Tags', submenu: tagItems.length > 0 ? tagItems : [{ key: 'no-tags', label: 'No tags yet — create in Settings', disabled: true }] },
      { key: 'trash', label: 'Move to Trash', danger: true, onClick: () => onTrash(chat.id) }
    ]
  }

  async function commitRename(chatId: number): Promise<void> {
    const title = renameValue.trim()
    setRenamingId(null)
    if (title) { await window.api.chats.rename({ chatId, title }); onChatsChanged() }
  }

  const folderMenuItems: MenuItem[] = [
    { key: 'root', label: '(root — no folder)', onClick: () => bulkMoveTo(null) },
    ...folders.filter((f) => !f.is_trashed).map((f) => ({
      key: `f-${f.id}`,
      label: f.name,
      onClick: () => bulkMoveTo(f.id)
    }))
  ]

  const tagMenuItems: MenuItem[] =
    allTags.length > 0
      ? allTags.map((t) => ({ key: `bt-${t.id}`, label: t.name, onClick: () => bulkTag(t.id) }))
      : [{ key: 'no-tags', label: 'No tags yet — create in Settings', disabled: true }]

  if (chats.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? <MessageSquare size={26} />}
        title={emptyLabel}
        body={
          isTrashView
            ? 'Deleted chats end up here. Restore them or delete forever.'
            : 'Import a chat to get started, or select a different folder.'
        }
        action={
          !isTrashView && onImportClick
            ? { label: 'Import chat', onClick: onImportClick }
            : undefined
        }
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* Selection toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
        borderBottom: '1px solid var(--border-subtle)', minHeight: 34, flexShrink: 0
      }}>
        {selectionMode ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {selectedIds.size} selected
            </span>
            <div style={{ flex: 1 }} />
            {!isTrashView && (
              <>
                <button
                  className="icon-btn" title="Move to folder…" disabled={selectedIds.size === 0 || bulkBusy}
                  onClick={(e) => setBulkMenu({ x: e.clientX, y: e.clientY, kind: 'move' })}
                  style={{ width: 26, height: 26 }}
                >
                  <FolderIcon size={13} />
                </button>
                <button
                  className="icon-btn" title="Add tag…" disabled={selectedIds.size === 0 || bulkBusy}
                  onClick={(e) => setBulkMenu({ x: e.clientX, y: e.clientY, kind: 'tag' })}
                  style={{ width: 26, height: 26 }}
                >
                  <TagIcon size={13} />
                </button>
                <button
                  className="icon-btn" title="Move to trash" disabled={selectedIds.size === 0 || bulkBusy}
                  onClick={bulkTrash}
                  style={{ width: 26, height: 26, color: 'var(--danger)' }}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
            {isTrashView && (
              <>
                <button className="pill-button" disabled={selectedIds.size === 0 || bulkBusy} onClick={bulkRestore} style={{ fontSize: 11, padding: '3px 9px' }}>
                  Restore
                </button>
                <button className="pill-button" disabled={selectedIds.size === 0 || bulkBusy} onClick={bulkDeletePermanent} style={{ fontSize: 11, padding: '3px 9px', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                  Delete Forever
                </button>
              </>
            )}
            <button className="icon-btn" title="Cancel selection" onClick={exitSelectionMode} style={{ width: 26, height: 26 }}>
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <div style={{ flex: 1 }} />
            <button
              className="icon-btn" title="Select multiple"
              onClick={() => setSelectionMode(true)}
              style={{ width: 26, height: 26 }}
            >
              <CheckSquare size={13} />
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, overflowY: 'auto', flex: 1 }}>
        {chats.map((chat) => (
          <ChatCard
            key={chat.id}
            chat={chat}
            selected={chat.id === selectedChatId}
            isRenaming={renamingId === chat.id}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameCommit={() => commitRename(chat.id)}
            onRenameCancel={() => setRenamingId(null)}
            selectionMode={selectionMode}
            checked={selectedIds.has(chat.id)}
            onToggleChecked={() => toggleSelected(chat.id)}
            onClick={() => (selectionMode ? toggleSelected(chat.id) : onOpenChat(chat.id))}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, chat }) }}
          />
        ))}
        {menu && (
          <ContextMenu
            x={menu.x} y={menu.y}
            items={buildMenuItems(menu.chat)}
            onClose={() => setMenu(null)}
          />
        )}
        {bulkMenu && (
          <ContextMenu
            x={bulkMenu.x} y={bulkMenu.y}
            items={bulkMenu.kind === 'move' ? folderMenuItems : tagMenuItems}
            onClose={() => setBulkMenu(null)}
          />
        )}
      </div>
    </div>
  )
}

function ChatCard({
  chat, selected, isRenaming, renameValue,
  onRenameChange, onRenameCommit, onRenameCancel, onClick, onContextMenu,
  selectionMode, checked, onToggleChecked
}: {
  chat: ChatSummary
  selected: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selectionMode: boolean
  checked: boolean
  onToggleChecked: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chat-${chat.id}`,
    disabled: selectionMode
  })
  const tags = parseChatTagSummary(chat.tagSummary)
  const avatarName = chat.character_name ?? chat.title
  const color = avatarColor(avatarName)

  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      onClick={onClick} onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '10px 10px',
        borderRadius: 'var(--radius-md)',
        border: selected ? `1px solid ${color}55` : checked ? '1px solid var(--accent)' : '1px solid transparent',
        background: checked ? 'var(--accent-dim)' : selected ? `${color}18` : 'transparent',
        cursor: 'default',
        opacity: isDragging ? 0.4 : 1,
        transition: 'background 0.1s, border-color 0.1s'
      }}
    >
      {selectionMode && (
        <div
          onClick={(e) => { e.stopPropagation(); onToggleChecked() }}
          style={{ flexShrink: 0, color: checked ? 'var(--accent)' : 'var(--text-muted)', display: 'flex' }}
        >
          {checked ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>
      )}

      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          background: chat.thumbnailAttachmentId ? '#000' : color + '28',
          border: `1.5px solid ${color}55`,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 700,
          color: color,
          letterSpacing: -0.5
        }}
      >
        {chat.thumbnailAttachmentId ? (
          <img
            src={`app://attachment/${chat.thumbnailAttachmentId}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          initials(avatarName) || <MessageSquare size={18} color={color} />
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel() }}
            onBlur={onRenameCommit}
            style={{
              width: '100%', padding: '2px 5px', fontSize: 13, fontWeight: 600,
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--accent)', borderRadius: 4, outline: 'none'
            }}
          />
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
            {chat.title}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {chat.message_count} msgs · {formatDate(chat.imported_at)}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
            {tags.map((tag) => <TagChip key={tag.id} tag={tag} small />)}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
