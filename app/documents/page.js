'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { FileText, Download, AlertTriangle, Plus, Search, Archive } from 'lucide-react';
import { differenceInDays } from 'date-fns';

export default function DocumentsPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [filteredDocs, setFilteredDocs] = useState([]);
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // SEARCH STATE

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, 'Title required'),
      category: z.string().min(1, 'Category required'),
      version: z.string().min(1, 'Version required'),
      access_level: z.enum(['all-staff', 'management-only', 'admin-only']),
      file: z.any()
    })),
    defaultValues: { title: '', category: 'Legal', version: '1.0', access_level: 'all-staff', file: null }
  });
  const supabase = useMemo(() => createClient(), []);


  const categories = ['All', 'Legal', 'HR', 'Regulatory', 'Finance', 'IP', 'QC', 'SOP'];

  useEffect(() => {
    if (employeeProfile) fetchDocuments();
  }, [employeeProfile, category]);

  // Client-Side Search Filter
  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const filtered = documents.filter(doc => 
      doc.title?.toLowerCase().includes(query) || 
      doc.category?.toLowerCase().includes(query)
    );
    setFilteredDocs(filtered);
  }, [searchQuery, documents]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let query = supabase.from('documents').select('*, employees(full_name)');
      if (category !== 'All') { query = query.eq('category', category); }
      if (!['admin', 'ceo', 'cto'].includes(role)) { query = query.eq('access_level', 'all-staff'); }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
      setFilteredDocs(data || []);
    } catch (err) {
      console.error('Fetch documents error:', err);
    } finally {
      setLoading(false);
    }
  };


  const handleUploadSubmit = async (data) => {
    if (!data.file || data.file.length === 0) return alert("Please select a file.");
    setUploading(true);
    
    const fetchWithTimeout = (url, options, timeout = 30000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network request timed out')), timeout))
      ]);
    };

    try {
      const formData = new FormData();
      formData.append('file', data.file[0]);
      formData.append('folder', 'document_vault');
      
      const uploadRes = await fetchWithTimeout('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error("File upload failed.");
      const uploadData = await uploadRes.json();

      const res = await fetchWithTimeout('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          category: data.category,
          version: data.version,
          access_level: data.access_level,
          file_url: uploadData.url || uploadData.download_url
        })
      });
      
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to sync document metadata');
      
      setShowUploadModal(false);
      reset();
      fetchDocuments();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const getExpiryWarning = (expiryDate) => {
    if (!expiryDate) return null;
    const days = differenceInDays(new Date(expiryDate), new Date());
    if (days < 0) return { text: 'Expired', color: 'text-red-600 bg-red-100' };
    if (days < 30) return { text: `Expires in ${days} days`, color: 'text-amber-600 bg-amber-100' };
    return null;
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading documents...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Document Vault</h1>
          <p className="text-gray-500 mt-1">Secure repository for GMP guidelines, regulatory filings, and company policies.</p>
        </div>
        {['admin', 'ceo', 'cto'].includes(role) && (
          <button onClick={() => setShowUploadModal(true)} className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm">
            <Plus className="w-5 h-5 mr-1" /> Upload Document
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
        <div className="flex space-x-1 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${category === c ? 'bg-teal-50 text-teal-800' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search documents..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocs.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white border border-gray-200 rounded-2xl shadow-sm text-gray-500">
            <Archive className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No documents found</h3>
            <p>There are no documents in the &apos;{category}&apos; category.</p>
          </div>
        ) : (
          filteredDocs.map(doc => {
            const warning = getExpiryWarning(doc.expiry_date);
            return (
              <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col shadow-sm transition-shadow hover:shadow-md relative overflow-hidden group">
                <div className={`absolute top-0 right-0 w-2 h-full ${doc.access_level === 'admin-only' ? 'bg-amber-400' : 'bg-teal-500'}`}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold tracking-wider bg-gray-100 text-gray-600 uppercase border border-gray-200">{doc.category}</span>
                  {warning && (
                    <span className={`px-2 py-1 rounded flex items-center text-xs font-bold ${warning.color}`}>
                      <AlertTriangle className="w-3 h-3 mr-1" /> {warning.text}
                    </span>
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-teal-800 transition-colors line-clamp-2">{doc.title}</h3>
                
                <div className="text-sm text-gray-500 space-y-1 mb-6 mt-2 flex-1">
                  <p>Version <span className="font-semibold text-gray-700">{doc.version || '1.0'}</span></p>
                  <p>Effective: {doc.effective_date ? new Date(doc.effective_date).toLocaleDateString() : 'N/A'}</p>
                  <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wider mt-2">Uploaded By: <span className="text-gray-700">{doc.employees?.full_name || 'System / Admin'}</span></p>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">{doc.access_level === 'admin-only' ? 'CONFIDENTIAL' : 'PUBLIC (STAFF)'}</span>
                  {doc.file_url ? (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 hover:text-teal-900 transition-colors" title="View Document">
                      <Download className="w-5 h-5" />
                    </a>
                  ) : (
                    <button disabled className="flex items-center justify-center w-10 h-10 bg-gray-50 text-gray-400 rounded-full cursor-not-allowed" title="No Document Attached">
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 relative shadow-2xl">
            <button onClick={() => setShowUploadModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">×</button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Document to Vault</h2>
            
            <form onSubmit={handleSubmit(handleUploadSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
                <input type="text" {...register('title')} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none" placeholder="e.g. Q3 Financial Report" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select {...register('category')} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                    {categories.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input type="text" {...register('version')} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none" placeholder="1.0" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Level</label>
                <select {...register('access_level')} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                  <option value="all-staff">Public (All Staff)</option>
                  <option value="admin-only">Confidential (Admin Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document File</label>
                <input type="file" accept=".pdf,.doc,.docx,.csv,.xlsx,.xls" {...register('file')} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 outline-none bg-gray-50 text-sm" />
              </div>

              <button disabled={uploading} type="submit" className="w-full bg-teal-800 text-white font-bold py-3 mt-4 rounded-xl hover:bg-teal-900 transition-colors disabled:opacity-50">
                {uploading ? 'Uploading securely...' : 'Upload & Commit to Vault'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
