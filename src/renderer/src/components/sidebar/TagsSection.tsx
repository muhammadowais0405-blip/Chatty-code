import { useEffect, useState } from 'react'
import { Tag as TagIcon } from 'lucide-react'
import type { Tag } from '@shared/types'
import TagChip from '../TagChip'

export default function TagsSection({
  activeTagId,
  onSelectTag
}: {
  activeTagId: number | null
  onSelectTag: (tagId: number | null) => void
}): JSX.Element {
  const [tags, setTags] = useState<Tag[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    window.api.tags.list().then(setTags)
  }, [])

  if (tags.length === 0) return <></>

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          cursor: 'default',
          userSelect: 'none'
        }}
      >
        <TagIcon size={11} />
        Tags
        <span style={{ marginLeft: 'auto' }}>{collapsed ? '▸' : '▾'}</span>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 6px' }}>
          {tags.map((tag) => (
            <div
              key={tag.id}
              onClick={() => onSelectTag(activeTagId === tag.id ? null : tag.id)}
              style={{
                cursor: 'pointer',
                outline: activeTagId === tag.id ? `2px solid ${tag.color ?? '#8b5cf6'}` : 'none',
                outlineOffset: 1,
                borderRadius: 999
              }}
            >
              <TagChip tag={tag} small />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
