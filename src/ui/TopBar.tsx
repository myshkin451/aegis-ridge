import { Aperture, Blocks, Box, Camera, Check, ChevronDown, Layers2, Mountain, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShelterStore } from '../store/useShelterStore'
import type { CameraPreset, ViewMode } from '../types/shelter'

const modes = [
  { id: 'exterior', label: '全山外观', icon: Mountain },
  { id: 'cutaway', label: '地质半剖', icon: Layers2 },
  { id: 'xray', label: 'X 光透视', icon: ScanLine },
] as const
const cameras = [
  { id: 'panorama', label: '全景', icon: Box },
  { id: 'surface', label: '地表', icon: Aperture },
  { id: 'section', label: '地下剖面', icon: Blocks },
] as const

export function TopBar() {
  const mode = useShelterStore((s) => s.mode),
    preset = useShelterStore((s) => s.preset),
    floor = useShelterStore((s) => s.floor)
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
        <img src="/ridge.svg" width="40" height="40" alt="" />
        <div>
          <h1>AEGIS RIDGE</h1>
          <span>磐石山脊观测站</span>
        </div>
      </div>
      <nav className="mode-strip" aria-label="山体视图">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={mode === id}
            onClick={() => setMode(id satisfies ViewMode)}
          >
            <Icon size={16} strokeWidth={1.65} />
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
          <Camera size={16} />
          <span className="prefix">视角</span>
          <strong>{floor === 'ALL' ? cameras.find((c) => c.id === preset)!.label : floor + ' 楼层'}</strong>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div id="camera-options" className="camera-options" role="group" aria-label="相机预设">
            {cameras.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} onClick={() => choose(id)}>
                <Icon size={15} />
                {label}
                {floor === 'ALL' && preset === id && <Check size={15} className="chosen" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
