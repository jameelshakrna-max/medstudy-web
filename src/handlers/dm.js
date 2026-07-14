import { uuid, json, extractId, safeString } from '../lib/worker-utils.js'
import { createAuth } from '../_auth.js'

function broadcastDMEvent(env, conversationId, event) {
  try {
    const id = env.DM_REALTIME_ROOM.idFromName(conversationId)
    const stub = env.DM_REALTIME_ROOM.get(id)
    return stub.fetch('http://dummy/broadcast', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  } catch {}
}

export async function handleListConversations(request, env, user) {
  try {
    const { results: conversations } = await env.DB.prepare(
      `SELECT c.id, c.updated_at,
        cm.user_id as other_user_id, cm2.user_id as my_user_id,
        cm2.last_read_at
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id != ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      ORDER BY c.updated_at DESC`
    ).bind(user.sub, user.sub).all()

    const result = []
    for (const conv of conversations) {
      const { results: profiles } = await env.DB.prepare(
        'SELECT user_id, display_name, avatar_url, username FROM user_profiles WHERE user_id = ?'
      ).bind(conv.other_user_id).all()

      const { results: lastMsg } = await env.DB.prepare(
        'SELECT id, content, user_id, created_at, message_type FROM direct_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(conv.id).all()

      const { results: unread } = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM direct_messages WHERE conversation_id = ? AND user_id != ? AND created_at > ?'
      ).bind(conv.id, user.sub, conv.last_read_at || '1970-01-01T00:00:00.000Z').all()

      result.push({
        id: conv.id,
        other_user: profiles[0] || { user_id: conv.other_user_id, display_name: null, avatar_url: null, username: null },
        last_message: lastMsg[0] || null,
        unread_count: unread[0]?.count || 0,
      })
    }

    return json(result)
  } catch (e) {
    return json({ error: 'Failed to list conversations' }, 500)
  }
}

export async function handleCreateConversation(request, env, user) {
  try {
    const body = await request.json()
    const targetUserId = body.user_id
    if (!targetUserId || targetUserId === user.sub) {
      return json({ error: 'Invalid target user' }, 400)
    }

    const { results: existing } = await env.DB.prepare(
      `SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      LIMIT 1`
    ).bind(user.sub, targetUserId).all()

    if (existing.length > 0) {
      return json({ id: existing[0].id, created: false })
    }

    const convId = 'conv_' + uuid()
    const now = new Date().toISOString()

    await env.DB.prepare('INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)')
      .bind(convId, now, now).run()

    await env.DB.prepare(
      'INSERT INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)'
    ).bind(uuid(), convId, user.sub).run()

    await env.DB.prepare(
      'INSERT INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)'
    ).bind(uuid(), convId, targetUserId).run()

    return json({ id: convId, created: true })
  } catch (e) {
    return json({ error: 'Failed to create conversation' }, 500)
  }
}

export async function handleGetDMMessages(request, env, user) {
  try {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const conversationId = parts[3]
    const before = url.searchParams.get('before')
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20')), 100)

    const { results: member } = await env.DB.prepare(
      'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).bind(conversationId, user.sub).all()

    if (member.length === 0) {
      return json({ error: 'Not a member of this conversation' }, 403)
    }

    let query
    let params

    if (before) {
      const { results: cursorMsg } = await env.DB.prepare(
        'SELECT created_at FROM direct_messages WHERE id = ? AND conversation_id = ?'
      ).bind(before, conversationId).all()

      if (cursorMsg.length > 0) {
        query = 'SELECT * FROM direct_messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
        params = [conversationId, cursorMsg[0].created_at, limit]
      } else {
        query = 'SELECT * FROM direct_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
        params = [conversationId, limit]
      }
    } else {
      query = 'SELECT * FROM direct_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
      params = [conversationId, limit]
    }

    const { results: messages } = await env.DB.prepare(query).bind(...params).all()

    return json(messages)
  } catch (e) {
    return json({ error: 'Failed to get messages' }, 500)
  }
}

export async function handleSendDM(request, env, user) {
  try {
    const parts = new URL(request.url).pathname.split('/')
    const conversationId = parts[3]

    const { results: member } = await env.DB.prepare(
      'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).bind(conversationId, user.sub).all()

    if (member.length === 0) {
      return json({ error: 'Not a member of this conversation' }, 403)
    }

    let content = ''
    let messageType = 'text'
    let fileKey = null
    let fileName = null

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && typeof file !== 'string') {
        const ext = file.name.split('.').pop() || 'bin'
        const key = `dm/${conversationId}/${uuid()}.${ext}`
        await env.IMAGES.put(key, file)
        fileKey = key
        fileName = file.name
        messageType = 'file'
      }
      content = safeString(formData.get('content') || '', 5000)
    } else {
      const body = await request.json()
      content = safeString(body.content || '', 5000)
      if (!content) {
        return json({ error: 'Content is required' }, 400)
      }
    }

    const msgId = 'dm_' + uuid()
    const now = new Date().toISOString()

    await env.DB.prepare(
      'INSERT INTO direct_messages (id, conversation_id, user_id, content, message_type, file_key, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(msgId, conversationId, user.sub, content, messageType, fileKey, fileName, now).run()

    await env.DB.prepare(
      'UPDATE conversations SET updated_at = ? WHERE id = ?'
    ).bind(now, conversationId).run()

    const { results: otherMembers } = await env.DB.prepare(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?'
    ).bind(conversationId, user.sub).all()

    for (const member of otherMembers) {
      await env.DB.prepare(
        'INSERT INTO notifications (id, user_id, type, title, body, data, category, action_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        uuid(), member.user_id, 'dm', 'New message',
        content.slice(0, 200), JSON.stringify({ conversation_id: conversationId, message_id: msgId }),
        'dm', `/messages/${conversationId}`
      ).run()
    }

    const message = { id: msgId, user_id: user.sub, content, message_type: messageType, file_key: fileKey, file_name: fileName, edited_at: null, deleted_at: null, created_at: now }

    broadcastDMEvent(env, conversationId, { type: 'message:new', message })

    return json(message)
  } catch (e) {
    return json({ error: 'Failed to send message' }, 500)
  }
}

export async function handleDeleteDM(request, env, user) {
  try {
    const parts = new URL(request.url).pathname.split('/')
    const messageId = parts[parts.length - 1]
    const conversationId = parts[parts.length - 3]

    const { results: msg } = await env.DB.prepare(
      'SELECT id, user_id FROM direct_messages WHERE id = ? AND conversation_id = ?'
    ).bind(messageId, conversationId).all()

    if (msg.length === 0) {
      return json({ error: 'Message not found' }, 404)
    }
    if (msg[0].user_id !== user.sub) {
      return json({ error: 'Not authorized' }, 403)
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      'UPDATE direct_messages SET deleted_at = ? WHERE id = ?'
    ).bind(now, messageId).run()

    broadcastDMEvent(env, conversationId, { type: 'message:delete', message_id: messageId })

    return json({ success: true })
  } catch (e) {
    return json({ error: 'Failed to delete message' }, 500)
  }
}

export async function handleMarkDMRead(request, env, user) {
  try {
    const parts = new URL(request.url).pathname.split('/')
    const conversationId = parts[3]

    const { results: member } = await env.DB.prepare(
      'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).bind(conversationId, user.sub).all()

    if (member.length === 0) {
      return json({ error: 'Not a member' }, 403)
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      'UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
    ).bind(now, conversationId, user.sub).run()

    return json({ success: true })
  } catch (e) {
    return json({ error: 'Failed to mark as read' }, 500)
  }
}

export async function handleStartDMWithUser(request, env, user) {
  try {
    const parts = new URL(request.url).pathname.split('/')
    const targetUserId = parts[3]

    const { results: existing } = await env.DB.prepare(
      `SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      LIMIT 1`
    ).bind(user.sub, targetUserId).all()

    if (existing.length > 0) {
      return json({ conversation_id: existing[0].id })
    }

    if (targetUserId === user.sub) {
      return json({ error: 'Cannot DM yourself' }, 400)
    }

    const convId = 'conv_' + uuid()
    const now = new Date().toISOString()

    await env.DB.prepare('INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)')
      .bind(convId, now, now).run()

    await env.DB.prepare(
      'INSERT INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)'
    ).bind(uuid(), convId, user.sub).run()

    await env.DB.prepare(
      'INSERT INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)'
    ).bind(uuid(), convId, targetUserId).run()

    return json({ conversation_id: convId })
  } catch (e) {
    return json({ error: 'Failed to start DM' }, 500)
  }
}

export async function handleDMWebSocketUpgrade(request, env) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const conversationId = parts[3]

  const jwt = url.searchParams.get('jwt') || request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const verifyAuth = createAuth(env)
  const user = await verifyAuth(jwt)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { results: member } = await env.DB.prepare(
    'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
  ).bind(conversationId, user.sub).all()

  if (member.length === 0) return json({ error: 'Not a member' }, 403)

  const id = env.DM_REALTIME_ROOM.idFromName(conversationId)
  const stub = env.DM_REALTIME_ROOM.get(id)
  return stub.fetch(request)
}
