import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'

// Reuses the same lifecycle endpoint the plan detail uses for activation:
// POST /rotation-planner/plans/:id/status with { action: 'activate', expectedRevision, clientRequestId }.
export default function usePlanActivation({ planId, revision }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => {
      const clientRequestId = crypto.randomUUID()
      return apiPost(`/rotation-planner/plans/${planId}/status`, {
        action: 'activate',
        expectedRevision: revision,
        clientRequestId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.forecast(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
    },
  })
}
