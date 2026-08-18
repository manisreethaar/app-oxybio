import { useState, useMemo } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function SupervisorSignOffModal({
  isOpen,
  onClose,
  onSuccess,
  actionName,
  employees,
  currentEmployeeId,
  supabase
}) {
  const toast = useToast();
  const [supervisorId, setSupervisorId] = useState('');
  const [pin, setPin] = useState('');
  const [validating, setValidating] = useState(false);

  // Filter out the current user, and only show active employees
  const availableSupervisors = useMemo(() => {
    return (employees || [])
      .filter(e => e.is_active && e.id !== currentEmployeeId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [employees, currentEmployeeId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supervisorId) {
      toast.warn('Please select a supervisor.');
      return;
    }
    if (!pin || pin.length < 4) {
      toast.warn('Please enter a valid 4-digit PIN.');
      return;
    }

    setValidating(true);
    try {
      const { data: isValid, error } = await supabase.rpc('verify_pin', {
        user_id: supervisorId,
        pin: pin
      });

      if (error) throw error;
      
      if (!isValid) {
        toast.error('Invalid PIN. Please try again.');
        setPin('');
        return;
      }

      // Valid PIN, proceed
      toast.success('Supervisor signature verified.');
      onSuccess(supervisorId);
    } catch (err) {
      toast.error(err.message || 'Error validating PIN.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold tracking-wide">Supervisor Sign-off</h3>
          </div>
          <button onClick={onClose} disabled={validating} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-xs text-slate-600 font-semibold mb-5 leading-relaxed">
            The action <strong className="text-slate-900">"{actionName}"</strong> requires secondary verification for ALCOA++ compliance. Please request a supervisor to enter their PIN.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Select Supervisor <span className="text-red-500">*</span>
              </label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy bg-white"
              >
                <option value="">-- Select Supervisor --</option>
                {availableSupervisors.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                4-Digit PIN <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                placeholder="••••"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold tracking-widest outline-none focus:border-navy focus:ring-1 focus:ring-navy font-mono"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={validating}
              className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={validating}
              className="flex-1 py-2 bg-navy hover:bg-navy-hover text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              {validating ? 'Verifying...' : 'Sign & Approve'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
