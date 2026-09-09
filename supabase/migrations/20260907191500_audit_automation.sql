
-- Central audit automation: immutable history for core blood workflows.
CREATE OR REPLACE FUNCTION audit_core_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uname text; hid uuid; action_name text; eid text; oldv text; newv text;
BEGIN
  SELECT COALESCE(full_name,email,'النظام'),hospital_id INTO uname,hid FROM profiles WHERE id=auth.uid();
  IF TG_TABLE_NAME='blood_units' THEN
    eid := COALESCE(NEW.unit_code,OLD.unit_code);
    IF TG_OP='INSERT' THEN action_name:='create'; newv:=NEW.blood_type||' '||NEW.component||' ('||NEW.status||')';
    ELSIF TG_OP='UPDATE' THEN
      action_name:=CASE WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status='discarded' THEN 'discard' ELSE 'update' END;
      oldv:=OLD.status; newv:=NEW.status;
    ELSE action_name:='delete'; oldv:=OLD.status; END IF;
    hid:=COALESCE(hid,COALESCE(NEW.hospital_id,OLD.hospital_id));
  ELSIF TG_TABLE_NAME='blood_requests' THEN
    eid:=COALESCE(NEW.request_code,OLD.request_code);
    IF TG_OP='INSERT' THEN action_name:='create'; newv:=NEW.status;
    ELSIF TG_OP='UPDATE' THEN action_name:=CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN NEW.status ELSE 'update' END; oldv:=OLD.status; newv:=NEW.status;
    ELSE action_name:='delete'; oldv:=OLD.status; END IF;
    hid:=COALESCE(hid,COALESCE(NEW.requesting_hospital_id,OLD.requesting_hospital_id));
  ELSIF TG_TABLE_NAME='deliveries' THEN
    eid:=COALESCE(NEW.delivery_code,OLD.delivery_code); action_name:='deliver';
    newv:=COALESCE(NEW.quantity::text,'');
    hid:=COALESCE(hid,COALESCE(NEW.supplier_hospital_id,OLD.supplier_hospital_id));
  END IF;

  INSERT INTO audit_logs(user_name,hospital_id,action,entity,entity_id,old_value,new_value,reason)
  VALUES(uname,hid,action_name,replace(TG_TABLE_NAME,'blood_',''),eid,oldv,newv,'تسجيل آلي من النظام');
  RETURN COALESCE(NEW,OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_blood_units ON blood_units;
CREATE TRIGGER trg_audit_blood_units AFTER INSERT OR UPDATE ON blood_units
FOR EACH ROW EXECUTE FUNCTION audit_core_changes();

DROP TRIGGER IF EXISTS trg_audit_blood_requests ON blood_requests;
CREATE TRIGGER trg_audit_blood_requests AFTER INSERT OR UPDATE ON blood_requests
FOR EACH ROW EXECUTE FUNCTION audit_core_changes();

DROP TRIGGER IF EXISTS trg_audit_deliveries ON deliveries;
CREATE TRIGGER trg_audit_deliveries AFTER INSERT ON deliveries
FOR EACH ROW EXECUTE FUNCTION audit_core_changes();
