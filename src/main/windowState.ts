import { app, BrowserWindow, screen } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTextFile } from './utils/readTextFile'

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

function isOnSomeDisplay(x: number, y: number): boolean {
  return screen
    .getAllDisplays()
    .some(
      (d) =>
        x >= d.bounds.x &&
        y >= d.bounds.y &&
        x < d.bounds.x + d.bounds.width &&
        y < d.bounds.y + d.bounds.height
    )
}

export function loadWindowState(): WindowState {
  const state: WindowState = { ...DEFAULTS }
  try {
    if (existsSync(statePath())) {
      Object.assign(state, JSON.parse(readTextFile(statePath())))
    }
  } catch {
    /* ignore parse errors */
  }
  // The monitor it was saved on may be unplugged: let Electron center it instead.
  if (state.x !== undefined && state.y !== undefined && !isOnSomeDisplay(state.x, state.y)) {
    delete state.x
    delete state.y
  }
  return state
}

export function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const bounds = win.getNormalBounds()
    if (!isOnSomeDisplay(bounds.x, bounds.y)) return
    const state: WindowState = { ...bounds, maximized }
    writeFileSync(statePath(), JSON.stringify(state, null, 2))
  } catch {
    /* ignore */
  }
}

/** Persists window bounds (debounced while resizing/moving, immediately on close). */
export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const saveSoon = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => saveWindowState(win), 500)
  }
  win.on('resize', saveSoon)
  win.on('move', saveSoon)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    saveWindowState(win)
  })
}