export type ForestTreeState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'success'
  | 'failed'

export interface TreeStages {
  seed: number
  roots: number
  trunk: number
  branches: number
  west: number
  east: number
  northwest: number
  northeast: number
  apex: number
  front: number
  ground: number
  flowers: number
  particles: number
  glow: number
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function stageProgress(
  progress: number,
  start: number,
  end: number,
): number {
  const normalized = (clamp01(progress) - start) / (end - start)
  return clamp01(normalized)
}

/**
 * Converts the timer's logical 0..1 progress into independently animated
 * growth stages. The overlaps are intentional so the tree never looks like
 * disconnected pieces popping in one after another.
 */
export function getTreeStages(progress: number): TreeStages {
  const p = clamp01(progress)

  return {
    seed: 1 - stageProgress(p, 0.04, 0.14),
    roots: stageProgress(p, 0.01, 0.16),
    trunk: stageProgress(p, 0.06, 0.31),
    branches: stageProgress(p, 0.20, 0.52),
    west: stageProgress(p, 0.43, 0.66),
    east: stageProgress(p, 0.47, 0.69),
    northwest: stageProgress(p, 0.54, 0.76),
    northeast: stageProgress(p, 0.58, 0.79),
    apex: stageProgress(p, 0.64, 0.86),
    front: stageProgress(p, 0.73, 0.94),
    ground: stageProgress(p, 0.12, 0.42),
    flowers: stageProgress(p, 0.80, 0.98),
    particles: stageProgress(p, 0.68, 0.94),
    glow: stageProgress(p, 0.36, 0.86),
  }
}
