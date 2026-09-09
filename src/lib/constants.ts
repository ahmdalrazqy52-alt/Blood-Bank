import type { UnitStatus, RequestStatus, RequestPriority } from './types';

export const UNIT_STATUS_COLORS: Record<UnitStatus, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  reserved: 'bg-amber-100 text-amber-700 border-amber-200',
  issued: 'bg-blue-100 text-blue-700 border-blue-200',
  expired: 'bg-red-100 text-red-700 border-red-200',
  discarded: 'bg-gray-200 text-gray-600 border-gray-300',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  reviewing: 'bg-purple-100 text-purple-700 border-purple-200',
  accepted: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  reserved: 'bg-amber-100 text-amber-700 border-amber-200',
  ready: 'bg-teal-100 text-teal-700 border-teal-200',
  delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-gray-200 text-gray-600 border-gray-300',
};

export const PRIORITY_COLORS: Record<RequestPriority, string> = {
  normal: 'bg-slate-100 text-slate-600 border-slate-200',
  urgent: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};

export const BLOOD_TYPE_COLORS: Record<string, string> = {
  'A+': 'bg-rose-500',
  'A-': 'bg-rose-400',
  'B+': 'bg-sky-500',
  'B-': 'bg-sky-400',
  'AB+': 'bg-violet-500',
  'AB-': 'bg-violet-400',
  'O+': 'bg-emerald-500',
  'O-': 'bg-emerald-600',
};

export const REQUEST_FLOW: RequestStatus[] = [
  'new', 'reviewing', 'accepted', 'reserved', 'ready', 'delivered'
];

export function daysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getExpiryLevel(days: number): 'safe' | 'warning' | 'danger' | 'expired' {
  if (days < 0) return 'expired';
  if (days <= 7) return 'danger';
  if (days <= 30) return 'warning';
  return 'safe';
}
