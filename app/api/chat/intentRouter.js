// Fast zero-AI path for common read-only queries — no AI tokens consumed.
// Write operations and complex queries fall through to Claude Haiku in route.js.

const WRITE_KEYWORDS = /\b(create|add|start|assign|approve|reject|update|log|raise|new|make|submit|record|register|close|cancel|delete|remove|edit|modify|change|schedule|book|file|send|post)\b/i;

// Ordered: more specific patterns first to prevent shadowing
const INTENT_PATTERNS = [
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

export function matchIntent(text) {
  if (!text || text.trim().length < 2) return null;
  if (WRITE_KEYWORDS.test(text)) return null;
  for (const { toolName, regex } of INTENT_PATTERNS) {
    if (regex.test(text)) return { toolName };
  }
  return null;
}

export async function executeIntent(toolName, supabase) {
  try {
    switch (toolName) {
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

        return {
          today,
          active_batches: batchRes.data || [],
          pending_leaves: leavesRes.data || [],
          high_priority_tasks: tasksRes.data || [],
          compliance_items: complianceRes.data || [],
          todays_attendance: attendanceRes.data || [],
          total_employees: totalEmployees || 0,
          recent_deviations: deviationsRes.data || [],
          low_stock_items: lowStockItems,
        };
      }

      case 'check_alerts': {
        const now = new Date();
        const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
        const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = now.toISOString().split('T')[0];

        const [deviationsRes, complianceRes] = await Promise.all([
          supabase.from('ph_readings').select('id, ph_value, created_at, batches(batch_id)').eq('is_deviation', true).gte('created_at', fifteenMinAgo).order('created_at', { ascending: false }),
          supabase.from('compliance_items').select('id, title, category, due_date, status').or(`status.eq.overdue,due_date.lte.${threeDaysOut}`).neq('status', 'done').order('due_date'),
        ]);

        const alerts = [];
        (deviationsRes.data || []).forEach(d => alerts.push({
          type: 'pH_DEVIATION', severity: 'critical',
          message: `pH deviation: ${d.ph_value} on batch ${d.batches?.batch_id || 'unknown'} at ${new Date(d.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        }));
        (complianceRes.data || []).forEach(c => {
          const isOverdue = c.status === 'overdue';
          alerts.push({
            type: 'COMPLIANCE', severity: isOverdue ? 'critical' : 'warning',
            message: isOverdue
              ? `OVERDUE: ${c.title} (${c.category}) was due ${c.due_date}`
              : `Due soon: ${c.title} (${c.category}) — due ${c.due_date}`,
          });
        });
        return { alerts };
      }

      case 'get_pending_leaves': {
        const { data } = await supabase
          .from('leave_applications')
          .select('id, leave_type, start_date, end_date, total_days, reason, employees(full_name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_open_tasks': {
        const { data } = await supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, employees!tasks_assigned_to_fkey(full_name)')
          .in('status', ['open', 'in-progress'])
          .order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_attendance_summary': {
        const today = new Date().toISOString().split('T')[0];
        const [attendanceRes, countRes] = await Promise.all([
          supabase.from('attendance_log')
            .select('id, check_in_time, check_out_time, total_hours, mispunch_status, employees(full_name)')
            .eq('date', today),
          supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ]);
        const records = attendanceRes.data || [];
        const total = countRes.count || 0;
        return {
          date: today,
          checked_in: records.length,
          total_employees: total,
          absent: total - records.length,
          records: records.map(r => ({
            name: r.employees?.full_name,
            check_in: r.check_in_time,
            check_out: r.check_out_time,
            hours: r.total_hours,
            mispunch: r.mispunch_status,
          })),
        };
      }

      case 'get_active_batches': {
        const { data } = await supabase
          .from('batches')
          .select('id, batch_id, variant, status, volume_litres, probiotic_strain, start_time')
          .in('status', ['fermenting', 'qc-hold'])
          .order('created_at', { ascending: false });
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
        const { data } = await supabase
          .from('compliance_items')
          .select('id, title, category, due_date, status, notes')
          .or(`status.eq.overdue,due_date.lte.${thirtyDaysOut.toISOString().split('T')[0]}`)
          .neq('status', 'done')
          .order('due_date');
        return data || [];
      }

      case 'get_equipment': {
        const { data } = await supabase
          .from('equipment')
          .select('id, name, model, serial_number, calibration_due_date, status')
          .order('name');
        return data || [];
      }

      case 'get_open_deviations': {
        const { data } = await supabase
          .from('deviations')
          .select('id, title, severity, source, status, created_at, employees!deviations_reported_by_fkey(full_name)')
          .in('status', ['Open', 'Investigating', 'CAPA Assigned'])
          .order('created_at', { ascending: false });
        return data || [];
      }

      case 'get_sops': {
        const { data } = await supabase
          .from('sop_library')
          .select('id, sop_id, title, category, version, effective_date')
          .eq('is_active', true)
          .order('title');
        return data || [];
      }

      case 'get_purchase_requests': {
        const { data } = await supabase
          .from('purchase_requests')
          .select('id, item_name, requested_quantity, unit, reason, urgency, status, created_at, employees!purchase_requests_requested_by_fkey(full_name)')
          .eq('status', 'Pending')
          .order('created_at', { ascending: false })
          .limit(30);
        return data || [];
      }

      case 'get_employees': {
        const { data } = await supabase
          .from('employees')
          .select('id, full_name, role, department')
          .eq('is_active', true)
          .order('full_name');
        return data || [];
      }

      case 'get_payslips': {
        const { data } = await supabase
          .from('payslips')
          .select('id, month, year, gross_salary, net_salary, lop_days, present_days, total_working_days, employees(full_name)')
          .order('year', { ascending: false })
          .limit(20);
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

const PRIORITY_EMOJI = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const SEVERITY_EMOJI = { Critical: '🔴', Major: '🟠', Minor: '🟡' };
const URGENCY_EMOJI  = { Critical: '🔴', Urgent: '🟡', Normal: '⚪' };

function fmtTime(t) {
  if (!t) return '?';
  return typeof t === 'string' && t.includes('T') ? t.split('T')[1].slice(0, 5) : String(t).slice(0, 5);
}

export function formatResult(toolName, data, userName) {
  if (data === null || data === undefined) {
    return `Sorry ${userName}, I couldn't fetch that data right now. Please try again or ask me to look it up in a different way.`;
  }

  switch (toolName) {
    case 'morning_briefing': {
      const { today, active_batches, pending_leaves, high_priority_tasks, compliance_items, todays_attendance, total_employees, recent_deviations, low_stock_items } = data;
      const overdue = (compliance_items || []).filter(c => c.status === 'overdue');
      const dueSoon = (compliance_items || []).filter(c => c.status !== 'overdue');

      let out = `## 🌅 Morning Briefing — ${today}\nGood morning, ${userName}! Here's your operational overview.\n\n`;

      out += `### 🏭 Production\n`;
      if (!active_batches?.length) {
        out += `- No active batches running\n`;
      } else {
        active_batches.forEach(b => {
          out += `- **${b.batch_id}** (${b.variant}, ${b.volume_litres}L) — ${b.status === 'qc-hold' ? '⚠️ QC Hold' : '🔄 Fermenting'}\n`;
        });
      }

      out += `\n### 👥 Attendance (Today)\n`;
      out += `- **${todays_attendance?.length || 0}** of **${total_employees}** employees checked in\n`;
      if ((total_employees - (todays_attendance?.length || 0)) > 0) {
        out += `- ${total_employees - (todays_attendance?.length || 0)} employee(s) not yet in\n`;
      }

      out += `\n### 📋 Pending Actions\n`;
      out += `- **${pending_leaves?.length || 0}** leave request(s) awaiting approval\n`;
      out += `- **${high_priority_tasks?.length || 0}** high/urgent task(s) open\n`;
      if (pending_leaves?.length > 0) {
        out += `\n**Leave requests:**\n`;
        pending_leaves.slice(0, 3).forEach(l => {
          out += `  - ${l.employees?.full_name || 'Unknown'}: ${l.leave_type} (${l.start_date} → ${l.end_date})\n`;
        });
        if (pending_leaves.length > 3) out += `  - ... and ${pending_leaves.length - 3} more\n`;
      }

      out += `\n### 📦 Inventory\n`;
      if (!low_stock_items?.length) {
        out += `- All items adequately stocked ✅\n`;
      } else {
        out += `- ⚠️ **${low_stock_items.length} item(s)** below minimum stock:\n`;
        low_stock_items.slice(0, 4).forEach(i => {
          out += `  - ${i.item_name}: ${i.quantity} ${i.unit} (min: ${i.minimum_threshold})\n`;
        });
        if (low_stock_items.length > 4) out += `  - ... and ${low_stock_items.length - 4} more\n`;
      }

      out += `\n### 📅 Compliance\n`;
      if (!compliance_items?.length) {
        out += `- No deadlines in the next 30 days ✅\n`;
      } else {
        if (overdue.length > 0) {
          out += `- 🔴 **${overdue.length} OVERDUE:**\n`;
          overdue.slice(0, 2).forEach(c => out += `  - ${c.title} (${c.category}) — was due ${c.due_date}\n`);
        }
        if (dueSoon.length > 0) {
          out += `- 🟡 **${dueSoon.length}** due within 30 days\n`;
          dueSoon.slice(0, 2).forEach(c => out += `  - ${c.title} — due ${c.due_date}\n`);
        }
      }

      out += `\n### 🧪 pH Deviations (last 7 days)\n`;
      if (!recent_deviations?.length) {
        out += `- No deviations recorded ✅\n`;
      } else {
        out += `- ⚠️ **${recent_deviations.length}** deviation(s) detected\n`;
        recent_deviations.slice(0, 2).forEach(d => {
          out += `  - pH ${d.ph_value} on ${d.batches?.batch_id || 'unknown batch'}\n`;
        });
      }

      out += `\n---\n*Need to take action on any of these? Just ask!*`;
      return out;
    }

    case 'check_alerts': {
      const alerts = data?.alerts || [];
      if (!alerts.length) return `## ✅ All Clear\nNo urgent alerts right now. Everything looks good, ${userName}!`;
      const critical = alerts.filter(a => a.severity === 'critical');
      const warnings = alerts.filter(a => a.severity === 'warning');
      let out = `## 🚨 Active Alerts (${alerts.length})\n\n`;
      if (critical.length) {
        out += `### 🔴 Critical\n`;
        critical.forEach(a => out += `- ${a.message}\n`);
        out += '\n';
      }
      if (warnings.length) {
        out += `### 🟡 Warnings\n`;
        warnings.forEach(a => out += `- ${a.message}\n`);
      }
      return out;
    }

    case 'get_pending_leaves': {
      const items = data || [];
      if (!items.length) return `## 📋 Leave Requests\nNo pending leave requests right now. 🎉`;
      let out = `## 📋 Pending Leave Requests (${items.length})\n\n`;
      items.forEach((l, i) => {
        out += `**${i + 1}. ${l.employees?.full_name || 'Unknown'}**\n`;
        out += `   ${l.leave_type} leave | ${l.start_date} → ${l.end_date}`;
        if (l.total_days) out += ` (${l.total_days} day${l.total_days !== 1 ? 's' : ''})`;
        out += '\n';
        if (l.reason) out += `   Reason: ${l.reason}\n`;
        out += '\n';
      });
      out += `*To approve or reject, say "approve leave for [name]" or "reject leave for [name]".*`;
      return out;
    }

    case 'get_open_tasks': {
      const items = data || [];
      if (!items.length) return `## ✅ Tasks\nNo open tasks at the moment!`;
      const sorted = [...items].sort((a, b) => {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] || 4) - (order[b.priority] || 4);
      });
      let out = `## 📋 Open Tasks (${items.length})\n\n`;
      sorted.slice(0, 12).forEach((t, i) => {
        out += `**${i + 1}. ${t.title}** ${PRIORITY_EMOJI[t.priority] || '⚪'} ${t.priority}\n`;
        out += `   Assigned to: ${t.employees?.full_name || 'Unassigned'} | Due: ${t.due_date || 'No due date'}\n\n`;
      });
      if (items.length > 12) out += `... and ${items.length - 12} more tasks.\n\n`;
      out += `*To assign a new task or update status, just ask!*`;
      return out;
    }

    case 'get_attendance_summary': {
      const { date, checked_in, total_employees, absent, records } = data;
      let out = `## 👥 Attendance — ${date}\n\n`;
      out += `- **${checked_in}** of **${total_employees}** checked in today\n`;
      out += `- **${absent}** absent\n\n`;
      if (records?.length) {
        out += `**Present:**\n`;
        records.forEach(r => {
          out += `- ${r.name || 'Unknown'}: ${fmtTime(r.check_in)} – ${r.check_out ? fmtTime(r.check_out) : 'still in'}`;
          if (r.mispunch) out += ` ⚠️ mispunch`;
          out += '\n';
        });
      }
      return out;
    }

    case 'get_active_batches': {
      const items = data || [];
      if (!items.length) return `## 🏭 Active Batches\nNo batches currently active.`;
      let out = `## 🏭 Active Batches (${items.length})\n\n`;
      items.forEach(b => {
        out += `**${b.batch_id}** — ${b.variant}, ${b.volume_litres}L\n`;
        out += `   Status: ${b.status === 'qc-hold' ? '⚠️ QC Hold' : '🔄 Fermenting'}`;
        if (b.probiotic_strain) out += ` | Strain: ${b.probiotic_strain}`;
        if (b.start_time) out += ` | Started: ${b.start_time.split('T')[0]}`;
        out += '\n\n';
      });
      out += `*To update batch status or log a pH reading, just ask!*`;
      return out;
    }

    case 'get_inventory_low': {
      const items = data || [];
      if (!items.length) return `## ✅ Inventory\nAll items are adequately stocked! No low stock alerts.`;
      let out = `## ⚠️ Low Stock Alert — ${items.length} item(s)\n\n`;
      items.forEach(i => {
        const pct = i.minimum_threshold > 0 ? Math.round((i.quantity / i.minimum_threshold) * 100) : 0;
        out += `**${i.item_name}** (${i.category})\n`;
        out += `   Stock: ${i.quantity} ${i.unit} | Minimum: ${i.minimum_threshold} ${i.unit} (${pct}%)\n\n`;
      });
      out += `*Say "create purchase request for [item]" to initiate procurement.*`;
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
      items.forEach(i => {
        const cat = i.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(i);
      });
      Object.entries(byCategory).forEach(([cat, catItems]) => {
        out += `**${cat}:**\n`;
        catItems.forEach(i => {
          const isLow = i.minimum_threshold > 0 && i.quantity <= i.minimum_threshold;
          out += `- ${i.item_name}: ${i.quantity} ${i.unit}${isLow ? ' ⚠️ LOW' : ''}\n`;
        });
        out += '\n';
      });
      return out.trim();
    }

    case 'get_upcoming_compliance': {
      const items = data || [];
      if (!items.length) return `## ✅ Compliance\nNo deadlines in the next 30 days!`;
      const overdue = items.filter(c => c.status === 'overdue');
      const upcoming = items.filter(c => c.status !== 'overdue');
      let out = `## 📅 Compliance Deadlines (${items.length})\n\n`;
      if (overdue.length) {
        out += `### 🔴 Overdue (${overdue.length})\n`;
        overdue.forEach(c => out += `- **${c.title}** (${c.category}) — was due **${c.due_date}**\n`);
        out += '\n';
      }
      if (upcoming.length) {
        out += `### 🟡 Upcoming (${upcoming.length})\n`;
        upcoming.forEach(c => out += `- **${c.title}** (${c.category}) — due **${c.due_date}**\n`);
      }
      out += `\n*To update status, say "mark [item] as done".*`;
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
      items.forEach(e => {
        const isOverdue = e.calibration_due_date && e.calibration_due_date < today;
        out += `**${e.name}**${e.model ? ` (${e.model})` : ''}\n`;
        out += `   Status: ${e.status || 'Unknown'} | Calibration due: ${e.calibration_due_date || 'Not set'} ${isOverdue ? '🔴' : '✅'}\n\n`;
      });
      out += `*To log a calibration, say "log calibration for [equipment name]".*`;
      return out;
    }

    case 'get_open_deviations': {
      const items = data || [];
      if (!items.length) return `## ✅ CAPA Deviations\nNo open deviations at this time!`;
      let out = `## ⚠️ Open Deviations (${items.length})\n\n`;
      items.forEach((d, i) => {
        out += `**${i + 1}. ${d.title}** ${SEVERITY_EMOJI[d.severity] || '⚪'} ${d.severity}\n`;
        out += `   Source: ${d.source} | Status: ${d.status}\n`;
        out += `   Reported by: ${d.employees?.full_name || 'Unknown'} on ${d.created_at?.split('T')[0]}\n\n`;
      });
      out += `*To investigate or spawn a CAPA action, just ask!*`;
      return out;
    }

    case 'get_sops': {
      const items = data || [];
      if (!items.length) return `## 📄 SOPs\nNo active SOPs found.`;
      let out = `## 📄 Active SOPs (${items.length})\n\n`;
      const byCategory = {};
      items.forEach(s => {
        const cat = s.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(s);
      });
      Object.entries(byCategory).forEach(([cat, sops]) => {
        out += `**${cat}:**\n`;
        sops.forEach(s => out += `- ${s.sop_id}: ${s.title} (${s.version})\n`);
        out += '\n';
      });
      return out.trim();
    }

    case 'get_purchase_requests': {
      const items = data || [];
      if (!items.length) return `## 🛒 Purchase Requests\nNo pending purchase requests.`;
      let out = `## 🛒 Pending Purchase Requests (${items.length})\n\n`;
      items.forEach((r, i) => {
        out += `**${i + 1}. ${r.item_name}** ${URGENCY_EMOJI[r.urgency] || '⚪'} ${r.urgency}\n`;
        out += `   Qty: ${r.requested_quantity}${r.unit ? ' ' + r.unit : ''} | Requested by: ${r.employees?.full_name || 'Unknown'}\n`;
        if (r.reason) out += `   Reason: ${r.reason}\n`;
        out += '\n';
      });
      out += `*To approve a request, say "approve purchase request for [item]".*`;
      return out;
    }

    case 'get_employees': {
      const items = data || [];
      if (!items.length) return `## 👥 Employees\nNo active employees found.`;
      let out = `## 👥 Active Employees (${items.length})\n\n`;
      const byDept = {};
      items.forEach(e => {
        const dept = e.department || 'General';
        if (!byDept[dept]) byDept[dept] = [];
        byDept[dept].push(e);
      });
      Object.entries(byDept).forEach(([dept, emps]) => {
        out += `**${dept}:**\n`;
        emps.forEach(e => out += `- ${e.full_name} (${e.role})\n`);
        out += '\n';
      });
      return out.trim();
    }

    case 'get_payslips': {
      const items = data || [];
      if (!items.length) return `## 💰 Payslips\nNo payslip records found.`;
      let out = `## 💰 Recent Payslips (${items.length})\n\n`;
      items.forEach(s => {
        out += `**${s.employees?.full_name || 'Unknown'} — ${s.month} ${s.year}**\n`;
        out += `   Gross: ₹${Number(s.gross_salary).toLocaleString('en-IN')} | Net: ₹${Number(s.net_salary).toLocaleString('en-IN')}`;
        if (s.lop_days > 0) out += ` | LOP: ${s.lop_days} day(s)`;
        out += '\n\n';
      });
      return out.trim();
    }

    default:
      return `Here's the data I found, ${userName}. Let me know if you need anything else!`;
  }
}

export function streamStaticSSE(text) {
  const encoder = new TextEncoder();
  const CHUNK_SIZE = 100;

  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        const chunk = text.slice(i, i + CHUNK_SIZE);
        const event = JSON.stringify({ type: 'text-delta', id: 'txt_0', delta: chunk });
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        // Tiny yield to prevent response buffering on Vercel
        await new Promise(r => setTimeout(r, 2));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
