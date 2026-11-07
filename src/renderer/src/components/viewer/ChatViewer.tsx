import { useVirtualizer } from '@tanstack/react-virtual'
import { File as FileIcon, ImageOff, LinkIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, ChatDetail, Message } from '@shared/types'
import Lightbox from './Lightbox'
import { avatarColor, initials } from '../../utils/avatar'

export default function ChatViewer({ chatId }: { chatId: number }): JSX.Element {
  const [detail, setDetail] = useState<ChatDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lightboxId, setLightboxId] = useState<number | null>(null)
  const [relinkState, setRelinkState] = useState<
    'idle' | 'working' | { relinked: number; stillMissing: number }
  >('idle')
  const scrollRef = useRef<HTMLDivElement>(null)

  function reload(): void {
    setDetail(null)
    setError(null)
    window.api.chats.get(chatId).then(setDetail).catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    reload()
    setRelinkState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  async function handleRelink(): Promise<void> {
    const folderPath = await window.api.dialog.selectFolder(
      'Select the folder containing the images (subfolders are searched too)'
    )
    if (!folderPath) return
    setRelinkState('working')
    try {
      const result = await window.api.chats.relinkAttachments({ chatId, folderPath })
      setRelinkState(result)
      if (result.relinked > 0) reload()
    } catch (err) {
      setRelinkState('idle')
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  const attachmentsByMessage = useMemo(() => {
    const map = new Map<number, Attachment[]>()
    if (!detail) return map
    for (const a of detail.attachments) {
      const list = map.get(a.message_id) ?? []
      list.push(a)
      map.set(a.message_id, list)
    }
    return map
  }, [detail])

  const messages = detail?.messages ?? []
  const missingCount = detail?.attachments.filter((a) => a.missing).length ?? 0

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 100,
    overscan: 8
  })

  const characterName = detail?.chat.character_name ?? detail?.chat.title ?? ''
  const charColor = avatarColor(characterName)
  const charInitials = initials(characterName)

  if (error) {
    return <div style={{ padding: 20, color: 'var(--danger)' }}>Failed to load chat: {error}</div>
  }
  if (!detail) {
    return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Loading…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          background: 'var(--bg-secondary)'
        }}
      >
        <div
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: charColor + '28',
            border: `1.5px solid ${charColor}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: charColor, flexShrink: 0
          }}
        >
          {charInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{detail.chat.character_name ?? detail.chat.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {detail.chat.message_count} messages
          </div>
        </div>
      </div>

      {/* Missing attachments banner */}
      {missingCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 18px',
          background: 'rgba(245,165,36,0.1)',
          borderBottom: '1px solid rgba(245,165,36,0.2)',
          fontSize: 13, flexShrink: 0
        }}>
          <ImageOff size={14} color="var(--warning)" />
          <span style={{ color: 'var(--warning)', flex: 1 }}>
            {missingCount} image{missingCount !== 1 ? 's' : ''} not found.
            {typeof relinkState === 'object' &&
              ` Re-linked ${relinkState.relinked}, still missing ${relinkState.stillMissing}.`}
          </span>
          <button
            className="pill-button" onClick={handleRelink}
            disabled={relinkState === 'working'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <LinkIcon size={11} />
            {relinkState === 'working' ? 'Searching…' : 'Re-link…'}
          </button>
        </div>
      )}

      {/* Virtualized messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index]
            const isFirst = virtualRow.index === 0
            const prevMsg = virtualRow.index > 0 ? messages[virtualRow.index - 1] : null
            const sameAsPrev = prevMsg && prevMsg.sender_name === message.sender_name && prevMsg.is_user === message.is_user
            return (
              <div
                key={message.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: 4,
                  paddingTop: isFirst || !sameAsPrev ? 8 : 2
                }}
              >
                <MessageBubble
                  message={message}
                  attachments={attachmentsByMessage.get(message.id) ?? []}
                  showSenderLabel={!sameAsPrev}
                  charColor={charColor}
                  charInitials={charInitials}
                  onOpenAttachment={setLightboxId}
                />
              </div>
            )
          })}
        </div>
      </div>

      {lightboxId !== null && (
        <Lightbox attachmentId={lightboxId} onClose={() => setLightboxId(null)} />
      )}
    </div>
  )
}

function MessageBubble({
  message,
  attachments,
  showSenderLabel,
  charColor,
  charInitials,
  onOpenAttachment
}: {
  message: Message
  attachments: Attachment[]
  showSenderLabel: boolean
  charColor: string
  charInitials: string
  onOpenAttachment: (id: number) => void
}): JSX.Element {
  const isUser = message.is_user === 1
  const isSystem = message.is_user === 2

  // System messages: centered pill
  if (isSystem) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <span style={{
          fontSize: 11, color: 'var(--text-muted)',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-pill)',
          padding: '3px 10px'
        }}>
          {message.text ?? '(system)'}
        </span>
      </div>
    )
  }

  if (isUser) {
    // User bubble: right-aligned, purple
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {showSenderLabel && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingRight: 4 }}>
            {message.sender_name ?? 'You'}
            {message.send_date && <span style={{ marginLeft: 6, opacity: 0.7 }}>{formatTime(message.send_date)}</span>}
          </div>
        )}
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {message.text && (
            <div style={{
              background: 'var(--bubble-user-bg)',
              color: 'var(--bubble-user-text)',
              borderRadius: '14px 14px 3px 14px',
              padding: '9px 13px',
              fontSize: 13.5,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {message.text}
            </div>
          )}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
              {attachments.map((a) => (
                <AttachmentThumb key={a.id} attachment={a} onOpen={() => onOpenAttachment(a.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Character bubble: left-aligned, with avatar
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      {showSenderLabel ? (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: charColor + '28', border: `1.5px solid ${charColor}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: charColor
        }}>
          {charInitials}
        </div>
      ) : (
        <div style={{ width: 30, flexShrink: 0 }} />
      )}
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {showSenderLabel && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 2 }}>
            {message.sender_name ?? 'Character'}
            {message.send_date && <span style={{ marginLeft: 6, opacity: 0.7 }}>{formatTime(message.send_date)}</span>}
          </div>
        )}
        {message.text && (
          <div style={{
            background: 'var(--bubble-char-bg)',
            color: 'var(--bubble-char-text)',
            borderRadius: '14px 14px 14px 3px',
            padding: '9px 13px',
            fontSize: 13.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: '1px solid var(--border-subtle)'
          }}>
            {message.text}
          </div>
        )}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {attachments.map((a) => (
              <AttachmentThumb key={a.id} attachment={a} onOpen={() => onOpenAttachment(a.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AttachmentThumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }): JSX.Element {
  if (attachment.missing) {
    return (
      <div title={attachment.original_ref ?? attachment.stored_path} style={{
        width: 100, height: 100, borderRadius: 10,
        background: 'var(--bg-tertiary)', border: '1px dashed var(--border-strong)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, color: 'var(--text-muted)', fontSize: 10
      }}>
        <ImageOff size={20} />
        missing
      </div>
    )
  }

  const isImage = attachment.mime_type?.startsWith('image/') ?? false
  if (!isImage) {
    return (
      <div title={attachment.label ?? ''} style={{
        width: 100, height: 100, borderRadius: 10,
        background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, color: 'var(--text-secondary)', fontSize: 10, padding: 4, textAlign: 'center'
      }}>
        <FileIcon size={20} />
        {attachment.label ?? 'file'}
      </div>
    )
  }

  return (
    <img
      src={`app://attachment/${attachment.id}`}
      alt={attachment.label ?? ''}
      onClick={onOpen}
      style={{
        maxWidth: 260, maxHeight: 320,
        borderRadius: 10,
        cursor: 'zoom-in',
        border: '1px solid var(--border-subtle)',
        display: 'block',
        objectFit: 'cover'
      }}
    />
  )
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
