'use client';
import { useCallback, useEffect, useState } from 'react';

// Shared SOP-training gate. Blocks an action until the current employee has
// acknowledged (read + quizzed + signed) the latest active SOP for `category`.
//
// failClosed: if the /api/training/check call errors, times out, or the
// employee is offline, treat the user as NOT trained (block) instead of
// letting them through. Use this for anything where an unread SOP is a
// real compliance risk.
//
// bypassRoles: roles that skip the check entirely (e.g. admins for
// non-critical modules). Pass [] to require everyone, including admins.
export function useSopGate({ employeeId, category, role, bypassRoles = [], failClosed = true, enabled = true }) {
  const [state, setState] = useState({ checking: true, isTrained: false, sopId: null, version: null, error: null });

  const bypassed = bypassRoles.includes(role);

  const check = useCallback(async (signal) => {
    if (!enabled || bypassed) {
      setState({ checking: false, isTrained: true, sopId: null, version: null, error: null });
      return;
    }
    if (!employeeId || !category) {
      // Nothing to check against yet (still loading employee profile) — stay blocked, not open.
      setState((prev) => ({ ...prev, checking: true }));
      return;
    }
    setState((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`/api/training/check?employeeId=${employeeId}&category=${encodeURIComponent(category)}`, { signal });
      if (!res.ok) throw new Error(`Training check failed (${res.status})`);
      const data = await res.json();
      setState({ checking: false, isTrained: !!data.isTrained, sopId: data.sopId || null, version: data.version || null, error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('SOP training check failed:', err);
      setState({ checking: false, isTrained: !failClosed, sopId: null, version: null, error: err.message });
    }
  }, [enabled, bypassed, employeeId, category, failClosed]);

  useEffect(() => {
    const controller = new AbortController();
    check(controller.signal);
    return () => controller.abort();
  }, [check]);

  return { ...state, bypassed, recheck: check };
}
