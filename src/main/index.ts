import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { getDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc/register'
import { registerAppProtocolScheme, handleAppProtocolRequests } from './attachments/serveAttachment'
import { loadWindowState, trackWindowState } from './windowState'
import { startAutoBackup } from './backup/autoBackup'

registerAppProtocolScheme() // must run before app is ready

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (state.maximized) mainWindow.maximize()

  trackWindowState(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Open external links (e.g. from an eventual "about" screen) in the
  // system browser instead of navigating the app window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode (vite dev server);
  // in a packaged/built app it's unset and we load the built HTML file.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const db = getDb()
  handleAppProtocolRequests()
  registerIpcHandlers()
  startAutoBackup(db)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
