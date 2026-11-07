import { useEffect, useState } from 'react'
import { Archive, FileImage, Folder, MessageSquare, ScrollText, Tag } from 'lucide-react'
import type { LibraryStats } from '@shared/types'
import { avatarColor, initials } from '../utils/avatar'

export default function LibraryStatsView(): JSX.Element {
  const [stats, setStats] = useState<LibraryStats | null>(null)

  useEffect(() => {
    window.api.stats.get().then(setStats)
  }, [])

  if (!stats) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
  }

  const maxMonthCount = Math.max(1, ...stats.importsByMonth.map((m) => m.count))

  return (
    <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ margin: 0 }}>Library stats</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <MetricCard icon={<MessageSquare size={16} />} label="Chats" value={stats.totalChats} />
        <MetricCard icon={<ScrollText size={16} />} label="Messages" value={stats.totalMessages} />
        <MetricCard icon={<FileImage size={16} />} label="Images" value={stats.totalAttachments} />
        <MetricCard icon={<Folder size={16} />} label="Folders" value={stats.totalFolders} />
        <MetricCard icon={<Tag size={16} />} label="Tags" value={stats.totalTags} />
        <MetricCard icon={<Archive size={16} />} label="In trash" value={stats.trashedCount} />
      </div>

      <div>
        <SectionLabel>Most-archived characters</SectionLabel>
        {stats.topCharacters.length === 0 ? (
          <EmptyNote>No characters yet — import a chat to see this fill in.</EmptyNote>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats.topCharacters.map((c) => {
              const color = avatarColor(c.name)
              const pct = Math.round(
                (c.chatCount / Math.max(1, stats.topCharacters[0].chatCount)) * 100
              )
              return (
                <div
                  key={c.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div
                    style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: color + '28', border: `1.5px solid ${color}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color
                    }}
                  >
                    {initials(c.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {c.chatCount} chat{c.chatCount !== 1 ? 's' : ''} · {c.messageCount} msgs
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Imports over time</SectionLabel>
        {stats.importsByMonth.length === 0 ? (
          <EmptyNote>No import history yet.</EmptyNote>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 6, height: 120,
            padding: '10px 12px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)'
          }}>
            {stats.importsByMonth.map((m) => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.count}</span>
                <div
                  title={`${m.month}: ${m.count} chat(s)`}
                  style={{
                    width: '100%',
                    height: `${Math.max(4, (m.count / maxMonthCount) * 80)}px`,
                    background: 'var(--accent)',
                    borderRadius: '3px 3px 0 0',
                    opacity: 0.85
                  }}
                />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatMonth(m.month)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }): JSX.Element {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)', padding: '12px 14px'
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)',
        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {value.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }): JSX.Element {
  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{children}</div>
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'short' })
}
