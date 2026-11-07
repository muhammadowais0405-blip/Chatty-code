import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Archive, BarChart3, Download, FolderOpen, MessageSquare, ScrollText, Search, Settings, Tag, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChatSummary, Folder, FolderView, ImportResult, Settings as AppSettings } from '@shared/types'
import ImportDialog from './components/ImportDialog'
import FieldMappingsSettings from './components/FieldMappingsSettings'
import BackupDialog from './components/BackupDialog'
import Sidebar from './components/sidebar/Sidebar'
import TagsSection from './components/sidebar/TagsSection'
import TagsSettings from './components/sidebar/TagsSettings'
import PromptsLibrary from './components/PromptsLibrary'
import ChatList from './components/chatlist/ChatList'
import ChatViewer from './components/viewer/ChatViewer'
import LibraryStatsView from './components/LibraryStatsView'
import QuickCopyPrompts from './components/QuickCopyPrompts'
import EmptyState from './components/EmptyState'
import { handleAppDragEnd } from './dnd/handleAppDragEnd'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; folders: Folder[]; settings: AppSettings }
  | { status: 'error'; message: string }

type View = 'library' | 'settings' | 'stats' | 'prompts'
type SettingsTab = 'fieldMappings' | 'tags'

export default function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [view, setView] = useState<View>('library')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('fieldMappings')
  const [selectedFolderView, setSelectedFolderView] = useState<FolderView>('all')
  const [activeTagId, setActiveTagId] = useState<number | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [lastImport, setLastImport] = useState<ImportResult | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  function refreshFolders(): void {
    window.api.folders.list().then((folders) =>
      setState((prev) => (prev.status === 'ready' ? { ...prev, folders } : prev))
    )
  }

  function refreshChats(): void {
    const q = searchQuery.trim()
    if (q) window.api.chats.search(q).then(setChats)
    else if (activeTagId !== null) window.api.chats.listByTag(activeTagId).then(setChats)
    else window.api.chats.listByFolder(selectedFolderView).then(setChats)
  }

  useEffect(() => {
    Promise.all([window.api.folders.list(), window.api.settings.get()])
      .then(([folders, settings]) => setState({ status: 'ready', folders, settings }))
      .catch((err: Error) => setState({ status: 'error', message: err.message }))
  }, [])

  useEffect(() => {
    const t = setTimeout(refreshChats, searchQuery ? 200 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderView, activeTagId, searchQuery])

  // Ctrl+P: jump to the prompts library from anywhere
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setView((prev) => (prev === 'prompts' ? 'library' : 'prompts'))
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleSelectTag(tagId: number | null): void {
    setActiveTagId(tagId)
    setSelectedChatId(null)
    if (tagId !== null) setSelectedFolderView('all')
  }

  // Determine the right empty state for the current chat list context
  function chatListEmptyProps(): {
    label: string
    icon: React.ReactNode
    isTrash: boolean
  } {
    if (searchQuery.trim()) return { label: 'No results', icon: <Search size={26} />, isTrash: false }
    if (activeTagId !== null) return { label: 'No chats with this tag', icon: <Tag size={26} />, isTrash: false }
    if (selectedFolderView === 'trash') return { label: 'Trash is empty', icon: <Trash2 size={26} />, isTrash: true }
    if (typeof selectedFolderView === 'number') return { label: 'Folder is empty', icon: <FolderOpen size={26} />, isTrash: false }
    return { label: 'No chats yet', icon: <MessageSquare size={26} />, isTrash: false }
  }

  const emptyProps = chatListEmptyProps()

  if (state.status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div style={{ padding: 32, color: 'var(--danger)' }}>
        Failed to reach main process: {state.message}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={(event) =>
        handleAppDragEnd(event, {
          folders: state.folders,
          onFoldersChanged: refreshFolders,
          onChatMoved: refreshChats
        })
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-primary)',
            flexShrink: 0
          }}
        >
          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7,
              background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Archive size={13} color="#fff" />
            </div>
            <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.1 }}>Chat Archiver</span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
            <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              placeholder="Search chats…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 30px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13, outline: 'none'
              }}
            />
          </div>

          <div style={{ flex: 1 }} />

          {/* Primary action */}
          <button
            className="pill-button pill-button--primary"
            onClick={() => setImportOpen(true)}
            style={{ fontSize: 13 }}
          >
            Import
          </button>

          {/* Icon buttons */}
          <button
            className="icon-btn"
            onClick={() => setView(view === 'prompts' ? 'library' : 'prompts')}
            title="Prompt library (Ctrl+P)"
            style={{ color: view === 'prompts' ? 'var(--accent)' : undefined }}
          >
            <ScrollText size={16} />
          </button>

          <QuickCopyPrompts />

          <button
            className="icon-btn"
            onClick={() => setView(view === 'stats' ? 'library' : 'stats')}
            title="Library stats"
            style={{ color: view === 'stats' ? 'var(--accent)' : undefined }}
          >
            <BarChart3 size={16} />
          </button>

          <button
            className="icon-btn"
            onClick={() => setBackupOpen(true)}
            title="Backup / Restore"
          >
            <Download size={16} />
          </button>

          <button
            className="icon-btn"
            onClick={() => setView(view === 'settings' ? 'library' : 'settings')}
            title="Settings"
            style={{ color: view === 'settings' ? 'var(--accent)' : undefined }}
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <aside style={{
            width: 'var(--sidebar-width)', background: 'var(--bg-primary)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', padding: '10px 6px', minHeight: 0
          }}>
            <Sidebar
              folders={state.folders}
              selectedView={selectedFolderView}
              onSelectView={(v) => { setSelectedFolderView(v); setActiveTagId(null); setSelectedChatId(null) }}
              onFoldersChanged={refreshFolders}
            />
            <TagsSection activeTagId={activeTagId} onSelectTag={handleSelectTag} />
          </aside>

          {view === 'settings' ? (
            <main style={{ flex: 1, background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Settings tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 20px', flexShrink: 0 }}>
                {(['fieldMappings', 'tags'] as SettingsTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    style={{
                      padding: '12px 4px', marginRight: 20, background: 'transparent', border: 'none',
                      borderBottom: settingsTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                      color: settingsTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: 13, fontWeight: settingsTab === tab ? 600 : 400, cursor: 'pointer'
                    }}
                  >
                    {tab === 'fieldMappings' ? 'Field Mappings' : 'Tags'}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                {settingsTab === 'fieldMappings' ? <FieldMappingsSettings /> : <TagsSettings />}
              </div>
            </main>
          ) : view === 'prompts' ? (
            <main style={{ flex: 1, background: 'var(--bg-app)', minHeight: 0 }}>
              <PromptsLibrary />
            </main>
          ) : view === 'stats' ? (
            <main style={{ flex: 1, background: 'var(--bg-app)', overflowY: 'auto', padding: 24 }}>
              <LibraryStatsView />
            </main>
          ) : (
            <>
              {/* Chat list panel */}
              <section style={{
                width: 'var(--chatlist-width)', background: 'var(--bg-secondary)',
                borderRight: '1px solid var(--border-subtle)',
                display: 'flex', flexDirection: 'column', minHeight: 0
              }}>
                <ChatList
                  chats={chats}
                  folders={state.folders}
                  selectedChatId={selectedChatId}
                  onOpenChat={setSelectedChatId}
                  isTrashView={selectedFolderView === 'trash'}
                  emptyLabel={emptyProps.label}
                  emptyIcon={emptyProps.icon}
                  onChatsChanged={refreshChats}
                  onBulkChanged={() => { refreshChats(); refreshFolders() }}
                  onImportClick={() => setImportOpen(true)}
                  onTrash={(chatId) => {
                    window.api.chats.trash(chatId).then(() => {
                      if (selectedChatId === chatId) setSelectedChatId(null)
                      refreshChats(); refreshFolders()
                    })
                  }}
                  onRestore={(chatId) => {
                    window.api.chats.restore(chatId).then(() => {
                      if (selectedChatId === chatId) setSelectedChatId(null)
                      refreshChats(); refreshFolders()
                    })
                  }}
                  onDeletePermanent={(chatId) => {
                    window.api.chats.deletePermanent(chatId).then(() => {
                      if (selectedChatId === chatId) setSelectedChatId(null)
                      refreshChats()
                    })
                  }}
                />
              </section>

              {/* Viewer */}
              <main style={{ flex: 1, background: 'var(--bg-app)', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {selectedChatId !== null ? (
                  <ChatViewer chatId={selectedChatId} />
                ) : (
                  <EmptyState
                    icon={<MessageSquare size={28} />}
                    title="No chat open"
                    body={
                      lastImport
                        ? `Last import: chat #${lastImport.chatId} · ${lastImport.messageCount} messages`
                        : 'Select a chat from the list, or import one to get started.'
                    }
                    action={!lastImport ? { label: 'Import chat', onClick: () => setImportOpen(true) } : undefined}
                  />
                )}
              </main>
            </>
          )}
        </div>

        {importOpen && (
          <ImportDialog
            folders={state.folders}
            onClose={() => setImportOpen(false)}
            onImported={(result) => { setLastImport(result); refreshFolders(); refreshChats() }}
          />
        )}

        {backupOpen && (
          <BackupDialog
            folders={state.folders}
            onClose={() => { setBackupOpen(false); refreshFolders(); refreshChats() }}
          />
        )}
      </div>
    </DndContext>
  )
}
