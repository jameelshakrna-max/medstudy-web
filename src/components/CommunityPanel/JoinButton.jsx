import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { apiPost } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import s from './CommunityPanel.module.css'

export default function JoinButton({ communityId, community, members }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [optimisticJoined, setOptimisticJoined] = useState(false)

  const isAlreadyMember = members.some(m => m.user_id === user?.sub) || optimisticJoined
  const isOwner = community.created_by === user?.sub

  const joinMutation = useMutation({
    onMutate: () => {
      setOptimisticJoined(true)
    },
    mutationFn: () => apiPost(`/communities/${communityId}/join`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communityPanel.full(communityId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.communitiesMonthly })
    },
    onError: () => {
      setOptimisticJoined(false)
    },
  })

  if (isAlreadyMember || isOwner) {
    return (
      <div className={s.joinSection}>
        <button className={s.joinBtnDisabled} disabled>Joined</button>
      </div>
    )
  }

  const joinType = community.join_type || 'anyone'

  if (joinType === 'invite_only') {
    return (
      <div className={s.joinSection}>
        <button className={s.joinBtnDisabled} disabled>Invite Only</button>
      </div>
    )
  }

  return (
    <div className={s.joinSection}>
      <button
        className={joinMutation.isPending ? s.joinBtnPending : s.joinBtn}
        onClick={() => joinMutation.mutate()}
        disabled={joinMutation.isPending}
      >
        {joinType === 'approval'
          ? (optimisticJoined ? 'Request Sent' : 'Request to Join')
          : (optimisticJoined ? 'Joined!' : 'Join')
        }
      </button>
    </div>
  )
}
