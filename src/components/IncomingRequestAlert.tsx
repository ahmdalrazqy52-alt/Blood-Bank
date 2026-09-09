import { useEffect, useRef } from 'react';
import { BellRing, ExternalLink, X, AlertTriangle } from 'lucide-react';
import type { Notification } from '@/lib/types';

export default function IncomingRequestAlert({ notification, onOpen, onClose, soundEnabled = true }: {
  notification: Notification | null; onOpen: () => void; onClose: () => void; soundEnabled?: boolean;
}) {
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!notification || !soundEnabled) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx(); audioRef.current = ctx;
      const beep = (delay:number) => {
        const osc=ctx.createOscillator(); const gain=ctx.createGain();
        osc.frequency.value=880; gain.gain.setValueAtTime(0.0001,ctx.currentTime+delay);
        gain.gain.exponentialRampToValueAtTime(0.18,ctx.currentTime+delay+0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+delay+0.18);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime+delay); osc.stop(ctx.currentTime+delay+0.2);
      };
      beep(0); beep(0.28); beep(0.56);
      return ()=>{ctx.close().catch(()=>{});};
    } catch {}
  }, [notification, soundEnabled]);

  if (!notification) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm" dir="rtl">
    <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-red-100 overflow-hidden animate-slide-in">
      <div className="p-5 bg-gradient-to-l from-red-700 to-red-500 text-white flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center pulse-ring"><BellRing size={26}/></div>
        <div className="flex-1"><p className="font-bold text-lg">طلب دم جديد</p><p className="text-red-100 text-sm">تم استلام طلب جديد من مستشفى آخر</p></div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10"><X/></button>
      </div>
      <div className="p-6 space-y-4">
        <div className="p-4 bg-red-50 rounded-2xl border border-red-100"><p className="font-semibold text-red-900">{notification.message}</p></div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">لاحقاً</button>
          <button onClick={onOpen} className="btn-primary flex-1 justify-center"><ExternalLink size={18}/> انتقال إلى عرض الطلب</button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500"><AlertTriangle size={14}/> إذا لم تسمح المتصفح بتشغيل الصوت، اضغط داخل النظام مرة واحدة لتفعيل الصوت.</div>
      </div>
    </div>
  </div>;
}
