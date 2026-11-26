import { beforeEach, expect, it } from 'vitest'
import { useShelterStore as store } from '../src/store/useShelterStore'

beforeEach(() => store.setState(store.getInitialState()))
it('exposes the chosen basement when slicing from the complete exterior', () => {
  store.getState().setMode('exterior')
  store.getState().selectFloor('B4')
  expect(store.getState()).toMatchObject({ floor: 'B4', mode: 'cutaway' })
  store.getState().setMode('xray')
  expect(store.getState().floor).toBe('B4')
})
it('restores the full exterior and can reframe the same camera after manual orbit', () => {
  store.getState().selectFloor('L1')
  store.getState().setMode('exterior')
  expect(store.getState()).toMatchObject({ floor: 'ALL', mode: 'exterior', preset: 'panorama' })
  store.getState().frame('section')
  expect(store.getState()).toMatchObject({ mode: 'cutaway', preset: 'section' })
  const revision = store.getState().cameraRevision
  store.getState().frame('section')
  expect(store.getState().cameraRevision).toBeGreaterThan(revision)
})
it('keeps plenum preference through slicing and returning to the overview', () => {
  store.getState().togglePlenum()
  store.getState().selectFloor('B2')
  store.getState().selectFloor('ALL')
  expect(store.getState()).toMatchObject({ floor: 'ALL', plenum: false, preset: 'panorama' })
})

it('opens a distant refuge in X-ray and restores the section or surface framing on demand', () => {
  store.getState().focusFacility(7)
  expect(store.getState()).toMatchObject({ mode: 'xray', floor: 'ALL', facilityId: 7 })
  store.getState().frame('section')
  expect(store.getState()).toMatchObject({ mode: 'cutaway', facilityId: null, preset: 'section' })
  store.getState().setSectionZ(42)
  expect(store.getState().sectionZ).toBe(8)
  store.getState().focusFacility(8)
  expect(store.getState()).toMatchObject({ mode: 'exterior', facilityId: 8 })
})
