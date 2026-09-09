-- =========================================================
-- Fix duplicate blood unit codes
-- =========================================================

-- First synchronize the sequence with the highest existing
-- numeric part of unit_code.
SELECT setval(
  'blood_unit_code_seq',
  GREATEST(
    1000,
    COALESCE(
      (
        SELECT MAX(
          NULLIF(
            regexp_replace(unit_code, '\D', '', 'g'),
            ''
          )::bigint
        )
        FROM blood_units
        WHERE unit_code ~ '\d+'
      ),
      1000
    )
  ),
  true
);


-- Generate a unique blood unit code.
CREATE OR REPLACE FUNCTION generate_unit_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code :=
      'BLD-' ||
      to_char(current_date, 'YYYY') ||
      '-' ||
      lpad(nextval('blood_unit_code_seq')::text, 6, '0');

    -- Make sure this code does not already exist.
    IF NOT EXISTS (
      SELECT 1
      FROM blood_units
      WHERE unit_code = v_code
    ) THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;


-- Keep the column using the safe generator.
ALTER TABLE blood_units
ALTER COLUMN unit_code
SET DEFAULT generate_unit_code();


-- Recreate save_blood_unit with the same public signature.
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  actor_hospital uuid;
  result_row blood_units;
BEGIN

  -- Get current user information.
  SELECT role, hospital_id
  INTO actor_role, actor_hospital
  FROM profiles
  WHERE id = auth.uid()
    AND is_active = true;

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;


  -- Hospital permission.
  IF actor_role <> 'admin'
     AND actor_hospital <> p_hospital_id THEN
    RAISE EXCEPTION 'لا يمكنك تعديل مخزون مستشفى آخر';
  END IF;


  -- Hospital must be active.
  IF EXISTS (
    SELECT 1
    FROM hospitals
    WHERE id = p_hospital_id
      AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'المستشفى موقوف';
  END IF;


  -- Validate dates.
  IF p_expiry_date <= p_collection_date THEN
    RAISE EXCEPTION 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الجمع';
  END IF;


  -- =======================================================
  -- INSERT
  -- =======================================================
  IF p_id IS NULL THEN

    INSERT INTO blood_units (
      hospital_id,
      blood_type,
      component,
      quantity,
      collection_date,
      expiry_date,
      status,
      storage_location,
      notes
    )
    VALUES (
      p_hospital_id,
      p_blood_type,
      p_component,
      1,
      p_collection_date,
      p_expiry_date,
      CASE
        WHEN p_expiry_date < current_date
          THEN 'expired'
        ELSE 'available'
      END,
      NULLIF(p_storage_location, ''),
      NULLIF(p_notes, '')
    )
    RETURNING *
    INTO result_row;


  -- =======================================================
  -- UPDATE
  -- =======================================================
  ELSE

    IF NOT EXISTS (
      SELECT 1
      FROM blood_units
      WHERE id = p_id
        AND (
          actor_role = 'admin'
          OR hospital_id = actor_hospital
        )
    ) THEN
      RAISE EXCEPTION 'الوحدة غير موجودة أو غير مصرح بها';
    END IF;


    UPDATE blood_units
    SET
      hospital_id = p_hospital_id,
      blood_type = p_blood_type,
      component = p_component,
      collection_date = p_collection_date,
      expiry_date = p_expiry_date,
      storage_location = NULLIF(p_storage_location, ''),
      notes = NULLIF(p_notes, ''),
      status = CASE
        WHEN status = 'available'
             AND p_expiry_date < current_date
          THEN 'expired'
        ELSE status
      END
    WHERE id = p_id
    RETURNING *
    INTO result_row;

  END IF;


  RETURN result_row;

END;
$$;


-- Permissions.
REVOKE ALL
ON FUNCTION save_blood_unit(
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  text,
  text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION save_blood_unit(
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  text,
  text
)
TO authenticated;


REVOKE ALL
ON FUNCTION generate_unit_code()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION generate_unit_code()
TO authenticated;





git init
git add .
git commit -m "Initial Blood Bank System"
git branch -M main
git remote add origin https://github.com/ahmdalrazqy52-alt/CentralBloodBank.git
git push -u origin main