// ─────────────────────────────────────────────────────────────────────────────
// OxyOS RBAC - Permissions Matrix
// ─────────────────────────────────────────────────────────────────────────────
// Role hierarchy (highest to lowest):
//   ceo > cto > research_fellow > scientist > research_intern > intern
//
// DB role values must match exactly:
//   'ceo', 'cto', 'research_fellow', 'scientist', 'research_intern', 'intern'
//
// Legacy roles still supported: 'admin', 'staff'
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  CEO:             'ceo',
  CTO:             'cto',
  RESEARCH_FELLOW: 'research_fellow',
  SCIENTIST:       'scientist',
  RESEARCH_INTERN: 'research_intern',
  INTERN:          'intern',
  // Legacy
  ADMIN:           'admin',
  STAFF:           'staff',
};

// Shorthand role groups for reuse
const ALL_ROLES = ['ceo', 'cto', 'research_fellow', 'scientist', 'research_intern', 'intern', 'admin', 'staff'];
const SENIOR =    ['ceo', 'cto', 'research_fellow', 'admin'];
const LEADERSHIP = ['ceo', 'cto', 'admin'];
const SCIENTISTS = ['ceo', 'cto', 'research_fellow', 'scientist', 'admin', 'staff'];

const PERMISSIONS = {

  dashboard: {
    view: ALL_ROLES,
  },

  activity: {
    view: ALL_ROLES,
    log:  ALL_ROLES,
  },

  attendance: {
    view:           ALL_ROLES,
    check_in:       ALL_ROLES,
    view_team:      SENIOR,
    export:         LEADERSHIP,
    override:       LEADERSHIP,  // geo override for CEO/CTO
  },

  tasks: {
    view:     ALL_ROLES,
    create:   SCIENTISTS,
    edit_own: ALL_ROLES,
    delete:   SENIOR,
    approve:  LEADERSHIP,
    // KEY FIX: Only senior roles can assign tasks
    // Interns and research_interns cannot assign to CEO/CTO
    assign:   SENIOR,
  },

  leave: {
    view:     ALL_ROLES,
    apply:    ALL_ROLES,
    approve:  LEADERSHIP,   // only CEO/CTO/admin approve leave
    view_all: LEADERSHIP,
  },

  sops: {
    view:        ALL_ROLES,
    create:      SENIOR,
    edit:        SENIOR,
    delete:      LEADERSHIP,
    acknowledge: ALL_ROLES,
  },

  documents: {
    view:   SCIENTISTS,
    upload: SENIOR,
    delete: LEADERSHIP,
  },

  recipes: {
    view:    SCIENTISTS,
    create:  ['ceo', 'cto', 'research_fellow', 'scientist', 'admin', 'staff'],
    edit:    SENIOR,
    approve: LEADERSHIP,   // recipe approval only by CEO/CTO
    delete:  LEADERSHIP,
  },

  batches: {
    view:     SCIENTISTS,
    create:   SCIENTISTS,
    edit:     SENIOR,
    sign_off: LEADERSHIP,
    delete:   LEADERSHIP,
  },

  compliance: {
    view:       SCIENTISTS,
    create_ncr: SCIENTISTS,
    close_capa: SENIOR,
    delete:     LEADERSHIP,
  },

  equipment: {
    view:   SCIENTISTS,
    edit:   SENIOR,
    delete: LEADERSHIP,
  },

  inventory: {
    view:          ALL_ROLES,
    edit:          SENIOR,
    delete:        LEADERSHIP,
    request_stock: ALL_ROLES,   // anyone can request
    approve_request: LEADERSHIP,
  },

  lab_notebook: {
    view:   SCIENTISTS,
    create: SCIENTISTS,
    finalise: SENIOR,
  },

  payslips: {
    view_own: ALL_ROLES,
    upload:   LEADERSHIP,
    view_all: LEADERSHIP,
  },

  notifications: {
    view:     ALL_ROLES,
    send:     SENIOR,
    send_all: LEADERSHIP,
  },

  // Admin panel — user management
  admin: {
    view:         LEADERSHIP,
    manage_users: LEADERSHIP,
    invite:       LEADERSHIP,
    manage_roles: ['ceo', 'admin'],   // only CEO can change roles
  },

  profile: {
    view: ALL_ROLES,
    edit: ALL_ROLES,
  },

  directory: {
    view: ALL_ROLES,
  },

  ops_center: {
    view: LEADERSHIP,   // ops center is admin/CEO/CTO only
  },
};

/**
 * Check if a role has permission to perform an action on a module.
 */
export function can(role, module, action) {
  if (!role || !module || !action) return false;
  const allowedRoles = PERMISSIONS?.[module]?.[action];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Get all permissions for a given role.
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