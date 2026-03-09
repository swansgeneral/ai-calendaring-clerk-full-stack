import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
  children?: React.ReactNode;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
  children
}) => {
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full flex-shrink-0 ${
                    variant === 'danger' 
                        ? 'bg-red-50 text-red-600' 
                        : title.includes("Applied") ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {title.includes("Applied") ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
                  {children && <div className="mt-2">{children}</div>}
                </div>
                <button 
                  onClick={onCancel}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row-reverse gap-3">
              <button
                onClick={onConfirm}
                className={`px-5 py-2.5 text-sm font-bold text-white rounded-lg shadow transition-all active:scale-95 cursor-pointer hover:shadow-md ${
                  variant === 'danger' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : title.includes("Applied") ? 'bg-green-600 hover:bg-green-700' : 'bg-[#00076F] hover:bg-[#00076F]/90'
                }`}
              >
                {confirmText}
              </button>
              {!title.includes("Applied") && (
                <button
                    onClick={onCancel}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 bg-white border border-gray-300 rounded-lg transition-colors cursor-pointer"
                >
                    {cancelText}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default ConfirmModal;
