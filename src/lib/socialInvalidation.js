import { queryKeys } from './queryKeys'

export function invalidateCommunityListQueries(queryClient) {
  if (!queryClient) return
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
}

export function invalidateCommunityDetailQueries(queryClient, communityId) {
  if (!queryClient || !communityId) return
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.joinRequests(communityId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.settings(communityId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.bans(communityId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.communities.mutes(communityId) })
}

export function invalidateCommunityQueries(queryClient, communityId) {
  invalidateCommunityListQueries(queryClient)
  invalidateCommunityDetailQueries(queryClient, communityId)
}

export function invalidateUserRelationshipQueries(queryClient, userId) {
  if (!queryClient || !userId) return
  queryClient.invalidateQueries({ queryKey: queryKeys.follow.status(userId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(userId) })
}

export function invalidateDmQueries(queryClient) {
  if (!queryClient) return
  queryClient.invalidateQueries({ queryKey: queryKeys.dm.all })
}

export function refreshDmInboxCache(queryClient) {
  if (!queryClient) return
  queryClient.invalidateQueries({ queryKey: queryKeys.dm.conversations() })
  queryClient.invalidateQueries({ queryKey: queryKeys.dm.unread() })
}

export function invalidateInvitationQueries(queryClient) {
  if (!queryClient) return
  queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all })
}
