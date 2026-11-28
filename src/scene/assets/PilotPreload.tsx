import { useLayoutEffect, useState, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import {
  loadCommonsLibrary,
  loadNativePackLibrary,
  type CommonsLibrary,
  type NativePackLibrary,
} from './commonsLibrary'
import { CommonsLibraryContext } from './CommonsAssets'
import { NativePacksContext } from './NativePbrAssets'
import { b2WingPack } from '../../data/assets/b2WingPack'
import { upperB1Pack } from '../../data/assets/upperB1Pack'
import { plantPack } from '../../data/assets/plantPack'
import { preloadFoliage } from '../terrain/foliageAssets'
import { useShelterStore } from '../../store/useShelterStore'
import {
  installPilotAssets,
  loadPilotAssets,
  releasePilotAssets,
  reportPilotAssets,
  setChairWalkthrough,
  simulateLateAssets,
} from './pilotAssets'

/** Register scene materials for shadows and GPU prewarming after the offline assets have decoded. */
export function PilotPreload({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl)
  const [ready, setReady] = useState(false)
  const [foliageReady, setFoliageReady] = useState(false)
  const [commons, setCommons] = useState<CommonsLibrary | null>(null)
  const [nativePacks, setNativePacks] = useState<NativePackLibrary | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  useLayoutEffect(() => {
    let mounted = true
    let resources: CommonsLibrary | undefined
    let extra: NativePackLibrary | undefined
    void Promise.all([
      loadCommonsLibrary(gl),
      loadNativePackLibrary(gl, [
        ['b2-wing', b2WingPack],
        ['upper-b1', upperB1Pack],
        ['plant-b34', plantPack],
      ]),
    ])
      .then(([library, packs]) => {
        if (!mounted) {
          library.dispose()
          packs.dispose()
          return
        }
        resources = library
        extra = packs
        setCommons(library)
        setNativePacks(packs)
      })
      .catch((error) => {
        if (mounted) setFailure(error instanceof Error ? error : new Error(String(error)))
      })
    return () => {
      mounted = false
      resources?.dispose()
      extra?.dispose()
    }
  }, [gl])
  useLayoutEffect(() => {
    let mounted = true
    let release: (() => void) | undefined
    void preloadFoliage(gl, () => mounted)
      .then((dispose) => {
        if (!mounted) return dispose()
        release = dispose
        setFoliageReady(true)
      })
      .catch((error) => {
        if (mounted) setFailure(error instanceof Error ? error : new Error(String(error)))
      })
    return () => {
      mounted = false
      release?.()
    }
  }, [gl])
  useLayoutEffect(() => {
    let mounted = true
    let resources: Awaited<ReturnType<typeof loadPilotAssets>> | undefined
    async function load() {
      const result = await loadPilotAssets(gl.capabilities.getMaxAnisotropy())
      if (!mounted) {
        releasePilotAssets(result)
        return
      }
      resources = result
      installPilotAssets(result)
      if (result.finishes) gl.initTexture(result.finishes.texture)
      reportPilotAssets(gl.domElement)
      performance.mark('ars-open-pilot-assets')
      setReady(true)
    }
    if (simulateLateAssets) {
      reportPilotAssets(gl.domElement)
      setReady(true)
      window.addEventListener('ars-load-late-assets', load, { once: true })
    } else void load()
    const unsubscribe = useShelterStore.subscribe((s) => setChairWalkthrough(s.cameraState === 'walkthrough'))
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('ars-load-late-assets', load)
      if (resources) releasePilotAssets(resources)
    }
  }, [gl])
  if (failure) throw failure
  return ready && foliageReady && commons && nativePacks ? (
    <CommonsLibraryContext.Provider value={commons}>
      <NativePacksContext.Provider value={nativePacks}>{children}</NativePacksContext.Provider>
    </CommonsLibraryContext.Provider>
  ) : null
}
