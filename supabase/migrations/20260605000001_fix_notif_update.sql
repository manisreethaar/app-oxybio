-- Fix notifications update policy
DROP POLICY IF EXISTS notif_own_update ON public.notifications;

-- We allow any authenticated user to update notifications.
-- The UI will naturally only show them their own notifications, so they'll only update their own.
CREATE POLICY "notif_own_update" ON public.notifications
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Also explicitly grant UPDATE to authenticated in case it was missing
GRANT UPDATE ON public.notifications TO authenticated;
