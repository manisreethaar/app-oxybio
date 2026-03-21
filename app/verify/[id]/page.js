import { createClient } from '@supabase/supabase-js';
import { CheckCircle, XCircle, ShieldCheck, Mail, Phone, Calendar } from 'lucide-react';

// Force dynamic rendering if needed, but since [id] changes, Next.js handles it
export const dynamic = 'force-dynamic';

export default async function VerifyEmployeePage({ params }) {
  const { id } = params;

  // Use the admin service key to securely bypass RLS on the server
  // This ensures the public internet cannot scrape the employees table, but CAN see exactly one ID if they have the secure hash.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: emp, error } = await supabaseAdmin
    .from('employees')
    .select('id, full_name, employee_code, role, designation, is_active, photo_url, joined_date')
    .eq('id', id)
    .single();

  if (error || !emp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl border border-slate-100">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Verification Failed</h1>
          <p className="text-slate-500 font-medium">This ID does not match any active record in the Oxygen Bioinnovations registry.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex py-12 px-6 sm:justify-center overflow-auto">
      <div className="w-full max-w-sm space-y-6">
        
        {/* Animated Success Badge */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-center text-emerald-800 shadow-sm animate-in fade-in slide-in-from-top-4">
          <ShieldCheck className="w-5 h-5 mr-2 shrink-0" />
          <span className="font-bold text-sm tracking-wide">Official Oxygen Bioinnovations Credentials</span>
        </div>

        {/* ID Card Display */}
        <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-500">
          {/* Header */}
          <div className="bg-gradient-to-br from-teal-800 to-teal-950 p-6 flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full translate-x-1/2 -translate-y-1/2 blur-2xl"></div>
            
            {emp.photo_url ? (
              <img src={emp.photo_url} alt="Profile" className="w-28 h-28 rounded-full border-4 border-white/20 shadow-xl object-cover z-10" />
            ) : (
              <div className="w-28 h-28 rounded-full border-4 border-white/20 bg-white/10 flex items-center justify-center shadow-xl z-10 backdrop-blur-sm">
                <ShieldCheck className="w-10 h-10 text-white/50" />
              </div>
            )}
            
            <div className="mt-4 text-center z-10">
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight">{emp.full_name}</h2>
              <p className="text-teal-200 font-medium text-sm mt-1">{emp.designation || emp.role.toUpperCase()}</p>
            </div>
          </div>

          {/* Details */}
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Status</span>
              {emp.is_active ? (
                <span className="flex items-center text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                  <CheckCircle className="w-4 h-4 mr-1.5" /> Active
                </span>
              ) : (
                <span className="flex items-center text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-lg">
                  <XCircle className="w-4 h-4 mr-1.5" /> Suspended
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center text-sm text-slate-600">
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mr-3 border border-slate-100">
                  <span className="font-bold text-slate-400">ID</span>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Employee Code</p>
                  <p className="font-bold text-slate-800">{emp.employee_code || 'Pending'}</p>
                </div>
              </div>

              <div className="flex items-center text-sm text-slate-600">
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mr-3 border border-slate-100">
                  <Calendar className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Since</p>
                  <p className="font-bold text-slate-800">{emp.joined_date ? new Date(emp.joined_date).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 text-center text-xs font-medium text-slate-400 border-t border-slate-100">
            Scanning this code guarantees real-time verification from the OxyOS registry.
          </div>
        </div>
      </div>
    </div>
  );
}
