
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS reserved_for_request_id uuid REFERENCES blood_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_blood_units_reserved_request ON blood_units(reserved_for_request_id);

CREATE OR REPLACE FUNCTION process_blood_request(p_request_id uuid, p_action text)
RETURNS blood_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r blood_requests; actor_role text; actor_hospital uuid; remaining integer; u record;
BEGIN
  SELECT role,hospital_id INTO actor_role,actor_hospital FROM profiles
   WHERE id=auth.uid() AND is_active=true;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'الحساب غير نشط أو غير مصرح'; END IF;
  PERFORM mark_expired_blood_units();
  SELECT * INTO r FROM blood_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF actor_role <> 'admin' AND actor_hospital NOT IN (r.requesting_hospital_id,COALESCE(r.supplier_hospital_id,'00000000-0000-0000-0000-000000000000')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية هذا الطلب';
  END IF;

  IF p_action='review' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'new' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالمراجعة'; END IF;
    UPDATE blood_requests SET status='reviewing' WHERE id=r.id;

  ELSIF p_action='accept' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'reviewing' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالقبول'; END IF;
    UPDATE blood_requests SET status='accepted',accepted_at=now() WHERE id=r.id;

  ELSIF p_action='reserve' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'accepted' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالحجز'; END IF;
    remaining:=r.quantity;
    FOR u IN SELECT id FROM blood_units
      WHERE hospital_id=r.supplier_hospital_id AND blood_type=r.blood_type AND component=r.component
        AND status='available' AND expiry_date>=current_date
      ORDER BY expiry_date,collection_date,created_at,id FOR UPDATE SKIP LOCKED
    LOOP
      UPDATE blood_units SET status='reserved',reserved_for_request_id=r.id
       WHERE id=u.id AND status='available' AND expiry_date>=current_date;
      IF FOUND THEN remaining:=remaining-1; END IF;
      EXIT WHEN remaining=0;
    END LOOP;
    IF remaining>0 THEN RAISE EXCEPTION 'الكمية المتاحة غير كافية؛ لم يتم تنفيذ الحجز'; END IF;
    UPDATE blood_requests SET status='reserved' WHERE id=r.id;

  ELSIF p_action='ready' THEN
    UPDATE blood_units SET status='expired' WHERE reserved_for_request_id=r.id AND status='reserved' AND expiry_date<current_date;
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'reserved' THEN RAISE EXCEPTION 'الحالة الحالية لا تسمح بالتجهيز'; END IF;
    IF (SELECT count(*) FROM blood_units WHERE reserved_for_request_id=r.id AND status='reserved')<>r.quantity
      THEN RAISE EXCEPTION 'الوحدات المحجوزة غير مكتملة'; END IF;
    UPDATE blood_requests SET status='ready',ready_at=now() WHERE id=r.id;

  ELSIF p_action='reject' THEN
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status NOT IN ('new','reviewing','accepted') THEN RAISE EXCEPTION 'لا يمكن رفض الطلب الآن'; END IF;
    UPDATE blood_requests SET status='rejected' WHERE id=r.id;

  ELSIF p_action='cancel' THEN
    IF r.status IN ('delivered','cancelled','rejected') THEN RAISE EXCEPTION 'لا يمكن إلغاء الطلب'; END IF;
    UPDATE blood_units SET status=CASE WHEN expiry_date<current_date THEN 'expired' ELSE 'available' END,
      reserved_for_request_id=NULL
      WHERE reserved_for_request_id=r.id AND status='reserved';
    UPDATE blood_requests SET status='cancelled' WHERE id=r.id;

  ELSIF p_action='deliver' THEN
    UPDATE blood_units SET status='expired' WHERE reserved_for_request_id=r.id AND status='reserved' AND expiry_date<current_date;
    IF actor_role<>'admin' AND actor_hospital<>r.supplier_hospital_id THEN RAISE EXCEPTION 'المورّد فقط'; END IF;
    IF r.status<>'ready' THEN RAISE EXCEPTION 'يجب تجهيز الطلب أولاً'; END IF;
    IF EXISTS(SELECT 1 FROM deliveries WHERE request_id=r.id) THEN RAISE EXCEPTION 'تم تسجيل التسليم مسبقاً'; END IF;
    IF (SELECT count(*) FROM blood_units WHERE reserved_for_request_id=r.id AND status='reserved')<>r.quantity
      THEN RAISE EXCEPTION 'الوحدات المحجوزة غير كافية'; END IF;

    UPDATE blood_units SET status='issued',reserved_for_request_id=NULL
      WHERE reserved_for_request_id=r.id AND status='reserved';

    INSERT INTO deliveries(request_id,supplier_hospital_id,receiving_hospital_id,blood_type,component,quantity,issued_by,received_by)
    VALUES(r.id,r.supplier_hospital_id,r.requesting_hospital_id,r.blood_type,r.component,r.quantity,
      (SELECT full_name FROM profiles WHERE id=auth.uid()),
      (SELECT manager FROM hospitals WHERE id=r.requesting_hospital_id));
    UPDATE blood_requests SET status='delivered',delivered_at=now() WHERE id=r.id;
  ELSE RAISE EXCEPTION 'إجراء غير معروف';
  END IF;

  SELECT * INTO r FROM blood_requests WHERE id=p_request_id; RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION process_blood_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_blood_request(uuid,text) TO authenticated;
