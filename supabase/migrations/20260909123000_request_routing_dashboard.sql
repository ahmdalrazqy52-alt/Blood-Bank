/* Central Blood Bank - realistic inter-hospital workflow and dual inventory dashboard */

-- ------------------------------------------------------------
-- Execution ownership and reservation binding
-- ------------------------------------------------------------
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS ready_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS delivered_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS reserved_for_request_id uuid REFERENCES blood_requests(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS issued_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS received_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_blood_units_reserved_request ON blood_units(reserved_for_request_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON blood_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_requests_accepted_by ON blood_requests(accepted_by);
CREATE INDEX IF NOT EXISTS idx_requests_ready_by ON blood_requests(ready_by);
CREATE INDEX IF NOT EXISTS idx_requests_delivered_by ON blood_requests(delivered_by);

-- ------------------------------------------------------------
-- Supplier discovery: return only hospitals that really have enough stock.
-- Aggregate only; individual unit records remain protected by RLS.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_supplier_availability(
  p_blood_type text,
  p_component text,
  p_quantity integer DEFAULT 1,
  p_exclude_hospital_id uuid DEFAULT NULL
)
RETURNS TABLE (hospital_id uuid, hospital_name text, city text, phone text, available_quantity bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
BEGIN
  IF p_quantity < 1 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
  RETURN QUERY
  SELECT h.id, h.name, h.city, h.phone, SUM(bu.quantity)::bigint
  FROM hospitals h
  JOIN blood_units bu ON bu.hospital_id=h.id
  WHERE h.status='active'
    AND bu.status='available'
    AND bu.expiry_date>=current_date
    AND bu.blood_type=p_blood_type
    AND bu.component=p_component
    AND h.id <> COALESCE(p_exclude_hospital_id,user_hospital_id(),'00000000-0000-0000-0000-000000000000'::uuid)
  GROUP BY h.id,h.name,h.city,h.phone
  HAVING SUM(bu.quantity)>=p_quantity
  ORDER BY SUM(bu.quantity) DESC,h.name;
END;
$$;
REVOKE ALL ON FUNCTION get_supplier_availability(text,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_supplier_availability(text,text,integer,uuid) TO authenticated;

-- ------------------------------------------------------------
-- Dashboard aggregate: system-wide or one hospital.
-- Every role can get the system summary; non-admins can only get their own hospital.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_inventory_status_summary(p_hospital_id uuid DEFAULT NULL)
RETURNS TABLE (blood_type text, status text, total_quantity bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE my_role text; my_hospital uuid;
BEGIN
  SELECT p.role,p.hospital_id INTO my_role,my_hospital FROM profiles p WHERE p.id=auth.uid() AND p.is_active=true;
  IF my_role IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p_hospital_id IS NOT NULL AND my_role<>'admin' AND p_hospital_id<>my_hospital THEN
    RAISE EXCEPTION 'لا يمكنك عرض مخزون مستشفى آخر';
  END IF;
  RETURN QUERY
  SELECT bu.blood_type,bu.status,SUM(bu.quantity)::bigint
  FROM blood_units bu JOIN hospitals h ON h.id=bu.hospital_id
  WHERE h.status='active' AND (p_hospital_id IS NULL OR bu.hospital_id=p_hospital_id)
  GROUP BY bu.blood_type,bu.status
  ORDER BY bu.blood_type,bu.status;
END;
$$;
REVOKE ALL ON FUNCTION get_inventory_status_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_inventory_status_summary(uuid) TO authenticated;

-- ------------------------------------------------------------
-- Create request: validate supplier stock again server-side and record creator.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_blood_request(
  p_requesting_hospital_id uuid,p_supplier_hospital_id uuid,p_department text,p_patient_name text,
  p_patient_file text,p_reason text,p_blood_type text,p_component text,p_quantity integer,
  p_priority text,p_needed_by timestamptz,p_contact_phone text,p_notes text
)
RETURNS blood_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role text; actor_hospital uuid; r blood_requests; available_count bigint;
BEGIN
  SELECT role,hospital_id INTO actor_role,actor_hospital FROM profiles WHERE id=auth.uid() AND is_active=true;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'الحساب غير نشط أو غير مصرح'; END IF;
  IF actor_role<>'admin' AND actor_hospital<>p_requesting_hospital_id THEN RAISE EXCEPTION 'لا يمكنك إنشاء طلب باسم مستشفى آخر'; END IF;
  IF p_supplier_hospital_id IS NULL OR p_supplier_hospital_id=p_requesting_hospital_id THEN RAISE EXCEPTION 'يجب اختيار مستشفى مورّد مختلف'; END IF;
  IF NOT EXISTS(SELECT 1 FROM hospitals WHERE id=p_supplier_hospital_id AND status='active') THEN RAISE EXCEPTION 'المستشفى المورّد غير متاح'; END IF;
  IF p_quantity<1 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;
  SELECT COALESCE(SUM(quantity),0) INTO available_count FROM blood_units
   WHERE hospital_id=p_supplier_hospital_id AND blood_type=p_blood_type AND component=p_component
     AND status='available' AND expiry_date>=current_date;
  IF available_count<p_quantity THEN RAISE EXCEPTION 'المخزون المتاح لم يعد كافياً؛ حدّث قائمة المستشفيات'; END IF;

  INSERT INTO blood_requests(requesting_hospital_id,supplier_hospital_id,department,patient_name,patient_file,reason,
    blood_type,component,quantity,priority,needed_by,status,contact_phone,notes,created_by)
  VALUES(p_requesting_hospital_id,p_supplier_hospital_id,NULLIF(trim(p_department),''),NULLIF(trim(p_patient_name),''),
    NULLIF(trim(p_patient_file),''),NULLIF(trim(p_reason),''),p_blood_type,p_component,p_quantity,p_priority,p_needed_by,
    'new',NULLIF(trim(p_contact_phone),''),NULLIF(trim(p_notes),''),auth.uid()) RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION create_blood_request(uuid,uuid,text,text,text,text,text,text,integer,text,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_blood_request(uuid,uuid,text,text,text,text,text,text,integer,text,timestamptz,text,text) TO authenticated;

-- ------------------------------------------------------------
-- Process request: acceptance and reservation are ONE atomic operation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_blood_request(p_request_id uuid,p_action text)
RETURNS blood_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r blood_requests; actor_role text; actor_hospital uuid; u record; remaining integer; d_id uuid;
BEGIN
  SELECT role,hospital_id INTO actor_role,actor_hospital FROM profiles WHERE id=auth.uid() AND is_active=true;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'الحساب غير نشط أو غير مصرح'; END IF;
  PERFORM mark_expired_blood_units();
  SELECT * INTO r FROM blood_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF actor_role<>'admin' AND actor_hospital NOT IN(r.requesting_hospital_id,COALESCE(r.supplier_hospital_id,'00000000-0000-0000-0000-000000000000')) THEN RAISE EXCEPTION 'لا تملك صلاحية هذا الطلب'; END IF;

  IF p_action='review' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'new' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالمراجعة'; END IF;
    UPDATE blood_requests SET status='reviewing' WHERE id=r.id;

  ELSIF p_action='accept' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status NOT IN('new','reviewing','accepted') THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالقبول'; END IF;
    remaining:=r.quantity;
    FOR u IN SELECT id FROM blood_units WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type
      AND component=r.component AND status='available' AND expiry_date>=current_date
      ORDER BY expiry_date ASC,collection_date ASC,created_at ASC,id ASC LIMIT r.quantity FOR UPDATE SKIP LOCKED
    LOOP
      UPDATE blood_units SET status='reserved',reserved_for_request_id=r.id WHERE id=u.id AND status='available';
      IF FOUND THEN remaining:=remaining-1; END IF;
    END LOOP;
    IF remaining>0 THEN RAISE EXCEPTION 'الكمية غير كافية؛ لم يتم تنفيذ الحجز الجزئي'; END IF;
    UPDATE blood_requests SET status='reserved',accepted_by=auth.uid(),accepted_at=COALESCE(accepted_at,now()) WHERE id=r.id;

  ELSIF p_action='reserve' THEN
    -- Compatibility only for old requests that already reached accepted.
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'accepted' THEN RAISE EXCEPTION 'لا توجد خطوة حجز منفصلة للطلبات الجديدة؛ استخدم القبول'; END IF;
    remaining:=r.quantity;
    FOR u IN SELECT id FROM blood_units WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type AND component=r.component
      AND status='available' AND expiry_date>=current_date ORDER BY expiry_date,collection_date,created_at,id LIMIT r.quantity FOR UPDATE SKIP LOCKED
    LOOP UPDATE blood_units SET status='reserved',reserved_for_request_id=r.id WHERE id=u.id AND status='available'; IF FOUND THEN remaining:=remaining-1; END IF; END LOOP;
    IF remaining>0 THEN RAISE EXCEPTION 'الكمية غير كافية'; END IF;
    UPDATE blood_requests SET status='reserved' WHERE id=r.id;

  ELSIF p_action='ready' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'reserved' THEN RAISE EXCEPTION 'يجب قبول الطلب وحجزه أولاً'; END IF;
    IF (SELECT count(*) FROM blood_units WHERE reserved_for_request_id=r.id AND status='reserved')<r.quantity THEN RAISE EXCEPTION 'الوحدات المحجوزة غير مكتملة'; END IF;
    UPDATE blood_requests SET status='ready',ready_by=auth.uid(),ready_at=now() WHERE id=r.id;

  ELSIF p_action='reject' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status IN('delivered','cancelled','rejected') THEN RAISE EXCEPTION 'لا يمكن رفض الطلب بعد إغلاقه'; END IF;
    UPDATE blood_units SET status='available',reserved_for_request_id=NULL WHERE reserved_for_request_id=r.id AND status='reserved';
    UPDATE blood_requests SET status='rejected' WHERE id=r.id;

  ELSIF p_action='cancel' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.requesting_hospital_id THEN RAISE EXCEPTION 'المستشفى الطالب فقط يستطيع الإلغاء'; END IF;
    IF r.status IN('delivered','cancelled','rejected') THEN RAISE EXCEPTION 'لا يمكن إلغاء الطلب'; END IF;
    UPDATE blood_units SET status='available',reserved_for_request_id=NULL WHERE reserved_for_request_id=r.id AND status='reserved';
    UPDATE blood_requests SET status='cancelled' WHERE id=r.id;

  ELSIF p_action='deliver' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'ready' THEN RAISE EXCEPTION 'يجب تجهيز الطلب أولاً'; END IF;
    IF EXISTS(SELECT 1 FROM deliveries WHERE request_id=r.id) THEN RAISE EXCEPTION 'تم تسجيل التسليم مسبقاً'; END IF;
    IF (SELECT count(*) FROM blood_units WHERE reserved_for_request_id=r.id AND status='reserved')<r.quantity THEN RAISE EXCEPTION 'الوحدات المحجوزة غير كافية'; END IF;
    FOR u IN SELECT id FROM blood_units WHERE reserved_for_request_id=r.id AND status='reserved' ORDER BY expiry_date,collection_date,created_at,id LIMIT r.quantity FOR UPDATE
    LOOP UPDATE blood_units SET status='issued',reserved_for_request_id=NULL WHERE id=u.id AND status='reserved'; END LOOP;
    INSERT INTO deliveries(request_id,supplier_hospital_id,receiving_hospital_id,blood_type,component,quantity,issued_by,received_by,issued_by_user_id)
    VALUES(r.id,r.supplier_hospital_id,r.requesting_hospital_id,r.blood_type,r.component,r.quantity,
      (SELECT full_name FROM profiles WHERE id=auth.uid()),(SELECT manager FROM hospitals WHERE id=r.requesting_hospital_id),auth.uid()) RETURNING id INTO d_id;
    UPDATE blood_requests SET status='delivered',delivered_by=auth.uid(),delivered_at=now() WHERE id=r.id;
  ELSE RAISE EXCEPTION 'إجراء غير معروف'; END IF;

  SELECT * INTO r FROM blood_requests WHERE id=r.id;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION process_blood_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_blood_request(uuid,text) TO authenticated;

-- ------------------------------------------------------------
-- Notifications: new request -> supplier; all later statuses -> requester.
-- Creator is never notified about their own creation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_blood_request_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE requester_name text;
BEGIN
  SELECT name INTO requester_name FROM hospitals WHERE id=NEW.requesting_hospital_id;
  IF TG_OP='INSERT' AND NEW.supplier_hospital_id IS NOT NULL THEN
    INSERT INTO notifications(type,title,message,hospital_id,request_id,priority)
    VALUES('new_request','طلب دم جديد',format('طلب %s من %s: %s %s — %s وحدة',NEW.request_code,requester_name,NEW.blood_type,NEW.component,NEW.quantity),NEW.supplier_hospital_id,NEW.id,NEW.priority);
  ELSIF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status='cancelled' AND NEW.supplier_hospital_id IS NOT NULL THEN
      INSERT INTO notifications(type,title,message,hospital_id,request_id,priority) VALUES('request_cancelled','إلغاء طلب دم','تم إلغاء الطلب '||NEW.request_code,NEW.supplier_hospital_id,NEW.id,NEW.priority);
    ELSIF NEW.status IN('reviewing','reserved','ready','delivered','rejected') THEN
      INSERT INTO notifications(type,title,message,hospital_id,request_id,priority)
      VALUES('request_status','تحديث طلب دم','الطلب '||NEW.request_code||' أصبح: '||NEW.status,NEW.requesting_hospital_id,NEW.id,NEW.priority);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_blood_request_event ON blood_requests;
CREATE TRIGGER trg_notify_blood_request_event AFTER INSERT OR UPDATE OF status ON blood_requests FOR EACH ROW EXECUTE FUNCTION notify_blood_request_event();

-- Protected workflows remain server-side only.
DROP POLICY IF EXISTS "blood_requests_insert" ON blood_requests;
DROP POLICY IF EXISTS "blood_requests_update" ON blood_requests;
CREATE POLICY "blood_requests_insert_server_only" ON blood_requests FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY "blood_requests_update_server_only" ON blood_requests FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
