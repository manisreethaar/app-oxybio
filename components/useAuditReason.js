import React, { useState, useCallback } from 'react';
import AuditReasonModal from './AuditReasonModal';

export function useAuditReason() {
  const [isOpen, setIsOpen] = useState(false);
  const [resolver, setResolver] = useState(null);

  const requestReason = useCallback(() => {
    setIsOpen(true);
    return new Promise((resolve, reject) => {
      setResolver({ resolve, reject });
    });
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (resolver) {
      resolver.reject(new Error('Audit reason cancelled by user.'));
      setResolver(null);
    }
  };

  const handleSubmit = (reason) => {
    setIsOpen(false);
    if (resolver) {
      resolver.resolve(reason);
      setResolver(null);
    }
  };

  const modal = (
    <AuditReasonModal 
      isOpen={isOpen} 
      onClose={handleClose} 
      onSubmit={handleSubmit} 
    />
  );

  return { requestReason, modal };
}
