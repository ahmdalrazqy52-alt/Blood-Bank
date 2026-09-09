import { useEffect, useState, useCallback } from 'react';
import { Printer, Eye, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Delivery } from '@/lib/types';
import { COMPONENT_LABELS } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import BloodTypeBadge from '@/components/BloodTypeBadge';
import Modal from '@/components/Modal';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

export default function Deliveries() {
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [detail, setDetail] = useState<Delivery | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('deliveries')
      .select('*, supplier_hospital:hospitals!supplier_hospital_id(*), receiving_hospital:hospitals!receiving_hospital_id(*), request:blood_requests(*)')
      .order('delivered_at', { ascending: false });
    setDeliveries(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <LoadingSpinner label="جاري تحميل التسليمات..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">التسليمات</h1>
        <p className="text-sm text-gray-500 mt-1">{deliveries.length} عملية تسليم</p>
      </div>

      {deliveries.length === 0 ? (
        <div className="card">
          <EmptyState title="لا توجد تسليمات" message="لم يتم تسليم أي طلبات بعد" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {deliveries.map((d) => (
            <div key={d.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">{d.delivery_code}</span>
                    <BloodTypeBadge type={d.blood_type} size="sm" />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {COMPONENT_LABELS[d.component]} - {d.quantity} وحدة
                  </p>
                  <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                    <p>من: {d.supplier_hospital?.name}</p>
                    <p>إلى: {d.receiving_hospital?.name}</p>
                    <p>{formatDateTime(d.delivered_at)}</p>
                  </div>
                </div>
                <button onClick={() => setDetail(d)} className="btn-secondary text-sm shrink-0">
                  <Eye size={16} />
                  عرض
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail / Print Report Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="تقرير تسليم دم"
        size="lg"
      >
        {detail && (
          <div className="space-y-5">
            <div className="print-area">
              {/* Report Header */}
              <div className="text-center pb-4 border-b-2 border-red-600">
                <h2 className="text-xl font-bold text-gray-900">نظام بنك الدم المركزي</h2>
                <p className="text-sm text-gray-500 mt-1">تقرير تسليم دم</p>
              </div>

              {/* Report Body */}
              <div className="py-6 space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-400">رقم التسليم</p>
                    <p className="text-lg font-bold text-gray-900">{detail.delivery_code}</p>
                  </div>
                  <BloodTypeBadge type={detail.blood_type} size="lg" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <ReportRow label="المستشفى المورّد" value={detail.supplier_hospital?.name || '-'} />
                  <ReportRow label="المستشفى المستلم" value={detail.receiving_hospital?.name || '-'} />
                  <ReportRow label="فصيلة الدم" value={detail.blood_type} />
                  <ReportRow label="مكوّن الدم" value={COMPONENT_LABELS[detail.component]} />
                  <ReportRow label="الكمية" value={`${detail.quantity} وحدة`} />
                  <ReportRow label="رقم الطلب" value={detail.request?.request_code || '-'} />
                  <ReportRow label="وقت التسليم" value={formatDateTime(detail.delivered_at)} />
                  <ReportRow label="الموظف المُسلّم" value={detail.issued_by || '-'} />
                  <ReportRow label="المستلم" value={detail.received_by || '-'} />
                </div>

                {detail.notes && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-400 mb-1">ملاحظات</p>
                    <p className="text-sm text-gray-700">{detail.notes}</p>
                  </div>
                )}

                {/* Signature Lines */}
                <div className="grid grid-cols-2 gap-8 pt-8">
                  <div>
                    <div className="border-t border-gray-300 pt-2">
                      <p className="text-xs text-gray-500 text-center">توقيع الموظف المُسلّم</p>
                    </div>
                  </div>
                  <div>
                    <div className="border-t border-gray-300 pt-2">
                      <p className="text-xs text-gray-500 text-center">توقيع المستلم</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Print Button */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 no-print">
              <button onClick={() => setDetail(null)} className="btn-secondary">
                إغلاق
              </button>
              <button onClick={() => window.print()} className="btn-primary">
                <Printer size={18} />
                طباعة التقرير
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border border-gray-100 rounded-xl">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
