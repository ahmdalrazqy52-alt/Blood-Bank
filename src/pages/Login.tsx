import { useState } from 'react';
import { Droplet, LogIn, Eye, EyeOff, KeyRound, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { signIn, requestPasswordReset, recovery, updatePassword } = useAuth();
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [newPassword,setNewPassword]=useState(''); const [confirm,setConfirm]=useState('');
  const [show,setShow]=useState(false); const [mode,setMode]=useState<'login'|'reset'>('login');
  const [error,setError]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null); const [loading,setLoading]=useState(false);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); setError(null); setMessage(null); setLoading(true);
    if (recovery) {
      if(newPassword.length<8 || newPassword!==confirm){setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل ومتطابقة');setLoading(false);return;}
      const r=await updatePassword(newPassword); if(r.error)setError(r.error); else setMessage('تم تحديث كلمة المرور بنجاح. يمكنك متابعة النظام.'); setLoading(false); return;
    }
    if(mode==='reset'){
      if(!email.trim()){setError('أدخل البريد الإلكتروني');setLoading(false);return;}
      const r=await requestPasswordReset(email.trim()); if(r.error)setError(r.error); else setMessage('إذا كان الحساب موجوداً، تم إرسال رابط استعادة كلمة المرور إلى البريد المرتبط به.'); setLoading(false); return;
    }
    const r=await signIn(email.trim(),password);
    if(r.error) setError(r.error==='Invalid login credentials'?'بيانات الدخول غير صحيحة':r.error);
    setLoading(false);
  };

  return <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-gray-100 flex items-center justify-center p-4" dir="rtl">
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl shadow-lg shadow-red-500/30 mb-4"><Droplet className="w-9 h-9 text-white"/></div>
        <h1 className="text-2xl font-bold text-gray-900">بنك الدم المركزي</h1><p className="text-sm text-gray-500 mt-1">نظام الإدارة المتكامل</p>
      </div>
      <div className="card p-8 animate-fade-in">
        <div className="flex items-center gap-2 mb-6"><KeyRound className="text-red-600"/><h2 className="text-lg font-semibold">{recovery?'تعيين كلمة مرور جديدة':mode==='reset'?'استعادة كلمة المرور':'تسجيل الدخول'}</h2></div>
        <form onSubmit={submit} className="space-y-4">
          {recovery ? <>
            <input className="input" type="password" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8}/>
            <input className="input" type="password" placeholder="تأكيد كلمة المرور" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8}/>
          </> : <>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">البريد أو اسم المستخدم أو رقم الهاتف</label><input className="input" dir="ltr" type="text" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></div>
            {mode==='login' && <div><label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label><div className="relative"><input className="input pl-11" dir="ltr" type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/><button type="button" onClick={()=>setShow(!show)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>}
          </>}
          {error&&<div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          {message&&<div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">{message}</div>}
          <button disabled={loading} className="btn-primary w-full justify-center">{loading?'جاري المعالجة...':recovery?'حفظ كلمة المرور':mode==='reset'?'إرسال رابط الاستعادة':'دخول'}<LogIn size={18}/></button>
        </form>
        {!recovery&&<button onClick={()=>{setMode(mode==='login'?'reset':'login');setError(null);setMessage(null)}} className="mt-5 text-sm text-red-600 hover:text-red-700 flex items-center gap-2 mx-auto">{mode==='login'?'نسيت كلمة المرور؟':'العودة إلى تسجيل الدخول'}<ArrowRight size={15}/></button>}
      </div>
    </div>
  </div>;
}
