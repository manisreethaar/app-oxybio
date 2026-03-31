-- Profile Synchronization & Case-Sensitivity Fix
-- Run this in the Supabase SQL Editor to resolve "Employee not found" errors

-- 1. UNIFY EMAIL CASING (Supabase Auth uses lowercase internally)
-- This ensures the lookup for "intern@oxy.com" matches "Intern@Oxy.com"
UPDATE public.employees 
SET email = lower(email)
WHERE email != lower(email);

-- 2. SYNC IDS (Link Auth Accounts to Employee Profiles)
-- This query shows users where the email matches but the ID doesn't.
-- Useful for diagnostic.
SELECT 
    e.email, 
    e.full_name, 
    e.id AS old_id, 
    u.id AS actual_auth_id
FROM public.employees e
JOIN auth.users u ON lower(e.email) = lower(u.email)
WHERE e.id != u.id;

-- 3. APPLY THE SYNC
UPDATE public.employees e
SET id = u.id
FROM auth.users u
WHERE lower(e.email) = lower(u.email) 
AND e.id != u.id;

-- 4. VERIFY FINAL STATUS
-- Should return total count of profiles that match by email and have correct ID.
SELECT count(*) 
FROM public.employees e
JOIN auth.users u ON lower(e.email) = lower(u.email)
WHERE e.id = u.id;
