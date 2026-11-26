import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { siteFacilities } from '../data/siteFacilities'
import { useShelterStore } from '../store/useShelterStore'
import type { CameraPreset, ViewMode } from '../types/shelter'

const modes = [
  { id: 'exterior', label: '全山外观' },
  { id: 'cutaway', label: '地质半剖' },
  { id: 'xray', label: 'X 光透视' },
] as const
const cameras = [
  { id: 'panorama', label: '场址总览' },
  { id: 'surface', label: '站房近景' },
  { id: 'section', label: '地下剖面' },
] as const

export function TopBar() {
  const mode = useShelterStore((s) => s.mode),
    preset = useShelterStore((s) => s.preset),
    floor = useShelterStore((s) => s.floor)
  const facilityId = useShelterStore((s) => s.facilityId),
    focus = useShelterStore((s) => s.focusFacility)
  const setMode = useShelterStore((s) => s.setMode),
    frame = useShelterStore((s) => s.frame)
  const [open, setOpen] = useState(false),
    menu = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  function choose(id: CameraPreset) {
    frame(id)
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <header className="top-bar">
      <div className="brand">
        <h1>磐石山脊观测站</h1>
        <span>ARS-01　±0.000 = 1,450.000 m</span>
      </div>
      <nav className="mode-strip" aria-label="山体视图">
        {modes.map(({ id, label }) => (
          <button
            type="button"
            key={id}
            aria-pressed={mode === id}
            onClick={() => setMode(id satisfies ViewMode)}
          >
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="camera-menu" ref={menu}>
        <button
          className="camera-trigger"
          aria-expanded={open}
          aria-controls="camera-options"
          ref={trigger}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="prefix">视角</span>
          <strong>
            {siteFacilities.find((f) => f.id === facilityId)?.name ??
              (floor === 'ALL' ? cameras.find((c) => c.id === preset)!.label : floor + ' 楼层')}
          </strong>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div id="camera-options" className="camera-options" role="group" aria-label="相机预设">
            {cameras.map(({ id, label }) => (
              <button
                type="button"
                key={id}
                aria-pressed={floor === 'ALL' && preset === id && !facilityId}
                onClick={() => choose(id)}
              >
                {label}
              </button>
            ))}
            <label className="facility-picker">
              定位外围设施
              <select
                aria-label="定位外围设施"
                value={facilityId ?? ''}
                onChange={(e) => {
                  if (e.target.value) {
                    focus(Number(e.target.value))
                    setOpen(false)
                    trigger.current?.focus()
                  }
                }}
              >
                <option value="">选择设施</option>
                {siteFacilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {String(f.id).padStart(2, '0')}　{f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </header>
  )
}
