import React, { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const STANDARD_REASONS = [
  'Data Entry Error Correction',
  'New Information Available',
  'Administrative Correction',
  'Regulatory / GDP Requirement',
  'Recalculation',
  'Other'
];

export default function AuditReasonModal({ isOpen, onClose, onSubmit, title = "Reason for Change Required" }) {
  const [selectedReason, setSelectedReason] = useState(STANDARD_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    let finalReason = selectedReason;
    if (selectedReason === 'Other') {
      if (!customReason.trim()) {
        setError('Please provide a specific reason.');
        return;
      }
      finalReason = customReason.trim();
    }
    
    if (!pin || pin.length < 4) {
      setError('Please provide a valid E-Signature PIN.');
      return;
    }
    
    // Pass the reason string and pin back to the parent to execute the RPC
    onSubmit(finalReason, pin);
    
    // Reset state for next time
    setSelectedReason(STANDARD_REASONS[0]);
    setCustomReason('');
    setPin('');
    setError('');
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden ring-1 ring-white/10">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-5">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              In accordance with GDP and ALCOA++ principles, you must provide a reason for modifying this record and your E-Signature PIN to authorize the change.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                value={selectedReason}
                onChange={(e) => {
                  setSelectedReason(e.target.value);
                  setError('');
                }}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
              >
                {STANDARD_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {selectedReason === 'Other' && (
               <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                   Specific Reason <span className="text-red-500">*</span>
                 </label>
                 <textarea
                   value={customReason}
                   onChange={(e) => {
                     setCustomReason(e.target.value);
                     setError('');
                   }}
                   rows={3}
                   placeholder="Explain why this change is being made..."
                   className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                 />
               </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                E-Signature PIN <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="••••••"
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border tracking-[0.5em] font-mono"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-transparent"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm rounded-lg transition-colors"
            >
              Sign & Update
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
