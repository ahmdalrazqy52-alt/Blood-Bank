import { useEffect, useState } from 'react';
import { Camera, Image as ImageIcon, Save, UserRound, Building2, KeyRound, Volume2, VolumeX, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Hospital } from '@/lib/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import DarkModeToggle from '@/components/DarkModeToggle';

export default function Settings() {
  const { profile } = useAuth();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [name, setName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [avatar, setAvatar] = useState(profile?.avatar_url || '');
  const [sound, setSound] = useState(profile?.notification_sound_enabled !== false);
  const [logo, setLogo] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name || ''); setUsername(profile.username || ''); setPhone(profile.phone || '');
    setAvatar(profile.avatar_url || ''); setSound(profile.notification_sound_enabled !== false);
  }, [profile]);

  useEffect(() => {
    (async () => {
      if (profile?.hospital_id) {
        const { data } = await supabase.from('hospitals').select('*').eq('id', profile.hospital_id).maybeSingle();
        if (data) { setHospital(data); setLogo(data.logo_url || ''); setImage(data.image_url || ''); }
      }
    })();
  }, [profile?.hospital_id]);

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error('حجم الصورة يجب ألا يتجاوز 2MB'));
    if (!file.type.startsWith('image/')) return reject(new Error('اختر ملف صورة صالحاً'));
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('تعذر قراءة الصورة')); reader.readAsDataURL(file);
  });

  const uploadHospitalAsset = async (file: File, folder: string) => {
    if (!profile?.hospital_id) throw new Error('لا يوجد مستشفى مرتبط بالحساب');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `hospital/${profile.hospital_id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('hospital-assets').upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    return supabase.storage.from('hospital-assets').getPublicUrl(path).data.publicUrl;
  };

  const saveProfile = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const { data, error: rpcError } = await supabase.rpc('update_my_profile', {
        p_full_name: name.trim(), p_avatar_url: avatar || null, p_username: username.trim() || null,
        p_phone: phone.trim() || null, p_notification_sound_enabled: sound,
      });
      if (rpcError) throw rpcError;
      if (data) { setAvatar((data as any).avatar_url || ''); }
      setMessage('تم حفظ الملف الشخصي والإعدادات');
    } catch (e: any) { setError(e.message || 'تعذر الحفظ'); } finally { setSaving(false); }
  };

  const changePassword = async () => {
    setError(''); setMessage('');
    if (newPassword.length < 8) return setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
    if (newPassword !== confirmPassword) return setError('كلمتا المرور غير متطابقتين');
    if (!currentPassword) return setError('أدخل كلمة المرور الحالية للتأكيد');
    if (!profile?.email) return setError('لا يوجد بريد مرتبط بالحساب');
    setChangingPassword(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
      if (authError) throw new Error('كلمة المرور الحالية غير صحيحة');
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await supabase.rpc('record_password_change');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage('تم تغيير كلمة المرور بنجاح');
    } catch (e: any) { setError(e.message || 'تعذر تغيير كلمة المرور'); } finally { setChangingPassword(false); }
  };

  if (!profile) return <LoadingSpinner label="جاري التحميل..." />;
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3 flex-wrap"><div><h1 className="text-2xl font-bold text-gray-900">الإعدادات والملف</h1><p className="text-sm text-gray-500 mt-1">إدارة بياناتك، الصورة الشخصية، الإشعارات والأمان</p></div><DarkModeToggle /></div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5"><UserRound className="text-red-600"/><div><h2 className="font-semibold text-gray-900">الملف الشخصي</h2><p className="text-xs text-gray-400">الصورة الشخصية تحفظ داخل قاعدة البيانات بصيغة Base64</p></div></div>
        <div className="flex items-center gap-5 mb-5">
          {avatar ? <img src={avatar} className="w-20 h-20 rounded-2xl object-cover border border-gray-200" /> : <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400"><UserRound /></div>}
          <label className="btn-secondary cursor-pointer"><Camera size={17}/> تغيير الصورة<input type="file" accept="image/*" className="hidden" onChange={async e => { const f=e.target.files?.[0]; if(!f)return; try{setAvatar(await fileToDataUrl(f));setError('')}catch(err:any){setError(err.message)} }} /></label>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="الاسم الكامل"><input className="input" value={name} onChange={e=>setName(e.target.value)} /></Field>
          <Field label="اسم المستخدم"><input className="input" dir="ltr" value={username} onChange={e=>setUsername(e.target.value)} placeholder="مثال: ahmed" /></Field>
          <Field label="رقم الهاتف"><input className="input" dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} /></Field>
          <Field label="البريد الإلكتروني"><input className="input bg-gray-50" dir="ltr" value={profile.email} disabled /></Field>
        </div>
        <div className="mt-4 p-3 rounded-xl border border-gray-200 flex items-center justify-between"><div className="flex items-center gap-3"><span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">{sound?<Volume2 size={18}/>:<VolumeX size={18}/>}</span><div><p className="text-sm font-medium">صوت إشعارات الطلبات</p><p className="text-xs text-gray-400">تشغيل صوت التنبيه عند وصول طلب جديد</p></div></div><button type="button" onClick={()=>setSound(v=>!v)} className={`relative w-12 h-7 rounded-full transition ${sound?'bg-red-600':'bg-gray-300'}`}><span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition ${sound?'right-1':'right-6'}`} /></button></div>
        <button onClick={saveProfile} disabled={saving} className="btn-primary mt-5"><Save size={17}/>{saving?'جاري الحفظ...':'حفظ الملف والإعدادات'}</button>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5"><KeyRound className="text-amber-600"/><div><h2 className="font-semibold text-gray-900">أمان الحساب</h2><p className="text-xs text-gray-400">تأكيد كلمة المرور الحالية مطلوب قبل التغيير</p></div></div>
        <div className="space-y-4">
          <Field label="كلمة المرور الحالية"><input className="input" type="password" dir="ltr" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="كلمة المرور الجديدة"><input className="input" type="password" dir="ltr" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} autoComplete="new-password" /></Field>
          <Field label="تأكيد كلمة المرور الجديدة"><input className="input" type="password" dir="ltr" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" /></Field>
          <button onClick={changePassword} disabled={changingPassword} className="btn-primary"><ShieldCheck size={17}/>{changingPassword?'جاري التغيير...':'تغيير كلمة المرور'}</button>
        </div>
        <div className="mt-5 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1"><p>الدور: <b>{profile.role==='admin'?'مدير عام':profile.role==='manager'?'مدير مستشفى':'موظف'}</b></p><p>تاريخ إنشاء الحساب: <b>{new Date((profile as any).created_at || Date.now()).toLocaleString('ar')}</b></p><p>آخر دخول: <b>{profile.last_login_at ? new Date(profile.last_login_at).toLocaleString('ar') : 'أول دخول مسجل'}</b></p></div>
      </div>
    </div>

    {(profile.role==='admin'||profile.role==='manager')&&hospital&&<div className="card p-6">
      <div className="flex items-center gap-3 mb-5"><Building2 className="text-blue-600"/><div><h2 className="font-semibold text-gray-900">هوية المستشفى</h2><p className="text-xs text-gray-400">{hospital.name} — الشعار يظهر لموظفي المستشفى</p></div></div>
      <div className="grid sm:grid-cols-2 gap-5"><Asset label="شعار المستشفى" value={logo} onChange={setLogo} onUpload={async f=>setLogo(await uploadHospitalAsset(f,'logo'))}/><Asset label="صورة المستشفى" value={image} onChange={setImage} onUpload={async f=>setImage(await uploadHospitalAsset(f,'image'))}/></div>
      <button onClick={async()=>{setSaving(true);setError('');setMessage('');try{const {data,error:e}=await supabase.rpc('update_hospital_branding',{p_hospital_id:hospital.id,p_logo_url:logo||null,p_image_url:image||null});if(e)throw e;if(data)setHospital(data as Hospital);setMessage('تم حفظ هوية المستشفى')}catch(e:any){setError(e.message)}finally{setSaving(false)}}} disabled={saving} className="btn-primary mt-5"><Save size={17}/> حفظ الهوية</button>
    </div>}
    {error&&<div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
    {message&&<div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{message}</div>}
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>{children}</div>}
function Asset({label,value,onChange,onUpload}:{label:string;value:string;onChange:(v:string)=>void;onUpload:(f:File)=>Promise<void>}){return <div><p className="text-sm font-medium text-gray-700 mb-2">{label}</p><div className="h-40 bg-gray-50 rounded-2xl border border-dashed border-gray-300 flex items-center justify-center overflow-hidden">{value?<img src={value} className="w-full h-full object-contain"/>:<ImageIcon className="text-gray-300 w-10 h-10"/>}</div><div className="flex gap-2 mt-2"><label className="btn-secondary cursor-pointer flex-1 justify-center"><Camera size={16}/> رفع صورة<input type="file" accept="image/*" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)try{await onUpload(f)}catch(err:any){alert(err.message)}}}/></label><input className="input flex-1" value={value} onChange={e=>onChange(e.target.value)} placeholder="أو رابط الصورة"/></div></div>}
