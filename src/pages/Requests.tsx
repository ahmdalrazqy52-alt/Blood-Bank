import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Plus, Check, X, PackageCheck, Truck, Eye, Building2, Printer, RefreshCw, Search, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { BloodRequest, Hospital, BloodType, BloodComponent, RequestStatus, RequestPriority } from '@/lib/types';
import { BLOOD_TYPES, BLOOD_COMPONENTS, COMPONENT_LABELS, REQUEST_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/types';
import { REQUEST_STATUS_COLORS, PRIORITY_COLORS, REQUEST_FLOW } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import BloodTypeBadge from '@/components/BloodTypeBadge';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

interface SupplierOption {
  hospital_id: string;
  hospital_name: string;
  city: string;
  phone: string | null;
  available_quantity: number;
}

export default function Requests() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [people, setPeople] = useState<Record<string,string>>({});
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<BloodRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<{ req: BloodRequest; action: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [success, setSuccess] = useState<{ code: string; id: string } | null>(null);
  const [error, setError] = useState('');

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const userHospitalId = profile?.hospital_id || '';
  const userName = profile?.full_name || (isAdmin ? 'المدير العام' : isManager ? 'مدير المستشفى' : 'موظف');

  const [form, setForm] = useState({
    requesting_hospital_id: '', supplier_hospital_id: '', department: '', patient_name: '', patient_file: '',
    reason: '', blood_type: 'O+' as BloodType, component: 'Whole Blood' as BloodComponent, quantity: 1,
    priority: 'normal' as RequestPriority, needed_by: '', contact_phone: '', notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rRes, hRes, pRes] = await Promise.all([
      supabase.from('blood_requests').select('*, requesting_hospital:hospitals!requesting_hospital_id(*), supplier_hospital:hospitals!supplier_hospital_id(*)').order('created_at', { ascending: false }),
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('profiles').select('id,full_name,email'),
    ]);
    if (rRes.error) setError(rRes.error.message);
    setRequests((rRes.data || []) as BloodRequest[]);
    setHospitals((hRes.data || []) as Hospital[]);
    const map: Record<string,string> = {}; (pRes.data || []).forEach((p:any)=>{ map[p.id] = p.full_name || p.email || p.id; }); setPeople(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    if (!profile) return;
    const channel = supabase.channel(`requests-${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'blood_requests' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData, profile?.id]);

  const refreshSuppliers = useCallback(async () => {
    if (!form.requesting_hospital_id || !form.quantity) { setSuppliers([]); return; }
    setLoadingSuppliers(true);
    const { data, error: rpcError } = await supabase.rpc('get_supplier_availability', {
      p_blood_type: form.blood_type,
      p_component: form.component,
      p_quantity: form.quantity,
      p_exclude_hospital_id: form.requesting_hospital_id,
    });
    if (rpcError) setError(rpcError.message);
    setSuppliers((data || []) as SupplierOption[]);
    if (form.supplier_hospital_id && !(data || []).some((s: SupplierOption) => s.hospital_id === form.supplier_hospital_id)) {
      setForm((f) => ({ ...f, supplier_hospital_id: '' }));
    }
    setLoadingSuppliers(false);
  }, [form.blood_type, form.component, form.quantity, form.requesting_hospital_id, form.supplier_hospital_id]);

  useEffect(() => {
    if (modalOpen) refreshSuppliers();
  }, [modalOpen, refreshSuppliers]);

  const visibleRequests = requests.filter((r) => {
    if (!profile) return false;
    let allowed = false;
    if (isAdmin) allowed = true;
    else if (isManager) allowed = r.requesting_hospital_id === userHospitalId || r.supplier_hospital_id === userHospitalId;
    else {
      allowed =
        r.created_by === profile.id || r.accepted_by === profile.id || r.ready_by === profile.id || r.delivered_by === profile.id ||
        (r.supplier_hospital_id === userHospitalId && ['new', 'reviewing'].includes(r.status));
    }
    if (!allowed) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(r.request_code.toLowerCase().includes(q) || r.patient_name?.toLowerCase().includes(q) || r.requesting_hospital?.name.toLowerCase().includes(q) || r.supplier_hospital?.name.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const openAdd = () => {
    setError('');
    setSuccess(null);
    setForm({
      requesting_hospital_id: isAdmin ? (hospitals.find((h) => h.status === 'active')?.id || '') : userHospitalId,
      supplier_hospital_id: '', department: '', patient_name: '', patient_file: '', reason: '',
      blood_type: 'O+', component: 'Whole Blood', quantity: 1, priority: 'normal', needed_by: '', contact_phone: '', notes: '',
    });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    setError('');
    if (!form.requesting_hospital_id || !form.supplier_hospital_id || form.quantity < 1) {
      setError('اختر المستشفى المورّد الذي يظهر أن لديه الكمية المطلوبة.');
      return;
    }
    setSaving(true);
    const { data, error: createError } = await supabase.rpc('create_blood_request', {
      p_requesting_hospital_id: form.requesting_hospital_id,
      p_supplier_hospital_id: form.supplier_hospital_id,
      p_department: form.department || null,
      p_patient_name: form.patient_name || null,
      p_patient_file: form.patient_file || null,
      p_reason: form.reason || null,
      p_blood_type: form.blood_type,
      p_component: form.component,
      p_quantity: form.quantity,
      p_priority: form.priority,
      p_needed_by: form.needed_by ? new Date(form.needed_by).toISOString() : null,
      p_contact_phone: form.contact_phone || null,
      p_notes: form.notes || null,
    });
    setSaving(false);
    if (createError || !data) {
      setError(createError?.message || 'تعذر إرسال الطلب. ربما تغير المخزون. حدّث القائمة وحاول مجدداً.');
      await refreshSuppliers();
      return;
    }
    const created = data as unknown as BloodRequest;
    setModalOpen(false);
    setSuccess({ code: created.request_code, id: created.id });
    await loadData();
  };

  const handleAction = async () => {
    if (!actionRequest) return;
    const { req, action } = actionRequest;
    setSaving(true);
    setError('');
    const { error: actionError } = await supabase.rpc('process_blood_request', {
      p_request_id: req.id,
      p_action: action,
    });
    setSaving(false);
    if (actionError) {
      setError(actionError.message);
      setActionRequest(null);
      return;
    }
    setActionRequest(null);
    setDetailRequest(null);
    await loadData();
  };

  const exportRequest = (req: BloodRequest) => {
    const rows = [
      ['تقرير طلب الدم', ''], ['رقم الطلب', req.request_code], ['الحالة', REQUEST_STATUS_LABELS[req.status]],
      ['الأولوية', PRIORITY_LABELS[req.priority]], ['المستشفى الطالب', req.requesting_hospital?.name || ''],
      ['المستشفى المورّد', req.supplier_hospital?.name || ''], ['الفصيلة', req.blood_type],
      ['المكوّن', COMPONENT_LABELS[req.component]], ['الكمية', String(req.quantity)], ['القسم', req.department || ''],
      ['المريض', req.patient_name || ''], ['رقم الملف', req.patient_file || ''], ['السبب', req.reason || ''],
      ['وقت الحاجة', formatDateTime(req.needed_by)], ['تاريخ الإنشاء', formatDateTime(req.created_at)],
      ['وقت القبول والحجز', formatDateTime(req.accepted_at)], ['وقت التجهيز', formatDateTime(req.ready_at)],
      ['وقت التسليم', formatDateTime(req.delivered_at)],
    ];
    const csv = '\ufeff' + rows.map(([a,b]) => `"${String(a).replaceAll('"','""')}","${String(b).replaceAll('"','""')}"`).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${req.request_code}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const printRequest = (req: BloodRequest) => {
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${req.request_code}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{color:#b91c1c}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border:1px solid #ddd;padding:10px;text-align:right}.head{display:flex;justify-content:space-between;border-bottom:2px solid #b91c1c;padding-bottom:12px}.muted{color:#666}</style></head><body><div class="head"><div><h1>بنك الدم المركزي</h1><div class="muted">تقرير طلب دم</div></div><strong>${req.request_code}</strong></div><table><tr><th>المستشفى الطالب</th><td>${esc(req.requesting_hospital?.name)}</td></tr><tr><th>المستشفى المورّد</th><td>${esc(req.supplier_hospital?.name)}</td></tr><tr><th>الفصيلة</th><td>${req.blood_type}</td></tr><tr><th>المكوّن</th><td>${esc(COMPONENT_LABELS[req.component])}</td></tr><tr><th>الكمية</th><td>${req.quantity} وحدة</td></tr><tr><th>الأولوية</th><td>${esc(PRIORITY_LABELS[req.priority])}</td></tr><tr><th>القسم</th><td>${esc(req.department)}</td></tr><tr><th>المريض</th><td>${esc(req.patient_name)}</td></tr><tr><th>سبب الطلب</th><td>${esc(req.reason)}</td></tr><tr><th>الحالة</th><td>${esc(REQUEST_STATUS_LABELS[req.status])}</td></tr><tr><th>تاريخ الإنشاء</th><td>${esc(formatDateTime(req.created_at))}</td></tr></table><p style="margin-top:35px">تم إنشاء هذا التقرير من نظام بنك الدم المركزي.</p><script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html); w.document.close();
  };

  const canAct = (req: BloodRequest, action: string) => {
    if (isAdmin) return true;
    if (req.supplier_hospital_id === userHospitalId && ['review', 'accept', 'ready', 'reject', 'deliver'].includes(action)) return true;
    if (req.requesting_hospital_id === userHospitalId && action === 'cancel') return true;
    return false;
  };

  if (loading) return <LoadingSpinner label="جاري تحميل الطلبات..." />;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3"><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
      {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-wrap items-center gap-3"><div className="flex-1"><p className="font-bold text-emerald-800">تم إرسال الطلب بنجاح</p><p className="text-sm text-emerald-700 mt-1">رقم الطلب: <b dir="ltr">{success.code}</b> — تم إشعار المستشفى المورّد.</p></div><button className="btn-secondary" onClick={() => { const r=requests.find(x=>x.id===success.id); if(r) printRequest(r); }}><Printer size={17}/> طباعة الطلب</button><button className="text-emerald-700" onClick={()=>setSuccess(null)}><X size={18}/></button></div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">طلبات الدم</h1><p className="text-sm text-gray-500 mt-1">{visibleRequests.length} طلب ضمن نطاق صلاحيتك</p></div>
        <button onClick={openAdd} className="btn-primary"><Plus size={18}/> طلب دم جديد</button>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><input className="input pr-10" placeholder="بحث برقم الطلب أو المريض أو المستشفى..." value={search} onChange={(e)=>setSearch(e.target.value)}/></div>
        <button className="btn-secondary" onClick={loadData}><RefreshCw size={16}/> تحديث</button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button onClick={()=>setFilterStatus('')} className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${!filterStatus?'bg-red-600 text-white':'bg-white text-gray-600 border border-gray-200'}`}>الكل ({requests.filter((r)=>isAdmin || isManager ? true : r.created_by===profile?.id || r.accepted_by===profile?.id || r.ready_by===profile?.id || r.delivered_by===profile?.id || (r.supplier_hospital_id===userHospitalId && ['new','reviewing'].includes(r.status))).length})</button>
        {Object.entries(REQUEST_STATUS_LABELS).map(([k,v])=>{const count=visibleRequests.filter(r=>r.status===k).length; if(!count)return null; return <button key={k} onClick={()=>setFilterStatus(k)} className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${filterStatus===k?'bg-red-600 text-white':'bg-white text-gray-600 border border-gray-200'}`}>{v} ({count})</button>;})}
      </div>

      {visibleRequests.length===0 ? <div className="card"><EmptyState title="لا توجد طلبات" message="لا توجد عمليات ضمن نطاق صلاحيتك أو مطابقة للبحث."/></div> : <div className="space-y-3">{visibleRequests.map((req)=>{
        const flowIndex=Math.max(0,REQUEST_FLOW.indexOf(req.status));
        return <div key={req.id} className="card p-5 hover:shadow-md transition-shadow"><div className="flex items-start gap-4"><BloodTypeBadge type={req.blood_type} size="lg"/><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-base font-semibold text-gray-900">{req.request_code}</span><span className={`badge ${PRIORITY_COLORS[req.priority]}`}>{PRIORITY_LABELS[req.priority]}</span><span className={`badge ${REQUEST_STATUS_COLORS[req.status]}`}>{REQUEST_STATUS_LABELS[req.status]}</span></div><div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"><InfoRow label="المكوّن" value={COMPONENT_LABELS[req.component]}/><InfoRow label="الكمية" value={`${req.quantity} وحدة`}/><InfoRow label="الطالب" value={req.requesting_hospital?.name || '-'}/><InfoRow label="المورّد" value={req.supplier_hospital?.name || '-'}/></div><div className="mt-3 flex items-center gap-1">{REQUEST_FLOW.map((step,i)=><div key={step} className={`h-1.5 rounded-full transition-all ${i<=flowIndex && !['rejected','cancelled'].includes(req.status)?'bg-red-500 w-8':'bg-gray-200 w-6'}`}/>)}</div></div><div className="flex flex-col gap-2 shrink-0"><button onClick={()=>setDetailRequest(req)} className="btn-secondary text-sm"><Eye size={16}/> تفاصيل</button><button onClick={()=>printRequest(req)} className="btn-secondary text-sm"><Printer size={16}/> طباعة</button><button onClick={()=>exportRequest(req)} className="btn-secondary text-sm"><Download size={16}/> CSV</button></div></div></div>;
      })}</div>}

      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title="طلب دم جديد" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">سيعرض النظام فقط المستشفيات النشطة التي لديها <b>الكمية المطلوبة فعلياً</b> من الفصيلة والمكوّن المحددين.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="المستشفى الطالب">{isAdmin?<select value={form.requesting_hospital_id} onChange={e=>setForm({...form,requesting_hospital_id:e.target.value,supplier_hospital_id:''})} className="select"><option value="">اختر المستشفى</option>{hospitals.filter(h=>h.status==='active').map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>:<input className="input bg-gray-50" value={hospitals.find(h=>h.id===userHospitalId)?.name||''} disabled/>}</Field>
            <Field label="القسم"><input className="input" value={form.department} onChange={e=>setForm({...form,department:e.target.value})} placeholder="مثال: الطوارئ"/></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="فصيلة الدم"><select className="select" value={form.blood_type} onChange={e=>setForm({...form,blood_type:e.target.value as BloodType,supplier_hospital_id:''})}>{BLOOD_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
            <Field label="المكوّن"><select className="select" value={form.component} onChange={e=>setForm({...form,component:e.target.value as BloodComponent,supplier_hospital_id:''})}>{BLOOD_COMPONENTS.map(c=><option key={c} value={c}>{COMPONENT_LABELS[c]}</option>)}</select></Field>
            <Field label="الكمية"><input type="number" min={1} className="input" value={form.quantity} onChange={e=>setForm({...form,quantity:Math.max(1,Number(e.target.value)||1),supplier_hospital_id:''})}/></Field>
          </div>

          <Field label="المستشفى المورّد — حسب التوفر الفعلي">
            {loadingSuppliers ? <div className="input flex items-center gap-2 text-gray-400"><RefreshCw size={16} className="animate-spin"/> جاري فحص المخزون...</div> : suppliers.length===0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">لا يوجد حالياً مستشفى آخر يملك الكمية المطلوبة من هذا المكوّن. جرّب تغيير الفصيلة/المكوّن/الكمية.</div> : <div className="grid gap-2">{suppliers.map(s=><button type="button" key={s.hospital_id} onClick={()=>setForm({...form,supplier_hospital_id:s.hospital_id})} className={`text-right p-3 rounded-xl border transition ${form.supplier_hospital_id===s.hospital_id?'border-red-400 bg-red-50':'border-gray-200 hover:border-red-200'}`}><div className="flex items-center gap-3"><Building2 size={19} className="text-red-500"/><div className="flex-1"><p className="font-semibold text-gray-900">{s.hospital_name}</p><p className="text-xs text-gray-500">{s.city}{s.phone?` · ${s.phone}`:''}</p></div><span className="badge bg-emerald-100 text-emerald-700 border-emerald-200">متاح {s.available_quantity} وحدة</span></div></button>)}</div>}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="اسم المريض"><input className="input" value={form.patient_name} onChange={e=>setForm({...form,patient_name:e.target.value})}/></Field><Field label="رقم ملف المريض"><input className="input" value={form.patient_file} onChange={e=>setForm({...form,patient_file:e.target.value})}/></Field></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="الأولوية"><div className="flex gap-2">{(['normal','urgent','critical'] as RequestPriority[]).map(p=><button type="button" key={p} onClick={()=>setForm({...form,priority:p})} className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border ${form.priority===p?'bg-red-50 text-red-700 border-red-300':'bg-white text-gray-500 border-gray-200'}`}>{PRIORITY_LABELS[p]}</button>)}</div></Field><Field label="وقت الحاجة"><input type="datetime-local" className="input" value={form.needed_by} onChange={e=>setForm({...form,needed_by:e.target.value})}/></Field></div>
          <Field label="سبب الطلب"><input className="input" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="مثال: نزيف حاد"/></Field>
          <Field label="رقم التواصل"><input className="input" value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})}/></Field>
          <Field label="ملاحظات"><textarea className="input min-h-[70px] resize-y" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field>
          <div className="flex gap-3 pt-2"><button onClick={()=>setModalOpen(false)} className="btn-secondary flex-1 justify-center">إلغاء</button><button onClick={handleCreate} disabled={saving||!form.supplier_hospital_id} className="btn-primary flex-1 justify-center">{saving?'جاري الإرسال...':'إرسال الطلب'}</button></div>
        </div>
      </Modal>

      <Modal open={!!detailRequest} onClose={()=>setDetailRequest(null)} title={`تفاصيل الطلب ${detailRequest?.request_code||''}`} size="lg">
        {detailRequest && <div className="space-y-5">
          <div className="flex items-center gap-4"><BloodTypeBadge type={detailRequest.blood_type} size="lg"/><div><p className="text-lg font-semibold text-gray-900">{COMPONENT_LABELS[detailRequest.component]}</p><p className="text-sm text-gray-500">{detailRequest.quantity} وحدة</p></div><div className="flex-1 text-left"><span className={`badge ${PRIORITY_COLORS[detailRequest.priority]}`}>{PRIORITY_LABELS[detailRequest.priority]}</span></div></div>
          <div className="flex items-center gap-1 p-4 bg-gray-50 rounded-xl overflow-x-auto">{REQUEST_FLOW.map((step,i)=>{const current=REQUEST_FLOW.indexOf(detailRequest.status);const reached=i<=current&&!['rejected','cancelled'].includes(detailRequest.status);return <div key={step} className="flex items-center gap-1 flex-1 min-w-[75px]"><div className="flex flex-col items-center gap-1.5"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${reached?'bg-red-500 text-white':'bg-gray-200 text-gray-400'}`}>{i+1}</div><span className={`text-[11px] text-center ${reached?'text-red-600 font-medium':'text-gray-400'}`}>{REQUEST_STATUS_LABELS[step]}</span></div>{i<REQUEST_FLOW.length-1&&<div className={`flex-1 h-0.5 ${reached&&i<current?'bg-red-500':'bg-gray-200'}`}/>}</div>})}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><InfoRow label="المستشفى الطالب" value={detailRequest.requesting_hospital?.name||'-'}/><InfoRow label="المستشفى المورّد" value={detailRequest.supplier_hospital?.name||'-'}/><InfoRow label="القسم" value={detailRequest.department||'-'}/><InfoRow label="اسم المريض" value={detailRequest.patient_name||'-'}/><InfoRow label="رقم الملف" value={detailRequest.patient_file||'-'}/><InfoRow label="سبب الطلب" value={detailRequest.reason||'-'}/><InfoRow label="وقت الحاجة" value={formatDateTime(detailRequest.needed_by)}/><InfoRow label="رقم التواصل" value={detailRequest.contact_phone||'-'}/><InfoRow label="تاريخ الإنشاء" value={formatDateTime(detailRequest.created_at)}/><InfoRow label="منشئ الطلب" value={people[detailRequest.created_by||'']||'-'}/><InfoRow label="الموظف القابل والحاجز" value={people[detailRequest.accepted_by||'']||'-'}/><InfoRow label="موظف التجهيز" value={people[detailRequest.ready_by||'']||'-'}/><InfoRow label="موظف التسليم" value={people[detailRequest.delivered_by||'']||'-'}/><InfoRow label="وقت القبول والحجز" value={formatDateTime(detailRequest.accepted_at)}/><InfoRow label="وقت التجهيز" value={formatDateTime(detailRequest.ready_at)}/><InfoRow label="وقت التسليم" value={formatDateTime(detailRequest.delivered_at)}/></div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">عند القبول يتم حجز الكمية المطلوبة تلقائياً وبشكل ذري، ولا توجد خطوة حجز منفصلة.</div>
          {detailRequest.notes&&<div className="p-3 bg-gray-50 rounded-xl"><p className="text-xs text-gray-400 mb-1">ملاحظات</p><p className="text-sm text-gray-700">{detailRequest.notes}</p></div>}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {detailRequest.status==='new' && canAct(detailRequest,'review') && <><button onClick={()=>setActionRequest({req:detailRequest,action:'review'})} className="btn-primary"><Eye size={16}/> مراجعة</button><button onClick={()=>setActionRequest({req:detailRequest,action:'reject'})} className="btn-danger"><X size={16}/> رفض</button></>}
            {['new','reviewing'].includes(detailRequest.status) && canAct(detailRequest,'accept') && <button onClick={()=>setActionRequest({req:detailRequest,action:'accept'})} className="btn-primary"><PackageCheck size={16}/> قبول وحجز الكمية</button>}
            {detailRequest.status==='reserved' && canAct(detailRequest,'ready') && <button onClick={()=>setActionRequest({req:detailRequest,action:'ready'})} className="btn-primary"><Truck size={16}/> جاهز للتسليم</button>}
            {detailRequest.status==='ready' && canAct(detailRequest,'deliver') && <button onClick={()=>setActionRequest({req:detailRequest,action:'deliver'})} className="btn-primary"><Truck size={16}/> تأكيد التسليم</button>}
            {!['delivered','rejected','cancelled'].includes(detailRequest.status) && canAct(detailRequest,'cancel') && <button onClick={()=>setActionRequest({req:detailRequest,action:'cancel'})} className="btn-danger"><X size={16}/> إلغاء الطلب</button>}
            <button onClick={()=>printRequest(detailRequest)} className="btn-secondary"><Printer size={16}/> طباعة تقرير</button><button onClick={()=>exportRequest(detailRequest)} className="btn-secondary"><Download size={16}/> تصدير CSV</button>
          </div>
        </div>}
      </Modal>

      <ConfirmDialog open={!!actionRequest} onClose={()=>setActionRequest(null)} onConfirm={handleAction} title="تأكيد العملية" message={actionRequest?.action==='accept'?'سيتم قبول الطلب وحجز الكمية المطلوبة تلقائياً ولن يتمكن طلب آخر من استخدام الوحدات المحجوزة. هل تريد المتابعة؟':actionRequest?.action==='deliver'?'سيتم إخراج الوحدات المحجوزة من المخزون وتسجيل عملية التسليم. هل أنت متأكد؟':actionRequest?.action==='reject'?'هل أنت متأكد من رفض الطلب؟':actionRequest?.action==='cancel'?'هل أنت متأكد من إلغاء الطلب؟':'هل تريد تنفيذ هذه العملية؟'} confirmLabel="متابعة" variant={['reject','cancel'].includes(actionRequest?.action||'')?'danger':'warning'}/>
    </div>
  );
}

function Field({label,children}:{label:string;children:ReactNode}){return <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>{children}</div>}
function InfoRow({label,value}:{label:string;value:string}){return <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><p className="text-sm font-medium text-gray-800">{value}</p></div>}
function esc(v:string|null|undefined){return String(v||'-').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]||c));}
