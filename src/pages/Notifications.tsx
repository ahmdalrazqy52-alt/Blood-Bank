import { useEffect, useState, useCallback } from 'react';
import { Bell, CheckCheck, AlertTriangle, BellRing } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/lib/types';
import { PRIORITY_LABELS } from '@/lib/types';
import { PRIORITY_COLORS } from '@/lib/constants';
import { formatTimeAgo } from '@/lib/utils';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    setNotifications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    loadData();
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).neq('is_read', true);
    loadData();
  };

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) return <LoadingSpinner label="جاري تحميل الإشعارات..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الإشعارات</h1>
          <p className="text-sm text-gray-500 mt-1">{unreadCount} إشعار غير مقروء</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary">
            <CheckCheck size={18} />
            تعليم الكل كمقروء
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === 'all' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          الكل ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === 'unread' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          غير المقروء ({unreadCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="لا توجد إشعارات" message="جميع الإشعارات مقروءة" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`card p-4 flex items-start gap-3 transition-all hover:shadow-md ${
                !n.is_read ? 'border-r-4 border-r-red-500' : ''
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  n.type === 'expiry_warning'
                    ? 'bg-amber-100 text-amber-600'
                    : n.type === 'new_request'
                    ? 'bg-blue-100 text-blue-600'
                    : n.priority === 'critical'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {n.type === 'expiry_warning' ? (
                  <AlertTriangle size={20} />
                ) : n.type === 'new_request' ? (
                  <BellRing size={20} />
                ) : (
                  <Bell size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                  <span className={`badge ${PRIORITY_COLORS[n.priority]}`}>
                    {PRIORITY_LABELS[n.priority]}
                  </span>
                  {!n.is_read && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                </div>
                <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => markAsRead(n.id)}
                  className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
                  title="تعليم كمقروء"
                >
                  <CheckCheck size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
