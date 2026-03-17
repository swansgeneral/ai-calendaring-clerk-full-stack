
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hero from './components/Hero';
import FileUpload from './components/FileUpload';
import ResultsView from './components/ResultsView';
import SOPDashboard from './components/SOPDashboard';
import { analyzeDocument, applyAutoReminders } from './services/geminiService';
import { fetchAllIntegrationData, saveSOPData, fetchClioUsers, fetchClioCalendars, getUsers, getCalendars } from './services/webhookService';
import { AnalyzedDoc, Event, AnalysisState, SOPEvent, SOPReminder } from './types';
import { AlertCircle, Database, FileSearch, CheckCircle2, Link, ChevronLeft, ChevronRight } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<'analyzer' | 'database'>('analyzer');
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [isClioAuthenticated, setIsClioAuthenticated] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: 'idle' });
  const [analyzedDocs, setAnalyzedDocs] = useState<AnalyzedDoc[]>([]);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [totalDocsToAnalyze, setTotalDocsToAnalyze] = useState(0);
  const [analyzedDocsCount, setAnalyzedDocsCount] = useState(0);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, phase: 'idle' });

  // Ref to track latest state for "Save on Exit"
  const latestSopStateRef = React.useRef({
    events: analysisState.sopEvents || [],
    reminders: analysisState.sopReminders || [],
    users: analysisState.availableUsers || [],
    calendars: analysisState.availableCalendars || []
  });

  useEffect(() => {
    latestSopStateRef.current = {
      events: analysisState.sopEvents || [],
      reminders: analysisState.sopReminders || [],
      users: analysisState.availableUsers || [],
      calendars: analysisState.availableCalendars || []
    };
  }, [analysisState.sopEvents, analysisState.sopReminders, analysisState.availableUsers, analysisState.availableCalendars]);

  const checkClioStatus = async (retries = 3): Promise<{ authenticated: boolean; configured?: boolean }> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/clio/status');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setIsClioAuthenticated(data.authenticated);
        return data;
      } catch (error) {
        console.warn(`Clio status check attempt ${i + 1} failed:`, error);
        if (i === retries - 1) {
          console.error("Failed to check Clio status after retries:", error);
          return { authenticated: false };
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
    return { authenticated: false };
  };

  const loadSOPData = async () => {
    const status = await checkClioStatus();
    
    const sopData = await fetchAllIntegrationData();

    if (!status.authenticated) {
      setAnalysisState(prev => ({
        ...prev,
        availableUsers: prev.availableUsers || [],
        availableCalendars: prev.availableCalendars || [],
        sopEvents: sopData.sopEvents,
        sopReminders: sopData.sopReminders,
      }));
      return;
    }

    const [users, calendars] = await Promise.all([
      getUsers(),
      getCalendars()
    ]);
    
    setAnalysisState(prev => ({
      ...prev,
      availableUsers: users,
      availableCalendars: calendars,
      sopEvents: sopData.sopEvents,
      sopReminders: sopData.sopReminders,
      defaultCalendarName: undefined
    }));
  };

  useEffect(() => {
    // Initial load for analyzer view if needed, but the user wants 
    // "server should only be checked for changes when the user accesses the sop dashboard"
    // However, we need initial users/calendars for the analyzer too.
    // So we'll keep the initial load but focus the real-time sync on the dashboard.
    loadSOPData();

    // Listen for OAuth success message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CLIO_AUTH_SUCCESS') {
        checkClioStatus().then(() => loadSOPData());
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'clio_auth_status' && event.newValue?.startsWith('success_')) {
        checkClioStatus().then(() => loadSOPData());
        localStorage.removeItem('clio_auth_status');
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // WebSocket and "Save on Exit" logic for Database View
  useEffect(() => {
    if (view !== 'database') return;

    // 1. Check for changes on enter
    loadSOPData();

    // 2. WebSocket for real-time SOP updates
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWS = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'SOP_UPDATE') {
              const container = Array.isArray(message.data) ? message.data[0] : message.data;
              if (container) {
                setAnalysisState(prev => ({
                  ...prev,
                  sopEvents: container["Calendar Events"] || [],
                  sopReminders: container.Reminders || []
                }));
              }
            }
          } catch (e) {}
        };

        ws.onerror = () => {
          // Silently handle to avoid unhandled rejections in console
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWS, 5000);
        };
      } catch (err) {
        reconnectTimeout = setTimeout(connectWS, 5000);
      }
    };

    connectWS();

    // 3. Save on Exit (Cleanup function)
    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      clearTimeout(reconnectTimeout);

      // Save changes to server
      const state = latestSopStateRef.current;
      saveSOPData({
        Reminders: state.reminders,
        "Calendar Events": state.events
      }).catch(err => console.error("Failed to save SOP on exit:", err));
    };
  }, [view]);

  const handleClioAuth = async () => {
    try {
      const response = await fetch('/api/auth/clio/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        url,
        'clio_oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error) {
      console.error("OAuth error:", error);
      alert("Failed to start Clio authentication. Please check your configuration.");
    }
  };

  const handleClioSync = async () => {
    try {
      const [users, calendars, currentSopData] = await Promise.all([
        fetchClioUsers(),
        fetchClioCalendars(),
        fetchAllIntegrationData()
      ]);
      
      setAnalysisState(prev => ({
        ...prev,
        availableUsers: users,
        availableCalendars: calendars,
        sopEvents: currentSopData.sopEvents,
        sopReminders: currentSopData.sopReminders
      }));

      // Also update the local database with new users and calendars, preserving SOP events/reminders
      const success = await saveSOPData({
        Reminders: currentSopData.sopReminders,
        "Calendar Events": currentSopData.sopEvents
      });
      
      if (success) {
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 2000);
      }
    } catch (error) {
      console.error("Failed to sync Clio data:", error);
      setIsClioAuthenticated(false);
    }
  };

  const handleSOPUpdate = (newEvents?: SOPEvent[], newReminders?: SOPReminder[]) => {
    setAnalysisState(prev => ({
      ...prev,
      sopEvents: newEvents !== undefined ? newEvents : (prev.sopEvents || []),
      sopReminders: newReminders !== undefined ? newReminders : (prev.sopReminders || []),
    }));
  };

  const handleSaveSOP = async () => {
    const success = await saveSOPData({
      Reminders: analysisState.sopReminders || [],
      "Calendar Events": analysisState.sopEvents || []
    });
    
    if (success) {
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2000);
    }
  };

  // Debounced auto-save effect removed as per user request
  // (Changes are now saved only when exiting the SOP dashboard)

  const handleViewChange = async (newView: 'analyzer' | 'database') => {
    if (view === 'database' && newView === 'analyzer') {
      // Auto-save when leaving database view
      await handleSaveSOP();
    }
    setView(newView);
  };

  const handleFilesSelect = async (files: File[]) => {
    setTotalDocsToAnalyze(files.length);
    setAnalyzedDocsCount(0);
    setBatchProgress({ current: 0, total: 0, phase: 'idle' });
    setCurrentDocIndex(0);
    setAnalysisState(prev => ({ ...prev, status: 'analyzing' }));

    // Initialize all docs as pending
    const initialDocs: AnalyzedDoc[] = files.map(file => ({
      fileName: file.name,
      file: file,
      status: 'pending',
      events: [],
      stats: { totalEvents: 0, matchedEvents: 0, remindersAdded: 0 }
    }));
    
    setAnalyzedDocs(initialDocs);

    // Start analysis process
    const analyzeDocsSequentially = async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Update status to analyzing for current doc
        setAnalyzedDocs(prev => prev.map((doc, idx) => 
          idx === i ? { ...doc, status: 'analyzing' } : doc
        ));

        try {
          // Step 1: Analyze Document for Events
          const results = await analyzeDocument(file, (progress) => {
            setBatchProgress({
              current: progress.current,
              total: progress.total,
              phase: progress.phase
            });
          });
          let finalEvents = results.events;
          let matchedCount = 0;
          let remindersAddedCount = 0;

          // Step 2: Apply Auto-Reminders using Relational SOP Data
          if (analysisState.sopEvents && analysisState.sopReminders && analysisState.sopEvents.length > 0) {
            setBatchProgress(prev => ({ ...prev, phase: 'matching' }));
            try {
              const autoResult = await applyAutoReminders(
                finalEvents,
                results.caseType,
                analysisState.sopEvents,
                analysisState.sopReminders,
                file
              );
              
              // Simulate the "reminders" phase for progress bar feel
              setBatchProgress(prev => ({ ...prev, phase: 'reminders' }));
              
              finalEvents = autoResult.events;
              matchedCount = autoResult.matchedCount;
              remindersAddedCount = autoResult.remindersAddedCount;
            } catch (autoErr) {
              console.error(`Auto-reminders application failed for ${file.name}:`, autoErr);
            }
          }

          const analyzedDoc: Partial<AnalyzedDoc> = {
            status: 'success',
            events: finalEvents,
            caseType: results.caseType,
            stats: {
              totalEvents: finalEvents.length,
              matchedEvents: matchedCount,
              remindersAdded: remindersAddedCount
            }
          };

          setAnalyzedDocs(prev => prev.map((doc, idx) => 
            idx === i ? { ...doc, ...analyzedDoc } : doc
          ));
          
          setAnalyzedDocsCount(i + 1);

          // If this is the first document, transition to success view immediately
          if (i === 0) {
            setEvents(finalEvents);
            setAnalysisState(prev => ({ 
              ...prev,
              status: 'success', 
              caseType: results.caseType
            }));

            // Automatically sync Clio data if authenticated
            if (isClioAuthenticated) {
              handleClioSync();
            }
          } else if (currentDocIndex === i) {
            // If the user navigated to this document while it was analyzing, update current events
            setEvents(finalEvents);
            setAnalysisState(prev => ({ ...prev, caseType: results.caseType }));
          }

        } catch (error: any) {
          console.error(`Failed to analyze document ${file.name}:`, error);
          setAnalyzedDocs(prev => prev.map((doc, idx) => 
            idx === i ? { ...doc, status: 'error', error: error.message } : doc
          ));
          
          if (i === 0) {
             setAnalysisState(prev => ({ 
               ...prev, 
               status: 'error', 
               message: `Failed to analyze ${file.name}: ${error.message}` 
             }));
          }
        }
      }
    };

    analyzeDocsSequentially();
  };

  const handleNextDoc = () => {
    if (currentDocIndex < analyzedDocs.length - 1) {
      const nextIndex = currentDocIndex + 1;
      const nextDoc = analyzedDocs[nextIndex];
      
      setCurrentDocIndex(nextIndex);
      setEvents(nextDoc.events || []);
      setAnalysisState(prev => ({ ...prev, caseType: nextDoc.caseType }));
    }
  };

  const handlePrevDoc = () => {
    if (currentDocIndex > 0) {
      const prevIndex = currentDocIndex - 1;
      const prevDoc = analyzedDocs[prevIndex];
      
      setCurrentDocIndex(prevIndex);
      setEvents(prevDoc.events || []);
      setAnalysisState(prev => ({ ...prev, caseType: prevDoc.caseType }));
    }
  };

  const handleReset = () => {
    setEvents([]);
    setAnalyzedDocs([]);
    setCurrentDocIndex(0);
    setTotalDocsToAnalyze(0);
    setAnalyzedDocsCount(0);
    setAnalysisState(prev => ({ 
      ...prev, 
      status: 'idle', 
      caseType: undefined,
      message: undefined
    }));
  };

  const updateAnalysisMetadata = (updates: Partial<AnalysisState>) => {
    setAnalysisState(prev => ({ ...prev, ...updates }));
  };

  const handleEventsChange = (newEvents: Event[]) => {
    setEvents(newEvents);
    setAnalyzedDocs(prev => {
      const updated = [...prev];
      if (updated[currentDocIndex]) {
        updated[currentDocIndex].events = newEvents;
      }
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className={`bg-[#020035] border-b border-white/10 ${analysisState.status === 'success' ? 'h-14' : 'h-16'} transition-all duration-300`}>
         <div className={`${analysisState.status === 'success' ? 'w-full px-4' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} h-full transition-all`}>
            <div className="flex justify-between items-center h-full">
               <div className="flex items-center">
                  <img 
                    src="https://swans.co/wp-content/uploads/2024/10/W-LOGO.svg" 
                    alt="Swans Logo" 
                    className={`${analysisState.status === 'success' ? 'h-[23px]' : 'h-[29px]'} w-auto object-contain transition-all`} 
                  />
               </div>

                 <div className="flex items-center gap-4">

                   {view === 'analyzer' && analysisState.status === 'success' && analyzedDocs.length > 1 && (
                    <div className="flex items-center gap-3 bg-white/5 rounded-lg p-1 border border-white/10 mr-4">
                      <div className="flex items-center gap-1.5 px-2 border-r border-white/10">
                        <div className="flex -space-x-1">
                          {analyzedDocs.map((doc, idx) => (
                            <div 
                              key={idx}
                              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                                idx === currentDocIndex 
                                  ? 'bg-blue-400 scale-125' 
                                  : doc.status === 'success' 
                                    ? 'bg-emerald-400' 
                                    : doc.status === 'error'
                                      ? 'bg-red-400'
                                      : 'bg-white/20 animate-pulse'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">
                          {analyzedDocsCount}/{analyzedDocs.length} Ready
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 px-1">
                        <button 
                          onClick={handlePrevDoc}
                          disabled={currentDocIndex === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold text-white/80 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-all bg-white/5 border border-white/10 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          PREVIOUS FILE
                        </button>
                        <button 
                          onClick={handleNextDoc}
                          disabled={currentDocIndex === analyzedDocs.length - 1}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold text-white/80 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-all bg-white/5 border border-white/10 cursor-pointer"
                        >
                          NEXT FILE
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                   <button
                     onClick={() => handleViewChange('analyzer')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${view === 'analyzer' ? 'bg-white/10 text-white shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5 hover:shadow-md'}`}
                  >
                    <FileSearch className="w-4 h-4" />
                    Analyzer
                  </button>
                  <button
                    onClick={() => handleViewChange('database')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${view === 'database' ? 'bg-white/10 text-white shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5 hover:shadow-md'}`}
                  >
                    <Database className="w-4 h-4" />
                    SOP Database
                  </button>
               </div>
            </div>
         </div>
      </div>

      {/* Save Toast */}
      {showSaveToast && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-medium text-sm">
            <CheckCircle2 className="w-4 h-4" />
            All changes saved.
          </div>
        </div>
      )}

      <main className={`${analysisState.status === 'success' && view === 'analyzer' ? 'h-[calc(100vh-3.5rem)] overflow-hidden' : 'pt-8 pb-20'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {view === 'database' ? (
              <div className="h-[calc(100vh-4rem)]">
                <SOPDashboard 
                  sopEvents={analysisState.sopEvents || []}
                  sopReminders={analysisState.sopReminders || []}
                  onUpdateEvents={(newEvents) => handleSOPUpdate(newEvents, undefined)}
                  onUpdateReminders={(newReminders) => handleSOPUpdate(undefined, newReminders)}
                  onUpdateAll={(newEvents, newReminders) => handleSOPUpdate(newEvents, newReminders)}
                  onSave={handleSaveSOP}
                />
              </div>
            ) : (
              <>
                {analysisState.status === 'idle' && !isClioAuthenticated && (
                    <div className="max-w-2xl mx-auto mt-10 px-4">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                            <div className="w-16 h-16 bg-[#00076F]/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Link className="w-8 h-8 text-[#00076F]" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Connect to Clio Manage</h3>
                            <p className="text-slate-600 mb-6">
                                To use the AI Calendaring Clerk, you need to connect your Clio Manage account. 
                                This will allow the app to fetch your firm's users, calendars, and sync identified events.
                            </p>
                            <div className="flex justify-center">
                              <button
                                onClick={handleClioAuth}
                                className="px-8 py-3 bg-[#00076F] text-white font-bold rounded-xl hover:bg-[#00076F]/90 transition-all flex items-center gap-2 justify-center shadow-lg shadow-[#00076F]/20 cursor-pointer"
                              >
                                <Link className="w-4 h-4" />
                                Connect Clio Account
                              </button>
                            </div>
                        </div>
                    </div>
                )}

                {analysisState.status === 'idle' && isClioAuthenticated && (
                    <>
                        <Hero />
                        <div className="mt-4">
                            <FileUpload onFilesSelect={handleFilesSelect} isLoading={false} analyzedCount={0} totalCount={0} />
                        </div>
                    </>
                )}

                {analysisState.status === 'analyzing' && (
                    <>
                        <Hero />
                        <div className="mt-4">
                            <FileUpload 
                              onFilesSelect={() => {}} 
                              isLoading={true} 
                              analyzedCount={analyzedDocsCount} 
                              totalCount={totalDocsToAnalyze} 
                              batchProgress={batchProgress}
                            />
                        </div>
                    </>
                )}

                {analysisState.status === 'error' && (
                    <div className="max-w-2xl mx-auto mt-10 px-4">
                         <div className="rounded-md bg-red-50 p-4 border border-red-200">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">Analysis Error</h3>
                                    <div className="mt-2 text-sm text-red-700">
                                        <p>{analysisState.message}</p>
                                    </div>
                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {analysisState.status === 'success' && analyzedDocs.length > 0 && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentDocIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="h-full"
                    >
                      <ResultsView 
                        events={events} 
                        file={analyzedDocs[currentDocIndex].file} 
                        analysisState={analysisState}
                        currentDoc={analyzedDocs[currentDocIndex]}
                        onUpdateMetadata={updateAnalysisMetadata}
                        onReset={handleReset} 
                        onRedo={() => handleFilesSelect(analyzedDocs.map(d => d.file))}
                        onEventsChange={handleEventsChange}
                      />
                    </motion.div>
                  </AnimatePresence>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
