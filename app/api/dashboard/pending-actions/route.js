import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase
      .from('employees')
      .select('id, role, department')
      .eq('email', user.email)
      .single();

    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    const isGlobalAdmin = ['ceo', 'cto'].includes(emp.role);
    const isDeptManager = ['admin', 'research_fellow'].includes(emp.role);

    // 1. My Pending Tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, priority, due_date')
      .eq('assigned_to', emp.id)
      .in('status', ['open', 'in-progress'])
      .order('due_date', { ascending: true })
      .limit(10);

    // 2. My Pending SOPs (Active SOPs I haven't acknowledged)
    const { data: allSops } = await supabase
      .from('sop_library')
      .select('id, title, category')
      .eq('is_active', true);
    
    const { data: myAcks } = await supabase
      .from('sop_acknowledgements')
      .select('sop_id')
      .eq('employee_id', emp.id);
    
    const ackedSopIds = new Set(myAcks?.map(a => a.sop_id) || []);
    const pendingSops = (allSops || []).filter(s => !ackedSopIds.has(s.id)).slice(0, 10);

    // 3. My Assigned CAPA Actions
    const { data: capas } = await supabase
      .from('capa_actions')
      .select('id, description, status, due_date, deviation_id, deviations(title, severity)')
      .eq('assigned_to', emp.id)
      .in('status', ['Pending', 'In Progress'])
      .order('due_date', { ascending: true })
      .limit(10);

    // 4. Pending Approvals (Edit requests I can approve)
    let pendingApprovals = [];
    if (isGlobalAdmin || isDeptManager) {
      const { data: pendingChanges } = await supabase
        .from('pending_changes')
        .select(`
          id, table_name, module_label, change_type, created_at,
          requested_by, requester:requested_by ( department )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (pendingChanges) {
        pendingApprovals = pendingChanges.filter(c => {
          if (isGlobalAdmin) return true;
          // Dept Manager: only from same department, and don't approve own changes
          if (c.requester?.department !== emp.department) return false;
          if (c.requested_by === emp.id) return false;
          return true;
        }).slice(0, 10);
      }
    }

    // Format all actions into a unified list
    const unifiedActions = [];

    (tasks || []).forEach(t => unifiedActions.push({
      type: 'task',
      id: t.id,
      title: t.title,
      subtitle: `Due: ${new Date(t.due_date).toLocaleDateString()}`,
      priority: t.priority,
      link: '/tasks'
    }));

    pendingSops.forEach(s => unifiedActions.push({
      type: 'sop',
      id: s.id,
      title: s.title,
      subtitle: `Category: ${s.category}`,
      priority: 'high',
      link: '/sops'
    }));

    (capas || []).forEach(c => unifiedActions.push({
      type: 'capa',
      id: c.id,
      title: c.description || c.deviations?.title || 'CAPA Action',
      subtitle: `Due: ${c.due_date ? new Date(c.due_date).toLocaleDateString() : 'N/A'}`,
      priority: c.deviations?.severity === 'Critical' ? 'urgent' : 'high',
      link: '/capa'
    }));

    pendingApprovals.forEach(a => unifiedActions.push({
      type: 'approval',
      id: a.id,
      title: `${a.change_type.toUpperCase()} Request: ${a.module_label || a.table_name}`,
      subtitle: `Requested: ${new Date(a.created_at).toLocaleDateString()}`,
      priority: 'normal',
      link: '/admin/approvals'
    }));

    // Sort by priority (urgent > high > normal > low)
    const priorityWeight = { urgent: 4, high: 3, normal: 2, low: 1 };
    unifiedActions.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));

    return NextResponse.json({ success: true, data: unifiedActions });
  } catch (err) {
    console.error('[Pending Actions] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
