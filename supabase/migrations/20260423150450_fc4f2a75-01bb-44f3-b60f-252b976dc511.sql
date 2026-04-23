-- 1) burst_messaging: block anon/authenticated, keep service_role only
CREATE POLICY "Block anon and authenticated from burst_messaging"
ON public.burst_messaging
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 2) user_roles: explicit UPDATE policy restricted to admins only
CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3) burst_email & burst_social_dm: same hardening (block anon/authenticated)
CREATE POLICY "Block anon and authenticated from burst_email"
ON public.burst_email
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block anon and authenticated from burst_social_dm"
ON public.burst_social_dm
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);