/**
 * Notification settings CRUD handlers
 * Ported from meeting-translation/src/services/NotificationService.ts
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';

// ---------- Settings CRUD ----------

export async function handleGetNotificationSettings(req: Request, orgId: string): Promise<Response> {
  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT id, setting_type as "settingType", channel, config,
            schedule_type as "scheduleType", schedule_time as "scheduleTime",
            schedule_day as "scheduleDay", enabled,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM notification_settings WHERE org_id IS NULL OR org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );

  const data = rows.map((r: Record<string, unknown>) => ({
    ...r,
    config: r.config ?? {},
    createdAt: r.createdAt instanceof Date ? (r.createdAt as Date).toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? (r.updatedAt as Date).toISOString() : r.updatedAt,
  }));

  return successResponse(data, req);
}

export async function handleCreateNotificationSetting(req: Request, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const settingType = body.settingType as string;
  const channel = body.channel as string;
  if (!settingType || !channel) {
    return errorResponse('settingType and channel are required', 400, req);
  }
  if (settingType !== 'slack' && settingType !== 'email') {
    return errorResponse('settingType must be "slack" or "email"', 400, req);
  }

  const scheduleType = body.scheduleType as string | undefined;
  if (scheduleType) {
    if (scheduleType !== 'daily' && scheduleType !== 'weekly') {
      return errorResponse('scheduleType must be "daily" or "weekly"', 400, req);
    }
    const scheduleTime = body.scheduleTime as string | undefined;
    if (!scheduleTime || !/^\d{2}:\d{2}$/.test(scheduleTime)) {
      return errorResponse('scheduleTime is required when scheduleType is set (format: HH:MM)', 400, req);
    }
    if (scheduleType === 'weekly') {
      const scheduleDay = body.scheduleDay as number | undefined;
      if (scheduleDay === undefined || scheduleDay < 0 || scheduleDay > 6) {
        return errorResponse('scheduleDay (0-6, 0=Sunday) is required for weekly schedules', 400, req);
      }
    }
  }

  const db = getRailwayDb();
  const rows = await db.unsafe(
    `INSERT INTO notification_settings (org_id, setting_type, channel, config, schedule_type, schedule_time, schedule_day, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, setting_type as "settingType", channel, config,
               schedule_type as "scheduleType", schedule_time as "scheduleTime",
               schedule_day as "scheduleDay", enabled,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      orgId,
      settingType,
      channel,
      JSON.stringify(body.config || {}),
      scheduleType || null,
      (body.scheduleTime as string) || null,
      body.scheduleDay ?? null,
      body.enabled ?? true,
    ]
  );

  const row = rows[0] as Record<string, unknown>;
  return successResponse({
    ...row,
    config: row.config ?? {},
    createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? (row.updatedAt as Date).toISOString() : row.updatedAt,
  }, req);
}

export async function handleUpdateNotificationSetting(id: string, req: Request, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (body.settingType !== undefined) {
    updates.push(`setting_type = $${paramIndex++}`);
    values.push(body.settingType);
  }
  if (body.channel !== undefined) {
    updates.push(`channel = $${paramIndex++}`);
    values.push(body.channel);
  }
  if (body.config !== undefined) {
    updates.push(`config = $${paramIndex++}`);
    values.push(JSON.stringify(body.config));
  }
  if (body.scheduleType !== undefined) {
    updates.push(`schedule_type = $${paramIndex++}`);
    values.push(body.scheduleType);
  }
  if (body.scheduleTime !== undefined) {
    updates.push(`schedule_time = $${paramIndex++}`);
    values.push(body.scheduleTime);
  }
  if (body.scheduleDay !== undefined) {
    updates.push(`schedule_day = $${paramIndex++}`);
    values.push(body.scheduleDay);
  }
  if (body.enabled !== undefined) {
    updates.push(`enabled = $${paramIndex++}`);
    values.push(body.enabled);
  }

  if (updates.length === 0) {
    return errorResponse('No fields to update', 400, req);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id, orgId);

  const db = getRailwayDb();
  const rows = await db.unsafe(
    `UPDATE notification_settings SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND (org_id IS NULL OR org_id = $${paramIndex + 1})
     RETURNING id, setting_type as "settingType", channel, config,
               schedule_type as "scheduleType", schedule_time as "scheduleTime",
               schedule_day as "scheduleDay", enabled,
               created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  if (rows.length === 0) {
    return errorResponse('Notification setting not found', 404, req);
  }

  const row = rows[0] as Record<string, unknown>;
  return successResponse({
    ...row,
    config: row.config ?? {},
    createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? (row.updatedAt as Date).toISOString() : row.updatedAt,
  }, req);
}

export async function handleDeleteNotificationSetting(id: string, req: Request, orgId: string): Promise<Response> {
  const db = getRailwayDb();
  const rows = await db.unsafe(
    `DELETE FROM notification_settings WHERE id = $1 AND (org_id IS NULL OR org_id = $2) RETURNING id`,
    [id, orgId]
  );

  if (rows.length === 0) {
    return errorResponse('Notification setting not found', 404, req);
  }

  return successResponse({ deleted: true }, req);
}
