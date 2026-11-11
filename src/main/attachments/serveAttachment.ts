import { app, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { getDb } from '../db'

interface AttachmentRow {
  id: number
  message_id: number
  stored_path: string
  mime_type: string | null
  link_mode: 0 | 1
  missing: 0 | 1
}

/** Must run before app is ready (registers the scheme as privileged so
 *  <img src="app://attachment/123"> works under our CSP). */
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** Resolves an attachment's on-disk path from its DB row. Copy-mode
 *  (`link_mode = 0`) rows store "<chatId>/<filename>" relative to the
 *  managed attachments root (see importChat.ts); link-mode rows store an
 *  absolute path directly. */
function resolveAttachmentDiskPath(row: AttachmentRow): string {
  if (row.link_mode === 0 && !isAbsolute(row.stored_path)) {
    return join(app.getPath('userData'), 'attachments', row.stored_path)
  }
  return row.stored_path
}

/** Registers the app:// request handler. Must run after app is ready. */
export function handleAppProtocolRequests(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    // app://attachment/123 -> hostname "attachment", pathname "/123"
    if (url.hostname !== 'attachment') {
      return new Response(null, { status: 404 })
    }
    const attachmentId = Number(url.pathname.replace(/^\//, ''))
    if (!Number.isInteger(attachmentId)) {
      return new Response(null, { status: 400 })
    }

    const db = getDb()
    const row = db
      .prepare(
        `SELECT a.id, a.message_id, a.stored_path, a.mime_type, a.link_mode, a.missing,
                m.chat_id
           FROM attachments a JOIN messages m ON m.id = a.message_id
          WHERE a.id = ?`
      )
      .get(attachmentId) as (AttachmentRow & { chat_id: number }) | undefined

    if (!row || row.missing) {
      return new Response(null, { status: 404 })
    }

    try {
      const diskPath = resolveAttachmentDiskPath(row)
      const data = await readFile(diskPath)
      return new Response(data, {
        status: 200,
        headers: { 'content-type': row.mime_type ?? 'application/octet-stream' }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
