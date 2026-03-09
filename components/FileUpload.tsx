import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { ENV_VARS } from '../env';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  isLoading: boolean;
  analyzedCount: number;
  totalCount: number;
  batchProgress?: { current: number, total: number, phase: string };
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelect, isLoading, analyzedCount, totalCount, batchProgress }) => {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Preparing...');
  const inputRef = useRef<HTMLInputElement>(null);

  // Progress bar logic based on timing and phases
  useEffect(() => {
    let interval: number;
    
    if (isLoading) {
      const phase = batchProgress?.phase || 'reading';
      const current = batchProgress?.current || 0;
      const total = batchProgress?.total || 0;

      // Update status text
      if (phase === 'reading') {
        setStatusText('Reading document structure...');
      } else if (phase === 'analyzing') {
        setStatusText(`Analyzing document content...`);
      } else if (phase === 'matching') {
        setStatusText('Matching events with SOP Database...');
      } else if (phase === 'reminders') {
        setStatusText('Applying automatic reminders and calendar details...');
      }

      // Progress calculation
      // Total estimated time: (total * 15s) + 40s
      // If total is 0 (reading phase), we estimate based on a generic 5 page doc for now
      const estimatedTotalPages = total > 0 ? total : 5;
      const totalEstimatedTime = (estimatedTotalPages * 15) + 30;
      
      // We want to move the progress bar smoothly
      // We'll calculate a "target" progress based on the phase
      let targetProgress = 0;
      if (phase === 'reading') {
        targetProgress = 5;
      } else if (phase === 'analyzing') {
        // Analyzing takes up the bulk: from 5% to (total*15 / D)%
        const analysisWeight = (estimatedTotalPages * 15) / totalEstimatedTime;
        const batchWeight = total > 0 ? (current / total) : 0;
        targetProgress = 5 + (analysisWeight * batchWeight * 90);
      } else if (phase === 'matching') {
        const analysisWeight = (estimatedTotalPages * 15) / totalEstimatedTime;
        targetProgress = 5 + (analysisWeight * 90) + 5;
      } else if (phase === 'reminders') {
        targetProgress = 95;
      }

      // Smoothly move towards target
      interval = window.setInterval(() => {
        setProgress(prev => {
          if (prev < targetProgress) {
            return Math.min(prev + 0.5, targetProgress);
          }
          // Slow crawl if we reached target but phase hasn't changed
          if (prev < 99) {
            return prev + 0.05;
          }
          return prev;
        });
      }, 100);
    } else {
      setProgress(0);
      setStatusText('Preparing...');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, batchProgress]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndPass(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      validateAndPass(Array.from(e.target.files));
    }
  };

  const validateAndPass = (files: File[]) => {
    const validFiles = files.filter(f => f.type === 'application/pdf');
    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    } else {
      alert("Please upload valid PDF files.");
    }
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div
        className={`relative group rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out ${
          dragActive
            ? "border-[#00076F] bg-[#00076F]/5"
            : "border-gray-300 bg-white hover:border-gray-400"
        } ${isLoading ? "border-[#00076F]/30 bg-white shadow-inner" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={handleChange}
          disabled={isLoading}
        />
        
        <div className="p-10 flex flex-col items-center justify-center text-center">
          {isLoading ? (
            <div className="flex flex-col items-center w-full max-w-sm">
              <div className="bg-[#00076F]/10 p-4 rounded-full mb-4">
                <Loader2 className="h-10 w-10 text-[#00076F] animate-spin" />
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-1">Analyzing Documents...</p>
              <p className="text-sm text-gray-500 mb-8">{statusText}</p>
              
              {/* Progress Bar Container */}
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden border border-gray-200">
                <div 
                  className="bg-[#00076F] h-full rounded-full transition-all duration-300 ease-linear shadow-[0_0_8px_rgba(0,7,111,0.3)]"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between w-full mb-2">
                <span className="text-[11px] font-bold text-[#00076F] uppercase tracking-wider">Current Document Progress</span>
                <span className="text-[11px] font-bold text-[#00076F]">{Math.round(progress)}%</span>
              </div>

              {totalCount > 0 && (
                <p className="text-xs font-medium text-slate-500">
                  {analyzedCount} out of {totalCount} documents analyzed
                </p>
              )}
            </div>
          ) : (
            <>
              <div className={`p-4 rounded-full mb-4 transition-colors ${dragActive ? 'bg-[#00076F]/20' : 'bg-gray-100 group-hover:bg-gray-200'}`}>
                <UploadCloud className={`h-10 w-10 ${dragActive ? 'text-[#00076F]' : 'text-gray-500'}`} />
              </div>
              <p className="text-lg font-semibold text-gray-900">
                Click to upload or drag and drop
              </p>
              <p className="text-sm text-gray-500 mt-1 mb-6">
                PDF documents only (max 10MB each)
              </p>
              <button
                type="button"
                onClick={onButtonClick}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-[#00076F] hover:bg-[#00076F]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00076F] transition-all cursor-pointer hover:shadow-md"
              >
                <FileText className="w-5 h-5 mr-2" />
                Select Documents
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
