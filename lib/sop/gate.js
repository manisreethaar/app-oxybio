// Checks whether an employee has completed (e-signed) a required SOP.
// Mirrors the query shape in app/api/training/check/route.js, keyed by direct sop_id.
export async function checkSopCompletion(supabase, sopId, employeeId) {
  if (!sopId) return { required: false, completed: true, sop: null };

  const { data: sop } = await supabase
    .from('sop_library')
    .select('id, sop_id, title, version')
    .eq('id', sopId)
    .maybeSingle();

  // Dangling reference to a deleted SOP fails open, same convention as middleware.js.
  if (!sop) return { required: false, completed: true, sop: null };

  const { data: ack } = await supabase
    .from('sop_acknowledgements')
    .select('id, acknowledged_at')
    .eq('sop_id', sopId)
    .eq('employee_id', employeeId)
    .maybeSingle();

  return { required: true, completed: !!ack, sop };
}

// Checks a list of sop ids (e.g. lab_notebook_entries.sop_ids) and returns the first
// one the employee hasn't completed, or null if all are satisfied.
export async function checkSopCompletionMany(supabase, sopIds, employeeId) {
  for (const sopId of sopIds || []) {
    const result = await checkSopCompletion(supabase, sopId, employeeId);
    if (result.required && !result.completed) return result;
  }
  return null;
}
