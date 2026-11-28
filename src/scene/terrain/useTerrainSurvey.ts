import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import type { DataArrayTexture } from 'three'
import { loadTerrainScans } from '../assets/terrainScans'
import { AtlasLoader } from './loadAtlas'
import { terrainV2 } from './terrainVersion'
import { makeSurveyTextures } from './surveyTextures'
import type { TerrainAtlas } from '../../geometry/siteElevations'

export type TerrainSurface = { scans: DataArrayTexture; survey: ReturnType<typeof makeSurveyTextures> }
type Loaded = { atlas: TerrainAtlas; surface: TerrainSurface | null }

export function useTerrainSurvey() {
  const gl = useThree((s) => s.gl)
  const [loaded, setLoaded] = useState<Loaded>()
  const [failure, setFailure] = useState<Error>()
  useEffect(() => {
    let active = true
    let surface: TerrainSurface | null = null
    // Fetch both branches alongside the interior preload. Mount the whole survey
    // together so the existing CSM registration sees all three terrain materials.
    async function prepare() {
      const [field, photos] = await Promise.allSettled([
        new AtlasLoader().loadAsync(import.meta.env.BASE_URL + 'terrain/atlas.json'),
        terrainV2 ? loadTerrainScans() : Promise.resolve(null),
      ])
      if (field.status === 'rejected' || photos.status === 'rejected' || !active) {
        if (photos.status === 'fulfilled') photos.value?.dispose()
        if (field.status === 'rejected') throw field.reason
        if (photos.status === 'rejected') throw photos.reason
        return
      }
      if (photos.value) {
        surface = { scans: photos.value, survey: makeSurveyTextures(field.value) }
        gl.initTexture(surface.scans)
        gl.initTexture(surface.survey.macroNormal)
        gl.initTexture(surface.survey.horizons)
      }
      gl.domElement.dataset.terrain = surface ? 'v2' : 'v1'
      setLoaded({ atlas: field.value, surface })
    }
    prepare().catch((error) => {
      if (active) setFailure(error instanceof Error ? error : new Error(String(error)))
    })
    return () => {
      active = false
      surface?.scans.dispose()
      surface?.survey.dispose()
    }
  }, [gl])
  if (failure) throw failure
  return loaded ?? { atlas: undefined, surface: null }
}
