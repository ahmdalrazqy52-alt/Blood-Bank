import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Droplet, FileText, Hospital, Truck, Bell, BarChart3, History, Menu, X, LogOut, Users, Settings, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type PageId = 'dashboard'|'inventory'|'requests'|'hospitals'|'deliveries'|'notifications'|'reports'|'audit'|'users'|'settings';
interface SidebarProps { current: PageId; onNavigate: (page: PageId)=>void; unreadCount: number; }
interface NavItem { id: PageId; label: string; icon: typeof LayoutDashboard; roles: string[]; }
const ALL_NAV_ITEMS: NavItem[] = [
 {id:'dashboard',label:'لوحة التحكم',icon:LayoutDashboard,roles:['admin','manager','staff']},
 {id:'inventory',label:'مخزون الدم',icon:Droplet,roles:['manager','staff']},
 {id:'requests',label:'طلبات الدم',icon:FileText,roles:['manager','staff']},
 {id:'hospitals',label:'المستشفيات',icon:Hospital,roles:['admin']},
 {id:'deliveries',label:'التسليمات',icon:Truck,roles:['manager','staff']},
 {id:'notifications',label:'الإشعارات',icon:Bell,roles:['manager','staff']},
 {id:'reports',label:'التقارير',icon:BarChart3,roles:['admin','manager','staff']},
 {id:'audit',label:'سجل العمليات',icon:History,roles:['manager','staff']},
 {id:'users',label:'إدارة المستخدمين',icon:Users,roles:['manager']},
 {id:'settings',label:'الإعدادات والملف',icon:Settings,roles:['admin','manager','staff']},
];
const ROLE_LABELS: Record<string,string>={admin:'مدير عام',manager:'مدير مستشفى',staff:'موظف'};
export default function Sidebar({current,onNavigate,unreadCount}:SidebarProps){
 const {profile,signOut}=useAuth(); const [open,setOpen]=useState(false); const [hospital,setHospital]=useState<{name:string;logo_url:string|null}|null>(null); const start=useRef<{x:number;y:number}|null>(null);
 const role=profile?.role||'staff'; const isAdmin=role==='admin'; const navItems=ALL_NAV_ITEMS.filter(x=>x.roles.includes(role));
 useEffect(()=>{ if(profile?.hospital_id){supabase.from('hospitals').select('name,logo_url').eq('id',profile.hospital_id).maybeSingle().then(({data})=>setHospital(data));} else setHospital(null); },[profile?.hospital_id]);
 useEffect(()=>{document.body.style.overflow=open?'hidden':'';return()=>{document.body.style.overflow='';}},[open]);
 const displayName=profile?.full_name||ROLE_LABELS[role]||'مستخدم'; const initials=displayName.trim().charAt(0)||'م';
 const touchStart=(e:React.TouchEvent)=>{const t=e.changedTouches[0];start.current={x:t.clientX,y:t.clientY};};
 const touchEnd=(e:React.TouchEvent)=>{if(!start.current)return;const t=e.changedTouches[0];const dx=t.clientX-start.current.x;const dy=t.clientY-start.current.y;start.current=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)){if(dx<0&&!open)setOpen(true);if(dx>0&&open)setOpen(false);}};
 return <>
  <button aria-label="فتح القائمة" className="fixed top-4 right-4 z-[70] p-2.5 bg-white rounded-xl shadow-lg border border-gray-200 text-gray-700" onClick={()=>setOpen(v=>!v)}>{open?<X size={20}/>:<Menu size={20}/>}</button>
  {!open&&<div className="fixed top-0 right-0 bottom-0 w-3 z-40" onTouchStart={touchStart} onTouchEnd={touchEnd}/>} 
  {open&&<div className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] z-50" onClick={()=>setOpen(false)}/>} 
  <aside onTouchStart={touchStart} onTouchEnd={touchEnd} className={`fixed top-0 right-0 z-[60] h-[100dvh] w-72 max-w-[88vw] bg-white border-l border-gray-200 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${open?'translate-x-0':'translate-x-full'}`}>
   <div className="px-5 pt-6 pb-5 border-b border-gray-100 shrink-0"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl overflow-hidden bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">{hospital?.logo_url?<img src={hospital.logo_url} className="w-full h-full object-cover"/>:<Droplet className="w-6 h-6 text-white"/>}</div><div className="min-w-0"><h1 className="text-base font-bold text-gray-900 truncate">{isAdmin?'بنك الدم المركزي':hospital?.name||'نظام المستشفى'}</h1><p className="text-xs text-gray-400 truncate">{isAdmin?'لوحة الإدارة المركزية':'بوابة المستشفى'}</p></div></div></div>
   <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">{navItems.map(item=>{const Icon=item.icon;const active=current===item.id;return <button key={item.id} onClick={()=>{onNavigate(item.id);setOpen(false)}} className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${active?'bg-red-50 text-red-700 border border-red-100':'text-gray-600 hover:bg-gray-50 border border-transparent'}`}><Icon className={`w-5 h-5 shrink-0 ${active?'text-red-600':'text-gray-400'}`}/><span className="flex-1 text-right">{item.label}</span>{item.id==='notifications'&&unreadCount>0&&<span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">{unreadCount>99?'99+':unreadCount}</span>}</button>})}</nav>
   <div className="px-4 py-4 border-t border-gray-100 shrink-0"><div className="flex items-center gap-3 px-2 mb-3"><div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-slate-700 text-white text-sm font-bold">{profile?.avatar_url?<img src={profile.avatar_url} className="w-full h-full object-cover"/>:initials}</div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p><p className="text-xs text-gray-400 truncate">{ROLE_LABELS[role]} · {profile?.email}</p></div><ChevronLeft size={16} className="text-gray-300"/></div><button onClick={()=>signOut()} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 border border-gray-200 transition-all"><LogOut size={18}/> تسجيل الخروج</button></div>
  </aside>
 </>;
}
