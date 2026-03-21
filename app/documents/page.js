'use client';
import { useState, useEffect } from 'react';
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
  const supabase = createClient();

  const categories = ['All', 'Legal', 'HR', 'Regulatory', 'Finance', 'IP', 'QC', 'SOP'];

  useEffect(() => {
    if (employeeProfile) fetchDocuments();
  }, [employeeProfile]);

  useEffect(() => {
    if (category === 'All') setFilteredDocs(documents);
    else setFilteredDocs(documents.filter(d => d.category === category));
  }, [category, documents]);

  const fetchDocuments = async () => {
    setLoading(true);
    let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
    
    // Only fetch what they are allowed to see
    if (role !== 'admin') {
      query = query.eq('access_level', 'all-staff');
    }

    const { data } = await query;
    setDocuments(data || []);
    setLoading(false);
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
        {role === 'admin' && (
          <button className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm">
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
          <input type="text" placeholder="Search documents..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all" />
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
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">{doc.access_level === 'admin-only' ? 'CONFIDENTIAL' : 'PUBLIC (STAFF)'}</span>
                  <a href={doc.file_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 hover:text-teal-900 transition-colors" title="View Document">
                    <Download className="w-5 h-5" />
                  </a>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  );
}
