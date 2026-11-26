import { lazy, Suspense, useState, useEffect } from 'react'
import { Instruments } from './ui/Instruments'
import { useShelterStore } from './store/useShelterStore'
const ShelterCanvas = lazy(async () => ({ default: (await import('./scene/ShelterCanvas')).ShelterCanvas }))
export default function App() {
  const view = useShelterStore((s) => s.cameraState)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const opened = () => setReady(true)
    window.addEventListener('ars-ready', opened)
    return () => window.removeEventListener('ars-ready', opened)
  }, [])
  return (
    <main className={'viewport' + (ready ? ' ready' : '')} aria-label="磐石山脊观测站工程模型">
      <div className="canvas-wrap">
        <Suspense fallback={null}>
          <ShelterCanvas />
        </Suspense>
      </div>
      <div aria-hidden="true" className="drawing-intro" />
      {(view === 'section' || view === 'plan') && (
        <div key={view} className="drawing-transition" aria-hidden="true" />
      )}
      <div inert={!ready}>
        <Instruments />
      </div>
    </main>
  )
}
