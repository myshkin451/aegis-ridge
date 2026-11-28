import type { CommonsPlacement } from '../../scene/assets/CommonsAssets'
import {
  coffeePosition,
  diningOrigin,
  diningSeats,
  islandPosition,
  kitchenPosition,
  kitchenPoint,
  kitchenBayScale,
  sofaPositions,
} from './commons'

const back = (x: number, y: number, z: number) => kitchenPoint(kitchenPosition, x, y, z, kitchenBayScale)
const island = (x: number, y: number, z: number) => kitchenPoint(islandPosition, x, y, z)
export const commonsPlacements: CommonsPlacement[] = [
  ...sofaPositions.map((p) => ({ asset: 'sofa' as const, ...p })),
  { asset: 'coffee-table', position: coffeePosition, size: [1.42, 0.436, 0.76] },
  ...diningSeats.map((p) => ({
    asset: 'dining-chair' as const,
    ...p,
    size: [0.46, 0.99, 0.59] as [number, number, number],
  })),
  ...[-1.04, 0, 1.04].map((z) => ({
    asset: 'bar-stool' as const,
    position: island(-0.77, 0.024, z) as [number, number, number],
    size: [0.41, 0.81, 0.41] as [number, number, number],
    yaw: Math.PI,
  })),
  {
    asset: 'journal',
    position: [coffeePosition[0] - 0.08, 0.479, coffeePosition[2] + 0.05],
    size: [0.51, 0.026, 0.21],
    yaw: -0.22,
  },
  {
    asset: 'platter',
    position: [diningOrigin[0] + 0.31, 0.809, diningOrigin[2] + 0.83],
    size: [0.27, 0.038, 0.27],
  },
  { asset: 'platter', position: island(-0.12, 1.003, 0.23), size: [0.32, 0.045, 0.32] },
  {
    asset: 'coffee-maker',
    position: back(0.012, 0.964, -2.54),
    size: [0.6, 0.62, 0.6],
    yaw: 0,
  },
  {
    asset: 'mug',
    position: [coffeePosition[0] + 0.2, 0.48, coffeePosition[2] - 0.14],
    size: [0.13, 0.11, 0.103],
    yaw: 0.95,
  },
  { asset: 'mug', position: back(-0.22, 0.964, -2.06), size: [0.145, 0.12, 0.108], yaw: 2 },
  { asset: 'kettle', position: back(-0.05, 0.968, 1.35), size: [0.21, 0.24, 0.22], yaw: 0.37 },
  { asset: 'pot', position: back(0.02, 0.985, 0.61), size: [0.33, 0.15, 0.26] },
  ...[-0.77, -0.38, 0.05, 0.47, 0.87].map((z, i) => ({
    asset: 'pan' as const,
    position: island(0.46, 2.25 + (i % 2) * 0.045, z) as [number, number, number],
    size: [0.25 + (i % 2) * 0.055, 0.072, 0.49 + (i % 3) * 0.036] as [number, number, number],
    pitch: Math.PI / 2,
    yaw: Math.PI + (i % 2 === 0 ? -0.13 : 0.16),
  })),
  { asset: 'plant', position: [-12.23, -0.66, 6.54], size: [1.02, 2.79, 1.04], yaw: 0.8 },
  { asset: 'plant', position: [-11.68, -0.43, 5.9], size: [0.89, 2.0, 0.92], yaw: -0.4 },
  { asset: 'fern', position: [-12.31, 0.348, 7.31], size: [1.14, 0.92, 1.01], yaw: 1.5 },
  { asset: 'fern', position: [-11.66, 0.348, 7.18], size: [1.0, 1.22, 0.91], yaw: -0.7 },
  { asset: 'fern', position: [-12.48, 0.348, 5.96], size: [0.75, 0.65, 0.75], yaw: 0.32 },
  { asset: 'fern', position: [-12.63, 0.315, 6.73], size: [0.8, 1.15, 0.79], yaw: 2.8 },
  { asset: 'fern', position: [-11.68, 0.315, 6.44], size: [0.99, 1.15, 0.89], yaw: -1.3 },
  { asset: 'fern', position: [-12.32, 0.315, 7.62], size: [0.62, 0.52, 0.62], yaw: -2.7 },
  { asset: 'plant', position: island(0.14, 1.004, 1.02), size: [0.21, 0.41, 0.21], yaw: 2.3 },
]
