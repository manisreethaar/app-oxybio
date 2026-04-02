import { describe, it, expect } from 'vitest';
import { ROLES, ROLE_WEIGHTS, can, getPermissionsForRole } from '@/lib/permissions';

describe('permissions.js', () => {
  describe('ROLES', () => {
    it('should have all required role constants defined', () => {
      expect(ROLES.CEO).toBe('ceo');
      expect(ROLES.CTO).toBe('cto');
      expect(ROLES.ADMIN).toBe('admin');
      expect(ROLES.SCIENTIST).toBe('scientist');
      expect(ROLES.INTERN).toBe('intern');
    });
  });

  describe('ROLE_WEIGHTS', () => {
    it('should have correct weight hierarchy', () => {
      expect(ROLE_WEIGHTS[ROLES.CEO]).toBeGreaterThan(ROLE_WEIGHTS[ROLES.CTO]);
      expect(ROLE_WEIGHTS[ROLES.CTO]).toBeGreaterThan(ROLE_WEIGHTS[ROLES.ADMIN]);
      expect(ROLE_WEIGHTS[ROLES.ADMIN]).toBeGreaterThan(ROLE_WEIGHTS[ROLES.SCIENTIST]);
      expect(ROLE_WEIGHTS[ROLES.SCIENTIST]).toBeGreaterThan(ROLE_WEIGHTS[ROLES.INTERN]);
    });

    it('should have CEO as highest weight', () => {
      expect(ROLE_WEIGHTS[ROLES.CEO]).toBe(100);
    });
  });

  describe('can()', () => {
    it('should return true for admin accessing dashboard view', () => {
      expect(can('admin', 'dashboard', 'view')).toBe(true);
    });

    it('should return true for scientist accessing batches view', () => {
      expect(can('scientist', 'batches', 'view')).toBe(true);
    });

    it('should return false for scientist accessing batches create (requires senior role)', () => {
      // create batch requires SENIOR role: ['ceo', 'cto', 'admin', 'research_fellow']
      expect(can('scientist', 'batches', 'create')).toBe(false);
      expect(can('research_fellow', 'batches', 'create')).toBe(true);
    });

    it('should return true for intern accessing dashboard view', () => {
      expect(can('intern', 'dashboard', 'view')).toBe(true);
    });

    it('should return false for intern accessing admin-only modules', () => {
      expect(can('intern', 'compliance', 'delete')).toBe(false);
    });

    it('should return false for null role', () => {
      expect(can(null, 'dashboard', 'view')).toBe(false);
    });

    it('should return false for unknown module', () => {
      expect(can('admin', 'unknown_module', 'view')).toBe(false);
    });

    it('should handle ceo having all permissions', () => {
      expect(can('ceo', 'dashboard', 'view')).toBe(true);
      expect(can('ceo', 'admin', 'view')).toBe(true);
    });

    it('should return false for unknown action', () => {
      expect(can('admin', 'dashboard', 'unknown_action')).toBe(false);
    });
  });

  describe('getPermissionsForRole()', () => {
    it('should return permissions object for valid role', () => {
      const perms = getPermissionsForRole('admin');
      expect(perms).toBeDefined();
      expect(typeof perms).toBe('object');
      expect(perms.dashboard).toBeDefined();
    });

    it('should return full permissions object for admin', () => {
      const perms = getPermissionsForRole('admin');
      expect(perms.dashboard).toBeDefined();
      expect(perms.batches).toBeDefined();
      expect(perms.attendance).toBeDefined();
      expect(perms.compliance).toBeDefined();
    });

    it('should return dashboard permissions for scientist', () => {
      const perms = getPermissionsForRole('scientist');
      expect(perms.dashboard).toBeDefined();
      expect(perms.dashboard.view).toBe(true);
    });

    it('should return limited permissions for intern', () => {
      const perms = getPermissionsForRole('intern');
      expect(perms.dashboard).toBeDefined();
    });
  });
});
