import { useEffect, useState, useCallback } from 'react';
import { BarChart3, TrendingUp, Droplet, FileText, Truck, Package, Download, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { BloodUnit, BloodRequest, Delivery, Hospital } from '@/lib/types';
import { BLOOD_TYPES, BLOOD_COMPONENTS, COMPONENT_LABELS, REQUEST_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/types';
import BloodTypeBadge from '@/components/BloodTypeBadge';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<BloodUnit[]>([]);
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [uRes, rRes, dRes, hRes] = await Promise.all([
      supabase.from('blood_units').select('*'),
      supabase.from('blood_requests').select('*'),
      supabase.from('deliveries').select('*'),
      supabase.from('hospitals').select('*'),
    ]);
    setUnits(uRes.data || []);
    setRequests(rRes.data || []);
    setDeliveries(dRes.data || []);
    setHospitals(hRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <LoadingSpinner label="جاري تحميل التقارير..." />;

  const available = units.filter((u) => u.status === 'available' && u.expiry_date >= new Date().toISOString().slice(0,10));

  const exportReport = () => {
    const rows = [
      ['التقرير','بنك الدم المركزي'],['تاريخ التقرير',new Date().toLocaleString('ar')],
      ['الوحدات المتاحة',String(available.length)],['الطلبات',String(requests.length)],
      ['التسليمات',String(deliveries.length)],['الوحدات المسلمة',String(deliveries.reduce((s,d)=>s+d.quantity,0))]
    ];
    const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`blood-bank-report-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
  };
  const totalDelivered = deliveries.reduce((sum, d) => sum + d.quantity, 0);

  // Inventory by hospital
  const byHospital = hospitals.map((h) => ({
    hospital: h,
    count: available.filter((u) => u.hospital_id === h.id).length,
  }));
  const maxHospitalCount = Math.max(...byHospital.map((h) => h.count), 1);

  // Requests by status
  const byStatus = Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => ({
    status: k,
    label: v,
    count: requests.filter((r) => r.status === k).length,
  }));

  // Requests by priority
  const byPriority = Object.entries(PRIORITY_LABELS).map(([k, v]) => ({
    priority: k,
    label: v,
    count: requests.filter((r) => r.priority === k).length,
  }));

  // Most used blood types
  const typeUsage: Record<string, number> = {};
  deliveries.forEach((d) => {
    typeUsage[d.blood_type] = (typeUsage[d.blood_type] || 0) + d.quantity;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">التقارير والإحصائيات</h1><p className="text-sm text-gray-500 mt-1">إحصائيات شاملة عن النظام</p></div>
        <div className="flex gap-2 no-print"><button onClick={exportReport} className="btn-secondary"><Download size={17}/> تصدير التقرير</button><button onClick={()=>window.print()} className="btn-secondary"><Printer size={17}/> طباعة</button></div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={Droplet} label="إجمالي الوحدات المتاحة" value={available.length} color="bg-red-50 text-red-600" />
        <SummaryCard icon={FileText} label="إجمالي الطلبات" value={requests.length} color="bg-blue-50 text-blue-600" />
        <SummaryCard icon={Truck} label="عمليات التسليم" value={deliveries.length} color="bg-teal-50 text-teal-600" />
        <SummaryCard icon={Package} label="الوحدات المسلّمة" value={totalDelivered} color="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory by Hospital */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">المخزون حسب المستشفى</h2>
          </div>
          <div className="space-y-3">
            {byHospital.map((item) => (
              <div key={item.hospital.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 truncate">{item.hospital.name}</span>
                  <span className="text-sm text-gray-500">{item.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-red-500 to-red-400 rounded-full transition-all duration-500"
                    style={{ width: `${(item.count / maxHospitalCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requests by Status */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">الطلبات حسب الحالة</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {byStatus.map((item) => (
              <div key={item.status} className="p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{item.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Requests by Priority */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">الطلبات حسب الأولوية</h2>
          </div>
          <div className="space-y-3">
            {byPriority.map((item) => (
              <div key={item.priority} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 w-16">{item.label}</span>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                  <div
                    className={`h-full flex items-center justify-end px-3 text-white text-sm font-medium transition-all duration-500 ${
                      item.priority === 'critical'
                        ? 'bg-gradient-to-l from-red-600 to-red-500'
                        : item.priority === 'urgent'
                        ? 'bg-gradient-to-l from-orange-500 to-amber-500'
                        : 'bg-gradient-to-l from-slate-500 to-slate-400'
                    }`}
                    style={{ width: `${Math.max((item.count / Math.max(requests.length, 1)) * 100, 8)}%` }}
                  >
                    {item.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Used Blood Types */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Droplet className="w-5 h-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">أكثر الفصائل استخدامًا</h2>
          </div>
          {Object.keys(typeUsage).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">لا توجد بيانات تسليم بعد</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(typeUsage)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <BloodTypeBadge type={type as any} size="sm" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">{type}</span>
                        <span className="text-sm font-medium text-gray-900">{count} وحدة</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Component Distribution Table */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Package className="w-5 h-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">توزيع المكوّنات حسب الفصيلة</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">المكوّن</th>
                {BLOOD_TYPES.map((t) => (
                  <th key={t} className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">{t}</th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {BLOOD_COMPONENTS.map((comp) => {
                const rowTotal = available.filter((u) => u.component === comp).length;
                return (
                  <tr key={comp} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-sm font-medium text-gray-700">{COMPONENT_LABELS[comp]}</td>
                    {BLOOD_TYPES.map((t) => {
                      const count = available.filter((u) => u.component === comp && u.blood_type === t).length;
                      return (
                        <td key={t} className="px-3 py-2.5 text-center text-sm text-gray-600">
                          {count > 0 ? count : <span className="text-gray-300">-</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center text-sm font-bold text-gray-900">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: typeof Droplet; label: string; value: number; color: string }) {
  return (
    <div className="card p-5">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
