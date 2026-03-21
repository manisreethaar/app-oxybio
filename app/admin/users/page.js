'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { UserPlus, UserCog, ShieldCheck, Mail, Loader2, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UsersPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (role === 'admin') fetchUsers();
    else if (!authLoading && role !== 'admin') router.push('/dashboard');
  }, [role, authLoading]);

  const fetchUsers = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('employees').select('*').order('created_at', { ascending: true });
    setEmployees(data || []);
    setLoading(false);
  };

  const deactivateUser = async (id, currentStatus) => {
    if (id === employeeProfile.id) {
      return alert("You cannot deactivate your own account.");
    }
    const supabase = createClient();
    await supabase.from('employees').update({ is_active: !currentStatus }).eq('id', id);
    fetchUsers();
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading directory...</div>;
  if (role !== 'admin') return null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Team Directory</h1>
          <p className="text-gray-500 mt-1">Manage platform access, roles, and profiles for Oxygen Bioinnovations staff.</p>
        </div>
        <button className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm">
          <UserPlus className="w-5 h-5 mr-2" /> Invite Employee
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee Name / Email</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department & Role</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined Date</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {employees.map((emp) => (
                <tr key={emp.id} className={`hover:bg-gray-50 transition-colors ${!emp.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-full flex justify-center items-center text-sm font-bold mr-4 shrink-0 ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                        {emp.full_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{emp.full_name} {employeeProfile.id === emp.id && <span className="ml-2 text-[10px] bg-green-100 text-green-800 px-1 py-0.5 rounded">YOU</span>}</div>
                        <div className="text-sm text-gray-500 flex items-center mt-0.5"><Mail className="w-3 h-3 mr-1" /> {emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 font-medium">{emp.department}</div>
                    <div className="flex items-center mt-1">
                      {emp.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 mr-1 text-purple-600" />}
                      <span className={`text-xs font-bold uppercase tracking-wider ${emp.role === 'admin' ? 'text-purple-700' : 'text-teal-600'}`}>{emp.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                    {emp.joined_date ? new Date(emp.joined_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2.5 py-1 inline-flex text-xs font-bold uppercase tracking-wider rounded-md border ${emp.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                      {emp.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium space-x-2">
                    <button className="text-gray-400 hover:text-teal-600 p-2 rounded-lg hover:bg-teal-50 transition-colors outline-none" title="Edit Profile">
                      <UserCog className="w-5 h-5" />
                    </button>
                    {employeeProfile.id !== emp.id && (
                      <button onClick={() => deactivateUser(emp.id, emp.is_active)} className={`${emp.is_active ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'} p-2 rounded-lg transition-colors outline-none`} title={emp.is_active ? "Deactivate User" : "Reactivate User"}>
                        <UserX className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
