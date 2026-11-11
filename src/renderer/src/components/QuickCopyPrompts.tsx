import { Zap } from 'lucide-react'
import { useState } from 'react'
import ContextMenu, { type MenuItem } from './sidebar/ContextMenu'

export default function QuickCopyPrompts(): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function openMenu(e: React.MouseEvent): Promise<void> {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  async function copySet(setId: number, name: string): Promise<void> {
    const blocks = await window.api.promptBlocks.list(setId)
    const text = blocks
      .filter((b) => b.enabled)
      .map((b) => b.content)
      .filter(Boolean)
      .join('\n\n')
    await navigator.clipboard.writeText(text)
    setToast(`Copied "${name}"`)
    setTimeout(() => setToast(null), 1800)
  }

  const [items, setItems] = useState<MenuItem[] | null>(null)

  async function handleOpen(e: React.MouseEvent): Promise<void> {
    const sets = await window.api.promptSets.list()
    setItems(
      sets.length > 0
        ? sets.map((s) => ({ key: `qc-${s.id}`, label: s.name, onClick: () => copySet(s.id, s.name) }))
        : [{ key: 'none', label: 'No prompt sets yet', disabled: true }]
    )
    openMenu(e)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={handleOpen} title="Quick-copy a prompt set">
        <Zap size={16} />
      </button>

      {menu && items && (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 46,
            right: 16,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 14px',
            fontSize: 12,
            color: 'var(--text-primary)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            zIndex: 300
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
