/*
  Central Blood Bank - hardening + workflow v2
  Applies security, FEFO, atomic request actions, immutable audit, realtime notifications,
  account activation, safe inventory mutations and generated identifiers.
*/

-- ---------- Profiles ----------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_active ON profiles(hospital_id, is_active);

CREATE OR REPLACE FUNCTION is_active_user() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND (hospital_id IS NULL OR EXISTS (
        SELECT 1 FROM hospitals h WHERE h.id = profiles.hospital_id AND h.status = 'active'
      ))
  );
$$;

CREATE OR REPLACE FUNCTION can_manage_hospital(p_hospital uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (
        p.role = 'admin'
        OR (p.role = 'manager' AND p.hospital_id = p_hospital)
      )
  );
$$;

-- Never allow browser clients to change role/hospital_id/is_active.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
-- Profile edits are performed only by trusted Edge Functions / SQL SECURITY DEFINER routines.

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_scoped" ON profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR is_admin()
  OR (
    hospital_id = user_hospital_id()
    AND role IN ('manager','staff')
  )
);

-- ---------- Generated request/delivery/unit codes ----------
CREATE SEQUENCE IF NOT EXISTS blood_request_code_seq;
SELECT setval(
  'blood_request_code_seq',
  GREATEST(
    1000,
    COALESCE((SELECT MAX(NULLIF(regexp_replace(request_code, '\D', '', 'g'), '')::bigint)
              FROM blood_requests WHERE request_code ~ '\d+'), 1000)
  )
);

CREATE SEQUENCE IF NOT EXISTS delivery_code_seq;
SELECT setval(
  'delivery_code_seq',
  GREATEST(
    1000,
    COALESCE((SELECT MAX(NULLIF(regexp_replace(delivery_code, '\D', '', 'g'), '')::bigint)
              FROM deliveries WHERE delivery_code ~ '\d+'), 1000)
  )
);

CREATE SEQUENCE IF NOT EXISTS blood_unit_code_seq;
SELECT setval(
  'blood_unit_code_seq',
  GREATEST(
    1000,
    COALESCE((SELECT MAX(NULLIF(regexp_replace(unit_code, '\D', '', 'g'), '')::bigint)
              FROM blood_units WHERE unit_code ~ '\d+'), 1000)
  )
);

CREATE OR REPLACE FUNCTION generate_request_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'REQ-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('blood_request_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION generate_delivery_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'DLV-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('delivery_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION generate_unit_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'BLD-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('blood_unit_code_seq')::text, 6, '0');
$$;

ALTER TABLE blood_requests ALTER COLUMN request_code SET DEFAULT generate_request_code();
ALTER TABLE deliveries ALTER COLUMN delivery_code SET DEFAULT generate_delivery_code();
ALTER TABLE blood_units ALTER COLUMN unit_code SET DEFAULT generate_unit_code();

-- Individual blood units are tracked as individual units.
ALTER TABLE blood_units DROP CONSTRAINT IF EXISTS blood_units_quantity_one;
ALTER TABLE blood_units ADD CONSTRAINT blood_units_quantity_one CHECK (quantity = 1);

ALTER TABLE blood_units DROP CONSTRAINT IF EXISTS blood_units_dates_valid;
ALTER TABLE blood_units ADD CONSTRAINT blood_units_dates_valid CHECK (expiry_date > collection_date);

-- ---------- Expiry ----------
CREATE OR REPLACE FUNCTION mark_expired_blood_units()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE blood_units
     SET status = 'expired'
   WHERE status = 'available'
     AND expiry_date < current_date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION mark_expired_blood_units() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_expired_blood_units() TO authenticated;

-- ---------- Inventory mutations ----------
CREATE OR REPLACE FUNCTION save_blood_unit(
  p_id uuid,
  p_hospital_id uuid,
  p_blood_type text,
  p_component text,
  p_collection_date date,
  p_expiry_date date,
  p_storage_location text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS blood_units
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  actor_role text;
  actor_hospital uuid;
  result_row blood_units;
BEGIN
  SELECT role, hospital_id INTO actor_role, actor_hospital
  FROM profiles WHERE id = auth.uid() AND is_active = true;

  IF actor_role IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF actor_role <> 'admin' AND actor_hospital <> p_hospital_id THEN RAISE EXCEPTION 'لا يمكنك تعديل مخزون مستشفى آخر'; END IF;
  IF EXISTS (SELECT 1 FROM hospitals WHERE id=p_hospital_id AND status <> 'active') THEN RAISE EXCEPTION 'المستشفى موقوف'; END IF;
  IF p_expiry_date <= p_collection_date THEN RAISE EXCEPTION 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الجمع'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO blood_units (
      hospital_id,blood_type,component,quantity,collection_date,expiry_date,status,storage_location,notes
    ) VALUES (
      p_hospital_id,p_blood_type,p_component,1,p_collection_date,p_expiry_date,
      CASE WHEN p_expiry_date < current_date THEN 'expired' ELSE 'available' END,
      NULLIF(p_storage_location,''),NULLIF(p_notes,'')
    ) RETURNING * INTO result_row;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM blood_units WHERE id=p_id
      AND (actor_role='admin' OR hospital_id=actor_hospital)
    ) THEN RAISE EXCEPTION 'الوحدة غير موجودة أو غير مصرح بها'; END IF;

    UPDATE blood_units
       SET hospital_id=p_hospital_id,
           blood_type=p_blood_type,
           component=p_component,
           collection_date=p_collection_date,
           expiry_date=p_expiry_date,
           storage_location=NULLIF(p_storage_location,''),
           notes=NULLIF(p_notes,''),
           status=CASE WHEN status='available' AND p_expiry_date < current_date THEN 'expired' ELSE status END
     WHERE id=p_id
     RETURNING * INTO result_row;
  END IF;

  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION save_blood_unit(uuid,uuid,text,text,date,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_blood_unit(uuid,uuid,text,text,date,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION discard_blood_unit(p_id uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role text; actor_hospital uuid;
BEGIN
  SELECT role,hospital_id INTO actor_role,actor_hospital FROM profiles
   WHERE id=auth.uid() AND is_active=true;
  IF actor_role NOT IN ('admin','manager') THEN RAISE EXCEPTION 'المدير فقط يستطيع إتلاف وحدة الدم'; END IF;
  UPDATE blood_units SET status='discarded', notes=concat_ws(' | ',notes,NULLIF(p_reason,'')) 
   WHERE id=p_id AND (actor_role='admin' OR hospital_id=actor_hospital) AND status IN ('available','expired');
  IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن إتلاف هذه الوحدة'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION discard_blood_unit(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION discard_blood_unit(uuid,text) TO authenticated;

-- ---------- Request creation ----------
CREATE OR REPLACE FUNCTION create_blood_request(
  p_requesting_hospital_id uuid,
  p_supplier_hospital_id uuid,
  p_department text,
  p_patient_name text,
  p_patient_file text,
  p_reason text,
  p_blood_type text,
  p_component text,
  p_quantity integer,
  p_priority text,
  p_needed_by timestamptz,
  p_contact_phone text,
  p_notes text
)
RETURNS blood_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  actor_role text; actor_hospital uuid; r blood_requests;
BEGIN
  SELECT role,hospital_id INTO actor_role,actor_hospital FROM profiles
   WHERE id=auth.uid() AND is_active=true;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'الحساب غير نشط أو غير مصرح'; END IF;
  IF actor_role <> 'admin' AND actor_hospital <> p_requesting_hospital_id THEN RAISE EXCEPTION 'لا يمكنك إنشاء طلب باسم مستشفى آخر'; END IF;
  IF p_supplier_hospital_id IS NULL OR p_supplier_hospital_id = p_requesting_hospital_id THEN
    RAISE EXCEPTION 'يجب اختيار مستشفى مورّد مختلف';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hospitals WHERE id=p_supplier_hospital_id AND status='active') THEN
    RAISE EXCEPTION 'المستشفى المورّد غير متاح';
  END IF;
  IF p_quantity < 1 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;

  INSERT INTO blood_requests (
    requesting_hospital_id,supplier_hospital_id,department,patient_name,patient_file,
    reason,blood_type,component,quantity,priority,needed_by,status,contact_phone,notes
  ) VALUES (
    p_requesting_hospital_id,p_supplier_hospital_id,NULLIF(p_department,''),NULLIF(p_patient_name,''),
    NULLIF(p_patient_file,''),NULLIF(p_reason,''),p_blood_type,p_component,p_quantity,p_priority,
    p_needed_by,'new',NULLIF(p_contact_phone,''),NULLIF(p_notes,'')
  ) RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION create_blood_request(uuid,uuid,text,text,text,text,text,text,integer,text,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_blood_request(uuid,uuid,text,text,text,text,text,text,integer,text,timestamptz,text,text) TO authenticated;

-- ---------- Atomic request lifecycle / FEFO ----------
CREATE OR REPLACE FUNCTION process_blood_request(p_request_id uuid, p_action text)
RETURNS blood_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r blood_requests;
  actor_role text;
  actor_hospital uuid;
  remaining integer;
  u record;
  d_id uuid;
  delivered_code text;
BEGIN
  SELECT role,hospital_id INTO actor_role,actor_hospital
  FROM profiles WHERE id=auth.uid() AND is_active=true;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'الحساب غير نشط أو غير مصرح'; END IF;

  PERFORM mark_expired_blood_units();

  SELECT * INTO r FROM blood_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  IF actor_role <> 'admin' AND actor_hospital NOT IN (r.requesting_hospital_id, COALESCE(r.supplier_hospital_id,'00000000-0000-0000-0000-000000000000')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية هذا الطلب';
  END IF;

  IF p_action = 'review' THEN
    IF actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status <> 'new' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالمراجعة'; END IF;
    UPDATE blood_requests SET status='reviewing' WHERE id=r.id;

  ELSIF p_action = 'accept' THEN
    IF actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status <> 'reviewing' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالقبول'; END IF;
    UPDATE blood_requests SET status='accepted', accepted_at=now() WHERE id=r.id;

  ELSIF p_action = 'reserve' THEN
    IF actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالحجز'; END IF;
    remaining := r.quantity;
    FOR u IN
      SELECT id FROM blood_units
       WHERE hospital_id=r.supplier_hospital_id
         AND blood_type=r.blood_type
         AND component=r.component
         AND status='available'
         AND expiry_date >= current_date
       ORDER BY expiry_date ASC, collection_date ASC, created_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
    LOOP
      UPDATE blood_units SET status='reserved' WHERE id=u.id AND status='available' AND expiry_date >= current_date;
      IF FOUND THEN remaining := remaining - 1; END IF;
      EXIT WHEN remaining=0;
    END LOOP;
    IF remaining > 0 THEN
      RAISE EXCEPTION 'الكمية المتاحة غير كافية؛ لم يتم تنفيذ الحجز';
    END IF;
    UPDATE blood_requests SET status='reserved' WHERE id=r.id;

  ELSIF p_action = 'ready' THEN
    IF actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status <> 'reserved' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالتجهيز'; END IF;
    IF (SELECT count(*) FROM blood_units WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type AND component=r.component AND status='reserved') < r.quantity
    THEN RAISE EXCEPTION 'الوحدات المحجوزة غير مكتملة'; END IF;
    UPDATE blood_requests SET status='ready', ready_at=now() WHERE id=r.id;

  ELSIF p_action = 'reject' THEN
    IF actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status NOT IN ('new','reviewing','accepted') THEN RAISE EXCEPTION 'لا يمكن رفض الطلب الآن'; END IF;
    UPDATE blood_requests SET status='rejected' WHERE id=r.id;

  ELSIF p_action = 'cancel' THEN
    IF r.status IN ('delivered','cancelled','rejected') THEN RAISE EXCEPTION 'لا يمكن إلغاء الطلب'; END IF;
    IF r.status IN ('reserved','ready') AND actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN
      RAISE EXCEPTION 'بعد الحجز، الإلغاء من المورّد أو المدير العام';
    END IF;
    IF r.supplier_hospital_id IS NOT NULL AND r.status IN ('reserved','ready') THEN
      UPDATE blood_units SET status='available'
       WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type
         AND component=r.component AND status='reserved' AND expiry_date >= current_date;
    END IF;
    UPDATE blood_requests SET status='cancelled' WHERE id=r.id;

  ELSIF p_action = 'deliver' THEN
    IF actor_role <> 'admin' AND actor_hospital <> r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status <> 'ready' THEN RAISE EXCEPTION 'يجب تجهيز الطلب أولاً'; END IF;
    IF EXISTS (SELECT 1 FROM deliveries WHERE request_id=r.id) THEN RAISE EXCEPTION 'تم تسجيل التسليم مسبقاً'; END IF;

    SELECT count(*) INTO remaining
      FROM blood_units
     WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type
       AND component=r.component AND status='reserved';

    IF remaining < r.quantity THEN RAISE EXCEPTION 'الوحدات المحجوزة غير كافية'; END IF;

    FOR u IN
      SELECT id FROM blood_units
       WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type
         AND component=r.component AND status='reserved'
       ORDER BY expiry_date ASC, collection_date ASC, created_at ASC, id ASC
       FOR UPDATE
       LIMIT r.quantity
    LOOP
      UPDATE blood_units SET status='issued' WHERE id=u.id AND status='reserved';
    END LOOP;

    INSERT INTO deliveries (
      request_id,supplier_hospital_id,receiving_hospital_id,blood_type,component,quantity,
      issued_by,received_by
    ) VALUES (
      r.id,r.supplier_hospital_id,r.requesting_hospital_id,r.blood_type,r.component,r.quantity,
      (SELECT full_name FROM profiles WHERE id=auth.uid()),
      (SELECT manager FROM hospitals WHERE id=r.requesting_hospital_id)
    ) RETURNING id,delivery_code INTO d_id,delivered_code;

    UPDATE blood_requests SET status='delivered', delivered_at=now() WHERE id=r.id;
  ELSE
    RAISE EXCEPTION 'إجراء غير معروف';
  END IF;

  SELECT * INTO r FROM blood_requests WHERE id=p_request_id;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION process_blood_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_blood_request(uuid,text) TO authenticated;

-- ---------- RLS: remove direct mutation of protected workflows ----------
DROP POLICY IF EXISTS "blood_requests_insert" ON blood_requests;
DROP POLICY IF EXISTS "blood_requests_update" ON blood_requests;
DROP POLICY IF EXISTS "blood_requests_delete" ON blood_requests;
DROP POLICY IF EXISTS "blood_units_update" ON blood_units;
DROP POLICY IF EXISTS "blood_units_delete" ON blood_units;
CREATE POLICY "blood_requests_insert_via_function" ON blood_requests FOR INSERT TO authenticated WITH CHECK (false);
-- Requests are never hard-deleted; cancellation preserves the history.
CREATE POLICY "blood_units_select_scoped" ON blood_units FOR SELECT TO authenticated
USING (is_admin() OR hospital_id=user_hospital_id());
DROP POLICY IF EXISTS "blood_units_select" ON blood_units;

CREATE POLICY "blood_units_insert_admin_only_via_function" ON blood_units FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "blood_units_insert" ON blood_units;

-- ---------- Delivery mutations only through request RPC ----------
DROP POLICY IF EXISTS "deliveries_insert" ON deliveries;
DROP POLICY IF EXISTS "deliveries_update" ON deliveries;
DROP POLICY IF EXISTS "deliveries_delete" ON deliveries;
CREATE POLICY "deliveries_insert_never_direct" ON deliveries FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deliveries_update_never_direct" ON deliveries FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deliveries_delete_admin" ON deliveries FOR DELETE TO authenticated USING (is_admin());

-- ---------- Notifications ----------
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_insert_server_only" ON notifications FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "notifications_update_own_read" ON notifications FOR UPDATE TO authenticated
USING (is_admin() OR hospital_id=user_hospital_id())
WITH CHECK (is_admin() OR hospital_id=user_hospital_id());
CREATE POLICY "notifications_delete_admin" ON notifications FOR DELETE TO authenticated USING (is_admin());

-- Trigger creates notifications from request events.
CREATE OR REPLACE FUNCTION notify_blood_request_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  requester_name text;
  supplier_name text;
BEGIN
  SELECT name INTO requester_name FROM hospitals WHERE id=NEW.requesting_hospital_id;
  SELECT name INTO supplier_name FROM hospitals WHERE id=NEW.supplier_hospital_id;

  IF TG_OP='INSERT' AND NEW.supplier_hospital_id IS NOT NULL THEN
    INSERT INTO notifications(type,title,message,hospital_id,request_id,priority)
    VALUES (
      'new_request','طلب دم جديد',
      format('طلب %s من %s: %s %s — %s وحدة',NEW.request_code,requester_name,NEW.blood_type,NEW.component,NEW.quantity),
      NEW.supplier_hospital_id,NEW.id,NEW.priority
    );
  ELSIF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO notifications(type,title,message,hospital_id,request_id,priority)
    VALUES (
      'request_status','تحديث طلب دم',
      format('الطلب %s أصبح: %s',NEW.request_code,NEW.status),
      NEW.requesting_hospital_id,NEW.id,NEW.priority
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_blood_request_event ON blood_requests;
CREATE TRIGGER trg_notify_blood_request_event
AFTER INSERT OR UPDATE OF status ON blood_requests
FOR EACH ROW EXECUTE FUNCTION notify_blood_request_event();

-- Expiry warnings: avoid duplicates per day.
CREATE OR REPLACE FUNCTION create_expiry_warnings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO notifications(type,title,message,hospital_id,request_id,priority)
  SELECT 'expiry_warning','تنبيه صلاحية',
         format('الوحدة %s ستنتهي صلاحيتها خلال %s يوم',bu.unit_code,(bu.expiry_date-current_date)),
         bu.hospital_id,NULL,
         CASE WHEN bu.expiry_date-current_date <= 2 THEN 'critical' ELSE 'urgent' END
    FROM blood_units bu
   WHERE bu.status='available'
     AND bu.expiry_date >= current_date
     AND bu.expiry_date <= current_date + 7
     AND NOT EXISTS (
       SELECT 1 FROM notifications n2
        WHERE n2.type='expiry_warning' AND n2.hospital_id=bu.hospital_id
          AND n2.message LIKE '%'||bu.unit_code||'%'
          AND n2.created_at::date=current_date
     );
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION create_expiry_warnings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expiry_warnings() TO authenticated;

-- ---------- Audit log immutable ----------
DROP POLICY IF EXISTS "audit_logs_update" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_delete" ON audit_logs;
CREATE POLICY "audit_logs_insert_scoped" ON audit_logs FOR INSERT TO authenticated
WITH CHECK (is_admin() OR hospital_id=user_hospital_id());
-- no UPDATE / DELETE policies

-- ---------- Public aggregate availability ----------
CREATE OR REPLACE FUNCTION get_public_blood_availability()
RETURNS TABLE (blood_type text, component text, total_quantity bigint)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$
  SELECT bu.blood_type, bu.component, count(*)::bigint
  FROM blood_units bu JOIN hospitals h ON h.id=bu.hospital_id
  WHERE bu.status='available' AND bu.expiry_date >= current_date AND h.status='active'
  GROUP BY bu.blood_type,bu.component
  ORDER BY bu.blood_type,bu.component;
$$;

REVOKE ALL ON FUNCTION get_public_blood_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_blood_availability() TO authenticated;

-- ---------- Realtime ----------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.blood_requests;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ---------- Useful indexes ----------
CREATE INDEX IF NOT EXISTS idx_blood_units_fefo ON blood_units(hospital_id,blood_type,component,status,expiry_date,collection_date);
CREATE INDEX IF NOT EXISTS idx_requests_workflow ON blood_requests(supplier_hospital_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_request ON notifications(request_id,created_at);
