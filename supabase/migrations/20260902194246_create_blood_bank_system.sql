/*
# Create Central Blood Bank Management System

## Overview
Multi-hospital blood bank management system. Hospitals manage their own blood inventory,
requests, and deliveries. A central dashboard shows aggregate stats across all hospitals.

## Tables Created
1. `hospitals` — registered hospitals with status (active/suspended)
2. `blood_units` — individual blood units with type, component, collection/expiry dates, status
3. `blood_requests` — blood requests with full lifecycle (new → reviewing → accepted → reserved → ready → delivered/rejected/cancelled)
4. `deliveries` — delivery records linking a request from supplier hospital to requesting hospital
5. `notifications` — system notifications for events
6. `audit_logs` — audit trail of all actions

## Blood Types: A+, A-, B+, B-, AB+, AB-, O+, O-
## Blood Components: Whole Blood, Packed RBC, Plasma, Platelets, Cryoprecipitate
## Unit Status: available, reserved, issued, expired, discarded
## Request Status: new, reviewing, accepted, reserved, ready, delivered, rejected, cancelled
## Request Priority: normal, urgent, critical

## Security
- RLS enabled on all tables
- Single-tenant public access (no auth) — all data shared across the app
- Anon + authenticated roles can CRUD all tables
*/

-- ============================================================
-- HOSPITALS
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  city text NOT NULL,
  address text,
  phone text,
  email text,
  manager text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  registered_at timestamptz DEFAULT now()
);

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hospitals_select" ON hospitals;
CREATE POLICY "hospitals_select" ON hospitals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "hospitals_insert" ON hospitals;
CREATE POLICY "hospitals_insert" ON hospitals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "hospitals_update" ON hospitals;
CREATE POLICY "hospitals_update" ON hospitals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "hospitals_delete" ON hospitals;
CREATE POLICY "hospitals_delete" ON hospitals FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- BLOOD UNITS
-- ============================================================
CREATE TABLE IF NOT EXISTS blood_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code text UNIQUE NOT NULL,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_type text NOT NULL CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  component text NOT NULL CHECK (component IN ('Whole Blood','Packed RBC','Plasma','Platelets','Cryoprecipitate')),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  collection_date date NOT NULL,
  expiry_date date NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','issued','expired','discarded')),
  storage_location text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE blood_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blood_units_select" ON blood_units;
CREATE POLICY "blood_units_select" ON blood_units FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "blood_units_insert" ON blood_units;
CREATE POLICY "blood_units_insert" ON blood_units FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "blood_units_update" ON blood_units;
CREATE POLICY "blood_units_update" ON blood_units FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "blood_units_delete" ON blood_units;
CREATE POLICY "blood_units_delete" ON blood_units FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_blood_units_hospital ON blood_units(hospital_id);
CREATE INDEX IF NOT EXISTS idx_blood_units_type_component ON blood_units(blood_type, component);
CREATE INDEX IF NOT EXISTS idx_blood_units_status ON blood_units(status);

-- ============================================================
-- BLOOD REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS blood_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text UNIQUE NOT NULL,
  requesting_hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  supplier_hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  department text,
  patient_name text,
  patient_file text,
  reason text,
  blood_type text NOT NULL CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  component text NOT NULL CHECK (component IN ('Whole Blood','Packed RBC','Plasma','Platelets','Cryoprecipitate')),
  quantity int NOT NULL CHECK (quantity > 0),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent','critical')),
  needed_by timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','accepted','reserved','ready','delivered','rejected','cancelled')),
  notes text,
  contact_phone text,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz
);

ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blood_requests_select" ON blood_requests;
CREATE POLICY "blood_requests_select" ON blood_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "blood_requests_insert" ON blood_requests;
CREATE POLICY "blood_requests_insert" ON blood_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "blood_requests_update" ON blood_requests;
CREATE POLICY "blood_requests_update" ON blood_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "blood_requests_delete" ON blood_requests;
CREATE POLICY "blood_requests_delete" ON blood_requests FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_requests_requesting ON blood_requests(requesting_hospital_id);
CREATE INDEX IF NOT EXISTS idx_requests_supplier ON blood_requests(supplier_hospital_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON blood_requests(status);

-- ============================================================
-- DELIVERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_code text UNIQUE NOT NULL,
  request_id uuid NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  supplier_hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  receiving_hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_type text NOT NULL,
  component text NOT NULL,
  quantity int NOT NULL,
  issued_by text,
  received_by text,
  delivered_at timestamptz DEFAULT now(),
  notes text
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliveries_select" ON deliveries;
CREATE POLICY "deliveries_select" ON deliveries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "deliveries_insert" ON deliveries;
CREATE POLICY "deliveries_insert" ON deliveries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "deliveries_update" ON deliveries;
CREATE POLICY "deliveries_update" ON deliveries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "deliveries_delete" ON deliveries;
CREATE POLICY "deliveries_delete" ON deliveries FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  hospital_id uuid REFERENCES hospitals(id) ON DELETE CASCADE,
  request_id uuid REFERENCES blood_requests(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent','critical')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "audit_logs_update" ON audit_logs;
CREATE POLICY "audit_logs_update" ON audit_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "audit_logs_delete" ON audit_logs;
CREATE POLICY "audit_logs_delete" ON audit_logs FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Hospitals
INSERT INTO hospitals (code, name, city, address, phone, email, manager, status) VALUES
('H001', 'مستشفى الثورة', 'صنعاء', 'شارع حدة، جوار السد', '009671-5551234', 'info@althawra.ye', 'د. أحمد الشامي', 'active'),
('H002', 'مستشفى الجمهوري', 'تعز', 'شارع الرئيسي، وسط المدينة', '009674-5555678', 'info@gomhori.ye', 'د. سعيد العولقي', 'active'),
('H003', 'مستشفى الوحدة', 'صنعاء', 'شارع الزبيري', '009671-5559012', 'info@wahda.ye', 'د. محمد المقشي', 'active'),
('H004', 'مستشفى السلام', 'عدن', 'خورمكسر، المنطقة السياحية', '009672-5553456', 'info@salam.ye', 'د. ناصر العولقي', 'active'),
('H005', 'مستشفى ابن سينا', 'صنعاء', 'شارع المطار', '009671-5557890', 'info@ibnsina.ye', 'د. عبدالله الرعيني', 'active')
ON CONFLICT (code) DO NOTHING;

-- Blood Units (seed)
INSERT INTO blood_units (unit_code, hospital_id, blood_type, component, quantity, collection_date, expiry_date, status, storage_location) VALUES
('BLD-2026-0001', (SELECT id FROM hospitals WHERE code='H001'), 'O+', 'Whole Blood', 1, '2026-08-15', '2026-09-15', 'available', 'Refrigerator-01'),
('BLD-2026-0002', (SELECT id FROM hospitals WHERE code='H001'), 'O+', 'Packed RBC', 1, '2026-08-20', '2026-09-20', 'available', 'Refrigerator-01'),
('BLD-2026-0003', (SELECT id FROM hospitals WHERE code='H001'), 'A+', 'Plasma', 1, '2026-08-25', '2026-10-25', 'available', 'Freezer-02'),
('BLD-2026-0004', (SELECT id FROM hospitals WHERE code='H001'), 'B+', 'Platelets', 1, '2026-08-28', '2026-09-05', 'available', 'Agitator-01'),
('BLD-2026-0005', (SELECT id FROM hospitals WHERE code='H001'), 'O-', 'Packed RBC', 1, '2026-08-10', '2026-09-10', 'available', 'Refrigerator-02'),
('BLD-2026-0006', (SELECT id FROM hospitals WHERE code='H002'), 'O-', 'Whole Blood', 1, '2026-08-18', '2026-09-18', 'available', 'Refrigerator-01'),
('BLD-2026-0007', (SELECT id FROM hospitals WHERE code='H002'), 'A-', 'Packed RBC', 1, '2026-08-22', '2026-09-22', 'available', 'Refrigerator-01'),
('BLD-2026-0008', (SELECT id FROM hospitals WHERE code='H002'), 'AB+', 'Plasma', 1, '2026-08-27', '2026-10-27', 'available', 'Freezer-01'),
('BLD-2026-0009', (SELECT id FROM hospitals WHERE code='H003'), 'A+', 'Whole Blood', 1, '2026-08-12', '2026-09-12', 'available', 'Refrigerator-01'),
('BLD-2026-0010', (SELECT id FROM hospitals WHERE code='H003'), 'B-', 'Packed RBC', 1, '2026-08-19', '2026-09-19', 'available', 'Refrigerator-02'),
('BLD-2026-0011', (SELECT id FROM hospitals WHERE code='H003'), 'O+', 'Platelets', 1, '2026-08-29', '2026-09-06', 'available', 'Agitator-01'),
('BLD-2026-0012', (SELECT id FROM hospitals WHERE code='H004'), 'B+', 'Whole Blood', 1, '2026-08-16', '2026-09-16', 'available', 'Refrigerator-01'),
('BLD-2026-0013', (SELECT id FROM hospitals WHERE code='H004'), 'AB-', 'Plasma', 1, '2026-08-24', '2026-10-24', 'available', 'Freezer-01'),
('BLD-2026-0014', (SELECT id FROM hospitals WHERE code='H004'), 'O-', 'Packed RBC', 1, '2026-08-05', '2026-09-05', 'available', 'Refrigerator-02'),
('BLD-2026-0015', (SELECT id FROM hospitals WHERE code='H005'), 'A+', 'Packed RBC', 1, '2026-08-21', '2026-09-21', 'available', 'Refrigerator-01'),
('BLD-2026-0016', (SELECT id FROM hospitals WHERE code='H005'), 'O+', 'Whole Blood', 1, '2026-08-14', '2026-09-14', 'available', 'Refrigerator-01'),
('BLD-2026-0017', (SELECT id FROM hospitals WHERE code='H005'), 'B+', 'Platelets', 1, '2026-08-30', '2026-09-07', 'available', 'Agitator-02'),
('BLD-2026-0018', (SELECT id FROM hospitals WHERE code='H001'), 'AB+', 'Cryoprecipitate', 1, '2026-08-26', '2026-11-26', 'available', 'Freezer-03')
ON CONFLICT (unit_code) DO NOTHING;

-- Blood Requests (seed)
INSERT INTO blood_requests (request_code, requesting_hospital_id, supplier_hospital_id, department, patient_name, patient_file, reason, blood_type, component, quantity, priority, needed_by, status, contact_phone, accepted_at) VALUES
('REQ-1021', (SELECT id FROM hospitals WHERE code='H003'), (SELECT id FROM hospitals WHERE code='H001'), 'الطوارئ', 'محمد علي', 'PT-5521', 'نزيف حاد', 'O-', 'Packed RBC', 1, 'critical', '2026-09-10 22:00:00+03', 'new', '777111222', '2026-09-02 21:38:00+03'),
('REQ-1022', (SELECT id FROM hospitals WHERE code='H004'), NULL, 'العمليات', 'سالم أحمد', 'PT-3398', 'عملية قلب', 'A+', 'Whole Blood', 2, 'urgent', '2026-09-04 08:00:00+03', 'new', '777333444', NULL),
('REQ-1023', (SELECT id FROM hospitals WHERE code='H002'), (SELECT id FROM hospitals WHERE code='H005'), 'الباطنة', 'فاطمة حسن', 'PT-8812', 'أنيميا شديدة', 'B+', 'Platelets', 4, 'normal', '2026-09-05 12:00:00+03', 'reviewing', '777555666', NULL)
ON CONFLICT (request_code) DO NOTHING;

-- Notifications (seed)
INSERT INTO notifications (type, title, message, hospital_id, request_id, priority, is_read) VALUES
('new_request', 'طلب دم جديد', 'طلب جديد من مستشفى الوحدة - O- Packed RBC - 3 وحدات - حرج', (SELECT id FROM hospitals WHERE code='H001'), (SELECT id FROM blood_requests WHERE request_code='REQ-1021'), 'critical', false),
('expiry_warning', 'تنبيه انتهاء صلاحية', 'وحدة BLD-2026-0005 تنتهي خلال 8 أيام', (SELECT id FROM hospitals WHERE code='H001'), NULL, 'urgent', false),
('expiry_warning', 'تنبيه انتهاء صلاحية', 'وحدة BLD-2026-0014 تنتهي خلال 3 أيام', (SELECT id FROM hospitals WHERE code='H004'), NULL, 'urgent', false),
('request_accepted', 'تم قبول طلبك', 'تم قبول طلب REQ-1021 من مستشفى الثورة', (SELECT id FROM hospitals WHERE code='H003'), (SELECT id FROM blood_requests WHERE request_code='REQ-1021'), 'normal', false)
ON CONFLICT DO NOTHING;

-- Audit Logs (seed)
INSERT INTO audit_logs (user_name, hospital_id, action, entity, entity_id, old_value, new_value, reason, created_at) VALUES
('أحمد الشامي', (SELECT id FROM hospitals WHERE code='H001'), 'create', 'blood_unit', 'BLD-2026-0001', NULL, 'O+ Whole Blood', 'إضافة وحدة دم جديدة', '2026-08-15 09:00:00+03'),
('سعيد العولقي', (SELECT id FROM hospitals WHERE code='H002'), 'create', 'blood_request', 'REQ-1023', NULL, 'B+ Platelets 4', 'إنشاء طلب دم', '2026-09-01 14:30:00+03'),
('محمد المقشي', (SELECT id FROM hospitals WHERE code='H003'), 'accept', 'blood_request', 'REQ-1021', 'new', 'reserved', 'قبول طلب دم وحجز الكمية', '2026-09-02 21:38:00+03')
ON CONFLICT DO NOTHING;