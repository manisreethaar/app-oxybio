'use client';
import { useState, useEffect, useMemo } from 'react';
import { X, Users, Hash, Loader2, User } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

export default function CreateGroupModal({ onClose, onSuccess, isAdmin }) {
  const { employeeProfile } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState('individual'); // 'individual', 'group' or 'announcement'
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = useMemo(() => createClient(), []);
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
      // Filter out self so you don't start a chat with yourself
      setEmployees((data || []).filter(e => e.id !== employeeProfile?.id));
    } catch (err) {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (type !== 'individual' && !name.trim()) return toast.warn('Group name is required');
    if (selectedIds.length === 0) return toast.warn('Select at least one member');
    if (type === 'individual' && selectedIds.length !== 1) return toast.warn('Select exactly one person for individual chat');

    setIsSubmitting(true);

    try {
      if (!employeeProfile) throw new Error('User not found');
      const me = employeeProfile;

      // For individual chats, check if one already exists to avoid duplicates
      if (type === 'individual') {
        const otherId = selectedIds[0];

        // Fetch all individual chats the current user belongs to (no .single() — could be many)
        const { data: myMemberships } = await supabase
          .from('chat_members')
          .select('chat_id')
          .eq('employee_id', me.id);

        if (myMemberships && myMemberships.length > 0) {
          const myChats = myMemberships.map(m => m.chat_id);

          // Fetch all individual chats in that set (returns array, not single)
          const { data: candidateChats } = await supabase
            .from('chats')
            .select('*, members:chat_members(employee_id, employees(full_name))')
            .eq('type', 'individual')
            .in('id', myChats);

          // Find the one where the other person is also a member
          const existing = (candidateChats || []).find(chat =>
            chat.members?.some(m => m.employee_id === otherId)
          );

          if (existing) {
            toast.success('Opening existing chat');
            onSuccess(existing);
            return;
          }
        }
      }

      // Create the chat
      const { data: chatData, error: chatErr } = await supabase
        .from('chats')
        .insert({
          name: type === 'individual' ? null : name.trim(),
          type: type,
          created_by: me.id
        })
        .select()
        .single();

      if (chatErr) throw chatErr;

      // Add members (including creator as admin for groups)
      const membersToInsert = selectedIds.map(id => ({
        chat_id: chatData.id,
        employee_id: id,
        role: 'member'
      }));

      // Add self if not already in the list
      if (!selectedIds.includes(me.id)) {
        membersToInsert.push({
          chat_id: chatData.id,
          employee_id: me.id,
          role: type === 'individual' ? 'member' : 'admin'
        });
      } else {
        const selfMember = membersToInsert.find(m => m.employee_id === me.id);
        if (selfMember && type !== 'individual') selfMember.role = 'admin';
      }

      const { error: membersErr } = await supabase
        .from('chat_members')
        .insert(membersToInsert);

      if (membersErr) throw membersErr;

      // Fetch the full chat object with members so the sidebar can display it correctly
      const { data: fullChat } = await supabase
        .from('chats')
        .select('*, members:chat_members(employee_id, employees!chat_members_employee_id_fkey(full_name))')
        .eq('id', chatData.id)
        .single();

      toast.success(type === 'individual' ? 'Chat created' : `${type === 'announcement' ? 'Announcement group' : 'Group'} created`);
      onSuccess(fullChat || chatData);

    } catch (err) {
      console.error('Create chat error:', err);
      toast.error('Failed to create chat: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            {type === 'individual' ? <User className="w-5 h-5 text-slate-600" /> : (type === 'announcement' ? <Hash className="w-5 h-5 text-slate-600" /> : <Users className="w-5 h-5 text-navy" />)}
            New Chat
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-4 md:p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Type</label>
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => { setType('individual'); setSelectedIds([]); }}
                  className={`flex-1 min-w-[30%] py-2 text-xs font-bold rounded-lg border transition-colors ${type === 'individual' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  Direct Message
                </button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setType('group'); setSelectedIds([]); }}
                      className={`flex-1 min-w-[30%] py-2 text-xs font-bold rounded-lg border transition-colors ${type === 'group' ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      Group Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => { setType('announcement'); setSelectedIds([]); }}
                      className={`flex-1 min-w-[30%] py-2 text-xs font-bold rounded-lg border transition-colors ${type === 'announcement' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      Announcement
                    </button>
                  </>
                )}
              </div>
            </div>

            {type !== 'individual' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Group Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. R&D Team, General Announcements"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none font-semibold text-slate-700"
                  required={type !== 'individual'}
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Select {type === 'individual' ? 'User' : 'Members'} *</label>
                {type !== 'individual' && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(employees.map(e => e.id))}
                    className="text-xs font-bold text-navy hover:underline uppercase"
                  >
                    Select All
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto bg-slate-50 border border-slate-100 rounded-lg p-2 space-y-1">
                {loading ? (
                  <div className="p-4 text-center text-xs text-slate-400">Loading employees...</div>
                ) : employees.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No other employees found.</div>
                ) : (
                  employees.map(e => (
                    <label key={e.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors text-xs font-semibold text-slate-700">
                      <input
                        type={type === 'individual' ? 'radio' : 'checkbox'}
                        name="employee_select"
                        checked={selectedIds.includes(e.id)}
                        onChange={(ev) => {
                          if (type === 'individual') {
                            setSelectedIds([e.id]);
                          } else {
                            if (ev.target.checked) setSelectedIds([...selectedIds, e.id]);
                            else setSelectedIds(selectedIds.filter(id => id !== e.id));
                          }
                        }}
                        className="rounded text-navy focus:ring-navy flex-shrink-0 w-4 h-4"
                      />
                      {e.full_name} <span className="text-xs text-slate-400 ml-auto uppercase opacity-60 font-black">{e.role}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-white bg-navy rounded-lg hover:bg-navy-hover shadow-sm disabled:opacity-60 min-w-[100px] flex justify-center"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start Chat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
