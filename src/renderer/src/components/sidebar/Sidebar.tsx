import { useDroppable } from '@dnd-kit/core'
import { useEffect, useMemo, useState } from 'react'
import { Archive, Inbox } from 'lucide-react'
import type { Folder, FolderView } from '@shared/types'
import ContextMenu, { type MenuItem } from './ContextMenu'
import FolderRow from './FolderRow'
import { FOLDER_COLORS, FOLDER_ICONS } from './icons'

interface TreeNode {
  folder: Folder
  children: TreeNode[]
}

function buildTree(folders: Folder[]): TreeNode[] {
  const byParent = new Map<number | null, Folder[]>()
  for (const f of folders) {
    const list = byParent.get(f.parent_id) ?? []
    list.push(f)
    byParent.set(f.parent_id, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position)

  function build(parentId: number | null): TreeNode[] {
    return (byParent.get(parentId) ?? []).map((folder) => ({
      folder,
      children: build(folder.id)
    }))
  }
  return build(null)
}

export default function Sidebar({
  folders,
  selectedView,
  onSelectView,
  onFoldersChanged
}: {
  folders: Folder[]
  selectedView: FolderView
  onSelectView: (view: FolderView) => void
  onFoldersChanged: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; folder: Folder | null } | null>(null)

  const tree = useMemo(() => buildTree(folders), [folders])
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])

  const selectedFolder =
    typeof selectedView === 'number' ? (foldersById.get(selectedView) ?? null) : null

  function siblingsOf(parentId: number | null): Folder[] {
    return folders.filter((f) => f.parent_id === parentId).sort((a, b) => a.position - b.position)
  }

  async function handleCreateFolder(parentId: number | null): Promise<void> {
    const created = await window.api.folders.create({ parentId, name: 'New Folder' })
    if (parentId !== null) setExpanded((prev) => new Set(prev).add(parentId))
    onFoldersChanged()
    setRenamingId(created.id)
  }

  async function handleRenameCommit(folder: Folder, name: string): Promise<void> {
    setRenamingId(null)
    const trimmed = name.trim()
    if (trimmed && trimmed !== folder.name) {
      await window.api.folders.rename({ id: folder.id, name: trimmed })
      onFoldersChanged()
    }
  }

  async function handleMove(folder: Folder, direction: 'up' | 'down'): Promise<void> {
    const siblings = siblingsOf(folder.parent_id)
    const index = siblings.findIndex((f) => f.id === folder.id)
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= siblings.length) return
    const orderedIds = siblings.map((f) => f.id)
    ;[orderedIds[index], orderedIds[swapWith]] = [orderedIds[swapWith], orderedIds[index]]
    await window.api.folders.reorder({ parentId: folder.parent_id, orderedIds })
    onFoldersChanged()
  }

  async function handleSort(
    parentId: number | null,
    by: 'name' | 'date' | 'messageCount' | 'manual'
  ): Promise<void> {
    if (by === 'manual') return // manual = leave current drag order as-is
    const siblings = [...siblingsOf(parentId)]
    if (by === 'name') siblings.sort((a, b) => a.name.localeCompare(b.name))
    if (by === 'date') siblings.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (by === 'messageCount') siblings.sort((a, b) => (b.chatCount ?? 0) - (a.chatCount ?? 0))
    await window.api.folders.reorder({ parentId, orderedIds: siblings.map((f) => f.id) })
    onFoldersChanged()
  }

  async function handleDelete(folder: Folder): Promise<void> {
    const confirmed = window.confirm(
      `Delete "${folder.name}"? Chats inside it (and any subfolders) will move to Trash.`
    )
    if (!confirmed) return
    await window.api.folders.delete(folder.id)
    if (selectedView === folder.id) onSelectView('all')
    onFoldersChanged()
  }

  function buildContextMenuItems(folder: Folder): MenuItem[] {
    return [
      {
        key: 'new-folder',
        label: 'New Folder',
        shortcut: 'Ctrl+Shift+N',
        onClick: () => handleCreateFolder(folder.parent_id)
      },
      {
        key: 'new-subfolder',
        label: 'New Subfolder',
        shortcut: 'Alt+N',
        onClick: () => handleCreateFolder(folder.id)
      },
      { key: 'rename', label: 'Rename', shortcut: 'F2', onClick: () => setRenamingId(folder.id) },
      { key: 'move-up', label: 'Move Up', onClick: () => handleMove(folder, 'up') },
      { key: 'move-down', label: 'Move Down', onClick: () => handleMove(folder, 'down') },
      {
        key: 'sort',
        label: 'Sort Current Level By',
        submenu: [
          { key: 'sort-name', label: 'Name', onClick: () => handleSort(folder.parent_id, 'name') },
          {
            key: 'sort-date',
            label: 'Date Added',
            onClick: () => handleSort(folder.parent_id, 'date')
          },
          {
            key: 'sort-count',
            label: 'Message Count',
            onClick: () => handleSort(folder.parent_id, 'messageCount')
          },
          {
            key: 'sort-manual',
            label: 'Manual',
            onClick: () => handleSort(folder.parent_id, 'manual')
          }
        ]
      },
      {
        key: 'color',
        label: 'Assign Color',
        submenu: [
          {
            key: 'color-swatches',
            label: 'swatches',
            render: () => (
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', width: 160 }}
              >
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={async () => {
                      await window.api.folders.setColor({ id: folder.id, color })
                      onFoldersChanged()
                      setMenu(null)
                    }}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: color,
                      border:
                        folder.color === color
                          ? '2px solid var(--text-primary)'
                          : '1px solid var(--border-strong)',
                      cursor: 'pointer'
                    }}
                    title={color}
                  />
                ))}
                <button
                  onClick={async () => {
                    await window.api.folders.setColor({ id: folder.id, color: null })
                    onFoldersChanged()
                    setMenu(null)
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'transparent',
                    border: '1px dashed var(--border-strong)',
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    cursor: 'pointer'
                  }}
                  title="Clear color"
                >
                  ✕
                </button>
              </div>
            )
          }
        ]
      },
      {
        key: 'icon',
        label: 'Change Icon',
        submenu: [
          {
            key: 'icon-grid',
            label: 'grid',
            render: () => (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 4,
                  padding: '6px 8px',
                  width: 180
                }}
              >
                {FOLDER_ICONS.map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={async () => {
                      await window.api.folders.setIcon({ id: folder.id, icon: key })
                      onFoldersChanged()
                      setMenu(null)
                    }}
                    title={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 6,
                      borderRadius: 6,
                      background: folder.icon === key ? 'var(--bg-selected)' : 'transparent',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </div>
            )
          }
        ]
      },
      {
        key: 'delete',
        label: 'Delete Folder',
        danger: true,
        onClick: () => handleDelete(folder)
      }
    ]
  }

  // Global keyboard shortcuts: Ctrl+Shift+N (new sibling of selection),
  // Alt+N (new subfolder of selection), F2 (rename selection).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        handleCreateFolder(selectedFolder ? selectedFolder.parent_id : null)
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (selectedFolder) handleCreateFolder(selectedFolder.id)
      } else if (e.key === 'F2') {
        e.preventDefault()
        if (selectedFolder) setRenamingId(selectedFolder.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder])

  function renderNode(node: TreeNode, depth: number): JSX.Element {
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.folder.id)
    return (
      <div key={node.folder.id}>
        <FolderRow
          folder={node.folder}
          depth={depth}
          hasChildren={hasChildren}
          expanded={isExpanded}
          selected={selectedView === node.folder.id}
          isRenaming={renamingId === node.folder.id}
          onToggleExpand={() =>
            setExpanded((prev) => {
              const next = new Set(prev)
              if (next.has(node.folder.id)) next.delete(node.folder.id)
              else next.add(node.folder.id)
              return next
            })
          }
          onSelect={() => onSelectView(node.folder.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSelectView(node.folder.id)
            setMenu({ x: e.clientX, y: e.clientY, folder: node.folder })
          }}
          onRenameCommit={(name) => handleRenameCommit(node.folder, name)}
          onRenameCancel={() => setRenamingId(null)}
        />
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({ id: 'root-dropzone' })

  return (
    <>
      <div
        ref={setRootDropRef}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, folder: null })
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          borderRadius: 'var(--radius-sm)',
          background: isOverRoot ? 'var(--bg-hover)' : 'transparent'
        }}
      >
        <PseudoRow
          icon={<Inbox size={14} />}
          label="All"
          selected={selectedView === 'all'}
          onClick={() => onSelectView('all')}
        />

        <div style={{ flex: 1, overflowY: 'auto', marginTop: 4 }}>
          {tree.map((node) => renderNode(node, 0))}
        </div>

        <PseudoRow
          icon={<Archive size={14} />}
          label="Trash"
          selected={selectedView === 'trash'}
          onClick={() => onSelectView('trash')}
        />
      </div>

      {menu &&
        (menu.folder ? (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={buildContextMenuItems(menu.folder)}
            onClose={() => setMenu(null)}
          />
        ) : (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={[
              {
                key: 'new-folder-root',
                label: 'New Folder',
                shortcut: 'Ctrl+Shift+N',
                onClick: () => handleCreateFolder(null)
              }
            ]}
            onClose={() => setMenu(null)}
          />
        ))}
    </>
  )
}

function PseudoRow({
  icon,
  label,
  selected,
  onClick
}: {
  icon: React.ReactNode
  label: string
  selected: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13,
        cursor: 'default',
        transition: 'background 0.1s',
        background: selected ? 'var(--accent-dim)' : 'transparent',
        boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : 'none',
        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)'
      }}
    >
      {icon}
      {label}
    </div>
  )
}
