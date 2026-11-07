import type { DragEndEvent } from '@dnd-kit/core'
import type { Folder } from '@shared/types'

export async function handleAppDragEnd(
  event: DragEndEvent,
  ctx: {
    folders: Folder[]
    onFoldersChanged: () => void
    onChatMoved: () => void
  }
): Promise<void> {
  const { active, over } = event
  if (!over) return

  const activeId = String(active.id)
  const overId = String(over.id)
  const foldersById = new Map(ctx.folders.map((f) => [f.id, f]))

  function siblingsOf(parentId: number | null): Folder[] {
    return ctx.folders
      .filter((f) => f.parent_id === parentId)
      .sort((a, b) => a.position - b.position)
  }

  // ---- dragging a chat card onto a folder (or back to root) ----
  if (activeId.startsWith('chat-')) {
    const chatId = Number(activeId.replace('chat-', ''))
    const targetFolderId =
      overId === 'root-dropzone' ? null : Number(overId.replace('folder-', ''))
    await window.api.chats.move({ chatId, targetFolderId })
    ctx.onChatMoved()
    return
  }

  // ---- dragging a folder onto root (send to top level) ----
  if (!activeId.startsWith('folder-')) return
  const draggedId = Number(activeId.replace('folder-', ''))

  if (overId === 'root-dropzone') {
    const rootSiblings = siblingsOf(null).filter((f) => f.id !== draggedId)
    try {
      await window.api.folders.move({
        id: draggedId,
        newParentId: null,
        newPosition: rootSiblings.length
      })
      ctx.onFoldersChanged()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
    return
  }

  // ---- dragging a folder onto another folder (reparent, inserted before target) ----
  const targetId = Number(overId.replace('folder-', ''))
  if (targetId === draggedId) return
  const target = foldersById.get(targetId)
  if (!target) return

  try {
    await window.api.folders.move({
      id: draggedId,
      newParentId: target.parent_id,
      newPosition: target.position
    })
    ctx.onFoldersChanged()
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  }
}
