import webpush from 'web-push';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Sends a notification to a specific employee.
 * 1. Inserts into the Supabase 'notifications' table.
 * 2. Sends a Web Push notification if the user is subscribed.
 */
export async function sendServerNotification(assignedTo, title, message, url = '/notifications', type = 'info') {
  if (!assignedTo) return;

  const supabaseAdmin = createAdminClient();

  // 1. Insert into DB (notifications table)
  const { error: dbInsertError } = await supabaseAdmin
    .from('notifications')
    .insert({
      employee_id: assignedTo,
      title,
      message,
      type,
      link: url,
      is_read: false
    });

  if (dbInsertError) {
    console.error('[serverNotify] DB Insert Error:', dbInsertError);
  }

  // 2. Fetch subscription and send push notification
  const { data: employee, error: dbError } = await supabaseAdmin
    .from('employees')
    .select('push_subscription')
    .eq('id', assignedTo)
    .single();

  if (dbError || !employee?.push_subscription) {
    return; // No push subscription, but DB insert is done
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('[serverNotify] VAPID keys not configured');
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || 'mailto:ceo@oxygenbioinnovations.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const sub = typeof employee.push_subscription === 'string'
    ? JSON.parse(employee.push_subscription)
    : employee.push_subscription;

  try {
    await webpush.sendNotification(sub, JSON.stringify({
      title,
      body: message,
      url
    }));
  } catch (error) {
    // 410 / 404 = push subscription expired or invalid — clean it up
    if (error.statusCode === 410 || error.statusCode === 404) {
      await supabaseAdmin
        .from('employees')
        .update({ push_subscription: null })
        .eq('id', assignedTo);
    } else {
      console.error('[serverNotify] Push Send Error:', error);
    }
  }
}

/**
 * Sends a notification to all Admin, CEO, and CTO users.
 */
export async function notifyAdmins(title, message, url = '/notifications', type = 'info') {
  const supabaseAdmin = createAdminClient();
  const { data: admins } = await supabaseAdmin
    .from('employees')
    .select('id')
    .in('role', ['admin', 'ceo', 'cto']);
  
  if (admins && admins.length > 0) {
    const promises = admins.map(admin => sendServerNotification(admin.id, title, message, url, type));
    await Promise.allSettled(promises);
  }
}

/**
 * Sends a notification to department managers (admins/seniors in same department + CEO/CTO)
 */
export async function notifyDepartmentManagers(department, title, message, url = '/notifications', type = 'info') {
  const supabaseAdmin = createAdminClient();
  let query = supabaseAdmin.from('employees').select('id, role, department');
  
  const { data: employees } = await query;
  if (!employees) return;

  const managers = employees.filter(emp => {
    // CEO and CTO always get notified
    if (['ceo', 'cto'].includes(emp.role)) return true;
    // Admins or Research Fellows in the same department
    if (department && emp.department === department && ['admin', 'research_fellow'].includes(emp.role)) return true;
    // If no department specified, fallback to all admins
    if (!department && emp.role === 'admin') return true;
    return false;
  });

  if (managers.length > 0) {
    const promises = managers.map(mgr => sendServerNotification(mgr.id, title, message, url, type));
    await Promise.allSettled(promises);
  }
}
