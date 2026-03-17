
import { Event, Calendar as CalendarType, AnalysisState, User, AnalyzedDoc } from '../types';
import EventCard from './EventCard';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, ArrowRight, ExternalLink, Loader2, Plus, UploadCloud, X, Check, AlertCircle, Search, ChevronUp, ChevronDown, Calendar as CalendarIcon, ArrowLeft, Table, RefreshCcw, Users, CheckSquare, Square, Sparkles, AlertTriangle, Gavel, Info, BellOff, Eraser } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';
import ConfirmModal from './ConfirmModal';
import { exportToICS, exportToCSV } from '../services/downloadService';
import { ENV_VARS } from '../env';

const pdfjs = (pdfjsLib as any).GlobalWorkerOptions ? pdfjsLib : (pdfjsLib as any).default;
if (pdfjs && pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

interface SearchMatch {
  pageNumber: number;
  text: string;
  rects: any[]; 
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (matterDisplayNumber: string) => Promise<void>;
  status: 'idle' | 'submitting' | 'success' | 'error';
  errorMessage?: string;
  selectedEvents: Event[];
  summary?: { entriesCreated: number; remindersSent: number };
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onSubmit, status, errorMessage, selectedEvents, summary }) => {
  const [matterDisplayNumber, setMatterDisplayNumber] = useState('');
  const [progress, setProgress] = useState(0);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen && status === 'idle') {
      setProgress(0);
    }
  }, [isOpen, status]);

  // Calculate duration and run progress bar when submitting
  useEffect(() => {
    let interval: number;
    if (status === 'submitting') {
      setProgress(0);
      
      // Calculate Duration based on requirements:
      // 1s per Event + 1.7s per Reminder
      let totalDurationMs = 0;
      selectedEvents.forEach(evt => {
        totalDurationMs += 1000; // 1s per event
        if (evt.reminders) {
          totalDurationMs += (evt.reminders.length * 1700); // 1.7s per reminder
        }
      });

      // Ensure a minimum visual duration so it doesn't flash too fast (e.g., 1.5s)
      totalDurationMs = Math.max(totalDurationMs, 1500);

      const startTime = Date.now();
      
      interval = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Cap at 95% until success is actually returned
        const newProgress = Math.min(Math.floor((elapsed / totalDurationMs) * 100), 95);
        setProgress(newProgress);
      }, 50);
    } else if (status === 'success') {
      setProgress(100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, selectedEvents]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(matterDisplayNumber);
  };

  const isSubmitting = status === 'submitting';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.3 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#020035] px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-200" />
            Export to Clio
          </h3>
          <button onClick={onClose} disabled={isSubmitting} className="text-white/80 hover:text-white disabled:opacity-50 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {status === 'error' && (
            <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-start gap-3 text-xs text-red-700 animate-shake overflow-hidden">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold mb-1">Export failed</p>
                <p className="break-words whitespace-pre-wrap">{errorMessage || "Check network connection or system configuration."}</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Matter Display Number</label>
            <p className="text-xs text-gray-500 mb-2">Identifier like "13680-Michael"</p>
            <input
              type="text"
              required
              style={{ colorScheme: 'light' }}
              value={matterDisplayNumber}
              onChange={(e) => setMatterDisplayNumber(e.target.value)}
              placeholder="e.g. 13680-Michael"
              disabled={isSubmitting || status === 'success'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-[#00076F] focus:border-[#00076F] outline-none shadow-sm disabled:bg-gray-100 bg-white text-gray-900"
            />
          </div>

          <div className="bg-blue-50/80 border border-blue-100 rounded-lg p-3 flex gap-2.5">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed font-medium">
              <span className="font-bold">Note:</span> The Prefix "[Client Last Name]:" Will be added automatically to the case title of all events when they are exported to Clio Manage.
            </p>
          </div>

          {/* Progress Bar Display */}
          {isSubmitting && (
            <div className="space-y-2 pt-2 animate-fade-in">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-[#00076F] uppercase tracking-wider">Syncing Schedule...</span>
                <span className="text-xs font-bold text-gray-500">{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200">
                <div 
                  className="bg-[#00076F] h-full rounded-full transition-all duration-75 ease-out shadow-[0_0_8px_rgba(0,7,111,0.3)]"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-gray-400 italic text-center pt-1">Processing {selectedEvents.length} events and associated reminders</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4 py-2 animate-fade-in">
              <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-1">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="text-lg font-bold text-green-800">Export Successful</h4>
                <p className="text-sm text-green-700">All events have been synced to Clio Manage.</p>
              </div>
              
              {summary && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Entries Created</p>
                    <p className="text-xl font-bold text-slate-800">{summary.entriesCreated}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reminders Sent</p>
                    <p className="text-xl font-bold text-slate-800">{summary.remindersSent}</p>
                  </div>
                </div>
              )}
              
              <p className="text-[11px] text-gray-400 text-center italic">This window will close automatically in a few seconds.</p>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-2 flex-shrink-0">
            {status !== 'success' && (
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer hover:shadow-sm" disabled={isSubmitting}>
                Cancel
              </button>
            )}
            
            {status !== 'success' && !isSubmitting && (
              <button type="submit" className="px-5 py-2 text-sm font-bold text-white bg-[#00076F] rounded-lg shadow transition-all flex items-center hover:bg-[#00076F]/90 cursor-pointer hover:shadow-md">
                {status === 'error' ? 'Retry' : 'Export'}
              </button>
            )}
            
            {isSubmitting && (
              <button disabled className="px-5 py-2 text-sm font-bold text-white bg-gray-400 rounded-lg shadow flex items-center cursor-not-allowed">
                 <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...
              </button>
            )}
            
            {status === 'success' && (
              <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-bold text-white bg-green-600 rounded-lg shadow transition-all flex items-center hover:bg-green-700 cursor-pointer hover:shadow-md">
                Close
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
};

interface PdfPageProps {
  pageNumber: number;
  pdfDocument: any;
  events: Event[];
  focusedEvent: Event | null;
  focusTrigger: number;
  showAllHighlights: boolean;
  searchQuery: string;
  searchIndex: number;
  allMatches: SearchMatch[];
  isOcr: boolean;
}

const PdfPage: React.FC<PdfPageProps> = ({ pageNumber, pdfDocument, events, focusedEvent, focusTrigger, showAllHighlights, searchQuery, searchIndex, allMatches, isOcr }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [highlightPosition, setHighlightPosition] = useState<number | null>(null);

  const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '');

  useEffect(() => {
    let isCancelled = false;
    const renderPage = async () => {
      if (!canvasRef.current || !pdfDocument) return;
      if (renderTaskRef.current) renderTaskRef.current.cancel();

      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        setHighlightPosition(null);
        if (!context || isCancelled) return;
        canvas.height = viewport.height; canvas.width = viewport.width;
        canvas.style.width = "100%"; canvas.style.height = "auto";
        const renderTask = page.render({ canvasContext: context, viewport: viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (isCancelled) return;
        if (!showAllHighlights) { setIsRendered(true); return; }

        const textContent = await page.getTextContent();
        const items = textContent.items as any[];
        let cumulativeStr = "";
        const itemMap: { start: number; end: number; item: any }[] = [];
        items.forEach((item) => {
          const normStr = normalize(item.str);
          if (normStr.length === 0) return; 
          const start = cumulativeStr.length; cumulativeStr += normStr;
          itemMap.push({ start, end: cumulativeStr.length, item });
        });

        const targets: { quote: string, isFocused: boolean, eventId: string, boundingBox?: [number, number, number, number] }[] = [];
        events.forEach(e => {
          const p = parseInt(e.verification?.page?.toString()?.replace(/\D/g, '') || "0") || 0;
          if (p === pageNumber) {
            targets.push({ 
              quote: e.verification.quote || "", 
              isFocused: focusedEvent?.id === e.id, 
              eventId: e.id,
              boundingBox: e.verification.boundingBox
            });
          }
        });

        let firstFocusedMatchTop: number | null = null;
        const drawMergedRects = (matchedItems: any[], isFocused: boolean, color: string, strokeColor?: string) => {
          if (matchedItems.length === 0) return;
          const lineGroups: any[][] = [];
          matchedItems.forEach(mi => {
            const lastGroup = lineGroups[lineGroups.length - 1];
            if (lastGroup && Math.abs(lastGroup[0].item.transform[5] - mi.item.transform[5]) < 5) lastGroup.push(mi);
            else lineGroups.push([mi]);
          });
          lineGroups.forEach(group => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let maxH = 0;
            group.forEach(({ item }) => {
              const [vxMin, vyMin] = viewport.convertToViewportPoint(item.transform[4], item.transform[5] + Math.sqrt(item.transform[0]**2 + item.transform[1]**2)); 
              const [vxMax, vyMax] = viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5]);
              minX = Math.min(minX, vxMin, vxMax); maxX = Math.max(maxX, vxMin, vxMax);
              minY = Math.min(minY, vyMin, vyMax); maxY = Math.max(maxY, vyMin, vyMax);
              maxH = Math.max(maxH, Math.abs(vyMax - vyMin));
            });
            const rY = minY; const rH = maxH;
            const rectY = rY - rH * 0.1; const rectH = rH * 1.3;
            const rectX = minX - 2; const rectW = (maxX - minX) + 4;
            context.fillStyle = color; context.fillRect(rectX, rectY, rectW, rectH);
            if (strokeColor) {
              context.strokeStyle = strokeColor; context.lineWidth = isFocused ? 2 : 1;
              context.strokeRect(rectX, rectY, rectW, rectH);
            }
            if (isFocused && firstFocusedMatchTop === null) firstFocusedMatchTop = rY + (rH / 2);
          });
        };

        targets.forEach(({ quote, isFocused, boundingBox }) => {
          let textSearchSuccess = false;

          // 1. If OCR'd, try Text Search first (more accurate spatially for text)
          if (isOcr) {
            const normalizedQuote = normalize(quote);
            if (normalizedQuote) {
              let currentPos = 0;
              let matchFound = false;
              while (true) {
                const startIndex = cumulativeStr.indexOf(normalizedQuote, currentPos);
                if (startIndex === -1) break;
                matchFound = true;
                const endIndex = startIndex + normalizedQuote.length;
                const matchedItems = itemMap.filter(m => m.start < endIndex && m.end > startIndex);
                drawMergedRects(matchedItems, isFocused, 'rgba(255, 235, 59, 0.35)', isFocused ? '#dc2626' : 'rgba(245, 158, 11, 0.2)');
                currentPos = startIndex + 1;
                if (normalizedQuote.length < 3) break; 
              }
              if (matchFound) textSearchSuccess = true;
            }
          }

          // 2. Fallback to Bounding Box (Visual Grounding) if text search failed or not OCR'd
          if (!textSearchSuccess && boundingBox && Array.isArray(boundingBox) && boundingBox.length === 4) {
            const [ymin, xmin, ymax, xmax] = boundingBox;
            const rectX = (xmin / 1000) * viewport.width;
            const rectY = (ymin / 1000) * viewport.height;
            const rectW = ((xmax - xmin) / 1000) * viewport.width;
            const rectH = ((ymax - ymin) / 1000) * viewport.height;

            context.fillStyle = 'rgba(255, 235, 59, 0.35)';
            context.fillRect(rectX, rectY, rectW, rectH);
            
            context.strokeStyle = isFocused ? '#dc2626' : 'rgba(245, 158, 11, 0.2)';
            context.lineWidth = isFocused ? 2 : 1;
            context.strokeRect(rectX, rectY, rectW, rectH);

            if (isFocused && firstFocusedMatchTop === null) {
              firstFocusedMatchTop = rectY + (rectH / 2);
            }
          }
        });
        
        if (firstFocusedMatchTop !== null) setHighlightPosition((firstFocusedMatchTop / viewport.height) * 100);

        if (searchQuery.trim().length >= 2) {
          const normalizedQuery = normalize(searchQuery);
          let currentPos = 0; let matchCountInPage = 0;
          while (true) {
            const startIndex = cumulativeStr.indexOf(normalizedQuery, currentPos);
            if (startIndex === -1) break;
            const endIndex = startIndex + normalizedQuery.length;
            const matchedItems = itemMap.filter(m => m.start < endIndex && m.end > startIndex);
            const globalMatchIndex = allMatches.findIndex((m, idx) => m.pageNumber === pageNumber && allMatches.filter((prev, i) => i < idx && prev.pageNumber === pageNumber).length === matchCountInPage);
            const isActiveSearchMatch = globalMatchIndex === searchIndex;
            const searchColor = isActiveSearchMatch ? 'rgba(0, 122, 255, 0.4)' : 'rgba(0, 122, 255, 0.15)';
            const searchStroke = isActiveSearchMatch ? '#007AFF' : undefined;
            const lineGroups: any[][] = [];
            matchedItems.forEach(mi => {
              const lastGroup = lineGroups[lineGroups.length - 1];
              if (lastGroup && Math.abs(lastGroup[0].item.transform[5] - mi.item.transform[5]) < 5) lastGroup.push(mi);
              else lineGroups.push([mi]);
            });
            lineGroups.forEach(group => {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              let maxH = 0;
              group.forEach(({ item }) => {
                const [vxMin, vyMin] = viewport.convertToViewportPoint(item.transform[4], item.transform[5] + Math.sqrt(item.transform[0]**2 + item.transform[1]**2)); 
                const [vxMax, vyMax] = viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5]);
                minX = Math.min(minX, vxMin, vxMax); maxX = Math.max(maxX, vxMin, vxMax);
                minY = Math.min(minY, vyMin, vyMax); maxY = Math.max(maxY, vyMin, vyMax);
                maxH = Math.max(maxH, Math.abs(vyMax - vyMin));
              });
              const rY = minY; const rH = maxH;
              const rectY = rY - rH * 0.1; const rectH = rH * 1.3;
              const rectX = minX - 2; const rectW = (maxX - minX) + 4;
              context.fillStyle = searchColor; context.fillRect(rectX, rectY, rectW, rectH);
              if (searchStroke) { context.strokeStyle = searchStroke; context.lineWidth = 2; context.strokeRect(rectX, rectY, rectW, rectH); }
              if (isActiveSearchMatch) setHighlightPosition(((rY + rH/2) / viewport.height) * 100);
            });
            matchCountInPage++; currentPos = startIndex + 1;
          }
        }
        setIsRendered(true);
      } catch (err: any) { if (err.name === 'RenderingCancelledException') return; console.error(`Error rendering page ${pageNumber}`, err); }
    };
    renderPage();
    return () => { isCancelled = true; if (renderTaskRef.current) renderTaskRef.current.cancel(); };
  }, [pageNumber, pdfDocument, events, focusedEvent, focusTrigger, showAllHighlights, searchQuery, searchIndex, allMatches]);

  useEffect(() => {
    if (highlightPosition !== null && scrollTargetRef.current) {
      const isRelevant = (focusedEvent && (parseInt(focusedEvent.verification?.page?.toString()?.replace(/\D/g, '') || "0") || 0) === pageNumber) || (allMatches[searchIndex]?.pageNumber === pageNumber);
      if (isRelevant) scrollTargetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightPosition, focusTrigger, searchIndex, pageNumber, focusedEvent, allMatches]);

  return (
    <div id={`pdf-page-${pageNumber}`} className="mb-4 shadow-md bg-white relative scroll-mt-4">
      {highlightPosition !== null && showAllHighlights && (
         <>
           <div ref={scrollTargetRef} className="absolute left-0 w-1 h-1 pointer-events-none opacity-0" style={{ top: `${highlightPosition}%` }} />
           <div className="absolute -left-10 z-10 hidden md:flex items-center justify-end w-10" style={{ top: `${highlightPosition}%`, marginTop: '-12px' }}>
             <ArrowRight className="w-8 h-8 text-red-600 animate-pulse drop-shadow-sm" strokeWidth={3} />
           </div>
         </>
      )}
      {!isRendered && <div className="h-96 w-full bg-gray-50 flex items-center justify-center animate-pulse"><Loader2 className="animate-spin text-gray-300" /></div>}
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
};

interface ResultsViewProps {
  events: Event[];
  file: File;
  analysisState: AnalysisState;
  currentDoc: AnalyzedDoc;
  onUpdateMetadata: (updates: Partial<AnalysisState>) => void;
  onReset: () => void;
  onRedo: () => void;
  onEventsChange?: (events: Event[]) => void;
}

const ResultsView: React.FC<ResultsViewProps> = ({ events: initialEvents, file, analysisState, currentDoc, onUpdateMetadata, onReset, onRedo, onEventsChange }) => {
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [focusState, setFocusState] = useState<{ event: Event | null, trigger: number }>({ event: null, trigger: 0 });
  const [sortMode, setSortMode] = useState<'document' | 'date'>('document');
  const [showAllHighlights, setShowAllHighlights] = useState(true);
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submissionError, setSubmissionError] = useState<string | undefined>(undefined);
  const [exportSummary, setExportSummary] = useState<{ entriesCreated: number; remindersSent: number } | undefined>(undefined);
  const [sidebarWidth, setSidebarWidth] = useState(window.innerWidth / 2);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isConfirmingRedo, setIsConfirmingRedo] = useState(false);
  const [isConfirmingClearReminders, setIsConfirmingClearReminders] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  
  const [isAttorneyDropdownOpen, setIsAttorneyDropdownOpen] = useState(false);
  const [attorneySearch, setAttorneySearch] = useState('');

  const [isCalendarDropdownOpen, setIsCalendarDropdownOpen] = useState(false);
  const [calendarSearch, setCalendarSearch] = useState('');
  
  const [isOcr, setIsOcr] = useState(true);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [allMatches, setAllMatches] = useState<SearchMatch[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const staffRef = useRef<HTMLDivElement>(null);
  const attorneyRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPdfBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { 
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) setIsDownloadMenuOpen(false); 
      if (staffRef.current && !staffRef.current.contains(event.target as Node)) setIsStaffDropdownOpen(false);
      if (attorneyRef.current && !attorneyRef.current.contains(event.target as Node)) setIsAttorneyDropdownOpen(false);
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) setIsCalendarDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setSidebarWidth(window.innerWidth / 2);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInputRef.current?.focus(); searchInputRef.current?.select(); } };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { if (!isResizing) return; setSidebarWidth(Math.max(300, Math.min(e.clientX, window.innerWidth - 300))); };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); document.body.style.cursor = 'col-resize'; }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); document.body.style.cursor = ''; };
  }, [isResizing]);

  useEffect(() => { setEvents(initialEvents); }, [initialEvents]);

  const handleUpdateEvent = (updatedEvent: Event) => {
    const newEvents = events.map(e => e.id === updatedEvent.id ? updatedEvent : e);
    setEvents(newEvents);
    onEventsChange?.(newEvents);
  };

  const handleDeleteEvent = (id: string) => {
    const newEvents = events.filter(e => e.id !== id);
    setEvents(newEvents);
    onEventsChange?.(newEvents);
    if (expandedEventId === id) setExpandedEventId(null);
  };
  
  const handleAddEvent = () => {
    const today = new Date().toISOString().split('T')[0];
    const minDocIndex = events.length > 0 ? Math.min(...events.map(e => e.doc_index ?? 0)) : 0;
    const newEvent: Event = { 
      id: crypto.randomUUID(), 
      title: "New Event", 
      start_date: today, 
      end_date: today, 
      is_all_day: true, 
      location: "", 
      description: "", 
      selected: true, 
      doc_index: minDocIndex - 1, 
      verification: { quote: "", page: "", paragraph: "" },
      inviteAllStaff: true,
      inviteAllAttorneys: true,
      manualInvitees: []
    };
    const newEvents = [newEvent, ...events];
    setEvents(newEvents);
    onEventsChange?.(newEvents);
    setExpandedEventId(newEvent.id);
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    const newEvents = events.map(evt => ({ ...evt, selected: checked }));
    setEvents(newEvents);
    onEventsChange?.(newEvents);
  };
  const handleProcessNew = () => setIsConfirmingReset(true);
  const confirmReset = () => { onReset(); setIsConfirmingReset(false); };
  const confirmRedo = () => { onRedo(); setIsConfirmingRedo(false); };
  
  const handleClearAllReminders = () => {
    const newEvents = events.map(e => ({ ...e, reminders: [] }));
    setEvents(newEvents);
    onEventsChange?.(newEvents);
    setIsConfirmingClearReminders(false);
  };

  const validateExport = () => {
    const selectedEvents = events.filter(e => e.selected);
    if (selectedEvents.length === 0) {
      return { valid: false, message: "No events selected for export." };
    }

    const missingFields: string[] = [];
    if (!analysisState.defaultCalendarName) {
        missingFields.push("Default Calendar Host");
    }
    if ((analysisState.involvedAttorneys || []).length === 0) {
        missingFields.push("Involved Attorneys");
    }
    if ((analysisState.involvedStaff || []).length === 0) {
        missingFields.push("Involved Staff Members");
    }

    if (missingFields.length > 0) {
        return { 
          valid: false, 
          message: `Please select the following mandatory fields in the top sidebar menu: ${missingFields.join(', ')}.` 
        };
    }

    // Secondary check for event-specific settings (though main logic above usually covers it)
    const staffMissing = (analysisState.involvedStaff || []).length === 0;
    const attorneysMissing = (analysisState.involvedAttorneys || []).length === 0;
    const genericError = "Some events are set to invite all staff members or all attorneys, but no users have been selected in the top sidebar menu.";
    
    for (const event of selectedEvents) {
      if ((event.inviteAllStaff && staffMissing) || (event.inviteAllAttorneys && attorneysMissing)) {
        return { valid: false, message: genericError };
      }
      if (event.reminders) {
        for (const r of event.reminders) {
          if ((r.remindStaff && staffMissing) || (r.remindAttorneys && attorneysMissing)) {
            return { valid: false, message: genericError };
          }
        }
      }
    }
    return { valid: true };
  };

  const handleInitiateExport = () => {
    const { valid, message } = validateExport();
    if (!valid) {
      setValidationError(message || "Please check all required fields.");
      return;
    }
    setValidationError(null);
    setIsExportModalOpen(true);
  };

  const handlePostEventsSubmit = async (matterDisplayNumber: string) => {
    setSubmissionStatus('submitting');
    setSubmissionError(undefined);
    try {
      const selectedEvents = events.filter(e => e.selected);
      
      const getUserByName = (name: string): User | undefined => {
        return analysisState.availableUsers?.find(u => u.name.trim() === name.trim());
      };

      const getCalendarIdByName = (name: string) => {
        const found = analysisState.availableCalendars?.find(c => c.name.trim() === name.trim());
        return found ? found.id : name;
      };

      const resolveCalendarIdObj = (name: string) => {
        const user = getUserByName(name);
        return {
          calendar_id: user?.default_calendar_id || name
        };
      };

      const involvedAttorneysList = (analysisState.involvedAttorneys || []).map(resolveCalendarIdObj);
      const involvedStaffList = (analysisState.involvedStaff || []).map(resolveCalendarIdObj);

      const eventsWithMetadata = selectedEvents.map(e => {
        const { id, selected, doc_index, targetCalendar, inviteClient, reminders, inviteAllStaff, inviteAllAttorneys, manualInvitees, ...rest } = e;
        
        const mappedReminders = (reminders || []).map(r => ({
          type: r.type,
          quantity: r.quantity,
          unit: r.unit,
          calendarTitle: r.calendarTitle,
          calendarDescription: r.calendarDescription,
          remindAllStaff: r.remindStaff,
          remindAllAttorneys: r.remindAttorneys,
          manualUsers: (r.manualUsers || []).map(resolveCalendarIdObj)
        }));

        const calId = getCalendarIdByName(targetCalendar || analysisState.defaultCalendarName || "");
        
        const firmInviteesList = (manualInvitees || []).map(name => {
          const user = getUserByName(name);
          return {
            "calendar_id": user?.default_calendar_id || name
          };
        });

        return {
          ...rest,
          reminders: mappedReminders,
          "Calendar Owner": calId,
          "Invite Client": inviteClient || false,
          "inviteAllStaff": inviteAllStaff,
          "inviteAllAttorneys": inviteAllAttorneys,
          "Firm Invitees": firmInviteesList
        };
      });

      const payload = {
        matterDisplayNumber,
        defaultCalendarID: getCalendarIdByName(analysisState.defaultCalendarName || ""),
        timezone: ENV_VARS.TIMEZONE,
        involvedAttorneys: involvedAttorneysList,
        involvedStaff: involvedStaffList,
        events: eventsWithMetadata
      };

      const endpoint = '/api/clio/export-direct';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();
      setExportSummary(result.summary);
      setSubmissionStatus('success');
      setTimeout(() => { 
        setIsExportModalOpen(false); 
        setSubmissionStatus('idle');
        setExportSummary(undefined);
      }, ENV_VARS.POST_EVENTS_UI_RESET_DELAY);
    } catch (e: any) { setSubmissionStatus('error'); setSubmissionError(e.message); }
  };

  const toggleStaffSelection = (userName: string) => {
    const current = analysisState.involvedStaff || [];
    const updated = current.includes(userName) ? current.filter(u => u !== userName) : [...current, userName];
    onUpdateMetadata({ involvedStaff: updated });
    if (validationError) setValidationError(null);
  };

  const toggleAttorneySelection = (userName: string) => {
    const current = analysisState.involvedAttorneys || [];
    const updated = current.includes(userName) ? current.filter(u => u !== userName) : [...current, userName];
    onUpdateMetadata({ involvedAttorneys: updated });
    if (validationError) setValidationError(null);
  };

  const filteredStaffOptions = (analysisState.availableUsers || [])
    .filter(u => u.subscription_type === 'NonAttorney')
    .filter(u => !(analysisState.involvedAttorneys || []).includes(u.name))
    .filter(u => u.name.toLowerCase().includes(staffSearch.toLowerCase()));

  const filteredAttorneyOptions = (analysisState.availableUsers || [])
    .filter(u => u.subscription_type === 'Attorney')
    .filter(u => !(analysisState.involvedStaff || []).includes(u.name))
    .filter(u => u.name.toLowerCase().includes(attorneySearch.toLowerCase()));

  const filteredCalendarOptions = (analysisState.availableCalendars || [])
    .filter(cal => cal.name.toLowerCase().includes(calendarSearch.toLowerCase()));

  const hasAnySelections = useMemo(() => {
    return (analysisState.involvedAttorneys || []).length > 0 || 
           (analysisState.involvedStaff || []).length > 0 || 
           !!analysisState.defaultCalendarName;
  }, [analysisState.involvedAttorneys, analysisState.involvedStaff, analysisState.defaultCalendarName]);

  const handleClearSelections = () => {
    onUpdateMetadata({
      involvedAttorneys: [],
      involvedStaff: [],
      defaultCalendarName: undefined
    });
  };

  const sortedEvents = useMemo(() => {
    const list = [...events];
    if (sortMode === 'document') return list.sort((a, b) => (a.doc_index ?? 0) - (b.doc_index ?? 0));
    return list.sort((a, b) => {
      const dateCompare = (a.start_date || '9999').localeCompare(b.start_date || '9999');
      if (dateCompare !== 0) return dateCompare;
      const timeA = a.is_all_day ? "00:00" : (a.start_time || "00:00");
      const timeB = b.is_all_day ? "00:00" : (b.start_time || "00:00");
      return timeA.localeCompare(timeB);
    });
  }, [events, sortMode]);

  const selectedCount = events.filter(e => e.selected).length;
  const isAllSelected = events.length > 0 && selectedCount === events.length;
  
  const hasAnyReminders = useMemo(() => {
    return events.some(e => (e.reminders?.length || 0) > 0);
  }, [events]);

  useEffect(() => {
    const loadPdf = async () => {
      setIsLoadingPdf(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        setPdfDocument(doc); 
        setNumPages(doc.numPages);

        // Check if OCR'd (has text content)
        try {
          const firstPage = await doc.getPage(1);
          const textContent = await firstPage.getTextContent();
          const hasText = textContent.items.length > 0;
          setIsOcr(hasText);
        } catch (e) {
          setIsOcr(false);
        }
      } catch (error) { 
        console.error("Error loading PDF", error); 
      } finally { 
        setIsLoadingPdf(false); 
      }
    };
    loadPdf();
  }, [file]);

  useEffect(() => {
    if (!pdfDocument || searchQuery.trim().length < 2) { setAllMatches([]); setSearchIndex(0); return; }
    const performSearch = async () => {
      const matches: SearchMatch[] = [];
      const normalizeLocal = (str: string) => str.toLowerCase().replace(/\s+/g, '');
      const query = normalizeLocal(searchQuery);
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        const text = normalizeLocal(content.items.map((it: any) => it.str).join(''));
        let pos = 0;
        while (true) {
          const indexFound = text.indexOf(query, pos);
          if (indexFound === -1) break;
          matches.push({ pageNumber: i, text: searchQuery, rects: [] });
          pos = indexFound + 1;
        }
      }
      setAllMatches(matches); setSearchIndex(0);
    };
    const timeout = setTimeout(performSearch, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, pdfDocument, numPages]);

  const handleFindInDoc = (event: Event) => {
    setFocusState({ event, trigger: Date.now() });
    const pageNumStr = event.verification?.page?.toString()?.replace(/\D/g, '') || "1";
    const pageNum = parseInt(pageNumStr) || 1;
    document.getElementById(`pdf-page-${pageNum}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navigateSearch = (dir: 'next' | 'prev') => {
    if (allMatches.length === 0) return;
    if (dir === 'next') setSearchIndex((searchIndex + 1) % allMatches.length);
    else setSearchIndex((searchIndex - 1 + allMatches.length) % allMatches.length);
  };

  const downloadICS = () => { exportToICS(sortedEvents.filter(e => e.selected)); setIsDownloadMenuOpen(false); };
  const downloadCSV = () => { exportToCSV(sortedEvents.filter(e => e.selected)); setIsDownloadMenuOpen(false); };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-slate-100 overflow-hidden relative">
      {currentDoc.status !== 'success' && (
        <div className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8">
          <div className="bg-[#00076F]/10 p-6 rounded-full mb-6 animate-pulse">
            <Loader2 className="h-12 w-12 text-[#00076F] animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {currentDoc.status === 'analyzing' ? 'AI is still processing this document' : 'Waiting for analysis to start'}
          </h2>
          <p className="text-slate-600 max-w-md mb-8">
            {currentDoc.status === 'analyzing' 
              ? "We're currently extracting dates and matching them with your SOP. This will only take a few more seconds."
              : "This document is in the queue and will be analyzed shortly."}
          </p>
          <div className="flex gap-4">
            <button 
              onClick={onReset}
              className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer hover:shadow-sm"
            >
              Cancel & Reset
            </button>
            <p className="px-6 py-2.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-500 italic">
              You can evaluate other documents while you wait
            </p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isExportModalOpen && (
          <ExportModal 
            isOpen={isExportModalOpen} 
            onClose={() => setIsExportModalOpen(false)} 
            onSubmit={handlePostEventsSubmit} 
            status={submissionStatus} 
            errorMessage={submissionError} 
            selectedEvents={events.filter(e => e.selected)} 
            summary={exportSummary}
          />
        )}
      </AnimatePresence>
      <ConfirmModal isOpen={isConfirmingReset} title="Process New Document" message="Are you sure you want to process a new document? All un-exported dates for the current document will be lost." confirmText="Confirm" onConfirm={confirmReset} onCancel={() => setIsConfirmingReset(false)} />
      <ConfirmModal isOpen={isConfirmingRedo} title="Rerun AI Scan" message="Are you sure you want to rerun the full AI analysis on this document? This will replace all currently extracted dates and logic." confirmText="Rerun Full Scan" onConfirm={confirmRedo} onCancel={() => setIsConfirmingRedo(false)} />
      
      <ConfirmModal 
        isOpen={isConfirmingClearReminders} 
        title="Clear All Reminders" 
        message="Are you sure you want to remove all reminders from every event? This action cannot be undone." 
        confirmText="Clear All" 
        variant="danger" 
        onConfirm={handleClearAllReminders} 
        onCancel={() => setIsConfirmingClearReminders(false)} 
      />

      {validationError && (
        <ConfirmModal 
          isOpen={!!validationError}
          title="Export Blocked"
          message={validationError}
          confirmText="I'll fix it"
          onConfirm={() => setValidationError(null)}
          onCancel={() => setValidationError(null)}
          variant="danger"
        />
      )}

      <div className="w-full flex flex-col h-full border-r border-gray-200 bg-white shadow-xl z-10 flex-shrink-0" style={{ width: isMobile ? '100%' : sidebarWidth }}>
        <div className="px-6 py-5 border-b border-gray-100 bg-white flex-shrink-0 relative">
          <div className="flex gap-2 mb-4 pr-4">
            <button onClick={handleProcessNew} className="w-[20%] bg-gray-500 hover:bg-gray-600 text-white flex items-center justify-center rounded-lg transition-colors py-2.5 shadow-sm active:scale-95 text-[11px] font-bold cursor-pointer" title="Process New Document"><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back</button>
            <button onClick={() => handleInitiateExport()} className="flex-1 bg-[#00076F] hover:bg-[#00076F]/90 text-white font-bold py-2.5 rounded-lg shadow-md flex items-center justify-center transition-transform active:scale-95 text-[11px] cursor-pointer"><UploadCloud className="w-3.5 h-3.5 mr-1.5 text-blue-200" /> Export to Clio</button>
          </div>

          <div className="flex flex-col gap-3">
             <div className="space-y-1">
                <div className="flex items-center justify-between mb-1 ml-1">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Default Calendar Host for All Events <span className="text-red-500">*</span>
                  </label>
                  {hasAnySelections && (
                    <button 
                      onClick={handleClearSelections}
                      className="flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                      title="Clear all selected values"
                    >
                      <Eraser className="w-2.5 h-2.5" />
                      Clear
                    </button>
                  )}
                </div>
                <div className="relative" ref={calendarRef}>
                   <div 
                      onClick={() => setIsCalendarDropdownOpen(!isCalendarDropdownOpen)}
                      className={`flex items-center gap-2 border rounded-md px-2 shadow-sm cursor-pointer transition-all h-[32px] overflow-hidden ${(validationError && !analysisState.defaultCalendarName) ? 'bg-red-50 border-red-300 ring-1 ring-red-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                   >
                      <CalendarIcon className={`w-3 h-3 flex-shrink-0 ${(validationError && !analysisState.defaultCalendarName) ? 'text-red-500' : 'text-slate-500'}`} />
                      <div className="flex-1 truncate text-xs font-bold text-slate-800">
                        {analysisState.defaultCalendarName ? analysisState.defaultCalendarName : <span className="text-slate-400 font-normal italic text-[11px]">Select a calendar...</span>}
                      </div>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isCalendarDropdownOpen ? 'rotate-180' : ''}`} />
                   </div>
                   
                   {isCalendarDropdownOpen && (
                     <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-[60] overflow-hidden animate-fade-in">
                        <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                           <Search className="w-3.5 h-3.5 text-slate-400" />
                           <input 
                              type="text" 
                              placeholder="Search calendars..." 
                              className="bg-transparent border-none outline-none text-[11px] w-full p-0"
                              value={calendarSearch}
                              onChange={(e) => setCalendarSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                           />
                        </div>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                           {filteredCalendarOptions.length > 0 ? filteredCalendarOptions.map(cal => {
                               const isSelected = analysisState.defaultCalendarName === cal.name;
                               return (
                                 <div 
                                    key={cal.id} 
                                    onClick={(e) => { e.stopPropagation(); onUpdateMetadata({ defaultCalendarName: cal.name }); setIsCalendarDropdownOpen(false); }}
                                    className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between group"
                                 >
                                    <span className={`text-[11px] ${isSelected ? 'font-bold text-[#00076F]' : 'text-slate-600'}`}>{cal.name}</span>
                                    {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-[#00076F]" /> : <Square className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400" />}
                                 </div>
                               )
                             }) : <div className="p-3 text-center text-[11px] text-slate-400 italic">No calendars found</div>}
                        </div>
                     </div>
                   )}
                </div>
             </div>

             <div className="flex gap-2">
                <div className="flex-1 min-w-0 relative" ref={attorneyRef}>
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">
                     Involved Attorneys <span className="text-red-500">*</span>
                   </label>
                   <div 
                      onClick={() => setIsAttorneyDropdownOpen(!isAttorneyDropdownOpen)}
                      className={`flex items-center gap-2 border rounded-md px-2 shadow-sm cursor-pointer transition-all h-[32px] overflow-hidden ${(validationError && (analysisState.involvedAttorneys || []).length === 0) ? 'bg-red-50 border-red-300 ring-1 ring-red-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                   >
                      <Gavel className={`w-3 h-3 flex-shrink-0 ${(validationError && (analysisState.involvedAttorneys || []).length === 0) ? 'text-red-500' : 'text-blue-600'}`} />
                      <div className="flex-1 truncate text-xs font-bold text-slate-800">
                        {analysisState.involvedAttorneys?.length ? analysisState.involvedAttorneys.join(', ') : <span className="text-slate-400 font-normal italic text-[11px]">Select attorneys (Required)...</span>}
                      </div>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isAttorneyDropdownOpen ? 'rotate-180' : ''}`} />
                   </div>
                   
                   {isAttorneyDropdownOpen && (
                     <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-[60] overflow-hidden animate-fade-in">
                        <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                           <Search className="w-3.5 h-3.5 text-slate-400" />
                           <input 
                              type="text" 
                              placeholder="Search attorneys..." 
                              className="bg-transparent border-none outline-none text-[11px] w-full p-0"
                              value={attorneySearch}
                              onChange={(e) => setAttorneySearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                           />
                        </div>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                           {filteredAttorneyOptions.length > 0 ? filteredAttorneyOptions.map(user => {
                               const isSelected = (analysisState.involvedAttorneys || []).includes(user.name);
                               return (
                                 <div 
                                    key={user.id} 
                                    onClick={(e) => { e.stopPropagation(); toggleAttorneySelection(user.name); }}
                                    className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between group"
                                 >
                                    <span className={`text-[11px] ${isSelected ? 'font-bold text-blue-600' : 'text-slate-600'}`}>{user.name}</span>
                                    {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400" />}
                                 </div>
                               )
                             }) : <div className="p-3 text-center text-[11px] text-slate-400 italic">No users found</div>}
                        </div>
                     </div>
                   )}
                </div>

                <div className="flex-1 min-w-0 relative" ref={staffRef}>
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">
                     Involved Staff Members <span className="text-red-500">*</span>
                   </label>
                   <div 
                      onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)}
                      className={`flex items-center gap-2 border rounded-md px-2 shadow-sm cursor-pointer transition-all h-[32px] overflow-hidden ${(validationError && (analysisState.involvedStaff || []).length === 0) ? 'bg-red-50 border-red-300 ring-1 ring-red-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                   >
                      <Users className={`w-3 h-3 flex-shrink-0 ${(validationError && (analysisState.involvedStaff || []).length === 0) ? 'text-red-500' : 'text-purple-600'}`} />
                      <div className="flex-1 truncate text-xs font-bold text-slate-800">
                        {analysisState.involvedStaff?.length ? analysisState.involvedStaff.join(', ') : <span className="text-slate-400 font-normal italic text-[11px]">Select staff members (Required)...</span>}
                      </div>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isStaffDropdownOpen ? 'rotate-180' : ''}`} />
                   </div>
                   
                   {isStaffDropdownOpen && (
                     <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-[60] overflow-hidden animate-fade-in">
                        <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                           <Search className="w-3.5 h-3.5 text-slate-400" />
                           <input 
                              type="text" 
                              placeholder="Search staff members..." 
                              className="bg-transparent border-none outline-none text-[11px] w-full p-0"
                              value={staffSearch}
                              onChange={(e) => setStaffSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                           />
                        </div>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                           {filteredStaffOptions.length > 0 ? filteredStaffOptions.map(user => {
                               const isSelected = (analysisState.involvedStaff || []).includes(user.name);
                               return (
                                 <div 
                                    key={user.id} 
                                    onClick={(e) => { e.stopPropagation(); toggleStaffSelection(user.name); }}
                                    className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between group"
                                 >
                                    <span className={`text-[11px] ${isSelected ? 'font-bold text-purple-600' : 'text-slate-600'}`}>{user.name}</span>
                                    {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-purple-600" /> : <Square className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400" />}
                                 </div>
                               )
                             }) : <div className="p-3 text-center text-[11px] text-slate-400 italic">No users found</div>}
                        </div>
                     </div>
                   )}
                </div>
             </div>
             
             <div className="flex items-center justify-between bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2">
                    <input type="checkbox" style={{ colorScheme: 'light' }} checked={isAllSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 text-[#00076F] focus:ring-[#00076F] border-gray-300 rounded cursor-pointer" />
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Select All</span>
                </div>
                <div className="text-[11px] font-bold text-[#00076F] bg-[#00076F]/10 px-2 py-0.5 rounded-md">{selectedCount} selected</div>
             </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleAddEvent} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-md text-[11px] font-bold border border-green-200 hover:bg-green-100 flex items-center transition-all active:scale-95 cursor-pointer"><Plus className="w-3 h-3 mr-1" /> Add Date</button>
                <button onClick={() => setSortMode(prev => prev === 'document' ? 'date' : 'document')} className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${sortMode === 'document' ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                    {sortMode === 'document' ? <><FileText className="w-3 h-3" /> Order: Doc</> : <><CalendarIcon className="w-3 h-3" /> Order: Date</>}
                </button>
                <button onClick={() => setShowAllHighlights(!showAllHighlights)} className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${showAllHighlights ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-white hover:bg-gray-50 border-gray-200'}`}>Highlights</button>
                
                {hasAnyReminders && (
                  <button 
                    onClick={() => setIsConfirmingClearReminders(true)} 
                    className="px-3 py-1.5 bg-red-50 text-red-700 rounded-md text-[11px] font-bold border border-red-200 hover:bg-red-100 flex items-center transition-all active:scale-95"
                  >
                    <BellOff className="w-3 h-3 mr-1" /> Clear Reminders
                  </button>
                )}

                <div className="flex-1 min-w-[4px]"></div>
                
                <button 
                  onClick={() => setIsConfirmingRedo(true)} 
                  className="px-3 py-1.5 text-[#00076F] bg-[#00076F]/5 border border-[#00076F]/10 rounded-md hover:bg-[#00076F]/10 transition-all active:scale-95 text-[11px] font-bold flex items-center" 
                  title="Rerun analysis"
                >
                  <RefreshCcw className="w-3 h-3 mr-1" /> 
                  Rerun
                </button>

                <div className="relative" ref={downloadRef}>
                  <button onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)} disabled={selectedCount === 0} className="px-3 py-1.5 text-gray-700 bg-gray-50 border border-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-100 transition-all active:scale-95 text-[11px] font-bold flex items-center cursor-pointer" title="Download schedule"><Download className="w-3 h-3 mr-1" /> Export</button>
                  {isDownloadMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
                      <button onClick={downloadICS} className="w-full text-left px-4 py-3 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors border-b border-gray-100"><CalendarIcon className="w-4 h-4 text-[#00076F]" /> Calendar (.ics)</button>
                      <button onClick={downloadCSV} className="w-full text-left px-4 py-3 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"><Table className="w-4 h-4 text-green-600" /> Spreadsheet (.csv)</button>
                    </div>
                  )}
                </div>
             </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/50">
          <AnimatePresence initial={false}>
            {sortedEvents.map(event => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <EventCard 
                  event={event} 
                  onFindInDoc={handleFindInDoc} 
                  onUpdate={handleUpdateEvent} 
                  onDelete={handleDeleteEvent} 
                  isExpanded={expandedEventId === event.id} 
                  onToggleExpand={(expanded) => setExpandedEventId(expanded ? event.id : null)} 
                  involvedStaff={analysisState.involvedStaff}
                  involvedAttorneys={analysisState.involvedAttorneys}
                  availableCalendars={analysisState.availableCalendars || []}
                  defaultCalendarName={analysisState.defaultCalendarName}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {events.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No dates extracted from this document.</p>
              </div>
          )}
        </div>
      </div>

      <div className="hidden lg:flex w-4 hover:bg-[#00076F]/10 cursor-col-resize items-center justify-center z-20 -ml-2 group" onMouseDown={() => setIsResizing(true)}>
         <div className="w-1 h-12 bg-gray-300 rounded-full group-hover:bg-[#00076F]"></div>
      </div>

      <div className="flex-1 h-full bg-slate-200 relative hidden lg:flex lg:flex-col overflow-hidden">
         <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between z-20 shadow-sm">
            <div className="flex items-center text-sm text-gray-600 min-w-0 mr-4">
                <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate font-medium">{file.name}</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                    <div className="absolute left-2.5 text-gray-400"><Search className="w-4 h-4" /></div>
                    <input ref={searchInputRef} type="text" style={{ colorScheme: 'light' }} placeholder="Search document... (Ctrl+F)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-24 py-1.5 text-sm bg-gray-100 border-transparent border focus:bg-white focus:border-[#00076F] focus:ring-2 focus:ring-[#00076F]/10 rounded-lg outline-none w-64 transition-all text-gray-900" />
                    {searchQuery && (
                        <div className="absolute right-2 flex items-center gap-1">
                            <span className="text-[11px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-md">{allMatches.length > 0 ? `${searchIndex + 1}/${allMatches.length}` : '0/0'}</span>
                            <button onClick={() => navigateSearch('prev')} className="p-1 hover:bg-gray-200 rounded text-gray-600"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => navigateSearch('next')} className="p-1 hover:bg-gray-200 rounded text-gray-600"><ChevronDown className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </div>
                <div className="h-6 w-px bg-gray-200 mx-2"></div>
                <a href={pdfBlobUrl} target="_blank" rel="noreferrer" className="p-2 text-gray-500 hover:text-[#00076F] hover:bg-gray-100 rounded-lg transition-colors" title="Open PDF in new tab"><ExternalLink className="w-4 h-4" /></a>
            </div>
         </div>
         <div className="flex-1 w-full bg-gray-300 overflow-y-auto custom-scrollbar p-8">
            {isLoadingPdf ? (
                <div className="flex h-full items-center justify-center flex-col gap-3">
                    <Loader2 className="animate-spin text-[#00076F] w-10 h-10" />
                    <span className="text-gray-500 font-medium">Preparing document viewer...</span>
                </div>
            ) : (
                 <div className="max-w-4xl mx-auto pb-20">
                    {Array.from({ length: numPages }, (_, i) => (
                        <PdfPage key={i} pageNumber={i + 1} pdfDocument={pdfDocument} events={events} focusedEvent={focusState.event} focusTrigger={focusState.trigger} showAllHighlights={showAllHighlights} searchQuery={searchQuery} searchIndex={searchIndex} allMatches={allMatches} isOcr={isOcr} />
                    ))}
                 </div>
            )}
         </div>
         <div className="bg-white border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-[11px] text-gray-400 font-medium">
             <div className="flex items-center gap-3"><span>{numPages} Pages</span><span>•</span><span>{events.length} Extracted Items</span></div>
             <div>Scroll to find: <span className="text-[#00076F]">Orange Arrow</span> indicates active focus</div>
         </div>
      </div>
    </div>
  );
};

export default ResultsView;
