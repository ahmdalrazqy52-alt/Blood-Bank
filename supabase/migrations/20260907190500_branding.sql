
-- ---------- Branding / avatars ----------
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Public read-only assets, controlled uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('hospital-assets','hospital-assets',true)
ON CONFLICT (id) DO UPDATE SET public=true;

DROP POLICY IF EXISTS "hospital_assets_public_read" ON storage.objects;
CREATE POLICY "hospital_assets_public_read" ON storage.objects FOR SELECT
USING (bucket_id='hospital-assets');

DROP POLICY IF EXISTS "hospital_assets_upload" ON storage.objects;
CREATE POLICY "hospital_assets_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='hospital-assets'
  AND (
    is_admin()
    OR (
      (storage.foldername(name))[1] = 'hospital'
      AND (storage.foldername(name))[2] = user_hospital_id()::text
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id=auth.uid() AND p.role='manager' AND p.is_active=true
      )
    )
    OR (
      (storage.foldername(name))[1] = 'profile'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

DROP POLICY IF EXISTS "hospital_assets_update" ON storage.objects;
CREATE POLICY "hospital_assets_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id='hospital-assets' AND (
    is_admin()
    OR (storage.foldername(name))[1]='hospital' AND (storage.foldername(name))[2]=user_hospital_id()::text
    OR (storage.foldername(name))[1]='profile' AND (storage.foldername(name))[2]=auth.uid()::text
  )
)
WITH CHECK (
  bucket_id='hospital-assets' AND (
    is_admin()
    OR (storage.foldername(name))[1]='hospital' AND (storage.foldername(name))[2]=user_hospital_id()::text
    OR (storage.foldername(name))[1]='profile' AND (storage.foldername(name))[2]=auth.uid()::text
  )
);

DROP POLICY IF EXISTS "hospital_assets_delete" ON storage.objects;
CREATE POLICY "hospital_assets_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='hospital-assets' AND (
    is_admin()
    OR (storage.foldername(name))[1]='hospital' AND (storage.foldername(name))[2]=user_hospital_id()::text
    OR (storage.foldername(name))[1]='profile' AND (storage.foldername(name))[2]=auth.uid()::text
  )
);

-- Secure profile self-service update: only display name/avatar can be changed.
CREATE OR REPLACE FUNCTION update_my_profile(p_full_name text, p_avatar_url text DEFAULT NULL)
RETURNS profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r profiles;
BEGIN
  UPDATE profiles
     SET full_name=NULLIF(trim(p_full_name),''),
         avatar_url=p_avatar_url
   WHERE id=auth.uid() AND is_active=true
   RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحساب غير موجود أو غير نشط'; END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION update_my_profile(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_profile(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION update_hospital_branding(
  p_hospital_id uuid,
  p_logo_url text,
  p_image_url text
)
RETURNS hospitals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hospitals;
BEGIN
  IF NOT can_manage_hospital(p_hospital_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE hospitals SET logo_url=p_logo_url, image_url=p_image_url
   WHERE id=p_hospital_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'المستشفى غير موجود'; END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION update_hospital_branding(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_hospital_branding(uuid,text,text) TO authenticated;
