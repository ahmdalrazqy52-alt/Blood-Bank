/*
# Add Profiles Table, Helper Functions, and Trigger

## Overview
Sets up the foundation for hospital authentication: a profiles table linking auth users to hospitals,
helper functions for access checks, and a trigger to auto-create profiles on signup.

## New Table: profiles
- id (uuid, PK, FK to auth.users) — links to auth account
- email (text) — user email
- role (text, 'admin' | 'hospital') — access level
- hospital_id (uuid, FK to hospitals, nullable) — null for admin
- full_name (text, nullable) — display name
- created_at (timestamptz)

## Functions
- is_admin() — returns true if current user is admin
- user_hospital_id() — returns current user's hospital_id

## Trigger
- on_auth_user_created — auto-creates profile row on signup

## Seed
- Admin user: admin@bloodbank.ye / admin123456
*/

-- Supabase projects may not have pgcrypto enabled in this database yet.
-- Enable it before using crypt()/gen_salt() for the seeded admin account.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- PROFILES TABLE (no RLS yet — enabled in next migration)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'hospital' CHECK (role IN ('admin', 'hospital')),
  hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  full_name text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- HELPER FUNCTIONS (must exist before RLS policies)
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION user_hospital_id() RETURNS uuid AS $$
  SELECT hospital_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, role, hospital_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'hospital'),
    NULLIF(NEW.raw_user_meta_data->>'hospital_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEED ADMIN USER
-- ============================================================
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
)
SELECT
  gen_random_uuid(),
  'admin@bloodbank.ye',
  extensions.crypt('admin123456', extensions.gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "admin"}'::jsonb,
  'authenticated',
  'authenticated'
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@bloodbank.ye');

-- Ensure admin profile exists
INSERT INTO profiles (id, email, role, hospital_id, full_name)
SELECT id, email, 'admin', NULL, 'المدير العام'
FROM auth.users
WHERE email = 'admin@bloodbank.ye'
ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'المدير العام';