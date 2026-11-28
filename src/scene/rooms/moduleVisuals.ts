import type { EquipmentUnit } from '../../types/shelter'
import type { ModelBuilder } from '../utils/modelBuilder'

function listeningWall(m: ModelBuilder, e: EquipmentUnit) {
  const [w, h] = e.moduleSizeM
  m.box('#92795c', [0, h / 2, 0.3], [w, h, 0.17], 'oak_int')
  for (let x = -w / 2 + 0.12; x < w / 2; x += 0.16)
    m.box('#ad906d', [x, h / 2, 0.2], [0.075, h - 0.06, 0.07], 'oak_int')
  m.box('#323b39', [0, 1.47, 0.1], [w * 0.57, 1.53, 0.11], 'steel')
  m.box('#c7c8bd', [0, 1.47, 0.035], [w * 0.57 - 0.08, 1.45, 0.026], 'fabric')
  for (const x of [-w * 0.41, w * 0.41]) {
    m.box('#494841', [x, 0.78, -0.09], [0.53, 1.56, 0.51], 'oak_int')
    for (const [y, d] of [[0.55, 0.31], [1.17, 0.19]])
      m.part('round', 'rubber_gym', '#262b29', [x, y, -0.36], [d, 0.033, d], [Math.PI / 2, 0, 0])
  }
}
function listeningSeat(m: ModelBuilder) {
  m.box('#916c4e', [0, 0.22, 0], [1.95, 0.27, 0.94], 'oak_int')
  for (const x of [-0.48, 0.48]) {
    m.part('cushion', 'fabric', '#899481', [x, 0.43, 0.04], [0.91, 0.22, 0.87])
    m.part('cushion', 'fabric', '#a7ae98', [x, 0.73, -0.39], [0.91, 0.51, 0.2], [-0.09, 0, 0])
  }
  for (const x of [-0.98, 0.98]) m.box('#a17e59', [x, 0.55, 0], [0.083, 0.14, 0.96], 'oak_int')
}
function mill(m: ModelBuilder) {
  m.box('#5c645f', [0, 0.13, 0], [2.04, 0.22, 2.7], 'rubber_gym')
  m.box('#909b93', [0, 0.99, 0.1], [1.77, 1.54, 2.15], 'steel')
  for (const x of [-0.49, 0.49]) m.box('#a7afa7', [x, 1.96, -0.09], [0.1, 0.76, 1.64], 'steel', [0, 0, -Math.sign(x) * 0.35])
  for (const z of [-0.92, 0.74]) m.box('#9ba69d', [0, 1.96, z], [1.12, 0.76, 0.08], 'steel')
  m.box('#464e4b', [0, 0.96, 1.21], [1.03, 0.45, 0.09], 'steel')
  m.box('#c29e67', [0.62, 1.42, 1.21], [0.28, 0.27, 0.08], 'steel')
  for (let i = 0; i < 7; i++) m.box('#4e5b55', [-0.89, 1.21, -0.68 + i * 0.18], [0.034, 0.35, 0.07], 'steel')
}
function filter(m: ModelBuilder) {
  m.box('#727c73', [0, 0.08, 0], [1.53, 0.14, 1.85], 'steel')
  for (const x of [-0.37, 0.37]) {
    m.part('round', 'steel', '#a4b2a8', [x, 1.43, -0.17], [0.62, 1.39, 0.62])
    m.part('round', 'steel', '#62746c', [x, 0.48, -0.17], [0.67, 0.46, 0.67])
    for (const y of [0.81, 1.97]) m.part('round', 'steel', '#737c77', [x, y, -0.17], [0.65, 0.044, 0.65])
  }
  m.box('#74837f', [0, 2.22, -0.17], [1.42, 0.29, 0.36], 'steel')
  m.box('#8b9589', [0, 0.58, 0.57], [1.16, 0.92, 0.6], 'steel')
}
export const moduleVisuals = { 'listening-wall': listeningWall, 'listening-seat': listeningSeat, 'recycling-mill': mill, 'filter-hopper': filter }
