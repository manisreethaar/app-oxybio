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
};

export const ROLE_WEIGHTS = {
  [ROLES.CEO]:             100,
  [ROLES.CTO]:             90,
  [ROLES.ADMIN]:           80,
  [ROLES.RESEARCH_FELLOW]: 70,
  [ROLES.SCIENTIST]:       60,
  [ROLES.RESEARCH_INTERN]: 45,
  [ROLES.INTERN]:          40,
};

// Shorthand role groups for reuse
const ALL_ROLES = ['ceo', 'cto', 'admin', 'research_fellow', 'scientist', 'research_intern', 'intern'];
const LEADERSHIP = ['ceo', 'cto', 'admin'];
const SENIOR = ['ceo', 'cto', 'admin', 'research_fellow'];
const SCIENTISTS = ['ceo', 'cto', 'admin', 'research_fellow', 'scientist'];

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
    create:   ALL_ROLES,
    edit_own: ALL_ROLES,
    delete:   SENIOR,
    approve:  LEADERSHIP,
    assign:   SENIOR,
  },

  leave: {
    view:     ALL_ROLES,
    apply:    ALL_ROLES,
    approve:  LEADERSHIP,
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
    view:   ALL_ROLES,
    upload: SENIOR,
    delete: LEADERSHIP,
  },

  recipes: {
    view:    ALL_ROLES,
    create:  SCIENTISTS,
    edit:    SENIOR,
    approve: LEADERSHIP,
    delete:  LEADERSHIP,
  },

  batches: {
    view:     ALL_ROLES,
    create:   ALL_ROLES,
    edit:     ALL_ROLES,
    sign_off: LEADERSHIP,
    delete:   LEADERSHIP,
  },

  compliance: {
    view:       ALL_ROLES,
    create_ncr: ALL_ROLES,
    close_capa: LEADERSHIP,
    delete:     LEADERSHIP,
  },

  equipment: {
    view:   ALL_ROLES,
    edit:   ALL_ROLES,          // Add maintenance logs (Interns +)
    create: SCIENTISTS,         // Add Machine (Scientist +)
    delete: LEADERSHIP,
  },

  inventory: {
    view:          ALL_ROLES,
    edit:          ALL_ROLES,   // Add/Deduct stock (Interns +)
    delete:        LEADERSHIP,
    request_stock: ALL_ROLES,
    approve_request: LEADERSHIP,
  },

  lab_notebook: {
    view:   ALL_ROLES,
    create: ALL_ROLES,          // Draft LNB (Interns +)
    finalise: SENIOR,           // Countersign LNB (Research Fellow +)
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
    manage_roles: ['ceo', 'admin'], 
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
/**
 * Check if fromRole can assign a task to toRole based on OxyOS hierarchy.
 * Rule: Master Admin can assign to everyone. CEO/CTO can assign to everyone.
 * Others can assign to self or below. CEO/CTO are protected from lower-role assignments.
 */
export function canAssignTo(fromRole, toRole, fromEmail = '') {
  if (fromEmail === 'manisreethaar@gmail.com') return true;
  if (!fromRole || !toRole) return false;
  
  const weights = {
    'ceo': 100,
    'cto': 90,
    'admin': 80,
    'research_fellow': 70,
    'scientist': 60,
    'research_intern': 45,
    'intern': 40
  };

  const fromWeight = weights[fromRole] || 0;
  const toWeight = weights[toRole] || 0;

  if (fromRole === 'ceo' || fromRole === 'cto') return true;
  if (toRole === 'ceo' || toRole === 'cto') return false;
  return fromWeight >= toWeight;
}
