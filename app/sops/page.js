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

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', category: 'QC', version: '1.0', file: null });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (employeeProfile) fetchSOPs();
  }, [employeeProfile]);

  const fetchSOPs = async () => {
    setLoading(true);
    let query = supabase.from('sop_library').select('*, sop_acknowledgements(employee_id)').eq('is_active', true);
    const { data } = await query;
    
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
    if (!error) fetchSOPs();
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) return alert("Please select a file.");
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error);

      const { error: dbError } = await supabase.from('sop_library').insert({
        sop_id: `SOP-${Math.floor(1000 + Math.random() * 9000)}`,
        title: uploadForm.title,
        category: uploadForm.category,
        version: uploadForm.version,
        document_url: uploadData.url,
        is_active: true
      });

      if (dbError) throw dbError;
      
      setShowUploadModal(false);
      setUploadForm({ title: '', category: 'QC', version: '1.0', file: null });
      fetchSOPs();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading SOP Library...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Standard Operating Procedures</h1>
          <p className="text-gray-500 mt-1">Official lab protocols. Please read and acknowledge all newer versions.</p>
        </div>
        {role === 'admin' && (
          <button onClick={() => setShowUploadModal(true)} className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm">
            Upload Document
          </button>
        )}
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

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 relative shadow-2xl">
            <button onClick={() => setShowUploadModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">×</button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload SOP / Document</h2>
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
                <input required type="text" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none" placeholder="e.g. Tank Sanitation Protocol" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={uploadForm.category} onChange={e => setUploadForm({...uploadForm, category: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                    <option value="Fermentation">Fermentation</option>
                    <option value="QC">QC</option>
                    <option value="Sanitation">Sanitation</option>
                    <option value="Safety">Safety</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input required type="text" value={uploadForm.version} onChange={e => setUploadForm({...uploadForm, version: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none" placeholder="1.0" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF Document</label>
                <input required type="file" accept=".pdf,.doc,.docx" onChange={e => setUploadForm({...uploadForm, file: e.target.files[0]})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 outline-none bg-gray-50 text-sm" />
              </div>

              <button disabled={uploading} type="submit" className="w-full bg-teal-800 text-white font-bold py-3 mt-4 rounded-xl hover:bg-teal-900 transition-colors disabled:opacity-50">
                {uploading ? 'Uploading securely...' : 'Upload & Publish to Library'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
