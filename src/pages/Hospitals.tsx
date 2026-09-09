import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Power, PowerOff, Search, MapPin, Phone, Mail, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Hospital } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import Modal from '@/components/Modal';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

export default function Hospitals() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editHospital, setEditHospital] = useState<Hospital | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const userName = profile?.full_name || 'المدير العام';

  const [form, setForm] = useState({
    code: '',
    name: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    manager: '',
    manager_email: '',
    manager_password: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('hospitals').select('*').order('registered_at', { ascending: false });
    setHospitals(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = hospitals.filter(
    (h) =>
      h.name.includes(search) ||
      h.city.includes(search) ||
      h.code.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditHospital(null);
    setForm({ code: '', name: '', city: '', address: '', phone: '', email: '', manager: '', manager_email: '', manager_password: '' });
    setModalOpen(true);
  };

  const openEdit = (h: Hospital) => {
    setEditHospital(h);
    setForm({
      code: h.code,
      name: h.name,
      city: h.city,
      address: h.address || '',
      phone: h.phone || '',
      email: h.email || '',
      manager: h.manager || '',
      manager_email: '',
      manager_password: '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.city) return;
    if (!editHospital && (!form.manager || !form.manager_email || !form.manager_password)) return;
    if (!editHospital && form.manager_password.length < 6) return;
    setSaving(true);

    if (editHospital) {
      await supabase.from('hospitals').update({
        name: form.name,
        city: form.city,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        manager: form.manager || null,
      }).eq('id', editHospital.id);

      await supabase.rpc('write_audit_log',{p_hospital_id:editHospital.id,p_action:'update',p_entity:'hospital',p_entity_id:editHospital.code,p_old_value:editHospital.name,p_new_value:form.name,p_reason:'تعديل بيانات مستشفى'});
    } else {
      const { data } = await supabase.from('hospitals').insert({
        code: form.code,
        name: form.name,
        city: form.city,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        manager: form.manager || null,
        status: 'active',
      }).select().single();

      if (data) {
        const { data: session } = await supabase.auth.getSession();
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.session?.access_token || ''}`,
            },
            body: JSON.stringify({
              email: form.manager_email.trim(),
              password: form.manager_password,
              full_name: form.manager,
              role: 'manager',
              hospital_id: data.id,
            }),
          }
        );

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          await supabase.from('hospitals').delete().eq('id', data.id);
          setSaving(false);
          setModalOpen(false);
          window.alert(result.error || 'تم إلغاء إضافة المستشفى لأن حساب المدير لم يُنشأ.');
          return;
        }

        await supabase.rpc('write_audit_log',{p_hospital_id:data.id,p_action:'create',p_entity:'hospital',p_entity_id:form.code,p_new_value:`${form.name} - مدير: ${form.manager}`,p_reason:'إضافة مستشفى جديد وإنشاء حساب مدير المستشفى'});
      }
    }

    setSaving(false);
    setModalOpen(false);
    loadData();
  };

  const toggleStatus = async (h: Hospital) => {
    const newStatus = h.status === 'active' ? 'suspended' : 'active';
    await supabase.from('hospitals').update({ status: newStatus }).eq('id', h.id);

    await supabase.rpc('write_audit_log',{p_hospital_id:h.id,p_action:newStatus==='suspended'?'suspend':'activate',p_entity:'hospital',p_entity_id:h.code,p_old_value:h.status,p_new_value:newStatus,p_reason:newStatus==='suspended'?'إيقاف مستشفى':'إعادة تفعيل مستشفى'});

    loadData();
  };

  if (loading) return <LoadingSpinner label="جاري تحميل المستشفيات..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المستشفيات</h1>
          <p className="text-sm text-gray-500 mt-1">{hospitals.length} مستشفى مسجل</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={18} />
          إضافة مستشفى
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="بحث بالاسم أو المدينة أو الكود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pr-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="لا توجد مستشفيات" message="أضف مستشفى جديد للبدء" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((h) => (
            <div key={h.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                    {h.logo_url ? <img src={h.logo_url} className="w-full h-full object-cover" /> : <span className="text-white font-bold text-sm">{h.code}</span>}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{h.name}</h3>
                    <p className="text-xs text-gray-400">{h.city}</p>
                  </div>
                </div>
                <span
                  className={`badge ${
                    h.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-red-100 text-red-700 border-red-200'
                  }`}
                >
                  {h.status === 'active' ? 'نشط' : 'موقوف'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                {h.address && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{h.address}</span>
                  </div>
                )}
                {h.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={14} className="text-gray-400 shrink-0" />
                    <span dir="ltr">{h.phone}</span>
                  </div>
                )}
                {h.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{h.email}</span>
                  </div>
                )}
                {h.manager && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <User size={14} className="text-gray-400 shrink-0" />
                    <span>{h.manager}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-400">سجّل في {formatDate(h.registered_at)}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(h)}
                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => toggleStatus(h)}
                    className={`p-2 rounded-lg transition-colors ${
                      h.status === 'active'
                        ? 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'
                        : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'
                    }`}
                    title={h.status === 'active' ? 'إيقاف' : 'تفعيل'}
                  >
                    {h.status === 'active' ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editHospital ? 'تعديل مستشفى' : 'إضافة مستشفى'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كود المستشفى</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="input"
                disabled={!!editHospital}
                placeholder="مثال: H006"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم المستشفى</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">المدينة</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">المسؤول</label>
              <input
                type="text"
                value={form.manager}
                onChange={(e) => setForm({ ...form, manager: e.target.value })}
                className="input"
              />
            </div>
          </div>

          {!editHospital && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-4">
              <p className="text-sm font-semibold text-blue-800">بيانات حساب مدير المستشفى</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">بريد المدير</label>
                  <input type="email" value={form.manager_email} onChange={(e) => setForm({ ...form, manager_email: e.target.value })} className="input" dir="ltr" placeholder="manager@hospital.ye" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة مرور المدير</label>
                  <input type="password" value={form.manager_password} onChange={(e) => setForm({ ...form, manager_password: e.target.value })} className="input" dir="ltr" minLength={6} placeholder="6 أحرف على الأقل" />
                </div>
              </div>
              <p className="text-xs text-blue-600">سيتم إنشاء حساب المدير وربطه بهذا المستشفى تلقائياً.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">العنوان</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1 justify-center">
              إلغاء
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'جاري الحفظ...' : editHospital ? 'حفظ التعديلات' : 'إضافة المستشفى'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
