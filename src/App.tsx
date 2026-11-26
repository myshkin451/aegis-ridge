import { lazy, Suspense } from 'react'
import { Instruments } from './ui/Instruments'
import { useShelterStore } from './store/useShelterStore'
const ShelterCanvas = lazy(async () => ({ default: (await import('./scene/ShelterCanvas')).ShelterCanvas }))
export default function App() {
  const view = useShelterStore((s) => s.cameraState)
  return (
    <main className="viewport" aria-label="磐石山脊观测站工程模型">
      <div className="canvas-wrap">
        <Suspense fallback={null}>
          <ShelterCanvas />
        </Suspense>
      </div>
      <div aria-hidden="true" className="drawing-intro" />
      {(view === 'section' || view === 'plan') && (
        <div key={view} className="drawing-transition" aria-hidden="true" />
      )}
      <Instruments />
    </main>
  )
}
