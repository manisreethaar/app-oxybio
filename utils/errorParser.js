export function parseErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return msg || 'An unknown error occurred.';

  const lowerMsg = msg.toLowerCase();

  // 1. Unique constraint violation (Duplicate)
  if (lowerMsg.includes('duplicate key value violates unique constraint') || lowerMsg.includes('already exists')) {
    return 'This record already exists. Please check for duplicates and try again.';
  }

  // 2. Foreign Key constraint violation (In use)
  if (lowerMsg.includes('violates foreign key constraint') || lowerMsg.includes('update or delete on table')) {
    return 'Cannot delete or modify this record because it is actively used elsewhere in the system.';
  }

  // 3. Row-Level Security (RLS) / Permission Denied
  if (lowerMsg.includes('new row violates row-level security policy') || lowerMsg.includes('permission denied')) {
    return 'You do not have the required permissions to perform this action.';
  }

  // 4. Not Null constraint (Missing data)
  if (lowerMsg.includes('null value in column') && lowerMsg.includes('violates not-null constraint')) {
    return 'A required field was left blank. Please fill in all mandatory details.';
  }

  // 5. JWT / Auth Expired
  if (lowerMsg.includes('jwt expired') || lowerMsg.includes('invalid claim')) {
    return 'Your session has expired. Please refresh the page or log in again.';
  }

  // 6. Network / Fetch Error
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror')) {
    return 'Network connection error. Please check your internet connection and try again.';
  }

  // 7. Check constraint violation
  if (lowerMsg.includes('violates check constraint')) {
    return 'The provided data is invalid and violates system constraints (e.g. negative values or out of bounds).';
  }

  // Default fallback: return the original message (or strip 'Error:' prefix if present)
  return msg.replace(/^Error:\s*/i, '');
}
