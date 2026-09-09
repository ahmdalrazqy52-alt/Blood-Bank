import { useEffect, useState, useCallback } from 'react';
import { History, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  accept: 'قبول',
  reject: 'رفض',
  cancel: 'إلغاء',
  reserve: 'حجز',
  ready: 'تجهيز',
  deliver: 'تسليم',
  review: 'مراجعة',
  suspend: 'إيقاف',
  activate: 'تفعيل',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  update: 'bg-blue-100 text-blue-700 border-blue-200',
  delete: 'bg-red-100 text-red-700 border-red-200',
  accept: 'bg-teal-100 text-teal-700 border-teal-200',
  reject: 'bg-red-100 text-red-700 border-red-200',
  cancel: 'bg-gray-200 text-gray-600 border-gray-300',
  reserve: 'bg-amber-100 text-amber-700 border-amber-200',
  ready: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  deliver: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  review: 'bg-purple-100 text-purple-700 border-purple-200',
  suspend: 'bg-orange-100 text-orange-700 border-orange-200',
  activate: 'bg-green-100 text-green-700 border-green-200',
};

export default function AuditLogPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*, hospital:hospitals(*)')
      .order('created_at', { ascending: false });
    setLogs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = logs.filter((log) => {
    if (actionFilter && log.action !== actionFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        log.user_name.includes(search) ||
        log.entity_id?.toLowerCase().includes(s) ||
        log.reason?.includes(search) ||
        log.entity.includes(search)
      );
    }
    return true;
  });

  if (loading) return <LoadingSpinner label="جاري تحميل السجل..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">سجل العمليات</h1>
        <p className="text-sm text-gray-500 mt-1">{filtered.length} عملية مسجّلة</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث في السجل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pr-10"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="select sm:w-48"
        >
          <option value="">كل العمليات</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="لا توجد عمليات مسجّلة" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">المستخدم</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">المستشفى</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">العملية</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">الكيان</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">المعرّف</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">القيمة السابقة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">القيمة الجديدة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">السبب</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{log.user_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.hospital?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.entity}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{log.entity_id || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{log.old_value || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{log.new_value || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{log.reason || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
