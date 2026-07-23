import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { normalizePlanResponse } from './responseAdapters'

export default function useRotationPlanDetail(planId) {
  return useQuery({
    queryKey: queryKeys.rotations.plan(planId),
    enabled: !!planId,
    queryFn: () => apiGet(`/rotation-planner/plans/${planId}`),
    select: (raw) => normalizePlanResponse(raw),
  })
}
