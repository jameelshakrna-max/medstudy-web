import { uuid, json, extractId } from '../lib/worker-utils.js'

const ROTATION_SUBJECT_MAP = {
  'Cardiology': 'cardiology',
  'Pulmonology': 'respiratory',
  'Gastroenterology': 'gastroenterology',
  'Endocrinology': 'endocrinology',
  'Neurology': 'neurology',
  'Rheumatology': 'rheumatology',
  'Nephrology': 'nephrology',
  'Fluids, Electrolytes & Acid-Base': 'nephrology',
  'Hematology & Oncology': 'hematology',
  'Infectious Disease': 'infectious',
  'Dermatology & Hypersensitivity': 'dermatology',
  'Ambulatory Medicine': 'other',
  'Emergency Medicine': 'emergency',
  'Pediatrics': 'pediatrics',
  'Psychiatry': 'psychiatry',
  'General Surgery': 'other',
  'Orthopedics': 'other',
  'Urology': 'other',
}

// ── Get all plans for user ──
export async function handleGetPlans(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM rotation_plans WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.sub).all()
    return json(results)
  } catch (e) {
    return json({ error: 'Failed to fetch plans' }, 500)
  }
}

// ── Create a new plan ──
export async function handleCreatePlan(request, env, user) {
  try {
    const body = await request.json()
    const {
      name, rotation, source_id, start_date, end_date, exam_date,
      study_style, uworld_mode, planning_buffer_minutes,
      uworld_total_questions, preferred_questions_per_day,
      questions_per_day_min, questions_per_day_max,
      avg_minutes_per_question, scheduling_style,
      flashcard_review_enabled, flashcard_max_minutes,
      availability,
    } = body

    // Validate required fields
    if (!name) return json({ error: 'name is required' }, 400)
    if (!rotation) return json({ error: 'rotation is required' }, 400)
    if (!source_id) return json({ error: 'source_id is required' }, 400)
    if (!start_date) return json({ error: 'start_date is required' }, 400)
    if (!end_date) return json({ error: 'end_date is required' }, 400)
    if (!availability || !Array.isArray(availability) || availability.length !== 7) {
      return json({ error: 'availability must be an array of 7 entries' }, 400)
    }

    const planId = uuid()
    const now = new Date().toISOString()

    // Build plan insert
    const planStmt = env.DB.prepare(
      `INSERT INTO rotation_plans (
        id, user_id, name, rotation, source_id, start_date, end_date, exam_date,
        study_style, uworld_mode, planning_buffer_minutes,
        uworld_total_questions, preferred_questions_per_day,
        questions_per_day_min, questions_per_day_max,
        avg_minutes_per_question, scheduling_style,
        flashcard_review_enabled, flashcard_max_minutes,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).bind(
      planId, user.sub, name, rotation, source_id, start_date, end_date,
      exam_date || null,
      study_style || 'active',
      uworld_mode || 'timed',
      planning_buffer_minutes ?? 30,
      uworld_total_questions ?? 0,
      preferred_questions_per_day ?? 30,
      questions_per_day_min ?? 20,
      questions_per_day_max ?? 40,
      avg_minutes_per_question ?? 1.5,
      scheduling_style || 'efficient',
      flashcard_review_enabled ?? 1,
      flashcard_max_minutes ?? 30,
      now, now
    )

    // Build availability inserts
    const availStmts = availability.map((a) => {
      const availId = uuid()
      return env.DB.prepare(
        `INSERT INTO rotation_availability (id, plan_id, day_of_week, available_minutes, is_hospital_day, is_day_off)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        availId, planId, a.day_of_week,
        a.available_minutes ?? 0,
        a.is_hospital_day ? 1 : 0,
        a.is_day_off ? 1 : 0
      )
    })

    await env.DB.batch([planStmt, ...availStmts])

    // Fetch the created plan + availability
    const { results: planRows } = await env.DB.prepare(
      'SELECT * FROM rotation_plans WHERE id = ?'
    ).bind(planId).all()

    const { results: availRows } = await env.DB.prepare(
      'SELECT * FROM rotation_availability WHERE plan_id = ? ORDER BY day_of_week'
    ).bind(planId).all()

    return json({ success: true, plan: { ...planRows[0], availability: availRows } }, 201)
  } catch (e) {
    return json({ error: 'Failed to create plan' }, 500)
  }
}

// ── Get single plan with all related data ──
export async function handleGetPlan(request, env, user) {
  try {
    const planId = extractId(request.url)

    const { results: planRows } = await env.DB.prepare(
      'SELECT * FROM rotation_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).all()

    if (!planRows.length) return json({ error: 'Plan not found' }, 404)

    const { results: availability } = await env.DB.prepare(
      'SELECT * FROM rotation_availability WHERE plan_id = ? ORDER BY day_of_week'
    ).bind(planId).all()

    const { results: schedule } = await env.DB.prepare(
      'SELECT * FROM rotation_schedule WHERE plan_id = ? ORDER BY date, sort_order'
    ).bind(planId).all()

    const { results: progress } = await env.DB.prepare(
      'SELECT * FROM rotation_topic_progress WHERE plan_id = ? ORDER BY created_at DESC'
    ).bind(planId).all()

    return json({
      plan: planRows[0],
      availability,
      schedule,
      progress,
    })
  } catch (e) {
    return json({ error: 'Failed to fetch plan' }, 500)
  }
}

// ── Update a plan ──
export async function handleUpdatePlan(request, env, user) {
  try {
    const planId = extractId(request.url)
    const body = await request.json()
    const { availability, ...planFields } = body

    // Verify ownership
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM rotation_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).all()
    if (!existing.length) return json({ error: 'Plan not found' }, 404)

    // Build dynamic update for plan fields
    const allowedFields = [
      'name', 'rotation', 'source_id', 'start_date', 'end_date', 'exam_date',
      'study_style', 'uworld_mode', 'planning_buffer_minutes',
      'uworld_total_questions', 'preferred_questions_per_day',
      'questions_per_day_min', 'questions_per_day_max',
      'avg_minutes_per_question', 'scheduling_style',
      'flashcard_review_enabled', 'flashcard_max_minutes',
      'status',
    ]

    const stmts = []

    const fields = []
    const binds = []
    for (const f of allowedFields) {
      if (planFields[f] !== undefined) {
        fields.push(`${f} = ?`)
        binds.push(planFields[f])
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      binds.push(planId)
      stmts.push(
        env.DB.prepare(`UPDATE rotation_plans SET ${fields.join(', ')} WHERE id = ?`).bind(...binds)
      )
    }

    // Replace availability if provided
    if (availability && Array.isArray(availability)) {
      stmts.push(
        env.DB.prepare('DELETE FROM rotation_availability WHERE plan_id = ?').bind(planId)
      )
      for (const a of availability) {
        const availId = uuid()
        stmts.push(
          env.DB.prepare(
            `INSERT INTO rotation_availability (id, plan_id, day_of_week, available_minutes, is_hospital_day, is_day_off)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            availId, planId, a.day_of_week,
            a.available_minutes ?? 0,
            a.is_hospital_day ? 1 : 0,
            a.is_day_off ? 1 : 0
          )
        )
      }
    }

    if (stmts.length === 0) return json({ error: 'No fields to update' }, 400)

    await env.DB.batch(stmts)
    return json({ success: true })
  } catch (e) {
    return json({ error: 'Failed to update plan' }, 500)
  }
}

// ── Delete a plan ──
export async function handleDeletePlan(request, env, user) {
  try {
    const planId = extractId(request.url)

    // Verify ownership
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM rotation_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).all()
    if (!existing.length) return json({ error: 'Plan not found' }, 404)

    await env.DB.prepare('DELETE FROM rotation_plans WHERE id = ?').bind(planId).run()
    return json({ success: true })
  } catch (e) {
    return json({ error: 'Failed to delete plan' }, 500)
  }
}

// ── Generate schedule (client sends pre-computed schedule) ──
export async function handleGenerateSchedule(request, env, user) {
  try {
    const planId = extractId(request.url)
    const body = await request.json()
    const { schedule } = body

    if (!schedule || !Array.isArray(schedule)) {
      return json({ error: 'schedule array is required' }, 400)
    }

    // Verify ownership
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM rotation_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).all()
    if (!existing.length) return json({ error: 'Plan not found' }, 404)

    const stmts = []

    // Delete existing non-completed entries
    stmts.push(
      env.DB.prepare(
        "DELETE FROM rotation_schedule WHERE plan_id = ? AND status != 'completed'"
      ).bind(planId)
    )

    // Batch insert new entries
    for (const entry of schedule) {
      const entryId = uuid()
      stmts.push(
        env.DB.prepare(
          `INSERT INTO rotation_schedule (
            id, plan_id, user_id, date, topic_id, activity_type, description,
            estimated_minutes, uworld_questions, uworld_mode, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          entryId, planId, user.sub,
          entry.date,
          entry.topic_id || null,
          entry.activity_type,
          entry.description || null,
          entry.estimated_minutes ?? null,
          entry.uworld_questions ?? 0,
          entry.uworld_mode || null,
          entry.sort_order ?? 0
        )
      )
    }

    await env.DB.batch(stmts)
    return json({ success: true, count: schedule.length })
  } catch (e) {
    return json({ error: 'Failed to generate schedule' }, 500)
  }
}

// ── Update a schedule entry ──
export async function handleUpdateEntry(request, env, user) {
  try {
    const entryId = extractId(request.url)
    const body = await request.json()
    const { status, actual_minutes } = body

    const fields = []
    const binds = []

    if (status !== undefined) {
      fields.push('status = ?')
      binds.push(status)
    }
    if (actual_minutes !== undefined) {
      fields.push('actual_minutes = ?')
      binds.push(actual_minutes)
    }

    if (fields.length === 0) return json({ error: 'No fields to update' }, 400)

    fields.push("updated_at = datetime('now')")
    binds.push(entryId, user.sub)

    const { meta } = await env.DB.prepare(
      `UPDATE rotation_schedule SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...binds).run()

    if (meta.changes === 0) return json({ error: 'Entry not found' }, 404)
    return json({ success: true })
  } catch (e) {
    return json({ error: 'Failed to update entry' }, 500)
  }
}

// ── Get topic progress for a plan ──
export async function handleGetProgress(request, env, user) {
  try {
    const planId = extractId(request.url)

    const { results } = await env.DB.prepare(
      'SELECT * FROM rotation_topic_progress WHERE plan_id = ? AND user_id = ? ORDER BY created_at DESC'
    ).bind(planId, user.sub).all()

    return json(results)
  } catch (e) {
    return json({ error: 'Failed to fetch progress' }, 500)
  }
}

// ── Update topic progress ──
export async function handleUpdateProgress(request, env, user) {
  try {
    const progressId = extractId(request.url)
    const body = await request.json()
    const {
      study_status, study_completed_at,
      uworld_status, uworld_questions_done, uworld_completed_at,
      confidence, notes,
    } = body

    const fields = []
    const binds = []

    if (study_status !== undefined) { fields.push('study_status = ?'); binds.push(study_status) }
    if (study_completed_at !== undefined) { fields.push('study_completed_at = ?'); binds.push(study_completed_at) }
    if (uworld_status !== undefined) { fields.push('uworld_status = ?'); binds.push(uworld_status) }
    if (uworld_questions_done !== undefined) { fields.push('uworld_questions_done = ?'); binds.push(uworld_questions_done) }
    if (uworld_completed_at !== undefined) { fields.push('uworld_completed_at = ?'); binds.push(uworld_completed_at) }
    if (confidence !== undefined) { fields.push('confidence = ?'); binds.push(confidence) }
    if (notes !== undefined) { fields.push('notes = ?'); binds.push(notes) }

    if (fields.length === 0) return json({ error: 'No fields to update' }, 400)

    fields.push("updated_at = datetime('now')")
    binds.push(progressId, user.sub)

    const { meta } = await env.DB.prepare(
      `UPDATE rotation_topic_progress SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...binds).run()

    if (meta.changes === 0) return json({ error: 'Progress record not found' }, 404)
    return json({ success: true })
  } catch (e) {
    return json({ error: 'Failed to update progress' }, 500)
  }
}

// ── Flashcard review summary for planner ──
export async function handleFlashcardSummary(request, env, user) {
  try {
    const now = new Date().toISOString()
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM flashcards WHERE user_id = ? AND (next_review IS NULL OR next_review <= ?)"
    ).bind(user.sub, now).all()

    const totalDueCards = results[0]?.count || 0
    const estimatedMinutes = Math.ceil(totalDueCards * 1.5)

    return json({ totalDueCards, estimatedMinutes })
  } catch (e) {
    return json({ error: 'Failed to fetch flashcard summary' }, 500)
  }
}

// ── Activate a plan (set active, complete all others) ──
export async function handleActivatePlan(request, env, user) {
  try {
    const planId = extractId(request.url)

    // Fetch the full plan record
    const { results: planRows } = await env.DB.prepare(
      'SELECT * FROM rotation_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).all()
    if (!planRows.length) return json({ error: 'Plan not found' }, 404)

    const plan = planRows[0]
    const deadline = plan.exam_date || plan.end_date

    // Build batch: deactivate active plans, activate target, insert goals
    const stmts = [
      env.DB.prepare(
        "UPDATE rotation_plans SET status = 'completed', updated_at = datetime('now') WHERE user_id = ? AND status = 'active'"
      ).bind(user.sub),
      env.DB.prepare(
        "UPDATE rotation_plans SET status = 'active', updated_at = datetime('now') WHERE id = ?"
      ).bind(planId),
    ]

    let goalsCreated = 0

    // ── Auto-create UWorld questions goal ──
    if (plan.uworld_total_questions && plan.uworld_total_questions > 0) {
      const subjectId = ROTATION_SUBJECT_MAP[plan.rotation] || 'other'
      const goalId = uuid()
      stmts.push(
        env.DB.prepare(
          `INSERT INTO goals (id, user_id, title, goal_type, target_value, subject_id, module, category, deadline, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
        ).bind(
          goalId,
          user.sub,
          `Complete ${plan.uworld_total_questions} UWorld questions for ${plan.rotation}`,
          'questions',
          plan.uworld_total_questions,
          subjectId,
          'rotations',
          'long_term',
          deadline || null
        )
      )
      goalsCreated++
    }

    // ── Auto-create study hours goal ──
    // Query availability to estimate total study hours
    const { results: availabilityRows } = await env.DB.prepare(
      'SELECT available_minutes FROM rotation_availability WHERE plan_id = ? AND is_day_off = 0'
    ).bind(planId).all()

    if (availabilityRows.length > 0 && plan.start_date && plan.end_date) {
      const totalAvailableMinutesPerWeek = availabilityRows.reduce(
        (sum, row) => sum + (row.available_minutes || 0), 0
      )
      const avgDailyMinutes = totalAvailableMinutesPerWeek / 7

      // Calculate total days from start_date to end_date
      const startDate = new Date(plan.start_date)
      const endDate = new Date(plan.end_date)
      const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1

      // Apply 0.85 factor for realistic availability, then convert to hours
      const estimatedHours = Math.round((avgDailyMinutes * totalDays * 0.85) / 60)

      if (estimatedHours > 0) {
        const subjectId = ROTATION_SUBJECT_MAP[plan.rotation] || 'other'
        const goalId = uuid()
        stmts.push(
          env.DB.prepare(
            `INSERT INTO goals (id, user_id, title, goal_type, target_value, subject_id, module, category, deadline, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
          ).bind(
            goalId,
            user.sub,
            `Study ${estimatedHours} hours for ${plan.rotation}`,
            'hours',
            estimatedHours,
            subjectId,
            'rotations',
            'long_term',
            deadline || null
          )
        )
        goalsCreated++
      }
    }

    await env.DB.batch(stmts)

    return json({ success: true, goalsCreated })
  } catch (e) {
    return json({ error: 'Failed to activate plan' }, 500)
  }
}
