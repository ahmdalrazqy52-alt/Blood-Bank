import { useEffect,useState,useCallback } from 'react';
import { Plus, Search, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { BloodUnit,Hospital,BloodType,BloodComponent } from '@/lib/types';
import { BLOOD_TYPES,BLOOD_COMPONENTS,COMPONENT_LABELS,UNIT_STATUS_LABELS } from '@/lib/types';
import { UNIT_STATUS_COLORS,daysUntilExpiry,getExpiryLevel } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import BloodTypeBadge from '@/components/BloodTypeBadge';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

export default function Inventory(){
 const {profile}=useAuth(); const [loading,setLoading]=useState(true); const [units,setUnits]=useState<BloodUnit[]>([]);
 const [hospitals,setHospitals]=useState<Hospital[]>([]); const [modal,setModal]=useState(false); const [edit,setEdit]=useState<BloodUnit|null>(null);
 const [discard,setDiscard]=useState<BloodUnit|null>(null); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const [filters,setFilters]=useState({search:'',bloodType:'',component:'',hospitalId:'',status:''});
 const userHospitalId=profile?.hospital_id||''; const isAdmin=profile?.role==='admin'; const canDiscard=isAdmin||profile?.role==='manager';
 const [form,setForm]=useState({hospital_id:'',blood_type:'O+' as BloodType,component:'Whole Blood' as BloodComponent,collection_date:new Date().toISOString().slice(0,10),expiry_date:'',storage_location:'',notes:''});

 const load=useCallback(async()=>{setLoading(true); await supabase.rpc('mark_expired_blood_units'); const [u,h]=await Promise.all([
   supabase.from('blood_units').select('*,hospital:hospitals(*)').order('expiry_date',{ascending:true}),supabase.from('hospitals').select('*').order('name')
 ]);setUnits((u.data||[]) as BloodUnit[]);setHospitals(h.data||[]);setLoading(false)},[]);
 useEffect(()=>{load()},[load]);

 const filtered=units.filter(u=>(!filters.search||u.unit_code.toLowerCase().includes(filters.search.toLowerCase()))&&(!filters.bloodType||u.blood_type===filters.bloodType)&&(!filters.component||u.component===filters.component)&&(!filters.hospitalId||u.hospital_id===filters.hospitalId)&&(!filters.status||u.status===filters.status));
 const openAdd=()=>{setEdit(null);setError('');setForm({hospital_id:isAdmin?(hospitals[0]?.id||''):userHospitalId,blood_type:'O+',component:'Whole Blood',collection_date:new Date().toISOString().slice(0,10),expiry_date:'',storage_location:'',notes:''});setModal(true)};
 const openEdit=(u:BloodUnit)=>{setEdit(u);setError('');setForm({hospital_id:u.hospital_id,blood_type:u.blood_type,component:u.component,collection_date:u.collection_date,expiry_date:u.expiry_date,storage_location:u.storage_location||'',notes:u.notes||''});setModal(true)};
 const save=async()=>{if(!form.hospital_id||!form.expiry_date){setError('أكمل الحقول المطلوبة');return}setSaving(true);setError('');
   const {error}=await supabase.rpc('save_blood_unit',{p_id:edit?.id||null,p_hospital_id:form.hospital_id,p_blood_type:form.blood_type,p_component:form.component,p_collection_date:form.collection_date,p_expiry_date:form.expiry_date,p_storage_location:form.storage_location||null,p_notes:form.notes||null});
   if(error)setError(error.message);else{setModal(false);await load()}setSaving(false)
 };
 const doDiscard=async()=>{if(!discard)return;setSaving(true);const {error}=await supabase.rpc('discard_blood_unit',{p_id:discard.id,p_reason:'إتلاف يدوي من النظام'});if(error)window.alert(error.message);setDiscard(null);setSaving(false);load()};

 if(loading)return <LoadingSpinner label="جاري تحميل المخزون..."/>;
 return <div className="space-y-6">
  <div className="flex justify-between items-center flex-wrap gap-3"><div><h1 className="text-2xl font-bold">مخزون الدم</h1><p className="text-sm text-gray-500 mt-1">{filtered.length} وحدة — مرتب حسب FEFO</p></div><button onClick={openAdd} className="btn-primary"><Plus size={18}/> إضافة وحدة دم</button></div>
  <div className="card p-4"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
   <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><input className="input pr-10" placeholder="بحث برمز الوحدة..." value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/></div>
   <select className="select" value={filters.bloodType} onChange={e=>setFilters({...filters,bloodType:e.target.value})}><option value="">كل الفصائل</option>{BLOOD_TYPES.map(t=><option key={t}>{t}</option>)}</select>
   <select className="select" value={filters.component} onChange={e=>setFilters({...filters,component:e.target.value})}><option value="">كل المكونات</option>{BLOOD_COMPONENTS.map(c=><option key={c}>{COMPONENT_LABELS[c]}</option>)}</select>
   {isAdmin&&<select className="select" value={filters.hospitalId} onChange={e=>setFilters({...filters,hospitalId:e.target.value})}><option value="">كل المستشفيات</option>{hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>}
   <select className="select" value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">كل الحالات</option>{Object.entries(UNIT_STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
  </div></div>
  <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-gray-50 border-b border-gray-100">
   {['رمز الوحدة','الفصيلة','المكوّن','المستشفى','الجمع','الانتهاء','الحالة','إجراءات'].map((x,i)=><th key={x} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{i===3&&!isAdmin?'':x}</th>)}
  </tr></thead><tbody className="divide-y divide-gray-50">{filtered.map(u=>{const d=daysUntilExpiry(u.expiry_date);const level=getExpiryLevel(d);return <tr key={u.id} className="hover:bg-gray-50">
   <td className="px-4 py-3 text-sm font-semibold">{u.unit_code}</td><td className="px-4 py-3"><BloodTypeBadge type={u.blood_type} size="sm"/></td><td className="px-4 py-3 text-sm">{COMPONENT_LABELS[u.component]}</td>
   <td className="px-4 py-3 text-sm">{isAdmin?u.hospital?.name:''}</td><td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.collection_date)}</td>
   <td className="px-4 py-3 text-sm"><span className={level==='expired'?'font-bold text-red-700':level==='danger'?'text-red-600':level==='warning'?'text-amber-600':'text-gray-600'}>{formatDate(u.expiry_date)}</span>{d<=7&&<span className="block text-xs text-gray-400">{d<0?'منتهية':d===0?'اليوم':`${d} يوم`}</span>}</td>
   <td className="px-4 py-3"><span className={`badge ${UNIT_STATUS_COLORS[u.status]}`}>{UNIT_STATUS_LABELS[u.status]}</span></td>
   <td className="px-4 py-3"><div className="flex gap-1">{(u.status==='available'||u.status==='expired')&&<button onClick={()=>openEdit(u)} className="p-2 hover:bg-gray-100 rounded-lg"><Pencil size={16}/></button>}{canDiscard&&(u.status==='available'||u.status==='expired')&&<button onClick={()=>setDiscard(u)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={16}/></button>}</div></td>
  </tr>})}</tbody></table></div>{filtered.length===0&&<EmptyState title="لا توجد وحدات" message="لا توجد نتائج مطابقة"/>}</div>
  <Modal open={modal} onClose={()=>setModal(false)} title={edit?'تعديل وحدة دم':'إضافة وحدة دم'} size="lg"><div className="space-y-4">
   {!edit&&<div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">سيتم توليد رمز الوحدة تلقائياً لمنع التكرار.</div>}
   <div className="grid sm:grid-cols-2 gap-4"><Field label="المستشفى">{isAdmin?<select className="select" value={form.hospital_id} onChange={e=>setForm({...form,hospital_id:e.target.value})}>{hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>:<input className="input bg-gray-50" value={hospitals.find(h=>h.id===userHospitalId)?.name||''} disabled/>}</Field>
   <Field label="الفصيلة"><select className="select" value={form.blood_type} onChange={e=>setForm({...form,blood_type:e.target.value as BloodType})}>{BLOOD_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field></div>
   <div className="grid sm:grid-cols-2 gap-4"><Field label="المكوّن"><select className="select" value={form.component} onChange={e=>setForm({...form,component:e.target.value as BloodComponent})}>{BLOOD_COMPONENTS.map(c=><option key={c}>{COMPONENT_LABELS[c]}</option>)}</select></Field>
   <Field label="تاريخ الجمع"><input type="date" className="input" value={form.collection_date} onChange={e=>setForm({...form,collection_date:e.target.value})}/></Field></div>
   <Field label="تاريخ الانتهاء"><input type="date" className="input" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}/></Field>
   <Field label="مكان التخزين"><input className="input" value={form.storage_location} onChange={e=>setForm({...form,storage_location:e.target.value})}/></Field>
   <Field label="ملاحظات"><textarea className="input min-h-20" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field>
   {error&&<div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm flex gap-2"><AlertTriangle size={17}/>{error}</div>}
   <div className="flex gap-3"><button onClick={()=>setModal(false)} className="btn-secondary flex-1 justify-center">إلغاء</button><button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">{saving?'جاري الحفظ...':'حفظ'}</button></div>
  </div></Modal>
  <ConfirmDialog open={!!discard} onClose={()=>setDiscard(null)} onConfirm={doDiscard} title="إتلاف وحدة الدم" message={`سيتم تغيير حالة ${discard?.unit_code} إلى «مُتلف» ولن يتم حذف سجلها. هل تريد المتابعة؟`} confirmLabel="إتلاف" variant="danger"/>
 </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>{children}</div>}
