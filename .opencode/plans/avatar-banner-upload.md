# Avatar/Banner Upload Implementation Plan

## Problem
SettingsTab.jsx sends POST to `/api/communities/:id/avatar` and `/api/communities/:id/banner`, but worker.js has no matching routes or handlers. User gets 404.

## Changes Required

### 1. `src/handlers/communities.js` — Add after handleUpdateCommunity (line 342)

Add two new exported handler functions.

**handleUploadCommunityAvatar:**
- Extract communityId via extractCommunityId
- Verify moderator+ via hasMinimumRole(member.role, ROLES.MODERATOR)
- Parse formData, get 'file' field
- Validate: exists, image/* MIME, max 5MB
- Store in R2: `community-assets/{communityId}/avatar.{ext}`
- Update communities.avatar_url
- Return `{ success: true, avatar_url: "/api/images/community-assets/{communityId}/avatar.{ext}" }`

**handleUploadCommunityBanner:**
- Same pattern, max 10MB
- Key: `community-assets/{communityId}/banner.{ext}`
- Update communities.banner_url
- Return `{ success: true, banner_url: "/api/images/..." }`

### 2. `src/worker.js` — Add routes and imports

Import both handlers from `./handlers/communities.js`

Add routes before the `/announcements` routes (~line 229):
```
POST /api/communities/{id}/avatar  → handleUploadCommunityAvatar
POST /api/communities/{id}/banner  → handleUploadCommunityBanner
```

### 3. Deploy
Run `npx wrangler deploy` to push to production.
