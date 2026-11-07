import { useEffect } from 'react'

export default function Lightbox({
  attachmentId,
  onClose
}: {
  attachmentId: number
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        cursor: 'zoom-out'
      }}
    >
      <img
        src={`app://attachment/${attachmentId}`}
        alt=""
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="pill-button"
        style={{ position: 'absolute', top: 20, right: 20 }}
      >
        Close (Esc)
      </button>
    </div>
  )
}
