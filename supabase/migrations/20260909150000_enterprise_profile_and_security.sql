/* Enterprise profile, login identifier, notification preferences and workflow hardening */

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_sound_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_ci ON profiles (lower(username)) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON profiles(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_hospital_status ON blood_requests(requesting_hospital_id,supplier_hospital_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_units_stock_lookup ON blood_units(hospital_id,blood_type,component,status,expiry_date);

-- Self-service profile preferences; role/hospital/status remain protected.
CREATE OR REPLACE FUNCTION update_my_profile(
  p_full_name text,
  p_avatar_url text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notification_sound_enabled boolean DEFAULT true
)
RETURNS profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r profiles; normalized_username text;
BEGIN
  normalized_username := NULLIF(lower(trim(p_username)), '');
  IF normalized_username IS NOT NULL AND length(normalized_username) < 3 THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
  END IF;
  IF normalized_username IS NOT NULL AND EXISTS(SELECT 1 FROM profiles WHERE lower(username)=normalized_username AND id<>auth.uid()) THEN
    RAISE EXCEPTION 'اسم المستخدم مستخدم مسبقاً';
  END IF;
  UPDATE profiles SET
    full_name=NULLIF(trim(p_full_name),''),
    avatar_url=p_avatar_url,
    username=normalized_username,
    phone=NULLIF(trim(p_phone),''),
    notification_sound_enabled=COALESCE(p_notification_sound_enabled,true)
  WHERE id=auth.uid() AND is_active=true
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحساب غير موجود أو غير نشط'; END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION update_my_profile(text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_profile(text,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION record_my_login()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t timestamptz := now();
BEGIN
  UPDATE profiles SET last_login_at=t WHERE id=auth.uid() AND is_active=true;
  RETURN t;
END;
$$;
REVOKE ALL ON FUNCTION record_my_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_my_login() TO authenticated;

-- Resolve username/email/phone to the auth email without exposing other profile fields.
CREATE OR REPLACE FUNCTION resolve_login_identifier(p_identifier text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v text; normalized text := lower(trim(p_identifier));
BEGIN
  SELECT email INTO v FROM profiles
   WHERE lower(email)=normalized OR lower(username)=normalized OR phone=trim(p_identifier)
   LIMIT 1;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION resolve_login_identifier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_login_identifier(text) TO anon,authenticated;

-- Keep all active staff/manager users searchable within their hospital through existing RLS.
DROP POLICY IF EXISTS "profiles_select_scoped" ON profiles;
CREATE POLICY "profiles_select_scoped" ON profiles FOR SELECT TO authenticated
USING (
  auth.uid()=id OR is_admin() OR (hospital_id=user_hospital_id() AND role IN ('manager','staff'))
);

-- Compatibility overload for clients that still call the previous two-argument function.
CREATE OR REPLACE FUNCTION update_my_profile_legacy(p_full_name text, p_avatar_url text DEFAULT NULL)
RETURNS profiles
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM update_my_profile(p_full_name,p_avatar_url,NULL,NULL,true);
$$;

-- Tighten notification updates to the owning hospital; inserts are performed by trusted triggers/RPCs.
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_server_only" ON notifications;

CREATE POLICY "notifications_insert_server_only"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (false);
-- Every request creator/processor can be indexed and displayed safely.
CREATE INDEX IF NOT EXISTS idx_requests_created_by_status ON blood_requests(created_by,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_accepted_by_status ON blood_requests(accepted_by,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_ready_by_status ON blood_requests(ready_by,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_delivered_by_status ON blood_requests(delivered_by,status,created_at DESC);

CREATE OR REPLACE FUNCTION record_password_change()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE profiles SET password_changed_at=now() WHERE id=auth.uid(); END; $$;
REVOKE ALL ON FUNCTION record_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_password_change() TO authenticated;
