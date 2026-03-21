'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, CheckCircle, AlertTriangle, ExternalLink, Mail } from 'lucide-react';

export default function SOPLibraryPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) fetchSOPs();
  }, [employeeProfile]);

  const fetchSOPs = async () => {
    setLoading(true);
    let query = supabase.from('sop_library').select('*, sop_acknowledgements(employee_id)').eq('is_active', true);
    
    if (role === 'admin') {
      // Fetch all employess to compare acknowledgement
      const { data: employees } = await supabase.from('employees').select('id, full_name, role').eq('is_active', true);
      // Admin dashboard will map this out
    }
    
    const { data } = await query;
    
    // Map acknowledgement status for current user
    const mappedSops = (data || []).map(sop => {
      const isAck = sop.sop_acknowledgements.some(ack => ack.employee_id === employeeProfile.id);
      return { ...sop, is_acknowledged: isAck };
    });
    
    setSops(mappedSops);
    setLoading(false);
  };

  const acknowledgeSOP = async (sopId) => {
    const { error } = await supabase.from('sop_acknowledgements').insert({
      sop_id: sopId,
      employee_id: employeeProfile.id
    });
    
    if (!error) {
      fetchSOPs();
    }
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading SOP Library...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Standard Operating Procedures</h1>
        <p className="text-gray-500 mt-1">Official lab protocols. Please read and acknowledge all newer versions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sops.map(sop => (
          <div key={sop.id} className={`bg-white rounded-2xl border p-6 flex flex-col shadow-sm transition-all ${!sop.is_acknowledged ? 'border-amber-300 ring-1 ring-amber-300' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono text-sm font-bold tracking-widest text-teal-800 bg-teal-50 px-2 py-0.5 rounded">{sop.sop_id}</span>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{sop.category}</span>
            </div>
            
            <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">{sop.title}</h3>
            
            <div className="flex gap-4 mb-6">
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Version</span>
                <span className="text-sm font-semibold text-gray-700">{sop.version}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Effective Date</span>
                <span className="text-sm font-semibold text-gray-700">{sop.effective_date ? new Date(sop.effective_date).toLocaleDateString() : 'Draft'}</span>
              </div>
            </div>

            <div className="flex justify-between items-end mt-auto pt-4 border-t border-gray-100">
              <div className="flex items-center">
                {sop.is_acknowledged ? (
                  <div className="flex items-center text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span className="text-xs font-bold uppercase tracking-wider">Read and Signed</span>
                  </div>
                ) : (
                  <div className="flex items-center text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 animate-pulse">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    <span className="text-xs font-bold uppercase tracking-wider">Unread</span>
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <a href={sop.document_url || '#'} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors border border-transparent hover:border-teal-100">
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>

            {!sop.is_acknowledged && (
              <button onClick={() => acknowledgeSOP(sop.id)} className="w-full mt-4 bg-teal-800 text-white font-medium text-sm py-2.5 rounded-lg hover:bg-teal-900 shadow-sm transition-colors uppercase tracking-wider">
                Acknowledge Receipt
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
