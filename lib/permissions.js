// ─────────────────────────────────────────────────────────────────────────────
// OxyOS RBAC - Permissions Matrix
// Define exactly what each role can do per module.
// Usage: import { can } from '@/lib/permissions';
//        if (can(role, 'tasks', 'approve')) { ... }
// ─────────────────────────────────────────────────────────────────────────────

// ── Role Definitions ─────────────────────────────────────────────────────────
// NOTE: These must match EXACTLY what is stored in the employees.role column in Supabase.
// Current DB values: 'admin', 'staff', 'intern'
// Future DB values (after migration): 'admin', 'research_fellow', 'scientist', 'intern'
// We keep BOTH old and new role names for full backward compatibility.

export const ROLES = {
  ADMIN:           'admin',
  RESEARCH_FELLOW: 'research_fellow',
  STAFF:           'staff',           // legacy - maps to research_fellow/scientist
  SCIENTIST:       'scientist',
  INTERN:          'intern',
};

// ── Permissions Matrix ────────────────────────────────────────────────────────
// Structure: { [module]: { [action]: [roles_allowed] } }
// Include BOTH old ('staff') and new role names for backward compatibility.
const PERMISSIONS = {

  dashboard: {
    view: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
  },

  activity: {
    view: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
  },

  attendance: {
    view:      ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    check_in:  ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    view_team: ['admin', 'research_fellow', 'staff'],
    export:    ['admin'],
  },

  tasks: {
    view:     ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    create:   ['admin', 'research_fellow', 'staff', 'scientist'],
    edit_own: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    delete:   ['admin', 'research_fellow', 'staff'],
    approve:  ['admin', 'research_fellow', 'staff'],
    assign:   ['admin', 'research_fellow', 'staff'],
  },

  leave: {
    view:     ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    apply:    ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    approve:  ['admin'],
    view_all: ['admin'],
  },

  sops: {
    view:        ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    create:      ['admin', 'research_fellow', 'staff'],
    edit:        ['admin', 'research_fellow', 'staff'],
    delete:      ['admin'],
    acknowledge: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
  },

  documents: {
    view:   ['admin', 'research_fellow', 'staff', 'scientist'],
    upload: ['admin', 'research_fellow', 'staff'],
    delete: ['admin'],
  },

  batches: {
    view:     ['admin', 'research_fellow', 'staff', 'scientist'],
    create:   ['admin', 'research_fellow', 'staff', 'scientist'],
    edit:     ['admin', 'research_fellow', 'staff'],
    sign_off: ['admin', 'research_fellow', 'staff'],
    delete:   ['admin'],
  },

  compliance: {
    view:       ['admin', 'research_fellow', 'staff', 'scientist'],
    create_ncr: ['admin', 'research_fellow', 'staff', 'scientist'],
    close_capa: ['admin', 'research_fellow', 'staff'],
    delete:     ['admin'],
  },

  equipment: {
    view: ['admin', 'research_fellow', 'staff', 'scientist'],
    edit: ['admin', 'research_fellow', 'staff'],
    delete: ['admin'],
  },

  inventory: {
    view: ['admin', 'research_fellow', 'staff', 'scientist'],
    edit: ['admin', 'research_fellow', 'staff'],
    delete: ['admin'],
  },

  lab_notebook: {
    view: ['admin', 'research_fellow', 'scientist', 'staff'],
    create: ['admin', 'research_fellow', 'scientist', 'staff'],
  },

  payslips: {
    view_own: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    upload:   ['admin'],
    view_all: ['admin'],
  },

  notifications: {
    view:     ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    send:     ['admin', 'research_fellow', 'staff'],
    send_all: ['admin'],
  },

  admin: {
    view:         ['admin'],
    manage_users: ['admin'],
    invite:       ['admin'],
    manage_roles: ['admin'],
  },

  profile: {
    view: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
    edit: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
  },

  directory: {
    view: ['admin', 'research_fellow', 'staff', 'scientist', 'intern'],
  },
};

/**
 * Check if a role has permission to perform an action on a module.
 * @param {string|null|undefined} role - The user's role (e.g. 'admin', 'intern', 'staff')
 * @param {string} module - The module (e.g. 'tasks', 'compliance')
 * @param {string} action - The action (e.g. 'view', 'approve')
 * @returns {boolean}
 */
export function can(role, module, action) {
  if (!role || !module || !action) return false;
  const allowedRoles = PERMISSIONS?.[module]?.[action];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Get all permissions for a given role.
 * @param {string} role  
 * @returns {Object} { module: { action: boolean } }
 */
export function getPermissionsForRole(role) {
  if (!role) return {};
  const result = {};
  for (const [module, actions] of Object.entries(PERMISSIONS)) {
    result[module] = {};
    for (const [action, allowedRoles] of Object.entries(actions)) {
      result[module][action] = allowedRoles.includes(role);
    }
  }
  return result;
}

export default PERMISSIONS;
