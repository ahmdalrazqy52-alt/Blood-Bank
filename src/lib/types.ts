export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type BloodComponent = 'Whole Blood' | 'Packed RBC' | 'Plasma' | 'Platelets' | 'Cryoprecipitate';
export type UnitStatus = 'available' | 'reserved' | 'issued' | 'expired' | 'discarded';
export type RequestStatus = 'new' | 'reviewing' | 'accepted' | 'reserved' | 'ready' | 'delivered' | 'rejected' | 'cancelled';
export type RequestPriority = 'normal' | 'urgent' | 'critical';

export const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const BLOOD_COMPONENTS: BloodComponent[] = ['Whole Blood', 'Packed RBC', 'Plasma', 'Platelets', 'Cryoprecipitate'];

export const COMPONENT_LABELS: Record<BloodComponent, string> = {
  'Whole Blood': 'دم كامل',
  'Packed RBC': 'كريات حمراء',
  'Plasma': 'بلازما',
  'Platelets': 'صفائح',
  'Cryoprecipitate': 'راسب بردي',
};

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  available: 'متاح',
  reserved: 'محجوز',
  issued: 'مُسلّم',
  expired: 'منتهي',
  discarded: 'مُتلف',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'جديد',
  reviewing: 'قيد المراجعة',
  accepted: 'مقبول',
  reserved: 'محجوز',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  normal: 'عادية',
  urgent: 'عاجلة',
  critical: 'حرجة',
};

export interface Hospital {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager: string | null;
  logo_url: string | null;
  image_url: string | null;
  status: 'active' | 'suspended';
  registered_at: string;
}

export interface BloodUnit {
  id: string;
  unit_code: string;
  hospital_id: string;
  blood_type: BloodType;
  component: BloodComponent;
  quantity: number;
  collection_date: string;
  expiry_date: string;
  status: UnitStatus;
  storage_location: string | null;
  notes: string | null;
  created_at: string;
  reserved_for_request_id?: string | null;
  hospital?: Hospital;
}

export interface BloodRequest {
  id: string;
  request_code: string;
  requesting_hospital_id: string;
  supplier_hospital_id: string | null;
  department: string | null;
  patient_name: string | null;
  patient_file: string | null;
  reason: string | null;
  blood_type: BloodType;
  component: BloodComponent;
  quantity: number;
  priority: RequestPriority;
  needed_by: string | null;
  status: RequestStatus;
  notes: string | null;
  contact_phone: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  created_by: string | null;
  accepted_by: string | null;
  ready_by: string | null;
  delivered_by: string | null;
  requesting_hospital?: Hospital;
  supplier_hospital?: Hospital;
}

export interface Delivery {
  id: string;
  delivery_code: string;
  request_id: string;
  supplier_hospital_id: string;
  receiving_hospital_id: string;
  blood_type: BloodType;
  component: BloodComponent;
  quantity: number;
  issued_by: string | null;
  issued_by_user_id?: string | null;
  received_by: string | null;
  delivered_at: string;
  notes: string | null;
  supplier_hospital?: Hospital;
  receiving_hospital?: Hospital;
  request?: BloodRequest;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  hospital_id: string | null;
  request_id: string | null;
  priority: RequestPriority;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_name: string;
  hospital_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
  hospital?: Hospital;
}
