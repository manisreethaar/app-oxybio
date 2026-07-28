-- OxyOS Global Mutation Recovery Addon for Documents Vault
-- Run this in your Supabase SQL Editor to fix the RLS issue where document uploaders cannot view their own documents if they are not all-staff or admin.
-- This updated script also explicitly ensures legacy documents with a NULL access_level are treated as 'all-staff' so they are not lost.

DROP POLICY IF EXISTS "Anyone can view shared documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;

-- 1. Recreate SELECT policy to ensure uploaders and allowed roles can view documents
CREATE POLICY "Anyone can view shared documents" 
    ON public.documents FOR SELECT 
    USING (
        access_level = 'all-staff' 
        OR access_level IS NULL
        OR uploaded_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM employees 
            WHERE id = auth.uid() 
            AND (
                role = 'admin' 
                OR (role IN ('ceo', 'cto') AND (access_level IN ('management-only', 'all-staff') OR access_level IS NULL))
            )
        )
    );

-- 2. Recreate manage policy. Note: The API route now uses admin privileges to insert, 
-- but this policy is still required for security on the client side.
CREATE POLICY "Admins can manage documents" 
    ON public.documents FOR ALL 
    USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'));
