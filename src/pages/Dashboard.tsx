import { useEffect, useState, useCallback } from 'react';
import { Droplet, Hospital as HospitalIcon, Package, AlertTriangle, Clock, Activity, TrendingUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { BloodUnit, BloodRequest, Hospital, BloodType, UnitStatus } from '@/lib/types';
import { BLOOD_TYPES, BLOOD_COMPONENTS, COMPONENT_LABELS, PRIORITY_LABELS, REQUEST_STATUS_LABELS } from '@/lib/types';
import { daysUntilExpiry, PRIORITY_COLORS, REQUEST_STATUS_COLORS } from '@/lib/constants';
import { formatTimeAgo } from '@/lib/utils';
import BloodTypeBadge from '@/components/BloodTypeBadge';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { PageId } from '@/components/Sidebar';

interface DashboardProps { onNavigate: (page: PageId) => void; }
type SummaryRow = { blood_type: BloodType; status: UnitStatus; total_quantity: number };

const STATUS_LABELS: Record<UnitStatus, string> = { available: 'متاح', reserved: 'محجوز', issued: 'مُسلّم', expired: 'منتهي', discarded: 'مُتلف' };
const STATUS_CLASSES: Record<UnitStatus, string> = {
  available: 'bg-emerald-500', reserved: 'bg-amber-500', issued: 'bg-blue-500', expired: 'bg-slate-400', discarded: 'bg-red-500'
};

function buildSummary(rows: SummaryRow[]) {
  const result: Record<string, Record<UnitStatus, number>> = {};
  BLOOD_TYPES.forEach((t) => { result[t] = { available: 0, reserved: 0, issued: 0, expired: 0, discarded: 0 }; });
  rows.forEach((r) => { if (result[r.blood_type]) result[r.blood_type][r.status] = Number(r.total_quantity || 0); });
  return result;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [units, setUnits] = useState<BloodUnit[]>([]);
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [systemSummary, setSystemSummary] = useState<Record<string, Record<UnitStatus, number>>>(buildSummary([]));
  const [hospitalSummary, setHospitalSummary] = useState<Record<string, Record<UnitStatus, number>>>(buildSummary([]));
  const [selectedHospitalId, setSelectedHospitalId] = useState('');

  const isAdmin = profile?.role === 'admin';
  const ownHospitalId = profile?.hospital_id || '';

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    await supabase.rpc('mark_expired_blood_units');
    await supabase.rpc('create_expiry_warnings');
    const targetHospital = isAdmin ? selectedHospitalId || null : ownHospitalId;
    const [hRes, uRes, rRes, systemRes, hospitalRes] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('blood_units').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('blood_requests').select('*, requesting_hospital:hospitals!requesting_hospital_id(*), supplier_hospital:hospitals!supplier_hospital_id(*)').order('created_at', { ascending: false }),
      supabase.rpc('get_inventory_status_summary', { p_hospital_id: null }),
      supabase.rpc('get_inventory_status_summary', { p_hospital_id: targetHospital }),
    ]);
    setHospitals((hRes.data || []) as Hospital[]);
    setUnits((uRes.data || []) as BloodUnit[]);
    setRequests((rRes.data || []) as BloodRequest[]);
    setSystemSummary(buildSummary((systemRes.data || []) as SummaryRow[]));
    setHospitalSummary(buildSummary((hospitalRes.data || []) as SummaryRow[]));
    setLoading(false);
  }, [profile, isAdmin, ownHospitalId, selectedHospitalId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (isAdmin && !selectedHospitalId && hospitals.length) setSelectedHospitalId(hospitals.find(h => h.status === 'active')?.id || hospitals[0].id); }, [isAdmin, selectedHospitalId, hospitals]);

  if (loading) return <LoadingSpinner label="جاري تحميل لوحة التحكم..." />;

  const activeHospitals = hospitals.filter((h) => h.status === 'active').length;
  const availableUnits = units.filter((u) => u.status === 'available');
  const reservedUnits = units.filter((u) => u.status === 'reserved');
  const criticalRequests = requests.filter((r) => r.priority === 'critical' && !['delivered', 'rejected', 'cancelled'].includes(r.status));
  const expiringSoon = availableUnits.filter((u) => { const d = daysUntilExpiry(u.expiry_date); return d >= 0 && d <= 7; });
  const inventoryByType = Object.fromEntries(BLOOD_TYPES.map((t) => [t, systemSummary[t]?.available || 0]));
  const maxByType = Math.max(...Object.values(inventoryByType), 1);
  const selectedHospital = hospitals.find(h => h.id === (isAdmin ? selectedHospitalId : ownHospitalId));

  const stats = [
    ...(isAdmin ? [{ label: 'المستشفيات النشطة', value: activeHospitals, icon: HospitalIcon, bg: 'bg-blue-50', iconColor: 'text-blue-600' }] : []),
    { label: 'وحدات الدم المتاحة', value: availableUnits.length, icon: Droplet, bg: 'bg-red-50', iconColor: 'text-red-600' },
    { label: 'الوحدات المحجوزة', value: reservedUnits.length, icon: Package, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'طلبات حرجة', value: criticalRequests.length, icon: AlertTriangle, bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  ];

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">لوحة التحكم</h1><p className="text-sm text-gray-500 mt-1">{isAdmin ? 'نظرة عامة على بنك الدم المركزي' : `نظرة عامة على ${selectedHospital?.name || 'المستشفى'}`}</p></div><button onClick={loadData} className="btn-secondary"><RefreshCw size={16}/> تحديث</button></div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{stats.map((stat) => { const Icon=stat.icon; return <div key={stat.label} className="stat-card"><div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center shrink-0`}><Icon className={`w-6 h-6 ${stat.iconColor}`}/></div><div><p className="text-2xl font-bold text-gray-900">{stat.value}</p><p className="text-sm text-gray-500">{stat.label}</p></div></div>; })}</div>

    {/* Mandatory two inventory views for every role */}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <InventoryStatusCard title="حالة المخزون في النظام بالكامل" subtitle="جميع المستشفيات النشطة" summary={systemSummary} onNavigate={onNavigate}/>
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-5"><div><h2 className="text-base font-semibold text-gray-900">حالة المخزون في المستشفى</h2><p className="text-xs text-gray-500 mt-1">توزيع كل فصيلة حسب حالة الوحدات</p></div>{isAdmin ? <select className="select w-auto min-w-[190px]" value={selectedHospitalId} onChange={e=>setSelectedHospitalId(e.target.value)}><option value="">اختر المستشفى</option>{hospitals.filter(h=>h.status==='active').map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select> : <span className="badge bg-blue-50 text-blue-700 border-blue-100">{selectedHospital?.name || 'مستشفاك'}</span>}</div>
        <StatusLegend/><InventoryBars summary={hospitalSummary}/>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="card p-6 lg:col-span-2"><div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold text-gray-900">المخزون المتاح حسب الفصيلة</h2><button onClick={()=>onNavigate('inventory')} className="text-sm text-red-600 font-medium">عرض الكل</button></div><div className="space-y-3">{BLOOD_TYPES.map(type=>{const count=inventoryByType[type]||0; const pct=(count/maxByType)*100; return <div key={type} className="flex items-center gap-3"><BloodTypeBadge type={type} size="sm"/><div className="flex-1"><div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-gray-700">{type}</span><span className="text-sm text-gray-500">{count} وحدة</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-500 rounded-full transition-all duration-500" style={{width:`${Math.max(pct,count?2:0)}%`}}/></div></div></div>})}</div></div>
      <div className="card p-6"><div className="flex items-center gap-2 mb-5"><Clock className="w-5 h-5 text-amber-500"/><h2 className="text-base font-semibold text-gray-900">تنبيهات انتهاء الصلاحية</h2></div>{expiringSoon.length===0?<p className="text-sm text-gray-400 text-center py-8">لا توجد وحدات قاربت على الانتهاء</p>:<div className="space-y-3 max-h-80 overflow-y-auto">{expiringSoon.slice(0,8).map(unit=>{const days=daysUntilExpiry(unit.expiry_date);return <div key={unit.id} className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100"><BloodTypeBadge type={unit.blood_type} size="sm"/><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900">{COMPONENT_LABELS[unit.component]}</p><p className="text-xs text-gray-500">{unit.hospital?.name}</p></div><span className="badge bg-red-100 text-red-700 border-red-200">{days===0?'ينتهي اليوم':`${days} يوم`}</span></div>})}</div>}</div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="card p-6 lg:col-span-2"><div className="flex items-center gap-2 mb-5"><Activity className="w-5 h-5 text-gray-400"/><h2 className="text-base font-semibold text-gray-900">أحدث الطلبات</h2></div><div className="space-y-2">{requests.slice(0,6).map(req=><div key={req.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl"><BloodTypeBadge type={req.blood_type} size="sm"/><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-900">{req.request_code}</span><span className={`badge ${PRIORITY_COLORS[req.priority]}`}>{PRIORITY_LABELS[req.priority]}</span></div><p className="text-xs text-gray-500 mt-0.5">{COMPONENT_LABELS[req.component]} - {req.quantity} وحدة - {req.requesting_hospital?.name}</p></div><div className="text-left"><span className={`badge ${REQUEST_STATUS_COLORS[req.status]}`}>{REQUEST_STATUS_LABELS[req.status]}</span><p className="text-xs text-gray-400 mt-1">{formatTimeAgo(req.created_at)}</p></div></div>)}</div></div>
      <div className="card p-6"><div className="flex items-center gap-2 mb-5"><TrendingUp className="w-5 h-5 text-gray-400"/><h2 className="text-base font-semibold text-gray-900">توزيع المكوّنات المتاحة</h2></div><div className="space-y-3">{BLOOD_COMPONENTS.map(comp=>{const count=availableUnits.filter(u=>u.component===comp).length;const total=availableUnits.length||1;return <div key={comp}><div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-gray-700">{COMPONENT_LABELS[comp]}</span><span className="text-sm text-gray-500">{count}</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{width:`${Math.max((count/total)*100,count?2:0)}%`}}/></div></div>})}</div></div>
    </div>
  </div>;
}

function StatusLegend(){return <div className="flex flex-wrap gap-3 mb-4">{(Object.keys(STATUS_LABELS) as UnitStatus[]).map(s=><span key={s} className="flex items-center gap-1.5 text-xs text-gray-500"><span className={`w-2.5 h-2.5 rounded-full ${STATUS_CLASSES[s]}`}/>{STATUS_LABELS[s]}</span>)}</div>}
function InventoryStatusCard({title,subtitle,summary,onNavigate}:{title:string;subtitle:string;summary:Record<string,Record<UnitStatus,number>>;onNavigate:(p:PageId)=>void}){return <div className="card p-6"><div className="flex items-start justify-between mb-5"><div><h2 className="text-base font-semibold text-gray-900">{title}</h2><p className="text-xs text-gray-500 mt-1">{subtitle}</p></div><button onClick={()=>onNavigate('inventory')} className="text-sm text-red-600 font-medium">المخزون</button></div><StatusLegend/><InventoryBars summary={summary}/></div>}
function InventoryBars({summary}:{summary:Record<string,Record<UnitStatus,number>>}){return <div className="space-y-4">{BLOOD_TYPES.map(t=>{const row=summary[t]||{available:0,reserved:0,issued:0,expired:0,discarded:0};const total=Object.values(row).reduce((a,b)=>a+b,0);return <div key={t} className="grid grid-cols-[42px_1fr_auto] items-center gap-3"><BloodTypeBadge type={t} size="sm"/><div><div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">{(Object.keys(STATUS_LABELS) as UnitStatus[]).map(s=>row[s]>0&&<div key={s} className={STATUS_CLASSES[s]} style={{width:`${(row[s]/Math.max(total,1))*100}%`}} title={`${STATUS_LABELS[s]}: ${row[s]}`}/>)}</div><div className="flex gap-3 mt-1 text-[10px] text-gray-400">{(Object.keys(STATUS_LABELS) as UnitStatus[]).filter(s=>row[s]>0).map(s=><span key={s}>{STATUS_LABELS[s]} {row[s]}</span>)}</div></div><span className="text-sm font-bold text-gray-700 whitespace-nowrap">{total}</span></div>})}</div>}
