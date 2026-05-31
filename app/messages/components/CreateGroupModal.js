import { useState, useEffect } from 'react';
import { X, Users, Hash, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';

export default function CreateGroupModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('group'); // 'group' or 'announcement'
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const supabase = createClient();
  const toast = useToast();

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');
        
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.warn('Group name is required');
    if (selectedIds.length === 0) return toast.warn('Select at least one member');
    
    setIsSubmitting(true);
    
    try {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const { data: me } = await supabase.from('employees').select('id').eq('email', user.email).single();
      if (!me) throw new Error('User not found');

      // 2. Create the chat
      const { data: chatData, error: chatErr } = await supabase
        .from('chats')
        .insert({
          name: name.trim(),
          type: type,
          created_by: me.id
        })
        .select()
        .single();
        
      if (chatErr) throw chatErr;

      // 3. Add members (including creator as admin)
      const membersToInsert = selectedIds.map(id => ({
        chat_id: chatData.id,
        employee_id: id,
        role: 'member'
      }));
      
      // Add self if not selected
      if (!selectedIds.includes(me.id)) {
        membersToInsert.push({
          chat_id: chatData.id,
          employee_id: me.id,
          role: 'admin'
        });
      } else {
        // Find self and make admin
        const selfMember = membersToInsert.find(m => m.employee_id === me.id);
        if (selfMember) selfMember.role = 'admin';
      }

      const { error: membersErr } = await supabase
        .from('chat_members')
        .insert(membersToInsert);
        
      if (membersErr) throw membersErr;

      toast.success(`${type === 'announcement' ? 'Announcement group' : 'Group'} created`);
      onSuccess(chatData);
      
    } catch (err) {
      console.error('Create group error:', err);
      toast.error('Failed to create group: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            {type === 'announcement' ? <Hash className="w-5 h-5 text-indigo-600" /> : <Users className="w-5 h-5 text-navy" />}
            Create {type === 'announcement' ? 'Announcement' : 'Group'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleCreate} className="p-4 md:p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('group')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${type === 'group' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Group Chat
                </button>
                <button
                  type="button"
                  onClick={() => setType('announcement')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${type === 'announcement' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Announcement
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. R&D Team, General Announcements"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none font-semibold text-gray-700"
                required
              />
            </div>
            
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Members *</label>
                <button 
                  type="button" 
                  onClick={() => setSelectedIds(employees.map(e => e.id))}
                  className="text-[9px] font-bold text-navy hover:underline uppercase"
                >
                  Select All
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto bg-gray-50 border border-gray-100 rounded-lg p-2 space-y-1">
                {loading ? (
                  <div className="p-4 text-center text-xs text-gray-400">Loading employees...</div>
                ) : (
                  employees.map(e => (
                    <label key={e.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors text-xs font-semibold text-gray-700">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(e.id)} 
                        onChange={(ev) => {
                          if (ev.target.checked) setSelectedIds([...selectedIds, e.id]);
                          else setSelectedIds(selectedIds.filter(id => id !== e.id));
                        }} 
                        className="rounded text-navy focus:ring-navy flex-shrink-0 w-4 h-4" 
                      />
                      {e.full_name} <span className="text-[9px] text-gray-400 ml-auto uppercase opacity-60 font-black">{e.role}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="px-4 py-2 text-xs font-bold text-white bg-navy rounded-lg hover:bg-navy-hover shadow-sm disabled:opacity-60 min-w-[100px] flex justify-center"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
