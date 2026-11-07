import { app, BrowserWindow, screen } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULTS: WindowState = { width: 1280, height: 800, maximized: false }

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

export function loadWindowState(): WindowState {
  try {
    if (existsSync(statePath())) {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(statePath(), 'utf-8')) }
    }
  } catch { /* ignore parse errors */ }
  return { ...DEFAULTS }
}

export function saveWindowState(win: BrowserWindow): void {
  try {
    const maximized = win.isMaximized()
    const bounds = win.getNormalBounds()

    // Only save if the window is actually on a connected display
    const displays = screen.getAllDisplays()
    const onScreen = displays.some(
      (d) =>
        bounds.x >= d.bounds.x &&
        bounds.y >= d.bounds.y &&
        bounds.x < d.bounds.x + d.bounds.width &&
        bounds.y < d.bounds.y + d.bounds.height
    )
    if (!onScreen) return

    const state: WindowState = { ...bounds, maximized }
    writeFileSync(statePath(), JSON.stringify(state, null, 2))
  } catch { /* ignore */ }
}

/** Attaches save listeners so the state is persisted when the window closes. */
export function trackWindowState(win: BrowserWindow): void {
  const save = (): void => saveWindowState(win)
  win.on('close', save)
  win.on('resize', save)
  win.on('move', save)
}
