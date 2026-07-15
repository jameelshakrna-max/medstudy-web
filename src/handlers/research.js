import { json, uuid } from '../lib/worker-utils.js'

const REPUTATION_POINTS = {
  created_post: 10,
  commented: 1,
  upvote_received: 2,
  helped: 20,
  completed_survey: 15,
  collaborated: 25,
  reviewed_paper: 20,
  statistical_help: 20,
  data_collection: 15,
  paper_shared: 40,
  spam_penalty: -100,
}

const LEVEL_THRESHOLDS = [
  { level: 'Expert', min: 900 },
  { level: 'Advanced', min: 400 },
  { level: 'Intermediate', min: 100 },
  { level: 'Beginner', min: 0 },
]

function calculateLevel(score) {
  for (const t of LEVEL_THRESHOLDS) {
    if (score >= t.min) return t.level
  }
  return 'Beginner'
}

async function addReputationEvent(env, userId, action, points, referenceId = null) {
  const id = uuid()
  await env.DB.prepare(
    'INSERT INTO research_reputation_events (id, user_id, points, action, reference_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, points, action, referenceId).run()

  const { results } = await env.DB.prepare('SELECT score FROM user_research_stats WHERE user_id = ?').bind(userId).all()
  const currentScore = results[0]?.score || 0
  const newScore = currentScore + points
  const newLevel = calculateLevel(newScore)

  await env.DB.prepare(`
    INSERT INTO user_research_stats (user_id, score, level, last_activity, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      score = score + excluded.score,
      level = excluded.level,
      last_activity = datetime('now'),
      updated_at = datetime('now')
  `).bind(userId, points, newLevel).run()
}

async function incrementStat(env, userId, column) {
  await env.DB.prepare(`
    INSERT INTO user_research_stats (user_id, ${column}, last_activity, updated_at)
    VALUES (?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      ${column} = ${column} + 1,
      last_activity = datetime('now'),
      updated_at = datetime('now')
  `).bind(userId).run()
}

export async function handleListResearchPosts(request, env, user) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('search')
  const sort = url.searchParams.get('sort') || 'newest'
  const status = url.searchParams.get('status') || 'all'
  const communityId = url.searchParams.get('community_id')
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50)
  const offset = (page - 1) * limit

  const conditions = []
  const params = []

  if (category) {
    conditions.push('p.category = ?')
    params.push(category)
  }
  if (search) {
    conditions.push('(p.title LIKE ? OR p.description LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }
  if (communityId) {
    conditions.push('p.community_id = ?')
    params.push(communityId)
  }
  if (status !== 'all') {
    conditions.push('p.status = ?')
    params.push(status)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  let orderBy
  switch (sort) {
    case 'oldest': orderBy = 'p.created_at ASC'; break
    case 'top': orderBy = 'p.upvotes_count DESC'; break
    default: orderBy = 'p.created_at DESC'
  }

  const { results: posts } = await env.DB.prepare(`
    SELECT p.*, up.user_name, up.avatar_url, up.username, up.reputation
    FROM research_posts p
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all()

  // Check expires and update expired posts
  const now = new Date().toISOString()
  for (const post of posts) {
    if (post.expires_at && post.expires_at < now && post.status === 'open') {
      await env.DB.prepare(`UPDATE research_posts SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).bind(post.id).run()
      post.status = 'expired'
    }
  }

  // Fetch user votes, bookmarks, and tags for each post
  const userId = user?.sub
  for (const post of posts) {
    const { results: tags } = await env.DB.prepare('SELECT tag FROM research_post_tags WHERE post_id = ?').bind(post.id).all()
    post.tags = tags.map(t => t.tag)

    post.user_vote = 0
    post.is_bookmarked = false
    if (userId) {
      const { results: votes } = await env.DB.prepare('SELECT vote FROM research_votes WHERE post_id = ? AND user_id = ?').bind(post.id, userId).all()
      post.user_vote = votes[0]?.vote || 0
      const { results: bm } = await env.DB.prepare('SELECT id FROM research_bookmarks WHERE post_id = ? AND user_id = ?').bind(post.id, userId).all()
      post.is_bookmarked = bm.length > 0
    }
  }

  const { results: countResults } = await env.DB.prepare(`
    SELECT COUNT(*) as total FROM research_posts p ${where}
  `).bind(...params).all()
  const total = countResults[0]?.total || 0

  return json({ posts, page, hasMore: offset + limit < total })
}

export async function handleCreateResearchPost(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const body = await request.json()
  const { title, url: postUrl, description = '', category, tags = [], community_id = null, expires_at = null } = body

  if (!title || !title.trim()) return json({ error: 'Title is required' }, 400)
  if (!category) return json({ error: 'Category is required' }, 400)

  const id = uuid()
  await env.DB.prepare(`
    INSERT INTO research_posts (id, user_id, title, description, url, category, community_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.sub, title.trim(), description.trim(), (postUrl || '').trim() || null, category, community_id, expires_at).run()

  if (Array.isArray(tags) && tags.length > 0) {
    for (const tag of tags) {
      const trimmed = String(tag).trim().slice(0, 50)
      if (!trimmed) continue
      await env.DB.prepare('INSERT OR IGNORE INTO research_post_tags (id, post_id, tag) VALUES (?, ?, ?)').bind(uuid(), id, trimmed).run()
    }
  }

  await addReputationEvent(env, user.sub, 'created_post', 10, id)
  await incrementStat(env, user.sub, 'posts_created')

  if (category === 'paper') {
    await incrementStat(env, user.sub, 'papers_shared')
    await addReputationEvent(env, user.sub, 'paper_shared', 40, id)
  }

  const { results } = await env.DB.prepare(`
    SELECT p.*, up.user_name, up.avatar_url, up.username
    FROM research_posts p
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE p.id = ?
  `).bind(id).all()

  return json({ post: results[0] }, 201)
}

export async function handleGetResearchPost(request, env, user) {
  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const { results } = await env.DB.prepare(`
    SELECT p.*, up.user_name, up.avatar_url, up.username, up.reputation
    FROM research_posts p
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE p.id = ?
  `).bind(postId).all()

  if (!results.length) return json({ error: 'Post not found' }, 404)
  const post = results[0]

  let user_vote = 0
  let is_bookmarked = false
  if (user?.sub) {
    const { results: votes } = await env.DB.prepare('SELECT vote FROM research_votes WHERE post_id = ? AND user_id = ?').bind(postId, user.sub).all()
    user_vote = votes[0]?.vote || 0

    const { results: bookmarks } = await env.DB.prepare('SELECT id FROM research_bookmarks WHERE post_id = ? AND user_id = ?').bind(postId, user.sub).all()
    is_bookmarked = bookmarks.length > 0
  }

  const { results: tags } = await env.DB.prepare('SELECT tag FROM research_post_tags WHERE post_id = ?').bind(postId).all()

  const { results: comments } = await env.DB.prepare(`
    SELECT c.*, up.user_name, up.avatar_url, up.username
    FROM research_comments c
    LEFT JOIN user_profiles up ON up.user_id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).bind(postId).all()

  return json({ ...post, user_vote, is_bookmarked, tags: tags.map(t => t.tag), comments })
}

export async function handleUpdateResearchPost(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const { results: existing } = await env.DB.prepare('SELECT user_id FROM research_posts WHERE id = ?').bind(postId).all()
  if (!existing.length) return json({ error: 'Post not found' }, 404)
  if (existing[0].user_id !== user.sub) return json({ error: 'Forbidden' }, 403)

  const body = await request.json()
  const { title, description, category, status, tags } = body

  const fields = []
  const params = []

  if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()) }
  if (description !== undefined) { fields.push('description = ?'); params.push(description.trim()) }
  if (category !== undefined) { fields.push('category = ?'); params.push(category) }
  if (status !== undefined) { fields.push('status = ?'); params.push(status) }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    params.push(postId)
    await env.DB.prepare(`UPDATE research_posts SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
  }

  if (Array.isArray(tags)) {
    await env.DB.prepare('DELETE FROM research_post_tags WHERE post_id = ?').bind(postId).run()
    for (const tag of tags) {
      const trimmed = String(tag).trim().slice(0, 50)
      if (!trimmed) continue
      await env.DB.prepare('INSERT OR IGNORE INTO research_post_tags (id, post_id, tag) VALUES (?, ?, ?)').bind(uuid(), postId, trimmed).run()
    }
  }

  const { results } = await env.DB.prepare(`
    SELECT p.*, up.user_name, up.avatar_url, up.username
    FROM research_posts p
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE p.id = ?
  `).bind(postId).all()

  return json({ post: results[0] })
}

export async function handleDeleteResearchPost(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const { results: existing } = await env.DB.prepare('SELECT user_id FROM research_posts WHERE id = ?').bind(postId).all()
  if (!existing.length) return json({ error: 'Post not found' }, 404)
  if (existing[0].user_id !== user.sub) return json({ error: 'Forbidden' }, 403)

  await env.DB.prepare('DELETE FROM research_posts WHERE id = ?').bind(postId).run()

  return json({ ok: true })
}

export async function handleVoteOnPost(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const body = await request.json()
  const { vote } = body
  if (vote !== 1 && vote !== -1) return json({ error: 'Vote must be 1 or -1' }, 400)

  const { results: postResults } = await env.DB.prepare('SELECT user_id, upvotes_count FROM research_posts WHERE id = ?').bind(postId).all()
  if (!postResults.length) return json({ error: 'Post not found' }, 404)

  const { results: existing } = await env.DB.prepare('SELECT id, vote FROM research_votes WHERE post_id = ? AND user_id = ?').bind(postId, user.sub).all()

  let currentVote = vote

  if (existing.length) {
    const existingVote = existing[0].vote
    if (existingVote === vote) {
      // Toggle off
      await env.DB.prepare('DELETE FROM research_votes WHERE id = ?').bind(existing[0].id).run()
      currentVote = 0
    } else {
      // Switch vote
      await env.DB.prepare('UPDATE research_votes SET vote = ? WHERE id = ?').bind(vote, existing[0].id).run()
    }
  } else {
    // New vote
    await env.DB.prepare('INSERT INTO research_votes (id, post_id, user_id, vote) VALUES (?, ?, ?, ?)').bind(uuid(), postId, user.sub, vote).run()
  }

  // Recalculate upvotes_count
  const { results: voteCounts } = await env.DB.prepare('SELECT COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as up, COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as down FROM research_votes WHERE post_id = ?').bind(postId).all()
  const upvotesCount = (voteCounts[0]?.up || 0) - (voteCounts[0]?.down || 0)

  await env.DB.prepare('UPDATE research_posts SET upvotes_count = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(upvotesCount, postId).run()

  // Award upvote_received to post owner if upvote (not downvote)
  if (vote === 1 && existing.length === 0) {
    const postOwner = postResults[0].user_id
    if (postOwner !== user.sub) {
      await addReputationEvent(env, postOwner, 'upvote_received', 2, postId)
    }
  }

  return json({ vote: currentVote, upvotes_count: upvotesCount })
}

export async function handleGetResearchComments(request, env, user) {
  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const { results } = await env.DB.prepare(`
    SELECT c.*, up.user_name, up.avatar_url, up.username
    FROM research_comments c
    LEFT JOIN user_profiles up ON up.user_id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).bind(postId).all()

  return json({ comments: results })
}

export async function handleAddResearchComment(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const body = await request.json()
  const { content } = body
  if (!content || !content.trim()) return json({ error: 'Content is required' }, 400)

  const { results: postCheck } = await env.DB.prepare('SELECT id FROM research_posts WHERE id = ?').bind(postId).all()
  if (!postCheck.length) return json({ error: 'Post not found' }, 404)

  const id = uuid()
  await env.DB.prepare('INSERT INTO research_comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)').bind(id, postId, user.sub, content.trim()).run()

  await env.DB.prepare("UPDATE research_posts SET comments_count = comments_count + 1, updated_at = datetime('now') WHERE id = ?").bind(postId).run()

  await addReputationEvent(env, user.sub, 'commented', 1, postId)
  await incrementStat(env, user.sub, 'comments_created')

  const { results } = await env.DB.prepare(`
    SELECT c.*, up.user_name, up.avatar_url, up.username
    FROM research_comments c
    LEFT JOIN user_profiles up ON up.user_id = c.user_id
    WHERE c.id = ?
  `).bind(id).all()

  return json({ comment: results[0] }, 201)
}

export async function handleDeleteResearchComment(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const postId = parts[3]
  const commentId = parts[5]
  if (!postId || !commentId) return json({ error: 'Post ID and Comment ID required' }, 400)

  const { results: existing } = await env.DB.prepare('SELECT user_id FROM research_comments WHERE id = ? AND post_id = ?').bind(commentId, postId).all()
  if (!existing.length) return json({ error: 'Comment not found' }, 404)
  if (existing[0].user_id !== user.sub) return json({ error: 'Forbidden' }, 403)

  await env.DB.prepare('DELETE FROM research_comments WHERE id = ?').bind(commentId).run()
  await env.DB.prepare("UPDATE research_posts SET comments_count = comments_count - 1, updated_at = datetime('now') WHERE id = ?").bind(postId).run()

  return json({ ok: true })
}

export async function handleMarkHelped(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const body = await request.json()
  const { help_type, note = '' } = body
  if (!help_type) return json({ error: 'help_type is required' }, 400)

  const validTypes = ['helped', 'completed_survey', 'collaborated', 'reviewed_paper', 'statistical_help', 'data_collection']
  if (!validTypes.includes(help_type)) return json({ error: 'Invalid help_type' }, 400)

  const { results: postResults } = await env.DB.prepare('SELECT user_id FROM research_posts WHERE id = ?').bind(postId).all()
  if (!postResults.length) return json({ error: 'Post not found' }, 404)
  if (postResults[0].user_id !== user.sub) return json({ error: 'Only post owner can mark as helped' }, 403)

  const points = REPUTATION_POINTS[help_type] || 0
  const id = uuid()
  await env.DB.prepare('INSERT INTO research_helped_marks (id, post_id, helper_id, marked_by, help_type, note) VALUES (?, ?, ?, ?, ?, ?)').bind(id, postId, user.sub, user.sub, help_type, note).run()

  await env.DB.prepare("UPDATE research_posts SET helped_count = helped_count + 1, updated_at = datetime('now') WHERE id = ?").bind(postId).run()

  await addReputationEvent(env, user.sub, help_type, points, postId)
  await incrementStat(env, user.sub, 'comments_helpful')

  if (help_type === 'completed_survey') {
    await incrementStat(env, user.sub, 'surveys_completed')
  }
  if (help_type === 'collaborated') {
    await incrementStat(env, user.sub, 'collaborations_joined')
  }

  const { results } = await env.DB.prepare(`
    SELECT h.*, up.user_name, up.avatar_url, up.username
    FROM research_helped_marks h
    LEFT JOIN user_profiles up ON up.user_id = h.helper_id
    WHERE h.id = ?
  `).bind(id).all()

  return json({ mark: results[0] }, 201)
}

export async function handleGetHelpedMarks(request, env, user) {
  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const { results } = await env.DB.prepare(`
    SELECT h.*, up.user_name, up.avatar_url, up.username
    FROM research_helped_marks h
    LEFT JOIN user_profiles up ON up.user_id = h.helper_id
    WHERE h.post_id = ?
    ORDER BY h.created_at DESC
  `).bind(postId).all()

  return json({ helped: results })
}

export async function handleToggleBookmark(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const { results: existing } = await env.DB.prepare('SELECT id FROM research_bookmarks WHERE post_id = ? AND user_id = ?').bind(postId, user.sub).all()

  let bookmarked
  if (existing.length) {
    await env.DB.prepare('DELETE FROM research_bookmarks WHERE id = ?').bind(existing[0].id).run()
    await env.DB.prepare("UPDATE research_posts SET bookmarks_count = bookmarks_count - 1, updated_at = datetime('now') WHERE id = ?").bind(postId).run()
    bookmarked = false
  } else {
    await env.DB.prepare('INSERT INTO research_bookmarks (id, user_id, post_id) VALUES (?, ?, ?)').bind(uuid(), user.sub, postId).run()
    await env.DB.prepare("UPDATE research_posts SET bookmarks_count = bookmarks_count + 1, updated_at = datetime('now') WHERE id = ?").bind(postId).run()
    bookmarked = true
  }

  const { results } = await env.DB.prepare('SELECT bookmarks_count FROM research_posts WHERE id = ?').bind(postId).all()
  const bookmarks_count = results[0]?.bookmarks_count || 0

  return json({ bookmarked, bookmarks_count })
}

export async function handleGetBookmarks(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const { results } = await env.DB.prepare(`
    SELECT p.*, up.user_name, up.avatar_url, up.username, b.created_at as bookmarked_at
    FROM research_bookmarks b
    JOIN research_posts p ON p.id = b.post_id
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).bind(user.sub).all()

  for (const post of results) {
    const { results: tags } = await env.DB.prepare('SELECT tag FROM research_post_tags WHERE post_id = ?').bind(post.id).all()
    post.tags = tags.map(t => t.tag)
  }

  return json({ bookmarks: results })
}

export async function handleReportPost(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const postId = url.pathname.split('/')[3]
  if (!postId) return json({ error: 'Post ID required' }, 400)

  const body = await request.json()
  const { reason } = body
  if (!reason) return json({ error: 'Reason is required' }, 400)

  const validReasons = ['spam', 'scam', 'fake_survey', 'inappropriate', 'broken_link', 'other']
  if (!validReasons.includes(reason)) return json({ error: 'Invalid reason' }, 400)

  const { results: postCheck } = await env.DB.prepare('SELECT id FROM research_posts WHERE id = ?').bind(postId).all()
  if (!postCheck.length) return json({ error: 'Post not found' }, 404)

  const id = uuid()
  await env.DB.prepare('INSERT INTO research_reports (id, post_id, reported_by, reason) VALUES (?, ?, ?, ?)').bind(id, postId, user.sub, reason).run()

  return json({ ok: true }, 201)
}

export async function handleGetResearchProfile(request, env, user) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM user_research_profile WHERE user_id = ?').bind(userId).all()

  if (!results.length) {
    return json({ profile: {
      user_id: userId,
      bio: '',
      institution: '',
      department: '',
      research_interests: '',
      orcid: '',
      google_scholar: '',
      researchgate: '',
      linkedin: '',
      visibility: 'public',
      updated_at: null,
    }})
  }

  return json({ profile: results[0] })
}

export async function handleUpdateResearchProfile(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)
  if (user.sub !== userId) return json({ error: 'Forbidden' }, 403)

  const body = await request.json()
  const { bio, institution, department, research_interests, orcid, google_scholar, researchgate, linkedin, visibility } = body

  await env.DB.prepare(`
    INSERT INTO user_research_profile (user_id, bio, institution, department, research_interests, orcid, google_scholar, researchgate, linkedin, visibility, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      bio = excluded.bio,
      institution = excluded.institution,
      department = excluded.department,
      research_interests = excluded.research_interests,
      orcid = excluded.orcid,
      google_scholar = excluded.google_scholar,
      researchgate = excluded.researchgate,
      linkedin = excluded.linkedin,
      visibility = excluded.visibility,
      updated_at = datetime('now')
  `).bind(
    userId,
    bio || '',
    institution || '',
    department || '',
    research_interests || '',
    orcid || '',
    google_scholar || '',
    researchgate || '',
    linkedin || '',
    visibility || 'public'
  ).run()

  const { results } = await env.DB.prepare('SELECT * FROM user_research_profile WHERE user_id = ?').bind(userId).all()

  return json({ profile: results[0] })
}

export async function handleGetResearchSkills(request, env, user) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM user_research_skills WHERE user_id = ? ORDER BY skill').bind(userId).all()

  return json({ skills: results })
}

export async function handleAddResearchSkill(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)
  if (user.sub !== userId) return json({ error: 'Forbidden' }, 403)

  const body = await request.json()
  const { skill, proficiency = 'intermediate', is_custom = 0 } = body
  if (!skill || !skill.trim()) return json({ error: 'Skill is required' }, 400)

  const id = uuid()
  await env.DB.prepare('INSERT OR IGNORE INTO user_research_skills (id, user_id, skill, proficiency, is_custom) VALUES (?, ?, ?, ?, ?)').bind(id, userId, skill.trim(), proficiency, is_custom ? 1 : 0).run()

  const { results } = await env.DB.prepare('SELECT * FROM user_research_skills WHERE user_id = ? AND skill = ?').bind(userId, skill.trim()).all()

  return json({ skill: results[0] }, 201)
}

export async function handleDeleteResearchSkill(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const userId = parts[3]
  const skillId = parts[5]
  if (!userId || !skillId) return json({ error: 'User ID and Skill ID required' }, 400)
  if (user.sub !== userId) return json({ error: 'Forbidden' }, 403)

  await env.DB.prepare('DELETE FROM user_research_skills WHERE id = ? AND user_id = ?').bind(skillId, userId).run()

  return json({ ok: true })
}

export async function handleGetPredefinedSkills(request, env, user) {
  const PREDEFINED_SKILLS = [
    'Literature Review', 'SPSS', 'R', 'Python', 'Meta-analysis', 'PRISMA',
    'Systematic Review', 'Clinical Trials', 'Survey Design', 'Biostatistics',
    'Research Ethics', 'Data Visualization', 'Data Collection', 'Scientific Writing',
    'EndNote', 'Zotero', 'Covidence', 'Research Methodology', 'Data Analysis',
    'Grant Writing', 'Case Report Writing', 'Research Project Management', 'Qualitative Research',
  ]

  return json({ skills: PREDEFINED_SKILLS })
}

export async function handleGetResearchStats(request, env, user) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM user_research_stats WHERE user_id = ?').bind(userId).all()

  if (!results.length) {
    return json({ stats: {
      user_id: userId,
      score: 0,
      level: 'Beginner',
      posts_created: 0,
      posts_closed: 0,
      comments_created: 0,
      comments_helpful: 0,
      upvotes_received: 0,
      upvotes_given: 0,
      surveys_completed: 0,
      collaborations_joined: 0,
      papers_shared: 0,
      projects_created: 0,
      followers_from_research: 0,
      last_activity: null,
      updated_at: null,
    }})
  }

  return json({ stats: results[0] })
}

export async function handleGetResearchEvents(request, env, user) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)

  const { results } = await env.DB.prepare(
    'SELECT * FROM research_reputation_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(userId).all()

  return json({ events: results })
}

export async function handleGetPortfolio(request, env, user) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)

  const { results } = await env.DB.prepare(
    'SELECT * FROM research_portfolio WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()

  return json({ portfolio: results })
}

export async function handleAddPortfolioEntry(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  if (!userId) return json({ error: 'User ID required' }, 400)
  if (user.sub !== userId) return json({ error: 'Forbidden' }, 403)

  const body = await request.json()
  const { title, research_type = '', role = 'other', status = 'ongoing', specialty = '', journal = '', publication_date = '', doi = '', pmid = '', github_url = '', pdf_url = '', authors = '', abstract: abs = '' } = body
  if (!title || !title.trim()) return json({ error: 'Title is required' }, 400)
  if (!role) return json({ error: 'Role is required' }, 400)

  const id = uuid()
  await env.DB.prepare(`
    INSERT INTO research_portfolio (id, user_id, title, research_type, role, status, specialty, journal, publication_date, doi, pmid, github_url, pdf_url, authors, abstract)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, title.trim(), research_type, role, status, specialty, journal, publication_date, doi, pmid, github_url, pdf_url, authors, abs).run()

  await incrementStat(env, user.sub, 'projects_created')

  const { results } = await env.DB.prepare('SELECT * FROM research_portfolio WHERE id = ?').bind(id).all()

  return json({ project: results[0] }, 201)
}

export async function handleUpdatePortfolioEntry(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const userId = parts[3]
  const pid = parts[5]
  if (!userId || !pid) return json({ error: 'User ID and Project ID required' }, 400)
  if (user.sub !== userId) return json({ error: 'Forbidden' }, 403)

  const { results: existing } = await env.DB.prepare('SELECT user_id FROM research_portfolio WHERE id = ?').bind(pid).all()
  if (!existing.length) return json({ error: 'Project not found' }, 404)

  const body = await request.json()
  const { title, research_type, role, status, specialty, journal, publication_date, doi, pmid, github_url, pdf_url, authors, abstract: abs } = body

  const fields = []
  const params = []

  if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()) }
  if (research_type !== undefined) { fields.push('research_type = ?'); params.push(research_type) }
  if (role !== undefined) { fields.push('role = ?'); params.push(role) }
  if (status !== undefined) { fields.push('status = ?'); params.push(status) }
  if (specialty !== undefined) { fields.push('specialty = ?'); params.push(specialty) }
  if (journal !== undefined) { fields.push('journal = ?'); params.push(journal) }
  if (publication_date !== undefined) { fields.push('publication_date = ?'); params.push(publication_date) }
  if (doi !== undefined) { fields.push('doi = ?'); params.push(doi) }
  if (pmid !== undefined) { fields.push('pmid = ?'); params.push(pmid) }
  if (github_url !== undefined) { fields.push('github_url = ?'); params.push(github_url) }
  if (pdf_url !== undefined) { fields.push('pdf_url = ?'); params.push(pdf_url) }
  if (authors !== undefined) { fields.push('authors = ?'); params.push(authors) }
  if (abs !== undefined) { fields.push('abstract = ?'); params.push(abs) }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    params.push(pid)
    await env.DB.prepare(`UPDATE research_portfolio SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
  }

  const { results } = await env.DB.prepare('SELECT * FROM research_portfolio WHERE id = ?').bind(pid).all()

  return json({ project: results[0] })
}

export async function handleDeletePortfolioEntry(request, env, user) {
  if (!user?.sub) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const userId = parts[3]
  const pid = parts[5]
  if (!userId || !pid) return json({ error: 'User ID and Project ID required' }, 400)
  if (user.sub !== userId) return json({ error: 'Forbidden' }, 403)

  const { results: existing } = await env.DB.prepare('SELECT user_id FROM research_portfolio WHERE id = ?').bind(pid).all()
  if (!existing.length) return json({ error: 'Project not found' }, 404)

  await env.DB.prepare('DELETE FROM research_portfolio WHERE id = ?').bind(pid).run()

  return json({ ok: true })
}
