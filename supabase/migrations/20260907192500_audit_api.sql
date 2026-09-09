
CREATE OR REPLACE FUNCTION write_audit_log(
  p_hospital_id uuid, p_action text, p_entity text, p_entity_id text,
  p_old_value text DEFAULT NULL, p_new_value text DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS audit_logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r audit_logs; uname text; my_hospital uuid; my_role text;
BEGIN
  SELECT full_name,hospital_id,role INTO uname,my_hospital,my_role FROM profiles WHERE id=auth.uid() AND is_active=true;
  IF my_role IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF my_role <> 'admin' AND p_hospital_id IS DISTINCT FROM my_hospital THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  INSERT INTO audit_logs(user_name,hospital_id,action,entity,entity_id,old_value,new_value,reason)
  VALUES(COALESCE(uname,'مستخدم'),p_hospital_id,p_action,p_entity,p_entity_id,p_old_value,p_new_value,p_reason)
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION write_audit_log(uuid,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION write_audit_log(uuid,text,text,text,text,text,text) TO authenticated;

DROP POLICY IF EXISTS "audit_logs_insert_scoped" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
