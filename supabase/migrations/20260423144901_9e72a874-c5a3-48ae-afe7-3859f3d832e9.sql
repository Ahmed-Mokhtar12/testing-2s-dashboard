-- 1) Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- 2) Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) SECURITY DEFINER function to check role (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: is the user any kind of staff member (staff OR admin)
CREATE OR REPLACE FUNCTION public.is_hotel_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'staff')
  )
$$;

-- 4) RLS on user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5) Auto-assign admin role to the FIRST user, staff to others
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 6) Backfill: give existing users admin role (so they keep access)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- 7) Tighten policies on sensitive tables — restrict SELECT to hotel staff only

-- welcome_message_success_log
DROP POLICY IF EXISTS "Authenticated users can read welcome_message_success_log" ON public.welcome_message_success_log;
CREATE POLICY "Hotel staff can read welcome_message_success_log"
ON public.welcome_message_success_log FOR SELECT
TO authenticated
USING (public.is_hotel_staff(auth.uid()));

-- LongTermMemory
DROP POLICY IF EXISTS "Authenticated users can read LongTermMemory" ON public."LongTermMemory";
CREATE POLICY "Hotel staff can read LongTermMemory"
ON public."LongTermMemory" FOR SELECT
TO authenticated
USING (public.is_hotel_staff(auth.uid()));

-- Chat History (read + update)
DROP POLICY IF EXISTS "Authenticated staff can read Chat History" ON public."Chat History";
DROP POLICY IF EXISTS "Authenticated staff can update Chat History" ON public."Chat History";

CREATE POLICY "Hotel staff can read Chat History"
ON public."Chat History" FOR SELECT
TO authenticated
USING (public.is_hotel_staff(auth.uid()));

CREATE POLICY "Hotel staff can update Chat History"
ON public."Chat History" FOR UPDATE
TO authenticated
USING (public.is_hotel_staff(auth.uid()))
WITH CHECK (
  public.is_hotel_staff(auth.uid())
  AND (replied_by_user_id IS NULL OR replied_by_user_id = auth.uid())
);

-- Other sensitive operational tables → staff only
DROP POLICY IF EXISTS "Authenticated users can read reviews" ON public.reviews;
CREATE POLICY "Hotel staff can read reviews"
ON public.reviews FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read khaldia_reviews" ON public.khaldia_reviews;
CREATE POLICY "Hotel staff can read khaldia_reviews"
ON public.khaldia_reviews FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read email_threads" ON public.email_threads;
CREATE POLICY "Hotel staff can read email_threads"
ON public.email_threads FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read info_email_audit_log" ON public.info_email_audit_log;
CREATE POLICY "Hotel staff can read info_email_audit_log"
ON public.info_email_audit_log FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read social_engagement_logs" ON public.social_engagement_logs;
CREATE POLICY "Hotel staff can read social_engagement_logs"
ON public.social_engagement_logs FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read competitor rates" ON public."Two Seasons Competitor Hotel room Rates";
CREATE POLICY "Hotel staff can read competitor rates"
ON public."Two Seasons Competitor Hotel room Rates" FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read N8N_2S" ON public."N8N_2S";
CREATE POLICY "Hotel staff can read N8N_2S"
ON public."N8N_2S" FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read Sop" ON public."Sop";
CREATE POLICY "Hotel staff can read Sop"
ON public."Sop" FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read Conducted Training" ON public."Conducted Training";
CREATE POLICY "Hotel staff can read Conducted Training"
ON public."Conducted Training" FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read conducted_training" ON public.conducted_training;
CREATE POLICY "Hotel staff can read conducted_training"
ON public.conducted_training FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read n8n_chat_histories" ON public.n8n_chat_histories;
CREATE POLICY "Hotel staff can read n8n_chat_histories"
ON public.n8n_chat_histories FOR SELECT TO authenticated
USING (public.is_hotel_staff(auth.uid()));