/** §4.4: exact rule reused from the extensions' index.js. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 150) || 'file'
}
