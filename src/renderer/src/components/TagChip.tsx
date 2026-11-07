import type { Tag } from '@shared/types'

export default function TagChip({
  tag,
  onRemove,
  small
}: {
  tag: Tag
  onRemove?: () => void
  small?: boolean
}): JSX.Element {
  const bg = tag.color ?? '#706f7a'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: small ? '1px 6px' : '2px 8px',
        borderRadius: 999,
        background: bg + '33', // 20% alpha
        border: `1px solid ${bg}66`,
        color: bg,
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      {tag.name}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{ cursor: 'pointer', lineHeight: 1, marginLeft: 1 }}
        >
          ✕
        </span>
      )}
    </span>
  )
}
