import { create } from 'zustand'
import { defaultBox, moveFace } from '../geometry/viewGeometry'
import type { SectionBounds } from '../geometry/viewGeometry'
import { defaultBlueprint } from '../data/defaultBlueprint'
import { FLOORS } from '../data/floors'
import type { MepNetwork } from '../data/mepNetwork'
import { photo } from '../data/photographs'
import type { ShotId } from '../data/photographs'
import type {
  BoxFace,
  CameraStateId,
  CameraPreset,
  FloorId,
  FloorSelection,
  Point3,
  ViewMode,
} from '../types/shelter'

export const systems = ['power', 'data', 'water', 'air', 'freight', 'structure'] as const
export type SystemId = (typeof systems)[number]
const allLayers = { power: true, data: true, water: true, air: true, freight: true, structure: true }
interface ShelterView {
  mode: ViewMode
  cameraState: CameraStateId
  floor: FloorSelection
  lastFloor: FloorId
  sectionZ: number
  orbitCut: boolean
  cutHeight: number
  box: SectionBounds
  sectionPerspective: boolean
  plenum: boolean
  walkCeiling: boolean
  layers: Record<SystemId, boolean>
  mepNetwork: MepNetwork | null
  waterTrace: string | null
  hoveredValve: string | null
  setMepNetwork: (network: MepNetwork | null) => void
  setWaterTrace: (edgeId: string | null) => void
  setHoveredValve: (valveId: string | null) => void
  preset: CameraPreset
  facilityId: number | null
  equipmentTag: string | null
  surveyFocus: { point: Point3; height: number } | null
  routeOverview: boolean
  frameRoute: (points: Point3[]) => void
  inspect: (roomId: string, equipmentTag?: string, edgeId?: string) => void
  anchorIndex: number
  landingTarget: Point3 | null
  roomId: string | null
  landing: Point3 | null
  cameraRevision: number
  shot: ShotId | null
  time: string
  cold: boolean
  hud: boolean
  setView: (view: CameraStateId, landing?: Point3) => void
  setMode: (mode: ViewMode) => void
  selectFloor: (floor: FloorSelection) => void
  followFloor: (floor: FloorId) => void
  frame: (preset: CameraPreset) => void
  focusFacility: (id: number) => void
  focusRoom: (id: string | null, equipmentTag?: string) => void
  selectAnchor: (index: number) => void
  enterRoom: () => void
  refocus: () => void
  photograph: (shot: ShotId) => void
  setSectionZ: (z: number) => void
  setCutHeight: (h: number) => void
  setBoxFace: (face: BoxFace, value: number) => void
  toggleProjection: () => void
  togglePlenum: () => void
  toggleWalkCeiling: () => void
  toggleLayer: (id: SystemId) => void
  toggleHud: () => void
}
function fitSurvey(points: Point3[], minimumHeight = 8) {
  const low: Point3 = [Infinity, Infinity, Infinity],
    high: Point3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points)
    for (let k = 0; k < 3; k++) {
      low[k] = Math.min(low[k], p[k])
      high[k] = Math.max(high[k], p[k])
    }
  return {
    point: low.map((v, k) => (v + high[k]) / 2) as Point3,
    height: Math.max(minimumHeight, ...low.map((v, k) => (high[k] - v) * 1.1)),
  }
}
function viewFields(s: ShelterView, view: CameraStateId) {
  const whole = view === 'site' || view === 'section' || view === 'sectionBox'
  return {
    cameraState: view,
    mode: (view === 'site' ? 'exterior' : 'cutaway') as ViewMode,
    floor: whole ? ('ALL' as const) : s.lastFloor,
    orbitCut: false,
    shot: null,
    waterTrace: null,
    hoveredValve: null,
    roomId: null,
    equipmentTag: null,
    routeOverview: false,
    surveyFocus: null,
    anchorIndex: 0,
    landingTarget: null,
    facilityId: null,
    landing: null,
    preset: (view === 'section' ? 'section' : 'surface') as CameraPreset,
    cameraRevision: s.cameraRevision + 1,
  }
}
export const useShelterStore = create<ShelterView>((set) => ({
  mode: 'exterior',
  cameraState: 'site',
  floor: 'ALL',
  lastFloor: 'B2',
  sectionZ: -3.75,
  orbitCut: false,
  cutHeight: 1.2,
  box: defaultBox,
  sectionPerspective: false,
  preset: 'surface',
  plenum: true,
  walkCeiling: true,
  layers: allLayers,
  mepNetwork: null,
  waterTrace: null,
  hoveredValve: null,
  setMepNetwork: (mepNetwork) => set({ mepNetwork, waterTrace: null, hoveredValve: null }),
  setWaterTrace: (waterTrace) => set({ waterTrace, roomId: null, equipmentTag: null }),
  setHoveredValve: (hoveredValve) => set((s) => (hoveredValve === s.hoveredValve ? s : { hoveredValve })),
  facilityId: null,
  roomId: null,
  equipmentTag: null,
  routeOverview: false,
  surveyFocus: null,
  anchorIndex: 0,
  landingTarget: null,
  cameraRevision: 0,
  landing: null,
  shot: null,
  time: '07:40',
  cold: false,
  hud: true,
  setView: (view, landing) => set((s) => ({ ...viewFields(s, view), landing: landing ?? null })),
  selectFloor: (floor) =>
    set((s) => {
      if (floor === 'ALL') return { ...viewFields(s, 'site'), preset: 'panorama' }
      const view = s.cameraState === 'plan' || s.cameraState === 'walkthrough' ? s.cameraState : 'floorOrbit'
      return {
        ...viewFields(s, view),
        mode: s.mode === 'xray' ? 'xray' : 'cutaway',
        floor,
        lastFloor: floor,
        cutHeight: 1.2,
      }
    }),
  followFloor: (floor) => set({ floor, lastFloor: floor }),
  setMode: (mode) =>
    set((s) => {
      if (mode === 'xray')
        return { ...viewFields(s, s.floor === 'ALL' ? 'site' : 'floorOrbit'), mode, preset: 'panorama' }
      const view = mode === 'exterior' ? 'site' : 'section'
      return {
        ...viewFields(s, view),
        preset:
          mode === 'exterior' && s.floor !== 'ALL' ? 'panorama' : view === 'section' ? 'section' : 'surface',
      }
    }),
  frame: (preset) => set((s) => ({ ...viewFields(s, preset === 'section' ? 'section' : 'site'), preset })),
  focusFacility: (id) =>
    set((s) => ({
      ...viewFields(s, 'site'),
      facilityId: id,
      mode: id === 6 || id === 7 ? 'xray' : 'exterior',
    })),
  focusRoom: (roomId, equipmentTag) =>
    set((s) => ({
      roomId,
      waterTrace: null,
      equipmentTag: equipmentTag ?? null,
      anchorIndex: s.roomId === roomId ? s.anchorIndex : 0,
    })),
  frameRoute: (points) =>
    set((s) =>
      points.length
        ? {
            ...viewFields(s, 'sectionBox'),
            mode: 'xray',
            routeOverview: true,
            surveyFocus: fitSurvey(points, 48),
          }
        : s,
    ),
  inspect: (roomId, equipmentTag, edgeId) =>
    set((s) => {
      const room = defaultBlueprint.rooms.find((r) => r.id === roomId)
      const unit = room?.equipment.find((u) => u.tagCode === equipmentTag)
      const edge = s.mepNetwork?.edges.find((e) => e.id === edgeId)
      const floor = edge?.floor ?? room?.floorId
      if (!floor) return s
      let surveyFocus = null
      if (edge) {
        surveyFocus = fitSurvey(edge.points)
      } else if (unit) {
        const [x, y, z] = unit.position
        surveyFocus = {
          point: [x, FLOORS[floor].elevation + y + unit.moduleSizeM[1] / 2, z] as Point3,
          height: Math.max(8, ...unit.moduleSizeM.map((m) => m * 2)),
        }
      }
      return {
        ...viewFields(s, 'floorOrbit'),
        floor,
        lastFloor: floor,
        roomId: room?.id ?? null,
        equipmentTag: equipmentTag ?? null,
        surveyFocus,
        plenum: true,
        layers: edge ? { ...s.layers, [edge.system]: true } : s.layers,
      }
    }),
  selectAnchor: (anchorIndex) => set({ anchorIndex }),
  enterRoom: () =>
    set((s) => {
      const room = defaultBlueprint.rooms.find((r) => r.id === s.roomId)
      const anchor = room?.cameraAnchors[s.anchorIndex]
      if (!room || !anchor) return s
      const y = FLOORS[room.floorId].elevation
      return {
        ...viewFields(s, 'walkthrough'),
        floor: room.floorId,
        lastFloor: room.floorId,
        landing: [anchor.position[0], y + anchor.position[1] - 1.65, anchor.position[2]],
        landingTarget: [anchor.target[0], y + anchor.target[1], anchor.target[2]],
      }
    }),
  refocus: () =>
    set((s) => {
      const room = defaultBlueprint.rooms.find((r) => r.id === s.roomId)
      if (!room) return { cameraRevision: s.cameraRevision + 1 }
      return {
        ...viewFields(s, s.cameraState === 'plan' ? 'plan' : 'floorOrbit'),
        lastFloor: room.floorId,
        floor: room.floorId,
        roomId: room.id,
        equipmentTag: s.equipmentTag,
        anchorIndex: s.anchorIndex,
      }
    }),
  photograph: (shot) =>
    set((s) => {
      const p = photo(shot)
      return {
        ...viewFields(s, p.camera),
        shot,
        time: p.time,
        cold: !!p.cold,
        mode: p.xray ? 'xray' : p.camera === 'site' ? 'exterior' : 'cutaway',
        lastFloor: p.floor ?? 'B2',
        floor: p.floor ?? 'ALL',
        cutHeight: 1.2,
        layers: allLayers,
        sectionZ: -3.75,
        sectionPerspective: false,
        plenum: true,
        walkCeiling: true,
        hud: true,
      }
    }),
  setSectionZ: (z) => set({ sectionZ: Math.max(-9, Math.min(8, z)) }),
  setCutHeight: (h) =>
    set((s) => ({
      orbitCut: s.cameraState === 'floorOrbit',
      cutHeight: Math.max(0.05, Math.min(FLOORS[s.lastFloor].pitch - 0.02, h)),
    })),
  setBoxFace: (face, value) => set((s) => ({ box: moveFace(s.box, face, value) })),
  toggleProjection: () =>
    set((s) => ({ sectionPerspective: !s.sectionPerspective, cameraRevision: s.cameraRevision + 1 })),
  togglePlenum: () => set((s) => ({ plenum: !s.plenum })),
  toggleWalkCeiling: () => set((s) => ({ walkCeiling: !s.walkCeiling })),
  toggleLayer: (id) =>
    set((s) => ({
      layers: { ...s.layers, [id]: !s.layers[id] },
      hoveredValve: null,
      waterTrace: id === 'water' ? null : s.waterTrace,
    })),
  toggleHud: () => set((s) => ({ hud: !s.hud })),
}))
