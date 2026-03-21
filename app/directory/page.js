'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { User, Phone, Mail, MapPin, Droplets, Search, CreditCard, X, Briefcase, Hash, Calendar, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

function EmployeeIDCard({ emp, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-sm">
        <button onClick={onClose} className="absolute -top-4 -right-4 z-10 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 transition-colors">
          <X className="w-5 h-5 text-slate-600"/>
        </button>
        
        {/* Card */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100">
          {/* Top dark section */}
          <div className="relative bg-slate-800 p-6 pb-8">
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)`,
              backgroundSize: '30px 30px'
            }}/>
            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-yellow-400 font-black text-xs tracking-[0.2em] uppercase">OXYGEN</p>
                <p className="text-yellow-400 font-black text-xs tracking-[0.15em] uppercase">BIOINNOVATIONS</p>
              </div>
              <div className="w-20 h-24 rounded-xl overflow-hidden bg-slate-600 border-2 border-white/20 shadow-lg">
                {emp.photo_url ? (
                  <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                    <User className="w-10 h-10"/>
                  </div>
                )}
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-white" style={{clipPath: 'polygon(0 100%, 100% 100%, 100% 0)'}}/>
          </div>

          {/* Body */}
          <div className="px-6 pt-2 pb-6">
            <h2 className="text-xl font-black text-slate-800 leading-tight tracking-tight uppercase">{emp.full_name}</h2>
            <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-wider">Emp. Code: {emp.employee_code || 'N/A'}</p>
            <p className="text-sm font-bold text-yellow-600 mt-1 uppercase tracking-wide">{emp.designation || emp.role}</p>

            <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
              {emp.phone && <div className="flex items-center text-sm text-slate-600"><Phone className="w-3.5 h-3.5 mr-3 text-slate-400 shrink-0"/><span className="font-medium">{emp.phone}</span></div>}
              {emp.date_of_birth && <div className="flex items-center text-sm text-slate-600"><Calendar className="w-3.5 h-3.5 mr-3 text-slate-400 shrink-0"/><span className="font-medium">{new Date(emp.date_of_birth).toLocaleDateString('en-GB')}</span></div>}
              {emp.blood_group && <div className="flex items-center text-sm text-slate-600"><Droplets className="w-3.5 h-3.5 mr-3 text-red-400 shrink-0"/><span className="font-bold text-red-600">{emp.blood_group}</span></div>}
              {emp.address && <div className="flex items-start text-sm text-slate-600"><MapPin className="w-3.5 h-3.5 mr-3 text-slate-400 shrink-0 mt-0.5"/><span className="font-medium leading-snug">{emp.address}</span></div>}
            </div>

            {/* Extra details */}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center text-xs text-slate-500"><Mail className="w-3 h-3 mr-2"/>{emp.email}</div>
              {emp.emergency_contact_name && <div className="flex items-center text-xs text-slate-500"><AlertCircle className="w-3 h-3 mr-2 text-orange-400"/>{emp.emergency_contact_name} — {emp.emergency_contact}</div>}
              {emp.joined_date && <div className="flex items-center text-xs text-slate-500"><Calendar className="w-3 h-3 mr-2"/>Joined: {new Date(emp.joined_date).toLocaleDateString('en-GB')}</div>}
            </div>
          </div>

          <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex items-center justify-between">
            <div className="text-xs text-slate-400 font-medium">HOSUR – 635130</div>
            <div className="text-xs text-slate-400 font-medium">oxygenbio.com</div>
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
