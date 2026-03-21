'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { User, Phone, Mail, MapPin, Droplets, Search, CreditCard, X, Briefcase, Hash, Calendar, AlertCircle, ShieldCheck, CheckSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

function EmployeeIDCard({ emp, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-sm">
        <button onClick={onClose} className="absolute -top-4 -right-4 z-40 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 transition-colors">
          <X className="w-5 h-5 text-slate-600"/>
        </button>
        
        {/* Modern ID Card Engine */}
        <div className="bg-white rounded-[2rem] p-6 shadow-2xl w-full mx-auto border border-slate-200 flex flex-col items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-36 bg-gradient-to-br from-teal-800 to-cyan-900"/>
          
          {/* Header */}
          <div className="w-full relative z-10 flex justify-between items-start mb-8">
            <div>
              <h3 className="text-white font-black tracking-widest text-sm uppercase">OXYGEN</h3>
              <p className="text-teal-100 font-bold tracking-widest text-[9px] uppercase">Bioinnovations</p>
            </div>
            <div className={`px-2 py-1 backdrop-blur-sm rounded flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border ${
              emp.is_active ? 'bg-white/20 text-white border-white/30' : 'bg-red-500/40 text-white border-red-300/50'
            }`}>
              <CheckSquare className="w-3 h-3"/> {emp.is_active ? 'Active' : 'Inactive'}
            </div>
          </div>

          {/* Profile Core */}
          <div className="relative z-10 w-28 h-28 rounded-2xl overflow-hidden bg-white border-[3px] border-white shadow-lg mb-4">
            {emp.photo_url ? (
              <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-100">
                <User className="w-10 h-10 text-slate-300"/>
              </div>
            )}
          </div>

          <h2 className="text-xl font-black text-slate-800 tracking-tight text-center leading-none mt-2">{emp.full_name}</h2>
          <p className="text-xs font-bold text-teal-700 tracking-widest uppercase mt-2 mb-6 text-center">{emp.designation || emp.role}</p>
          
          <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center mb-2 shadow-inner">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Official Employee Code</p>
            <p className="font-mono text-2xl font-black text-slate-800 tracking-widest">{emp.employee_code || 'PENDING'}</p>
          </div>

          <div className="w-full space-y-2 mt-2 px-2 text-[10px] font-semibold text-slate-500">
            {emp.phone && <p className="flex items-center"><Phone className="w-3 h-3 mr-2" />{emp.phone}</p>}
            {emp.email && <p className="flex items-center"><Mail className="w-3 h-3 mr-2" />{emp.email}</p>}
            {emp.blood_group && <p className="flex items-center"><Droplets className="w-3 h-3 mr-2 text-red-500" />Blood Group: <span className="ml-1 text-red-600 font-bold">{emp.blood_group}</span></p>}
          </div>

          {/* QR Code Section */}
          <div className="w-full mt-4 pt-5 border-t border-slate-100 flex items-center justify-between">
            <div className="text-left pr-4">
              <p className="text-[9px] font-black text-teal-700 uppercase tracking-widest mb-1.5 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Global Audit Tag</p>
              <p className="text-[10px] font-bold text-slate-500 leading-relaxed">Scan to securely verify identity & access.</p>
            </div>
            <div className="p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm shrink-0">
              <QRCodeSVG value={`https://app-oxybio.vercel.app/verify/${emp.id}`} size={64} level="M" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function DirectoryPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (authLoading) return; // Wait for auth to resolve before checking permissions
    if (isAdmin === false) { router.push('/dashboard'); return; }
    fetchEmployees();
  }, [isAdmin, authLoading]);

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('full_name');
    setEmployees(data || []);
    setLoading(false);
  };

  const filtered = employees.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase()) ||
    e.designation?.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Employee Directory</h1>
        <p className="text-slate-500 font-medium mt-1">{employees.length} active team members</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/>
        <input
          type="text"
          placeholder="Search by name, department, code..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-4 glass-card rounded-2xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-slate-400"
        />
      </div>

      {/* Employee Cards Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <User className="w-16 h-16 mx-auto mb-4 opacity-30"/>
          <p className="font-bold text-lg">No employees found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(emp => (
            <div key={emp.id} className="glass-card rounded-[1.75rem] p-6 flex flex-col gap-4 cursor-pointer" onClick={() => setSelected(emp)}>
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-teal-100 to-cyan-100 border border-white shadow-sm shrink-0">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-teal-600 font-black text-lg">
                      {(() => {
                        const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
                        const parts = emp.full_name?.split(' ') || [];
                        const startIdx = (parts.length > 1 && titles.includes(parts[0])) ? 1 : 0;
                        return parts.slice(startIdx, startIdx + 2).map(n => n[0]).join('').toUpperCase();
                      })()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 truncate leading-tight">{emp.full_name}</p>
                  <p className="text-xs font-bold text-teal-600 mt-0.5">{emp.designation || emp.role}</p>
                  <p className="text-xs text-slate-400 font-medium">{emp.department}</p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-500 border-t border-white/40 pt-4">
                {emp.employee_code && <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-slate-400"/><span className="font-bold">{emp.employee_code}</span></div>}
                <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400"/><span className="truncate">{emp.email}</span></div>
                {emp.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400"/>{emp.phone}</div>}
                {emp.blood_group && <div className="flex items-center gap-2"><Droplets className="w-3.5 h-3.5 text-red-400"/><span className="font-bold text-red-600">{emp.blood_group}</span></div>}
              </div>

              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/60 hover:bg-white rounded-xl text-xs font-black text-teal-700 border border-white transition-all">
                <CreditCard className="w-3.5 h-3.5"/> View ID Card
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Full ID Card Modal */}
      {selected && <EmployeeIDCard emp={selected} onClose={() => setSelected(null)}/>}
    </div>
  );
}
