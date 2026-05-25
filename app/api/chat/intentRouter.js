// Fast zero-AI path for both common reads AND simple structured writes.
// Complex writes (need follow-up questions, UUID lookups, multi-step) still go to Claude.

import { createAdminClient } from '@/utils/supabase/admin';

// ─────────────────────────────────────────────────────────────────────────────
// WRITE INTENTS — structured patterns where ALL needed values are in the message
// Checked BEFORE the write-keyword block so they aren't rejected as unhandled writes.
// ─────────────────────────────────────────────────────────────────────────────

const WRITE_INTENT_PATTERNS = [
  // ── Batch status ─────────────────────────────────────────────────────────
  {
    toolName: 'update_batch_status',
    // "release BATCH-047" | "reject BATCH-049"
    regex: /\b(release|reject)\s+(BATCH-\w+)\b/i,
    extract: (text) => {
      const m = text.match(/\b(release|reject)\s+(BATCH-\w+)\b/i);
      if (!m) return null;
      return { status: m[1].toLowerCase() === 'release' ? 'released' : 'rejected', batch_id: m[2].toUpperCase() };
    },
  },
  {
    toolName: 'update_batch_status',
    // "put BATCH-047 on qc hold" | "move BATCH-047 to qc-hold" | "BATCH-047 qc hold"
    regex: /\b(BATCH-\w+)\b.*\bqc.?hold\b/i,
    extract: (text) => {
      const m = text.match(/\b(BATCH-\w+)\b/i);
      if (!m) return null;
      return { status: 'qc-hold', batch_id: m[1].toUpperCase() };
    },
  },
  {
    toolName: 'update_batch_status',
    // "BATCH-047 back to fermenting" | "set BATCH-047 fermenting"
    regex: /\b(BATCH-\w+)\b.*\bfermenting\b/i,
    extract: (text) => {
      const m = text.match(/\b(BATCH-\w+)\b/i);
      if (!m) return null;
      return { status: 'fermenting', batch_id: m[1].toUpperCase() };
    },
  },

  // ── Bulk approve all pending leaves ──────────────────────────────────────
  {
    toolName: 'approve_all_leaves',
    // "approve all leaves" | "approve all pending leave requests"
    regex: /\bapprove\s+all\s+(pending\s+)?leave/i,
    extract: () => ({}),
  },

  // ── Restock inventory ────────────────────────────────────────────────────
  {
    toolName: 'restock_inventory',
    // "restock sugar 50 kg" | "restock pH buffer 3 bottles" | "restock milk 10"
    regex: /\brestock\s+(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/i,
    extract: (text) => {
      const m = text.match(/\brestock\s+(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/i);
      if (!m) return null;
      return { item_name: m[1].trim(), quantity: parseFloat(m[2]), unit: m[3] || null };
    },
  },

  // ── Mark compliance item done ────────────────────────────────────────────
  {
    toolName: 'mark_compliance_done',
    // "mark ESI compliance as done" | "mark FSSAI renewal as done" | "mark nabl as done"
    regex: /\bmark\s+(.+?)\s+(?:compliance\s+)?as\s+done\b/i,
    extract: (text) => {
      const m = text.match(/\bmark\s+(.+?)\s+(?:compliance\s+)?as\s+done\b/i);
      if (!m) return null;
      return { keyword: m[1].trim() };
    },
  },
  {
    toolName: 'mark_compliance_done',
    // "complete ESI filing" | "complete FSSAI renewal"
    regex: /\bcomplete\s+(?:the\s+)?(.+?)\s*(?:filing|renewal|submission|audit)?\s*$/i,
    extract: (text) => {
      const m = text.match(/\bcomplete\s+(?:the\s+)?(.+?)\s*(?:filing|renewal|submission|audit)?\s*$/i);
      if (!m) return null;
      return { keyword: m[1].trim() };
    },
  },

  // ── Mark task done / cancel / in-progress ────────────────────────────────
  {
    toolName: 'mark_task_status',
    // "mark media preparation as done" | "mark pH calibration task as in progress"
    regex: /\bmark\s+(.+?)\s+(?:task\s+)?as\s+(done|complete[d]?|in.?progress|cancel+ed?)\b/i,
    extract: (text) => {
      const m = text.match(/\bmark\s+(.+?)\s+(?:task\s+)?as\s+(done|complete[d]?|in.?progress|cancel+ed?)\b/i);
      if (!m) return null;
      return { keyword: m[1].trim(), status: normaliseTaskStatus(m[2]) };
    },
  },
  {
    toolName: 'mark_task_status',
    // "complete the fermentation monitoring task" | "cancel task about batch scheduling"
    regex: /\b(complete|finish|close|cancel)\s+(?:the\s+)?(?:task\s+)?(?:about\s+|for\s+|on\s+)?(.+?)\s*(?:task)?\s*$/i,
    extract: (text) => {
      const m = text.match(/\b(complete|finish|close|cancel)\s+(?:the\s+)?(?:task\s+)?(?:about\s+|for\s+|on\s+)?(.+?)\s*(?:task)?\s*$/i);
      if (!m) return null;
      return { keyword: m[2].trim(), status: normaliseTaskStatus(m[1]) };
    },
  },
];

function normaliseTaskStatus(raw) {
  const r = raw.toLowerCase().replace(/\s+/g, '-');
  if (r === 'complete' || r === 'completed' || r === 'finish' || r === 'close') return 'done';
  if (r === 'cancel' || r === 'cancelled' || r === 'canceled') return 'cancelled';
  if (r === 'in-progress' || r === 'in-progress') return 'in-progress';
  return 'done';
}

// ─────────────────────────────────────────────────────────────────────────────
// READ INTENTS — pattern match, no parameters needed
// ─────────────────────────────────────────────────────────────────────────────

// Write keywords that block unstructured writes from hitting the read path
const WRITE_KEYWORDS = /\b(create|add|start|assign|approve|reject|update|log|raise|new|make|submit|record|register|close|cancel|delete|remove|edit|modify|change|schedule|book|file|send|post)\b/i;

// Ordered: more specific first to prevent shadowing
const READ_INTENT_PATTERNS = [
  { toolName: 'morning_briefing',        regex: /\bgood\s*morning\b|\bbrief(ing)?\b|\bmorning\s*(update|report)\b|\bdaily\s*(update|overview|report|brief)\b/i },
  { toolName: 'get_pending_leaves',      regex: /\bleave|\btime\s*off\b/i },
  { toolName: 'get_open_tasks',          regex: /\btask(s)?\b|\btodo\b|\bto-do\b|\bwork\s*order/i },
  { toolName: 'get_attendance_summary',  regex: /\battendance\b|\bwho.*(present|check)|\bmispunch\b/i },
  { toolName: 'get_active_batches',      regex: /\bbatch(es)?\b|\bfermenting\b|\bqc.?hold\b/i },
  { toolName: 'get_inventory_low',       regex: /\blow\s*stock\b|\brunning\s*(low|out)\b|\breorder\b/i },
  { toolName: 'get_inventory',           regex: /\binventor(y|ies)\b|\bstock\b|\bmaterial(s)?\b/i },
  { toolName: 'get_upcoming_compliance', regex: /\bcompliance\b|\bregulat(ory)?\b|\bdeadline(s)?\b|\bfssai\b|\bnabl\b/i },
  { toolName: 'get_equipment',           regex: /\bequipment\b|\bcalibration\b|\binstrument(s)?\b/i },
  { toolName: 'get_open_deviations',     regex: /\bdeviation(s)?\b|\bcapa\b|\bnon.?conform/i },
  { toolName: 'get_sops',                regex: /\bsop(s)?\b|\bstandard\s*operating/i },
  { toolName: 'get_purchase_requests',   regex: /\bpurchase\s*request(s)?\b|\bprocurement\b/i },
  { toolName: 'get_employees',           regex: /\bemployee(s)?\b|\bstaff\b|\bteam\s*(list|member|dir)?\b/i },
  { toolName: 'get_payslips',            regex: /\bpayslip(s)?\b|\bsalary\s*slip\b|\bpayroll\b/i },
  { toolName: 'check_alerts',            regex: /\balert(s)?\b|\bwarning(s)?\b|\bany\s*(issue|problem|urgent)\b/i },
];

// ─────────────────────────────────────────────────────────────────────────────
// matchIntent — returns { toolName, params } or null
// ─────────────────────────────────────────────────────────────────────────────

export function matchIntent(text) {
  if (!text || text.trim().length < 2) return null;

  // 1. Check structured write intents FIRST (they have all values in the message)
  for (const { toolName, regex, extract } of WRITE_INTENT_PATTERNS) {
    if (regex.test(text)) {
      const params = extract(text);
      if (params !== null) return { toolName, params };
    }
  }

  // 2. Block unstructured writes — fall through to Claude
  if (WRITE_KEYWORDS.test(text)) return null;

  // 3. Read intents (no params needed)
  for (const { toolName, regex } of READ_INTENT_PATTERNS) {
    if (regex.test(text)) return { toolName, params: {} };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// executeIntent — runs the Supabase query for the matched intent
// ─────────────────────────────────────────────────────────────────────────────

export async function executeIntent(toolName, supabase, params = {}, employeeId = null) {
  try {
    switch (toolName) {

      // ── WRITE: Update batch status ────────────────────────────────────────
      case 'update_batch_status': {
        const { batch_id, status } = params;
        const { data: batch, error: findErr } = await supabase
          .from('batches')
          .select('id, batch_id, status')
          .ilike('batch_id', batch_id)
          .single();
        if (findErr || !batch) return { error: `No batch found with ID "${batch_id}". Say "show batches" to see all active batches.` };

        const updateData = { status };
        if (status === 'released' && employeeId) {
          updateData.released_by = employeeId;
          updateData.released_at = new Date().toISOString();
        }
        const { data, error } = await supabase
          .from('batches').update(updateData).eq('id', batch.id)
          .select('id, batch_id, status').single();
        if (error) return { error: error.message };
        return { success: true, batch: data, old_status: batch.status };
      }

      // ── WRITE: Approve all pending leaves ─────────────────────────────────
      case 'approve_all_leaves': {
        const { data: pending, error: fetchErr } = await supabase
          .from('leave_applications')
          .select('id, employee_id, leave_type, start_date, end_date, total_days, employees(full_name)')
          .eq('status', 'pending');
        if (fetchErr) return { error: fetchErr.message };
        if (!pending?.length) return { success: true, count: 0, leaves: [] };

        const { error: updateErr } = await supabase
          .from('leave_applications')
          .update({ status: 'approved', reviewed_by: employeeId, reviewed_at: new Date().toISOString() })
          .in('id', pending.map(l => l.id));
        if (updateErr) return { error: updateErr.message };

        // Notify each employee (fire-and-forget)
        try {
          const adminDb = createAdminClient();
          await adminDb.from('notifications').insert(
            pending.map(l => ({
              employee_id: l.employee_id,
              title: '✅ Leave Approved',
              message: `Your ${l.leave_type} leave (${l.start_date} to ${l.end_date}) has been approved.`,
              type: 'success', is_read: false, link: '/leave',
            }))
          );
        } catch (e) { console.error('[IntentRouter] Leave notifications failed:', e.message); }

        return { success: true, count: pending.length, leaves: pending };
      }

      // ── WRITE: Restock inventory ──────────────────────────────────────────
      case 'restock_inventory': {
        const { item_name, quantity } = params;
        const { data: items, error: findErr } = await supabase
          .from('inventory')
          .select('id, item_name, quantity, unit')
          .ilike('item_name', `%${item_name}%`)
          .limit(4);
        if (findErr) return { error: findErr.message };
        if (!items?.length) return { error: `No inventory item found matching "${item_name}". Say "show inventory" to see all items.` };
        if (items.length > 1) return { ambiguous: true, matches: items, keyword: item_name };

        const item = items[0];
        const previous = item.quantity;
        const { data, error } = await supabase
          .from('inventory')
          .update({ quantity: item.quantity + quantity, last_restocked: new Date().toISOString().split('T')[0] })
          .eq('id', item.id)
          .select('id, item_name, quantity, unit').single();
        if (error) return { error: error.message };
        return { success: true, item: data, added: quantity, previous };
      }

      // ── WRITE: Mark compliance item done ──────────────────────────────────
      case 'mark_compliance_done': {
        const { keyword } = params;
        const { data: items, error: findErr } = await supabase
          .from('compliance_items')
          .select('id, title, status, category')
          .ilike('title', `%${keyword}%`)
          .neq('status', 'done')
          .limit(4);
        if (findErr) return { error: findErr.message };
        if (!items?.length) return { error: `No active compliance item found matching "${keyword}". Say "show compliance" to see all items.` };
        if (items.length > 1) return { ambiguous: true, matches: items, keyword };

        const { data, error } = await supabase
          .from('compliance_items')
          .update({ status: 'done' })
          .eq('id', items[0].id)
          .select('id, title, status, category').single();
        if (error) return { error: error.message };
        return { success: true, item: data };
      }

      // ── WRITE: Mark task done / cancel / in-progress ──────────────────────
      case 'mark_task_status': {
        const { keyword, status } = params;
        const { data: tasks, error: findErr } = await supabase
          .from('tasks')
          .select('id, title, status, assigned_to, employees!tasks_assigned_to_fkey(full_name)')
          .ilike('title', `%${keyword}%`)
          .in('status', ['open', 'in-progress'])
          .limit(4);
        if (findErr) return { error: findErr.message };
        if (!tasks?.length) return { error: `No active task found matching "${keyword}". Say "show tasks" to see all open tasks.` };
        if (tasks.length > 1) return { ambiguous: true, matches: tasks, keyword, status };

        const { data, error } = await supabase
          .from('tasks')
          .update({ status })
          .eq('id', tasks[0].id)
          .select('id, title, status').single();
        if (error) return { error: error.message };
        return { success: true, task: data, assignee: tasks[0].employees?.full_name };
      }

      // ── READ INTENTS ──────────────────────────────────────────────────────

      case 'morning_briefing': {
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysOut = new Date();
        thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
        const [batchRes, leavesRes, tasksRes, complianceRes, attendanceRes, deviationsRes, inventoryRes] = await Promise.all([
          supabase.from('batches').select('id, batch_id, variant, status, volume_litres, probiotic_strain, start_time').in('status', ['fermenting', 'qc-hold']).order('created_at', { ascending: false }),
          supabase.from('leave_applications').select('id, leave_type, start_date, end_date, total_days, employees(full_name)').eq('status', 'pending'),
          supabase.from('tasks').select('id, title, priority, status, due_date, employees!tasks_assigned_to_fkey(full_name)').in('status', ['open', 'in-progress']).in('priority', ['high', 'urgent']),
          supabase.from('compliance_items').select('id, title, category, due_date, status').or(`status.eq.overdue,due_date.lte.${thirtyDaysOut.toISOString().split('T')[0]}`).neq('status', 'done').order('due_date'),
          supabase.from('attendance_log').select('id, check_in_time, check_out_time, mispunch_status, employees(full_name)').eq('date', today),
          supabase.from('ph_readings').select('id, ph_value, created_at, batches(batch_id)').eq('is_deviation', true).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(5),
          supabase.from('inventory').select('id, item_name, quantity, minimum_threshold, unit, category'),
        ]);
        const { count: totalEmployees } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true);
        const allInventory = inventoryRes.data || [];
        const lowStockItems = allInventory.filter(i => i.minimum_threshold > 0 && i.quantity <= i.minimum_threshold);
        return { today, active_batches: batchRes.data || [], pending_leaves: leavesRes.data || [], high_priority_tasks: tasksRes.data || [], compliance_items: complianceRes.data || [], todays_attendance: attendanceRes.data || [], total_employees: totalEmployees || 0, recent_deviations: deviationsRes.data || [], low_stock_items: lowStockItems };
      }

      case 'check_alerts': {
        const now = new Date();
        const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
        const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const [deviationsRes, complianceRes] = await Promise.all([
          supabase.from('ph_readings').select('id, ph_value, created_at, batches(batch_id)').eq('is_deviation', true).gte('created_at', fifteenMinAgo).order('created_at', { ascending: false }),
          supabase.from('compliance_items').select('id, title, category, due_date, status').or(`status.eq.overdue,due_date.lte.${threeDaysOut}`).neq('status', 'done').order('due_date'),
        ]);
        const alerts = [];
        (deviationsRes.data || []).forEach(d => alerts.push({ type: 'pH_DEVIATION', severity: 'critical', message: `pH deviation: ${d.ph_value} on batch ${d.batches?.batch_id || 'unknown'} at ${new Date(d.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` }));
        (complianceRes.data || []).forEach(c => { const isOverdue = c.status === 'overdue'; alerts.push({ type: 'COMPLIANCE', severity: isOverdue ? 'critical' : 'warning', message: isOverdue ? `OVERDUE: ${c.title} (${c.category}) was due ${c.due_date}` : `Due soon: ${c.title} (${c.category}) — due ${c.due_date}` }); });
        return { alerts };
      }

      case 'get_pending_leaves': {
        const { data } = await supabase.from('leave_applications').select('id, leave_type, start_date, end_date, total_days, reason, employees(full_name)').eq('status', 'pending').order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_open_tasks': {
        const { data } = await supabase.from('tasks').select('id, title, priority, status, due_date, employees!tasks_assigned_to_fkey(full_name)').in('status', ['open', 'in-progress']).order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_attendance_summary': {
        const today = new Date().toISOString().split('T')[0];
        const [attendanceRes, countRes] = await Promise.all([
          supabase.from('attendance_log').select('id, check_in_time, check_out_time, total_hours, mispunch_status, employees(full_name)').eq('date', today),
          supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ]);
        const records = attendanceRes.data || [];
        const total = countRes.count || 0;
        return { date: today, checked_in: records.length, total_employees: total, absent: total - records.length, records: records.map(r => ({ name: r.employees?.full_name, check_in: r.check_in_time, check_out: r.check_out_time, hours: r.total_hours, mispunch: r.mispunch_status })) };
      }

      case 'get_active_batches': {
        const { data } = await supabase.from('batches').select('id, batch_id, variant, status, volume_litres, probiotic_strain, start_time').in('status', ['fermenting', 'qc-hold']).order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_inventory_low': {
        const { data } = await supabase.from('inventory').select('*').order('item_name');
        return (data || []).filter(i => i.minimum_threshold > 0 && i.quantity <= i.minimum_threshold);
      }

      case 'get_inventory': {
        const { data } = await supabase.from('inventory').select('*').order('item_name');
        return data || [];
      }

      case 'get_upcoming_compliance': {
        const thirtyDaysOut = new Date();
        thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
        const { data } = await supabase.from('compliance_items').select('id, title, category, due_date, status, notes').or(`status.eq.overdue,due_date.lte.${thirtyDaysOut.toISOString().split('T')[0]}`).neq('status', 'done').order('due_date');
        return data || [];
      }

      case 'get_equipment': {
        const { data } = await supabase.from('equipment').select('id, name, model, serial_number, calibration_due_date, status').order('name');
        return data || [];
      }

      case 'get_open_deviations': {
        const { data } = await supabase.from('deviations').select('id, title, severity, source, status, created_at, employees!deviations_reported_by_fkey(full_name)').in('status', ['Open', 'Investigating', 'CAPA Assigned']).order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_sops': {
        const { data } = await supabase.from('sop_library').select('id, sop_id, title, category, version, effective_date').eq('is_active', true).order('title');
        return data || [];
      }

      case 'get_purchase_requests': {
        const { data } = await supabase.from('purchase_requests').select('id, item_name, requested_quantity, unit, reason, urgency, status, created_at, employees!purchase_requests_requested_by_fkey(full_name)').eq('status', 'Pending').order('created_at', { ascending: false }).limit(30);
        return data || [];
      }

      case 'get_employees': {
        const { data } = await supabase.from('employees').select('id, full_name, role, department').eq('is_active', true).order('full_name');
        return data || [];
      }

      case 'get_payslips': {
        const { data } = await supabase.from('payslips').select('id, month, year, gross_salary, net_salary, lop_days, present_days, total_working_days, employees(full_name)').order('year', { ascending: false }).limit(20);
        return data || [];
      }

      default:
        return null;
    }
  } catch (err) {
    console.error(`[IntentRouter] executeIntent(${toolName}) failed:`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// formatResult — converts raw data into human-readable markdown
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_EMOJI = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const SEVERITY_EMOJI = { Critical: '🔴', Major: '🟠', Minor: '🟡' };
const URGENCY_EMOJI  = { Critical: '🔴', Urgent: '🟡', Normal: '⚪' };

function fmtTime(t) {
  if (!t) return '?';
  return typeof t === 'string' && t.includes('T') ? t.split('T')[1].slice(0, 5) : String(t).slice(0, 5);
}

export function formatResult(toolName, data, userName) {
  if (data === null || data === undefined) {
    return `Sorry ${userName}, I couldn't fetch that data right now. Please try again.`;
  }

  switch (toolName) {

    // ── WRITE formatters ────────────────────────────────────────────────────

    case 'update_batch_status': {
      if (data.error) return `❌ **Error:** ${data.error}`;
      const { batch, old_status } = data;
      const emoji = { released: '✅', rejected: '❌', 'qc-hold': '⚠️', fermenting: '🔄' }[batch.status] || '📋';
      return `${emoji} **${batch.batch_id}** status updated\n\n- **${old_status}** → **${batch.status}**`;
    }

    case 'approve_all_leaves': {
      if (data.error) return `❌ **Error:** ${data.error}`;
      if (data.count === 0) return `## ✅ No Pending Leaves\nAll clear — no pending leave requests right now.`;
      let out = `## ✅ Approved ${data.count} Leave Request${data.count !== 1 ? 's' : ''}\n\n`;
      data.leaves.forEach(l => {
        out += `- **${l.employees?.full_name || 'Unknown'}**: ${l.leave_type} (${l.start_date} → ${l.end_date})\n`;
      });
      out += `\n*All ${data.count} employee${data.count !== 1 ? 's have' : ' has'} been notified.*`;
      return out;
    }

    case 'restock_inventory': {
      if (data.error) return `❌ **Error:** ${data.error}`;
      if (data.ambiguous) {
        let out = `⚠️ Multiple items match **"${data.keyword}"** — which one do you mean?\n\n`;
        data.matches.forEach(i => out += `- **${i.item_name}** (currently ${i.quantity} ${i.unit})\n`);
        out += `\nBe more specific, e.g. *"restock ${data.matches[0].item_name} 50 kg"*`;
        return out;
      }
      const { item, added, previous } = data;
      return `## ✅ Stock Updated\n\n**${item.item_name}**\n- Before: ${previous} ${item.unit}\n- Added: +${added} ${item.unit}\n- **Now: ${item.quantity} ${item.unit}** ✅`;
    }

    case 'mark_compliance_done': {
      if (data.error) return `❌ **Error:** ${data.error}`;
      if (data.ambiguous) {
        let out = `⚠️ Multiple compliance items match **"${data.keyword}"**:\n\n`;
        data.matches.forEach(i => out += `- **${i.title}** (${i.category}, ${i.status})\n`);
        out += `\nBe more specific, e.g. *"mark ${data.matches[0].title} as done"*`;
        return out;
      }
      return `## ✅ Compliance Item Complete\n\n**${data.item.title}** (${data.item.category}) marked as done. ✅`;
    }

    case 'mark_task_status': {
      if (data.error) return `❌ **Error:** ${data.error}`;
      if (data.ambiguous) {
        let out = `⚠️ Multiple tasks match **"${data.keyword}"**:\n\n`;
        data.matches.forEach(t => out += `- **${t.title}** (${t.status}, assigned to ${t.employees?.full_name || 'Unassigned'})\n`);
        out += `\nBe more specific, e.g. *"mark ${data.matches[0].title} as ${data.status}"*`;
        return out;
      }
      const emoji = { done: '✅', cancelled: '❌', 'in-progress': '🔄' }[data.task.status] || '📋';
      let out = `${emoji} **${data.task.title}** → **${data.task.status}**`;
      if (data.assignee) out += `\n*Assigned to: ${data.assignee}*`;
      return out;
    }

    // ── READ formatters ─────────────────────────────────────────────────────

    case 'morning_briefing': {
      const { today, active_batches, pending_leaves, high_priority_tasks, compliance_items, todays_attendance, total_employees, recent_deviations, low_stock_items } = data;
      const overdue = (compliance_items || []).filter(c => c.status === 'overdue');
      const dueSoon = (compliance_items || []).filter(c => c.status !== 'overdue');
      let out = `## 🌅 Morning Briefing — ${today}\nGood morning, ${userName}! Here's your operational overview.\n\n`;
      out += `### 🏭 Production\n`;
      if (!active_batches?.length) { out += `- No active batches running\n`; }
      else { active_batches.forEach(b => { out += `- **${b.batch_id}** (${b.variant}, ${b.volume_litres}L) — ${b.status === 'qc-hold' ? '⚠️ QC Hold' : '🔄 Fermenting'}\n`; }); }
      out += `\n### 👥 Attendance (Today)\n- **${todays_attendance?.length || 0}** of **${total_employees}** checked in\n`;
      if ((total_employees - (todays_attendance?.length || 0)) > 0) out += `- ${total_employees - (todays_attendance?.length || 0)} employee(s) not yet in\n`;
      out += `\n### 📋 Pending Actions\n- **${pending_leaves?.length || 0}** leave request(s) awaiting approval\n- **${high_priority_tasks?.length || 0}** high/urgent task(s) open\n`;
      if (pending_leaves?.length > 0) { out += `\n**Leave requests:**\n`; pending_leaves.slice(0, 3).forEach(l => { out += `  - ${l.employees?.full_name || 'Unknown'}: ${l.leave_type} (${l.start_date} → ${l.end_date})\n`; }); if (pending_leaves.length > 3) out += `  - ... and ${pending_leaves.length - 3} more\n`; }
      out += `\n### 📦 Inventory\n`;
      if (!low_stock_items?.length) { out += `- All items adequately stocked ✅\n`; }
      else { out += `- ⚠️ **${low_stock_items.length} item(s)** below minimum:\n`; low_stock_items.slice(0, 4).forEach(i => { out += `  - ${i.item_name}: ${i.quantity} ${i.unit} (min: ${i.minimum_threshold})\n`; }); if (low_stock_items.length > 4) out += `  - ... and ${low_stock_items.length - 4} more\n`; }
      out += `\n### 📅 Compliance\n`;
      if (!compliance_items?.length) { out += `- No deadlines in the next 30 days ✅\n`; }
      else { if (overdue.length) { out += `- 🔴 **${overdue.length} OVERDUE:**\n`; overdue.slice(0, 2).forEach(c => out += `  - ${c.title} (${c.category}) — was due ${c.due_date}\n`); } if (dueSoon.length) { out += `- 🟡 **${dueSoon.length}** due within 30 days\n`; dueSoon.slice(0, 2).forEach(c => out += `  - ${c.title} — due ${c.due_date}\n`); } }
      out += `\n### 🧪 pH Deviations (last 7 days)\n`;
      if (!recent_deviations?.length) { out += `- No deviations recorded ✅\n`; }
      else { out += `- ⚠️ **${recent_deviations.length}** deviation(s) detected\n`; recent_deviations.slice(0, 2).forEach(d => { out += `  - pH ${d.ph_value} on ${d.batches?.batch_id || 'unknown batch'}\n`; }); }
      out += `\n---\n*Need to take action on any of these? Just ask!*`;
      return out;
    }

    case 'check_alerts': {
      const alerts = data?.alerts || [];
      if (!alerts.length) return `## ✅ All Clear\nNo urgent alerts right now. Everything looks good, ${userName}!`;
      const critical = alerts.filter(a => a.severity === 'critical');
      const warnings = alerts.filter(a => a.severity === 'warning');
      let out = `## 🚨 Active Alerts (${alerts.length})\n\n`;
      if (critical.length) { out += `### 🔴 Critical\n`; critical.forEach(a => out += `- ${a.message}\n`); out += '\n'; }
      if (warnings.length) { out += `### 🟡 Warnings\n`; warnings.forEach(a => out += `- ${a.message}\n`); }
      return out;
    }

    case 'get_pending_leaves': {
      const items = data || [];
      if (!items.length) return `## 📋 Leave Requests\nNo pending leave requests right now. 🎉`;
      let out = `## 📋 Pending Leave Requests (${items.length})\n\n`;
      items.forEach((l, i) => { out += `**${i + 1}. ${l.employees?.full_name || 'Unknown'}**\n   ${l.leave_type} | ${l.start_date} → ${l.end_date}`; if (l.total_days) out += ` (${l.total_days} day${l.total_days !== 1 ? 's' : ''})`; out += '\n'; if (l.reason) out += `   Reason: ${l.reason}\n`; out += '\n'; });
      out += `*Say "approve all leaves" to approve all at once, or ask me to approve/reject specific ones.*`;
      return out;
    }

    case 'get_open_tasks': {
      const items = data || [];
      if (!items.length) return `## ✅ Tasks\nNo open tasks at the moment!`;
      const sorted = [...items].sort((a, b) => { const o = { urgent: 0, high: 1, medium: 2, low: 3 }; return (o[a.priority] || 4) - (o[b.priority] || 4); });
      let out = `## 📋 Open Tasks (${items.length})\n\n`;
      sorted.slice(0, 12).forEach((t, i) => { out += `**${i + 1}. ${t.title}** ${PRIORITY_EMOJI[t.priority] || '⚪'} ${t.priority}\n   ${t.employees?.full_name || 'Unassigned'} | Due: ${t.due_date || 'No due date'}\n\n`; });
      if (items.length > 12) out += `... and ${items.length - 12} more.\n\n`;
      out += `*Say "mark [task name] as done" to complete a task instantly.*`;
      return out;
    }

    case 'get_attendance_summary': {
      const { date, checked_in, total_employees, absent, records } = data;
      let out = `## 👥 Attendance — ${date}\n\n- **${checked_in}** of **${total_employees}** checked in\n- **${absent}** absent\n\n`;
      if (records?.length) { out += `**Present:**\n`; records.forEach(r => { out += `- ${r.name || 'Unknown'}: ${fmtTime(r.check_in)} – ${r.check_out ? fmtTime(r.check_out) : 'still in'}`; if (r.mispunch) out += ` ⚠️ mispunch`; out += '\n'; }); }
      return out;
    }

    case 'get_active_batches': {
      const items = data || [];
      if (!items.length) return `## 🏭 Active Batches\nNo batches currently active.`;
      let out = `## 🏭 Active Batches (${items.length})\n\n`;
      items.forEach(b => { out += `**${b.batch_id}** — ${b.variant}, ${b.volume_litres}L\n   ${b.status === 'qc-hold' ? '⚠️ QC Hold' : '🔄 Fermenting'}`; if (b.probiotic_strain) out += ` | ${b.probiotic_strain}`; if (b.start_time) out += ` | Started: ${b.start_time.split('T')[0]}`; out += '\n\n'; });
      out += `*Say "release BATCH-XXX" or "reject BATCH-XXX" to update status instantly.*`;
      return out;
    }

    case 'get_inventory_low': {
      const items = data || [];
      if (!items.length) return `## ✅ Inventory\nAll items adequately stocked! No low stock alerts.`;
      let out = `## ⚠️ Low Stock Alert — ${items.length} item(s)\n\n`;
      items.forEach(i => { const pct = i.minimum_threshold > 0 ? Math.round((i.quantity / i.minimum_threshold) * 100) : 0; out += `**${i.item_name}** (${i.category})\n   Stock: ${i.quantity} ${i.unit} | Min: ${i.minimum_threshold} ${i.unit} (${pct}%)\n\n`; });
      out += `*Say "restock [item name] [qty] [unit]" to add stock instantly.*`;
      return out;
    }

    case 'get_inventory': {
      const items = data || [];
      if (!items.length) return `## 📦 Inventory\nNo inventory items found.`;
      const lowStock = items.filter(i => i.minimum_threshold > 0 && i.quantity <= i.minimum_threshold);
      let out = `## 📦 Inventory (${items.length} items)\n`;
      if (lowStock.length) out += `⚠️ **${lowStock.length} item(s) below minimum stock!**\n`;
      out += '\n';
      const byCategory = {};
      items.forEach(i => { const cat = i.category || 'Other'; if (!byCategory[cat]) byCategory[cat] = []; byCategory[cat].push(i); });
      Object.entries(byCategory).forEach(([cat, catItems]) => { out += `**${cat}:**\n`; catItems.forEach(i => { const isLow = i.minimum_threshold > 0 && i.quantity <= i.minimum_threshold; out += `- ${i.item_name}: ${i.quantity} ${i.unit}${isLow ? ' ⚠️ LOW' : ''}\n`; }); out += '\n'; });
      out += `*Say "restock [item name] [qty]" to add stock instantly.*`;
      return out.trim();
    }

    case 'get_upcoming_compliance': {
      const items = data || [];
      if (!items.length) return `## ✅ Compliance\nNo deadlines in the next 30 days!`;
      const overdue = items.filter(c => c.status === 'overdue');
      const upcoming = items.filter(c => c.status !== 'overdue');
      let out = `## 📅 Compliance Deadlines (${items.length})\n\n`;
      if (overdue.length) { out += `### 🔴 Overdue (${overdue.length})\n`; overdue.forEach(c => out += `- **${c.title}** (${c.category}) — was due **${c.due_date}**\n`); out += '\n'; }
      if (upcoming.length) { out += `### 🟡 Upcoming (${upcoming.length})\n`; upcoming.forEach(c => out += `- **${c.title}** (${c.category}) — due **${c.due_date}**\n`); }
      out += `\n*Say "mark [item name] as done" to complete instantly.*`;
      return out;
    }

    case 'get_equipment': {
      const items = data || [];
      if (!items.length) return `## 🔬 Equipment\nNo equipment records found.`;
      const today = new Date().toISOString().split('T')[0];
      const overdueItems = items.filter(e => e.calibration_due_date && e.calibration_due_date < today);
      let out = `## 🔬 Equipment Status (${items.length})\n`;
      if (overdueItems.length) out += `⚠️ **${overdueItems.length} instrument(s) with overdue calibration!**\n`;
      out += '\n';
      items.forEach(e => { const isOverdue = e.calibration_due_date && e.calibration_due_date < today; out += `**${e.name}**${e.model ? ` (${e.model})` : ''}\n   ${e.status || 'Unknown'} | Calibration due: ${e.calibration_due_date || 'Not set'} ${isOverdue ? '🔴' : '✅'}\n\n`; });
      return out;
    }

    case 'get_open_deviations': {
      const items = data || [];
      if (!items.length) return `## ✅ CAPA Deviations\nNo open deviations!`;
      let out = `## ⚠️ Open Deviations (${items.length})\n\n`;
      items.forEach((d, i) => { out += `**${i + 1}. ${d.title}** ${SEVERITY_EMOJI[d.severity] || '⚪'} ${d.severity}\n   ${d.source} | ${d.status} | ${d.employees?.full_name || 'Unknown'} on ${d.created_at?.split('T')[0]}\n\n`; });
      return out;
    }

    case 'get_sops': {
      const items = data || [];
      if (!items.length) return `## 📄 SOPs\nNo active SOPs found.`;
      let out = `## 📄 Active SOPs (${items.length})\n\n`;
      const byCategory = {};
      items.forEach(s => { const cat = s.category || 'Other'; if (!byCategory[cat]) byCategory[cat] = []; byCategory[cat].push(s); });
      Object.entries(byCategory).forEach(([cat, sops]) => { out += `**${cat}:**\n`; sops.forEach(s => out += `- ${s.sop_id}: ${s.title} (${s.version})\n`); out += '\n'; });
      return out.trim();
    }

    case 'get_purchase_requests': {
      const items = data || [];
      if (!items.length) return `## 🛒 Purchase Requests\nNo pending purchase requests.`;
      let out = `## 🛒 Pending Purchase Requests (${items.length})\n\n`;
      items.forEach((r, i) => { out += `**${i + 1}. ${r.item_name}** ${URGENCY_EMOJI[r.urgency] || '⚪'} ${r.urgency}\n   ${r.requested_quantity}${r.unit ? ' ' + r.unit : ''} | ${r.employees?.full_name || 'Unknown'}\n`; if (r.reason) out += `   ${r.reason}\n`; out += '\n'; });
      return out;
    }

    case 'get_employees': {
      const items = data || [];
      if (!items.length) return `## 👥 Employees\nNo active employees found.`;
      let out = `## 👥 Active Employees (${items.length})\n\n`;
      const byDept = {};
      items.forEach(e => { const dept = e.department || 'General'; if (!byDept[dept]) byDept[dept] = []; byDept[dept].push(e); });
      Object.entries(byDept).forEach(([dept, emps]) => { out += `**${dept}:**\n`; emps.forEach(e => out += `- ${e.full_name} (${e.role})\n`); out += '\n'; });
      return out.trim();
    }

    case 'get_payslips': {
      const items = data || [];
      if (!items.length) return `## 💰 Payslips\nNo payslip records found.`;
      let out = `## 💰 Recent Payslips (${items.length})\n\n`;
      items.forEach(s => { out += `**${s.employees?.full_name || 'Unknown'} — ${s.month} ${s.year}**\n   Gross: ₹${Number(s.gross_salary).toLocaleString('en-IN')} | Net: ₹${Number(s.net_salary).toLocaleString('en-IN')}`; if (s.lop_days > 0) out += ` | LOP: ${s.lop_days}d`; out += '\n\n'; });
      return out.trim();
    }

    default:
      return `Here's what I found, ${userName}. Let me know if you need anything else!`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// streamStaticSSE — stream formatted text as AI SDK v6 text-delta SSE events
// ─────────────────────────────────────────────────────────────────────────────

export function streamStaticSSE(text) {
  const encoder = new TextEncoder();
  const CHUNK_SIZE = 100;
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        const chunk = text.slice(i, i + CHUNK_SIZE);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', id: 'txt_0', delta: chunk })}\n\n`));
        await new Promise(r => setTimeout(r, 2));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
