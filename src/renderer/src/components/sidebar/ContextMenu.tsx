import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  key: string
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  submenu?: MenuItem[]
  /** Custom content instead of a plain label (used for color/icon pickers). */
  render?: () => React.ReactNode
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 100 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList items={items} onDone={onClose} />
    </div>
  )
}

function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }): JSX.Element {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)

  return (
    <div
      style={{
        minWidth: 220,
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        padding: 4,
        fontSize: 13
      }}
    >
      {items.map((item) => (
        <div key={item.key} style={{ position: 'relative' }}>
          <div
            onMouseEnter={() => setOpenSubmenu(item.submenu ? item.key : null)}
            onClick={() => {
              if (item.disabled || item.submenu) return
              item.onClick?.()
              onDone()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled
                ? 'var(--text-muted)'
                : item.danger
                  ? 'var(--danger)'
                  : 'var(--text-primary)',
              background: openSubmenu === item.key ? 'var(--bg-hover)' : 'transparent'
            }}
            onMouseDown={(e) => {
              // prevent losing focus/selection before onClick fires for plain items
              if (!item.submenu) e.stopPropagation()
            }}
          >
            {item.render ? (
              item.render()
            ) : (
              <>
                <span>{item.label}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.shortcut && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {item.shortcut}
                    </span>
                  )}
                  {item.submenu && <span style={{ color: 'var(--text-muted)' }}>▸</span>}
                </span>
              </>
            )}
          </div>

          {item.submenu && openSubmenu === item.key && (
            <div style={{ position: 'absolute', left: '100%', top: 0, marginLeft: 2 }}>
              <MenuList items={item.submenu} onDone={onDone} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
