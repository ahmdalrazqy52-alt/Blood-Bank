import { useState, useEffect, useCallback } from 'react';
import Sidebar, { type PageId } from '@/components/Sidebar';
import Dashboard from '@/pages/Dashboard';
import Inventory from '@/pages/Inventory';
import Requests from '@/pages/Requests';
import Hospitals from '@/pages/Hospitals';
import Deliveries from '@/pages/Deliveries';
import Notifications from '@/pages/Notifications';
import Reports from '@/pages/Reports';
import AuditLog from '@/pages/AuditLog';
import Users from '@/pages/Users';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import LoadingSpinner from '@/components/LoadingSpinner';
import IncomingRequestAlert from '@/components/IncomingRequestAlert';
import type { Notification } from '@/lib/types';

function App() {
  const { profile, loading, recovery } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [incoming, setIncoming] = useState<Notification|null>(null);

  const loadUnread = useCallback(async () => {
    if (!profile) return;
    const { count } = await supabase.from('notifications').select('*',{count:'exact',head:true}).eq('is_read',false);
    setUnreadCount(count||0);
  },[profile]);

  useEffect(()=>{ if(!profile)return; loadUnread(); const t=setInterval(loadUnread,30000); return()=>clearInterval(t);},[loadUnread,profile]);

  useEffect(()=>{
    if(!profile)return;
    const channel=supabase.channel(`notifications-${profile.id}-${profile.hospital_id||'admin'}`)
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'notifications',
        ...(profile.role==='admin'?{}:{filter:`hospital_id=eq.${profile.hospital_id}`})
      },payload=>{
        const n=payload.new as Notification;
        setUnreadCount(c=>c+1);
        if(n.type==='new_request') setIncoming(n);
      }).subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[profile]);

  const handleNavigate=(p:PageId)=>{setPage(p);if(p==='notifications')loadUnread();};

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl"><LoadingSpinner label="جاري التحميل..." /></div>;
  if(recovery || !profile) return <Login/>;

  return <div className="min-h-screen bg-gray-50 flex" dir="rtl">
    <Sidebar current={page} onNavigate={handleNavigate} unreadCount={unreadCount}/>
    <main className="flex-1 min-w-0 p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-20 max-w-[1500px] mx-auto w-full">
      {page==='dashboard'&&<Dashboard onNavigate={handleNavigate}/>}
      {page==='inventory'&&<Inventory/>}
      {page==='requests'&&<Requests/>}
      {page==='hospitals'&&profile.role==='admin'&&<Hospitals/>}
      {page==='deliveries'&&<Deliveries/>}
      {page==='notifications'&&<Notifications/>}
      {page==='reports'&&<Reports/>}
      {page==='audit'&&<AuditLog/>}
      {page==='users'&&(profile.role==='admin'||profile.role==='manager')&&<Users/>}
      {page==='settings'&&<Settings/>}
    </main>
    <IncomingRequestAlert notification={incoming} soundEnabled={profile.notification_sound_enabled !== false} onClose={()=>setIncoming(null)} onOpen={()=>{setIncoming(null);setPage('requests');}}/>
  </div>;
}
export default App;
