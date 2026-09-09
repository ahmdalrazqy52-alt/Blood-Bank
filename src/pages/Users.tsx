import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Mail, Building2, User as UserIcon, KeyRound, Power, PowerOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, type Profile, type UserRole } from '@/lib/auth';
import type { Hospital } from '@/lib/types';
import Modal from '@/components/Modal';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدير عام',
  manager: 'مدير مستشفى',
  staff: 'موظف',
  hospital: 'مستشفى',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-gray-100 text-gray-700 border-gray-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  staff: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  hospital: 'bg-amber-100 text-amber-700 border-amber-200',
};

interface UserRow extends Profile {
  hospital?: Hospital | null;
}

export default function Users() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const userHospitalId = profile?.hospital_id || '';

  const [form, setForm] = useState({
    full_name: '',
    username: '',
    phone: '',
    email: '',
    password: '',
    role: 'staff' as UserRole,
    hospital_id: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [uRes, hRes] = await Promise.all([
      supabase.from('profiles').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('hospitals').select('*').order('name'),
    ]);
    setUsers(uRes.data as UserRow[] || []);
    setHospitals(hRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setError(null);
    setForm({
      full_name: '',
      username: '',
      phone: '',
      email: '',
      password: '',
      role: isAdmin ? 'manager' : 'staff',
      hospital_id: isAdmin ? '' : userHospitalId,
    });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) {
      setError('يرجى ملء جميع الحقول');
      return;
    }
    if (isAdmin && !form.hospital_id) {
      setError('يرجى اختيار المستشفى');
      return;
    }
    if (form.password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    setSaving(true);
    setError(null);

    const { data: session } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name,
          username: form.username.trim() || null,
          phone: form.phone.trim() || null,
          role: isAdmin ? form.role : 'staff',
          hospital_id: isAdmin ? form.hospital_id : userHospitalId,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || 'فشل إنشاء الحساب');
      setSaving(false);
      return;
    }

    await supabase.rpc('write_audit_log',{p_hospital_id:isAdmin?form.hospital_id:userHospitalId,p_action:'create',p_entity:'user',p_entity_id:form.email,p_new_value:`${form.full_name} (${ROLE_LABELS[isAdmin?form.role:'staff']})`,p_reason:'إنشاء حساب مستخدم جديد'});

    setSaving(false);
    setModalOpen(false);
    loadData();
  };

  const handleToggleActive = async (target: UserRow) => {
    setError(null);
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.session?.access_token || ''}` },
      body: JSON.stringify({ action: 'set_active', user_id: target.id, is_active: !target.is_active }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'تعذر تغيير حالة الحساب');
      return;
    }
    await supabase.rpc('write_audit_log',{p_hospital_id:target.hospital_id,p_action:target.is_active?'suspend':'activate',p_entity:'user',p_entity_id:target.email,p_old_value:target.is_active?'active':'inactive',p_new_value:target.is_active?'inactive':'active',p_reason:target.is_active?'تعطيل حساب المستخدم':'تفعيل حساب المستخدم'});
    loadData();
  };

  const handleResetPassword = async () => {
    if (!resetUser || !newPassword || newPassword.length < 8) {
      setResetError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    setResetting(true);
    setResetError(null);

    const { data: session } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          email: resetUser.email,
          password: newPassword,
          full_name: resetUser.full_name || '',
          role: resetUser.role,
          hospital_id: resetUser.hospital_id,
          update: true,
        }),
      }
    );

    if (!response.ok) {
      const result = await response.json();
      setResetError(result.error || 'فشل إعادة التعيين');
      setResetting(false);
      return;
    }

    await supabase.rpc('write_audit_log',{p_hospital_id:resetUser.hospital_id,p_action:'update',p_entity:'user',p_entity_id:resetUser.email,p_reason:'إعادة تعيين كلمة المرور'});

    setResetting(false);
    setResetUser(null);
    setNewPassword('');
    setResetError(null);
  };

  if (loading) return <LoadingSpinner label="جاري تحميل المستخدمين..." />;

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.phone?.includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'كل المستخدمين في النظام' : 'موظفو المستشفى'}
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={18} />
          {isAdmin ? 'إضافة مدير/موظف' : 'إضافة موظف'}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="بحث بالاسم أو البريد..."
          className="input pr-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div className="card">
          <EmptyState title="لا يوجد مستخدمون" message="أضف مستخدم جديد للبدء" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">الاسم</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">بيانات الاتصال</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">الصلاحية</th>
                  {isAdmin && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">المستشفى</th>}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">الحالة</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br from-blue-500 to-blue-700">
                          {u.full_name?.charAt(0) || '?'}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{u.full_name || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600"><div dir="ltr">{u.email}</div>{u.username&&<div className="text-xs text-gray-400">@{u.username}</div>}{u.phone&&<div className="text-xs text-gray-400" dir="ltr">{u.phone}</div>}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-sm text-gray-600">{u.hospital?.name || '-'}</td>
                    )}
                    <td className="px-4 py-3"><span className={`badge ${u.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{u.is_active ? 'نشط' : 'معطل'}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {u.id !== profile?.id && u.role !== 'admin' && <button onClick={() => handleToggleActive(u)} className={`p-2 rounded-lg ${u.is_active?'text-red-500 hover:bg-red-50':'text-emerald-500 hover:bg-emerald-50'}`} title={u.is_active?'تعطيل الحساب':'تفعيل الحساب'}>
                          {u.is_active ? <PowerOff size={16}/> : <Power size={16}/>}
                        </button>}
                        <button
                          onClick={() => { setResetUser(u); setResetError(null); setNewPassword(''); }}
                          className="p-2 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <KeyRound size={16} />
                        </button>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isAdmin ? 'إضافة مستخدم جديد' : 'إضافة موظف جديد'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل</label>
            <div className="relative">
              <UserIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="input pr-10"
                placeholder="اسم المستخدم"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">اسم المستخدم</label><input type="text" value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})} className="input" dir="ltr" placeholder="username" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الهاتف</label><input type="text" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} className="input" dir="ltr" placeholder="+967..." /></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input pr-10"
                dir="ltr"
                placeholder="example@hospital.ye"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input pr-10"
                dir="ltr"
                placeholder="••••••••"
                minLength={6}
              />
            </div>
          </div>

          {isAdmin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الصلاحية</label>
                <div className="flex gap-2">
                  {(['manager', 'staff'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setForm({ ...form, role: r })}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        form.role === r
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">المستشفى</label>
                <div className="relative">
                  <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={form.hospital_id}
                    onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}
                    className="select pr-10"
                  >
                    <option value="">اختر المستشفى</option>
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 animate-fade-in">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1 justify-center">
              إلغاء
            </button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
            </button>
          </div>

          {!isAdmin && (
            <p className="text-xs text-gray-400 text-center">
              سيتم ربط الحساب بمستشفى: {hospitals.find((h) => h.id === userHospitalId)?.name || ''}
            </p>
          )}
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={!!resetUser}
        onClose={() => { setResetUser(null); setResetError(null); setNewPassword(''); }}
        title="إعادة تعيين كلمة المرور"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            أدخل كلمة المرور الجديدة للمستخدم <span className="font-medium">{resetUser?.full_name || resetUser?.email}</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور الجديدة</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              dir="ltr"
              placeholder="••••••••"
              minLength={6}
              autoFocus
            />
          </div>
          {resetError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 animate-fade-in">
              {resetError}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setResetUser(null); setResetError(null); setNewPassword(''); }} className="btn-secondary flex-1 justify-center">
              إلغاء
            </button>
            <button onClick={handleResetPassword} disabled={resetting} className="btn-primary flex-1 justify-center">
              {resetting ? 'جاري التعيين...' : 'تعيين كلمة المرور'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
