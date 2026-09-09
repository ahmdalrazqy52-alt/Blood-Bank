
-- Never trust browser-supplied role/hospital metadata during automatic profile creation.
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id,email,role,hospital_id,full_name,is_active)
  VALUES (NEW.id,NEW.email,'staff',NULL,NEW.raw_user_meta_data->>'full_name',true)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
