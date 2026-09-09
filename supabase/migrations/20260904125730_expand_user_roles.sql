/*
# Expand User Roles: manager + staff

## Overview
Extends the profiles table to support a hierarchy:
- admin: sees everything, creates hospitals + manager accounts
- manager: hospital-level admin, creates staff accounts for their hospital
- staff: hospital-level user, read/write own hospital data (no user management)

## Changes
1. profiles.role CHECK constraint: add 'manager' and 'staff'
2. Update is_admin() to is_admin_or_manager() for user management scope
3. Update profiles RLS: managers can SELECT staff in their hospital
4. Update trigger to accept 'manager' and 'staff' roles from metadata
*/

-- ============================================================
-- 1. Expand role CHECK constraint
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'staff', 'hospital'));

-- ============================================================
-- 2. Helper: is_admin_or_manager()
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin_or_manager() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. Helper: can_manage_user(target_hospital_id)
--    Admin can manage any; manager can manage users in own hospital
-- ============================================================
CREATE OR REPLACE FUNCTION can_manage_user(target_hospital uuid) RETURNS boolean AS $$
  DECLARE
    my_role text;
    my_hospital uuid;
  BEGIN
    SELECT role, hospital_id INTO my_role, my_hospital FROM profiles WHERE id = auth.uid();
    IF my_role = 'admin' THEN RETURN true;
    END IF;
    IF my_role = 'manager' AND my_hospital = target_hospital THEN RETURN true;
    END IF;
    RETURN false;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 4. Update profiles RLS: managers can see staff in their hospital
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR is_admin()
    OR (role IN ('staff', 'manager', 'hospital') AND hospital_id = user_hospital_id())
  );

-- ============================================================
-- 5. Update trigger to accept new roles
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, role, hospital_id, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'hospital'),
    NULLIF(NEW.raw_user_meta_data->>'hospital_id', '')::uuid,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    hospital_id = EXCLUDED.hospital_id,
    full_name = EXCLUDED.full_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Migrate existing 'hospital' role users to 'manager'
-- ============================================================
UPDATE profiles SET role = 'manager' WHERE role = 'hospital';