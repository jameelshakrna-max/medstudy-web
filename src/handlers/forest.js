import { json } from '../lib/worker-utils.js'

const FREE_TREES = ['oak', 'sakura']

export async function handleGetForestInventory(request, env, user) {
  const { results: inventory } = await env.DB.prepare(
    'SELECT tree_id, purchased_at, purchase_type FROM user_forest_inventory WHERE user_id = ?'
  ).bind(user.sub).all()

  const { results: settings } = await env.DB.prepare(
    'SELECT selected_tree, coins FROM user_forest_settings WHERE user_id = ?'
  ).bind(user.sub).all()

  const owned = inventory.map(r => r.tree_id)
  // Ensure free trees are always in the list
  const allOwned = [...new Set([...FREE_TREES, ...owned])]

  const setting = settings[0] || { selected_tree: 'oak', coins: 0 }

  return json({
    owned: allOwned,
    selectedTree: setting.selected_tree,
    coins: setting.coins,
  })
}

export async function handleUpdateSelectedTree(request, env, user) {
  const { treeId } = await request.json()

  if (!treeId || typeof treeId !== 'string') {
    return json({ error: 'treeId required' }, 400)
  }

  // Verify user owns this tree
  const isFree = FREE_TREES.includes(treeId)
  if (!isFree) {
    const { results } = await env.DB.prepare(
      'SELECT 1 FROM user_forest_inventory WHERE user_id = ? AND tree_id = ?'
    ).bind(user.sub, treeId).all()

    if (results.length === 0) {
      return json({ error: 'Tree not owned' }, 403)
    }
  }

  await env.DB.prepare(
    `INSERT INTO user_forest_settings (user_id, selected_tree, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET selected_tree = excluded.selected_tree, updated_at = datetime('now')`
  ).bind(user.sub, treeId).run()

  return json({ ok: true, selectedTree: treeId })
}

const TREE_PRICES = {
  pine: 500, maple: 750, bamboo: 1000,
  willow: 1250, baobab: 1500, eucalyptus: 2000,
}

const ACHIEVEMENTS = [
  { treeId: 'crystal', name: 'Crystal Tree', criteria: 'totalFocusMinutes >= 6000 (100h)' },
  { treeId: 'cosmic', name: 'Cosmic Pine', criteria: 'longestStreak >= 365' },
]

function calculateCoins(focusMinutes, streak) {
  const base = 10
  const durationBonus = Math.floor(focusMinutes / 5) - 5
  const streakBonus = Math.min(streak, 7)
  return base + Math.max(durationBonus, 0) + streakBonus
}

export async function handleEarnCoins(request, env, user) {
  const { focusMinutes, streak } = await request.json()

  if (!focusMinutes || focusMinutes < 1) {
    return json({ error: 'focusMinutes must be >= 1' }, 400)
  }

  const coins = calculateCoins(focusMinutes, streak || 0)

  await env.DB.prepare(
    `INSERT INTO user_forest_settings (user_id, coins, total_focus_minutes, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       coins = coins + excluded.coins,
       total_focus_minutes = total_focus_minutes + excluded.total_focus_minutes,
       updated_at = datetime('now')`
  ).bind(user.sub, coins, focusMinutes).run()

  await env.DB.prepare(
    `INSERT INTO forest_coin_transactions (id, user_id, amount, reason)
     VALUES (?, ?, ?, 'focus_session')`
  ).bind(crypto.randomUUID(), user.sub, coins).run()

  const { results: settingsRows } = await env.DB.prepare(
    'SELECT total_focus_minutes, coins FROM user_forest_settings WHERE user_id = ?'
  ).bind(user.sub).all()
  const settings = settingsRows[0] || { total_focus_minutes: 0, coins: 0 }

  const { results: statsRows } = await env.DB.prepare(
    'SELECT current_streak, longest_streak FROM user_stats WHERE user_id = ?'
  ).bind(user.sub).all()
  const stats = statsRows[0] || { current_streak: 0, longest_streak: 0 }

  const { results: ownedRows } = await env.DB.prepare(
    'SELECT tree_id FROM user_forest_inventory WHERE user_id = ?'
  ).bind(user.sub).all()
  const ownedSet = new Set(ownedRows.map(r => r.tree_id))

  const achievements = []

  if (settings.total_focus_minutes >= 6000 && !ownedSet.has('crystal')) {
    await env.DB.prepare(
      `INSERT INTO user_forest_inventory (user_id, tree_id, purchase_type) VALUES (?, 'crystal', 'achievement')`
    ).bind(user.sub).run()
    achievements.push({ treeId: 'crystal', newlyUnlocked: true })
  }

  if (stats.longest_streak >= 365 && !ownedSet.has('cosmic')) {
    await env.DB.prepare(
      `INSERT INTO user_forest_inventory (user_id, tree_id, purchase_type) VALUES (?, 'cosmic', 'achievement')`
    ).bind(user.sub).run()
    achievements.push({ treeId: 'cosmic', newlyUnlocked: true })
  }

  return json({
    coinsEarned: coins,
    newBalance: settings.coins,
    totalFocusMinutes: settings.total_focus_minutes,
    achievements,
  })
}

export async function handlePurchaseTree(request, env, user) {
  const { treeId } = await request.json()

  if (!treeId || typeof treeId !== 'string') {
    return json({ error: 'treeId required' }, 400)
  }

  const price = TREE_PRICES[treeId]
  if (price === undefined) {
    return json({ error: 'Invalid tree' }, 400)
  }

  if (FREE_TREES.includes(treeId)) {
    return json({ error: 'Tree is free' }, 400)
  }

  const { results: existing } = await env.DB.prepare(
    'SELECT 1 FROM user_forest_inventory WHERE user_id = ? AND tree_id = ?'
  ).bind(user.sub, treeId).all()

  if (existing.length > 0) {
    return json({ error: 'Already owned' }, 400)
  }

  const { results: settingsRows } = await env.DB.prepare(
    'SELECT coins FROM user_forest_settings WHERE user_id = ?'
  ).bind(user.sub).all()

  const currentCoins = settingsRows[0]?.coins || 0
  if (currentCoins < price) {
    return json({ error: 'Insufficient coins', currentCoins, required: price }, 400)
  }

  const { meta } = await env.DB.prepare(
    `UPDATE user_forest_settings SET coins = coins - ?, updated_at = datetime('now') WHERE user_id = ? AND coins >= ?`
  ).bind(price, user.sub, price).run()

  if (meta.changes === 0) {
    return json({ error: 'Insufficient coins' }, 400)
  }

  await env.DB.prepare(
    `INSERT INTO user_forest_inventory (user_id, tree_id, purchase_type) VALUES (?, ?, 'coins')`
  ).bind(user.sub, treeId).run()

  const { results: updated } = await env.DB.prepare(
    'SELECT coins FROM user_forest_settings WHERE user_id = ?'
  ).bind(user.sub).all()

  return json({ ok: true, newBalance: updated[0]?.coins || 0, treeId })
}

export async function handleGetForestStats(request, env, user) {
  const { results: settingsRows } = await env.DB.prepare(
    'SELECT coins, total_focus_minutes FROM user_forest_settings WHERE user_id = ?'
  ).bind(user.sub).all()
  const settings = settingsRows[0] || { coins: 0, total_focus_minutes: 0 }

  const { results: statsRows } = await env.DB.prepare(
    'SELECT current_streak, longest_streak, study_hours FROM user_stats WHERE user_id = ?'
  ).bind(user.sub).all()
  const stats = statsRows[0] || { current_streak: 0, longest_streak: 0, study_hours: 0 }

  const { results: ownedRows } = await env.DB.prepare(
    'SELECT tree_id FROM user_forest_inventory WHERE user_id = ?'
  ).bind(user.sub).all()
  const ownedSet = new Set([...FREE_TREES, ...ownedRows.map(r => r.tree_id)])

  const achievements = ACHIEVEMENTS.map(a => ({
    treeId: a.treeId,
    name: a.name,
    unlocked: a.treeId === 'crystal'
      ? settings.total_focus_minutes >= 6000
      : stats.longest_streak >= 365,
    criteria: a.criteria,
  }))

  return json({
    coins: settings.coins,
    totalFocusMinutes: settings.total_focus_minutes,
    currentStreak: stats.current_streak,
    longestStreak: stats.longest_streak,
    studyHours: stats.study_hours,
    achievements,
  })
}
