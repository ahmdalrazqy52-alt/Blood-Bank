/* Stability and data-integrity fixes */

-- Keep the hospital manager field synchronized with the manager profile when possible.
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_role ON profiles(hospital_id, role);
CREATE INDEX IF NOT EXISTS idx_notifications_hospital_read ON notifications(hospital_id, is_read);
CREATE INDEX IF NOT EXISTS idx_deliveries_request ON deliveries(request_id);

-- Prevent duplicate delivery records for the same request.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_request_id ON deliveries(request_id);

-- Protect request quantities and timestamps from obviously invalid values.
ALTER TABLE blood_requests DROP CONSTRAINT IF EXISTS blood_requests_quantity_positive;
ALTER TABLE blood_requests ADD CONSTRAINT blood_requests_quantity_positive CHECK (quantity > 0);

ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_quantity_positive;
ALTER TABLE deliveries ADD CONSTRAINT deliveries_quantity_positive CHECK (quantity > 0);


-- Shared availability summary: exposes only aggregate available quantities to authenticated users.
CREATE OR REPLACE FUNCTION get_public_blood_availability()
RETURNS TABLE (blood_type text, component text, total_quantity bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT bu.blood_type, bu.component, SUM(bu.quantity)::bigint
  FROM blood_units bu
  JOIN hospitals h ON h.id = bu.hospital_id
  WHERE bu.status = 'available' AND h.status = 'active'
  GROUP BY bu.blood_type, bu.component
  ORDER BY bu.blood_type, bu.component;
$$;

REVOKE ALL ON FUNCTION get_public_blood_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_blood_availability() TO authenticated;
