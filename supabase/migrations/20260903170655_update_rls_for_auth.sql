/*
# Enable RLS on profiles and Update All Table Policies

## Overview
Enables RLS on profiles and replaces all existing table policies with role-aware ones.
- Admin role: sees and manages everything
- Hospital role: sees only their hospital's data, can create requests for their hospital

## profiles RLS
- SELECT: own row or admin
- UPDATE: own row only

## hospitals RLS
- SELECT: all authenticated (needed for dropdowns)
- INSERT/UPDATE/DELETE: admin only

## blood_units RLS
- Admin: all; Hospital: own hospital only

## blood_requests RLS
- Admin: all; Hospital: where requester or supplier; can insert as requester

## deliveries RLS
- Admin: all; Hospital: where supplier or receiver

## notifications RLS
- Admin: all; Hospital: own hospital

## audit_logs RLS
- Admin: all; Hospital: own hospital; insert allowed for all
*/

-- ============================================================
-- PROFILES: Enable RLS + policies
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- HOSPITALS
-- ============================================================
DROP POLICY IF EXISTS "hospitals_select" ON hospitals;
CREATE POLICY "hospitals_select" ON hospitals FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "hospitals_insert" ON hospitals;
CREATE POLICY "hospitals_insert" ON hospitals FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "hospitals_update" ON hospitals;
CREATE POLICY "hospitals_update" ON hospitals FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "hospitals_delete" ON hospitals;
CREATE POLICY "hospitals_delete" ON hospitals FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- BLOOD_UNITS
-- ============================================================
DROP POLICY IF EXISTS "blood_units_select" ON blood_units;
CREATE POLICY "blood_units_select" ON blood_units FOR SELECT
  TO authenticated USING (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "blood_units_insert" ON blood_units;
CREATE POLICY "blood_units_insert" ON blood_units FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "blood_units_update" ON blood_units;
CREATE POLICY "blood_units_update" ON blood_units FOR UPDATE
  TO authenticated USING (is_admin() OR hospital_id = user_hospital_id())
  WITH CHECK (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "blood_units_delete" ON blood_units;
CREATE POLICY "blood_units_delete" ON blood_units FOR DELETE
  TO authenticated USING (is_admin() OR hospital_id = user_hospital_id());

-- ============================================================
-- BLOOD_REQUESTS
-- ============================================================
DROP POLICY IF EXISTS "blood_requests_select" ON blood_requests;
CREATE POLICY "blood_requests_select" ON blood_requests FOR SELECT
  TO authenticated USING (
    is_admin()
    OR requesting_hospital_id = user_hospital_id()
    OR supplier_hospital_id = user_hospital_id()
  );

DROP POLICY IF EXISTS "blood_requests_insert" ON blood_requests;
CREATE POLICY "blood_requests_insert" ON blood_requests FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR requesting_hospital_id = user_hospital_id()
  );

DROP POLICY IF EXISTS "blood_requests_update" ON blood_requests;
CREATE POLICY "blood_requests_update" ON blood_requests FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR requesting_hospital_id = user_hospital_id()
    OR supplier_hospital_id = user_hospital_id()
  )
  WITH CHECK (
    is_admin()
    OR requesting_hospital_id = user_hospital_id()
    OR supplier_hospital_id = user_hospital_id()
  );

DROP POLICY IF EXISTS "blood_requests_delete" ON blood_requests;
CREATE POLICY "blood_requests_delete" ON blood_requests FOR DELETE
  TO authenticated USING (is_admin() OR requesting_hospital_id = user_hospital_id());

-- ============================================================
-- DELIVERIES
-- ============================================================
DROP POLICY IF EXISTS "deliveries_select" ON deliveries;
CREATE POLICY "deliveries_select" ON deliveries FOR SELECT
  TO authenticated USING (
    is_admin()
    OR supplier_hospital_id = user_hospital_id()
    OR receiving_hospital_id = user_hospital_id()
  );

DROP POLICY IF EXISTS "deliveries_insert" ON deliveries;
CREATE POLICY "deliveries_insert" ON deliveries FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR supplier_hospital_id = user_hospital_id()
    OR receiving_hospital_id = user_hospital_id()
  );

DROP POLICY IF EXISTS "deliveries_update" ON deliveries;
CREATE POLICY "deliveries_update" ON deliveries FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR supplier_hospital_id = user_hospital_id()
    OR receiving_hospital_id = user_hospital_id()
  ) WITH CHECK (
    is_admin()
    OR supplier_hospital_id = user_hospital_id()
    OR receiving_hospital_id = user_hospital_id()
  );

DROP POLICY IF EXISTS "deliveries_delete" ON deliveries;
CREATE POLICY "deliveries_delete" ON deliveries FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (is_admin() OR hospital_id = user_hospital_id())
  WITH CHECK (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated USING (is_admin() OR hospital_id = user_hospital_id());

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_update" ON audit_logs;
CREATE POLICY "audit_logs_update" ON audit_logs FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "audit_logs_delete" ON audit_logs;
CREATE POLICY "audit_logs_delete" ON audit_logs FOR DELETE
  TO authenticated USING (is_admin());