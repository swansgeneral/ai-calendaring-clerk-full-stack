import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SOPEvent, SOPReminder } from '../types';
import { 
  Plus, Trash2, ChevronRight, ChevronDown, Clock, Bell, 
  Edit3, Mail, Calendar as CalendarIcon,
  UserCheck, ShieldCheck, X, Search, Filter, Info, CheckCircle2, Database
} from 'lucide-react';

const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <div className="group/tip relative inline-block ml-1.5 align-middle">
    <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 bg-slate-800 text-white text-[11px] rounded shadow-xl opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-[100] pointer-events-none font-medium leading-relaxed">
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-slate-800" />
      {text}
    </div>
  </div>
);

interface SOPDashboardProps {
  sopEvents: SOPEvent[];
  sopReminders: SOPReminder[];
  onUpdateEvents: (events: SOPEvent[]) => void;
  onUpdateReminders: (reminders: SOPReminder[]) => void;
  onUpdateAll?: (events: SOPEvent[], reminders: SOPReminder[]) => void;
  onSave?: () => Promise<void>;
}

const SOPDashboard: React.FC<SOPDashboardProps> = ({ 
  sopEvents, 
  sopReminders, 
  onUpdateEvents, 
  onUpdateReminders,
  onUpdateAll,
  onSave
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCaseType, setFilterCaseType] = useState<string>('All');
  const [filterMinReminders, setFilterMinReminders] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState<Partial<SOPEvent>>({
    "Event Name": "",
    "Case Type": "Personal Injury",
    "Title in Calendar Event": "",
    "Description in Calendar Event": "",
    "Invite All Attorneys": true,
    "Invite All Staff Members": true,
    "Default Duration (Hours)": 1,
    "Reminders": []
  });

  const getDurationMs = (quantity: number, unit: string) => {
    const multipliers: Record<string, number> = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
    };
    return quantity * (multipliers[unit] || 0);
  };

  const sortReminders = (reminderIds: string[]) => {
    return [...reminderIds].sort((a, b) => {
      const ra = sopReminders.find(r => r.id === a);
      const rb = sopReminders.find(r => r.id === b);
      if (!ra || !rb) return 0;
      return getDurationMs(ra.Quantity, ra.Unit) - getDurationMs(rb.Quantity, rb.Unit);
    });
  };

  const addEvent = () => {
    setIsAddModalOpen(true);
  };

  const handleCreateEvent = () => {
    setValidationError(null);
    if (!newEvent["Event Name"]?.trim()) {
      setValidationError("Event Name is required.");
      return;
    }
    if (!newEvent["Title in Calendar Event"]?.trim()) {
      setValidationError("Calendar Title Template is required.");
      return;
    }
    if (!newEvent["Description in Calendar Event"]?.trim()) {
      setValidationError("Description Template is required.");
      return;
    }
    if (newEvent["Default Duration (Hours)"] === null || newEvent["Default Duration (Hours)"] === undefined) {
      setValidationError("Default Duration is required.");
      return;
    }

    const newId = `rec${Math.random().toString(36).substr(2, 9)}`;
    const eventToSave: SOPEvent = {
      ...newEvent,
      id: newId,
      RecordID: newId,
      "Event Name": newEvent["Event Name"] || "New Event Type",
      "Case Type": newEvent["Case Type"] || "Personal Injury",
      "Title in Calendar Event": newEvent["Title in Calendar Event"] || "New Event Title",
      "Description in Calendar Event": newEvent["Description in Calendar Event"] || "",
      "Invite All Attorneys": newEvent["Invite All Attorneys"] ?? true,
      "Invite All Staff Members": newEvent["Invite All Staff Members"] ?? true,
      "Default Duration (Hours)": newEvent["Default Duration (Hours)"] ?? 1,
      "Reminders": []
    } as SOPEvent;
    
    onUpdateEvents([eventToSave, ...sopEvents]);
    setIsAddModalOpen(false);
    setNewEvent({
      "Event Name": "",
      "Case Type": "Personal Injury",
      "Title in Calendar Event": "",
      "Description in Calendar Event": "",
      "Invite All Attorneys": true,
      "Invite All Staff Members": true,
      "Default Duration (Hours)": 1,
      "Reminders": []
    });
    setExpandedEventId(newId);
  };

  const updateEvent = (id: string, updates: Partial<SOPEvent>) => {
    onUpdateEvents(sopEvents.map(e => (e.id === id || e.RecordID === id) ? { ...e, ...updates } : e));
  };

  const deleteEvent = (id: string) => {
    const eventToDelete = sopEvents.find(e => e.id === id || e.RecordID === id);
    if (!eventToDelete) return;

    const reminderIdsToDelete = eventToDelete.Reminders || [];
    
    // Filter out the event
    const updatedEvents = sopEvents.filter(e => e.id !== id && e.RecordID !== id);
    
    // Filter out its reminders
    const updatedReminders = sopReminders.filter(r => 
      !reminderIdsToDelete.includes(r.id) && 
      !reminderIdsToDelete.includes(r["Reminder ID"])
    );

    if (onUpdateAll) {
      onUpdateAll(updatedEvents, updatedReminders);
    } else {
      onUpdateEvents(updatedEvents);
      onUpdateReminders(updatedReminders);
    }

    setEditingEventId(null);
    setExpandedEventId(null);
  };

  const addReminder = (eventId: string) => {
    const newId = `rec${Math.random().toString(36).substr(2, 9)}`;
    const newReminder: SOPReminder = {
      id: newId,
      "Reminder ID": newId,
      "Unit": "days",
      "Quantity": 1,
      "Type of Reminder": "Email",
      "Remind All Attorneys": true,
      "Remind All Staff Members": true,
      "Calendar Event Reminder Title": "Reminder Title",
      "Calendar Event Reminder Description": "",
      "Calendar Event": [eventId]
    };
    
    const updatedReminders = [...sopReminders, newReminder];
    const updatedEvents = sopEvents.map(e => e.id === eventId ? { ...e, Reminders: [...(e.Reminders || []), newId] } : e);

    if (onUpdateAll) {
      onUpdateAll(updatedEvents, updatedReminders);
    } else {
      onUpdateReminders(updatedReminders);
      onUpdateEvents(updatedEvents);
    }
    
    setEditingReminderId(newId);
  };

  const updateReminder = (id: string, updates: Partial<SOPReminder>) => {
    onUpdateReminders(sopReminders.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteReminder = (eventId: string, reminderId: string) => {
    const updatedReminders = sopReminders.filter(r => r.id !== reminderId);
    const updatedEvents = sopEvents.map(e => e.id === eventId ? { ...e, Reminders: (e.Reminders || []).filter(rid => rid !== reminderId) } : e);
    
    if (onUpdateAll) {
      onUpdateAll(updatedEvents, updatedReminders);
    } else {
      onUpdateReminders(updatedReminders);
      onUpdateEvents(updatedEvents);
    }
    
    if (editingReminderId === reminderId) setEditingReminderId(null);
  };

  const seedSampleData = () => {
    const trialId = `rec_trial_${Math.random().toString(36).substr(2, 5)}`;
    const depoId = `rec_depo_${Math.random().toString(36).substr(2, 5)}`;
    const mediationId = `rec_med_${Math.random().toString(36).substr(2, 5)}`;

    const sampleEvents: SOPEvent[] = [
      {
        id: trialId,
        RecordID: trialId,
        "Event Name": "Jury Trial",
        "Case Type": "Personal Injury",
        "Title in Calendar Event": "Jury Trial: {Case Name}",
        "Description in Calendar Event": "Trial commencement. Ensure all exhibits are ready. {prompt}",
        "Invite All Attorneys": true,
        "Invite All Staff Members": true,
        "Default Duration (Hours)": 8,
        "Reminders": [`rem_trial_1_${trialId}`, `rem_trial_2_${trialId}`]
      },
      {
        id: depoId,
        RecordID: depoId,
        "Event Name": "Deposition",
        "Case Type": "Personal Injury",
        "Title in Calendar Event": "Deposition: {Deponent Name}",
        "Description in Calendar Event": "Deposition of {Deponent Name}. Location: {Location}. {prompt}",
        "Invite All Attorneys": true,
        "Invite All Staff Members": false,
        "Default Duration (Hours)": 4,
        "Reminders": [`rem_depo_1_${depoId}`]
      },
      {
        id: mediationId,
        RecordID: mediationId,
        "Event Name": "Mediation",
        "Case Type": "Civil",
        "Title in Calendar Event": "Mediation: {Case Name}",
        "Description in Calendar Event": "Mediation session. Review settlement authority. {prompt}",
        "Invite All Attorneys": true,
        "Invite All Staff Members": true,
        "Default Duration (Hours)": 6,
        "Reminders": [`rem_med_1_${mediationId}`]
      }
    ];

    const sampleReminders: SOPReminder[] = [
      {
        id: `rem_trial_1_${trialId}`,
        "Reminder ID": `rem_trial_1_${trialId}`,
        "Unit": "weeks",
        "Quantity": 1,
        "Type of Reminder": "Email",
        "Remind All Attorneys": true,
        "Remind All Staff Members": true,
        "Calendar Event": [trialId]
      },
      {
        id: `rem_trial_2_${trialId}`,
        "Reminder ID": `rem_trial_2_${trialId}`,
        "Unit": "days",
        "Quantity": 1,
        "Type of Reminder": "Email",
        "Remind All Attorneys": true,
        "Remind All Staff Members": true,
        "Calendar Event": [trialId]
      },
      {
        id: `rem_depo_1_${depoId}`,
        "Reminder ID": `rem_depo_1_${depoId}`,
        "Unit": "days",
        "Quantity": 2,
        "Type of Reminder": "Email",
        "Remind All Attorneys": true,
        "Remind All Staff Members": false,
        "Calendar Event": [depoId]
      },
      {
        id: `rem_med_1_${mediationId}`,
        "Reminder ID": `rem_med_1_${mediationId}`,
        "Unit": "days",
        "Quantity": 3,
        "Type of Reminder": "Email",
        "Remind All Attorneys": true,
        "Remind All Staff Members": true,
        "Calendar Event": [mediationId]
      }
    ];

    if (onUpdateAll) {
      onUpdateAll(sampleEvents, sampleReminders);
    } else {
      onUpdateEvents(sampleEvents);
      onUpdateReminders(sampleReminders);
    }
  };

  const filteredEvents = sopEvents
    .filter(event => {
      const matchesSearch = (event["Event Name"] || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCaseType = filterCaseType === 'All' || event["Case Type"] === filterCaseType;
      
      const reminderCount = (event.Reminders || []).length;
      let matchesReminders = true;
      if (filterMinReminders === -1) {
        matchesReminders = reminderCount === 0;
      } else if (filterMinReminders !== null) {
        matchesReminders = reminderCount >= filterMinReminders;
      }

      return matchesSearch && matchesCaseType && matchesReminders;
    })
    .sort((a, b) => (a["Event Name"] || '').localeCompare(b["Event Name"] || ''));

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col gap-4">
            {/* Search and Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <div className="flex-1 min-w-[240px] relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by event name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#020035] outline-none transition-all"
                  />
                </div>

                {/* Case Type Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={filterCaseType}
                    onChange={(e) => setFilterCaseType(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#020035] outline-none"
                  >
                    <option value="All">All Case Types</option>
                    <option value="Personal Injury">Personal Injury</option>
                    <option value="Civil">Civil</option>
                  </select>
                </div>

                {/* Min Reminders Filter */}
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-400" />
                  <select
                    value={filterMinReminders === null ? 'All' : filterMinReminders}
                    onChange={(e) => setFilterMinReminders(e.target.value === 'All' ? null : parseInt(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#020035] outline-none"
                  >
                    <option value="All">Any Reminders</option>
                    <option value="-1">No Reminders</option>
                    <option value="1">1+ Reminders</option>
                    <option value="3">3+ Reminders</option>
                    <option value="5">5+ Reminders</option>
                  </select>
                </div>

                <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

                {(searchTerm || filterCaseType !== 'All' || filterMinReminders !== null) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterCaseType('All');
                      setFilterMinReminders(null);
                    }}
                    className="text-xs font-bold text-red-600 hover:text-red-700 underline underline-offset-4 mr-2 cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}

                <button
                  onClick={addEvent}
                  className="flex items-center gap-2 px-4 py-2 bg-[#020035] text-white rounded-lg hover:bg-[#030050] transition-all shadow-sm hover:shadow-md font-bold text-sm whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Event Type
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {sopEvents.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-6">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                  <Database className="w-8 h-8 text-slate-300" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">Your SOP Database is Empty</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    The AI Clerk uses this database to match extracted events and automatically add reminders. 
                    Add your first event type manually or start with our sample legal templates.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={addEvent}
                    className="px-6 py-2.5 bg-[#020035] text-white rounded-lg font-bold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    Add Manually
                  </button>
                  <button
                    onClick={seedSampleData}
                    className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Seed Sample Data
                  </button>
                </div>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No event types match your current filters.</p>
              </div>
            ) : filteredEvents.map((event) => (
              <div key={event.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all hover:border-slate-300">
                {/* Event Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                      {expandedEventId === event.id ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      {editingEventId === event.id ? (
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={event["Event Name"] || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateEvent(event.id, { "Event Name": e.target.value })}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-900 focus:ring-2 focus:ring-[#020035] outline-none min-w-[200px]"
                            placeholder="Event Name"
                          />
                          <select
                            value={event["Case Type"] || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateEvent(event.id, { "Case Type": e.target.value })}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-medium text-slate-600 focus:ring-2 focus:ring-[#020035] outline-none"
                          >
                            <option value="Personal Injury">Personal Injury</option>
                            <option value="Civil">Civil</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{event["Event Name"]}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-bold border bg-slate-50 text-slate-600 border-slate-100">
                            {event["Case Type"]}
                          </span>
                        </div>
                      )}
                      <div className="text-sm text-slate-500 mt-1 flex items-center gap-4">
                        <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> {(event.Reminders || []).length} Reminders</span>
                        <div className="flex items-center gap-3">
                          {event["Invite All Attorneys"] && (
                            <span className="flex items-center gap-1 text-purple-600 font-medium text-xs bg-purple-50 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-3 h-3" /> Attorneys
                            </span>
                          )}
                          {event["Invite All Staff Members"] && (
                            <span className="flex items-center gap-1 text-blue-600 font-medium text-xs bg-blue-50 px-2 py-0.5 rounded-full">
                              <UserCheck className="w-3 h-3" /> Staff Members
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingEventId === event.id && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={(e) => { e.stopPropagation(); deleteEvent(event.id); }}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                        title="Delete Event Type"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingEventId(editingEventId === event.id ? null : event.id); if (expandedEventId !== event.id) setExpandedEventId(event.id); }}
                      className={`p-2 rounded-lg transition-all cursor-pointer ${editingEventId === event.id ? 'bg-[#020035] text-white shadow-md' : 'text-slate-400 hover:text-[#020035] hover:bg-slate-100 hover:shadow-sm'}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Event Details (Expanded) */}
                <AnimatePresence>
                  {expandedEventId === event.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 border-t border-slate-100 bg-slate-50/30 space-y-6">
                        <AnimatePresence mode="wait">
                          {editingEventId === event.id ? (
                            <motion.div 
                              key="edit-form"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-6 rounded-xl border border-slate-200 shadow-inner"
                            >
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Calendar Title Template <span className="text-red-500">*</span>
                                    <InfoTip text="The title that will appear on the calendar event." />
                                  </label>
                                  <input
                                    type="text"
                                    value={event["Title in Calendar Event"] || ''}
                                    onChange={(e) => updateEvent(event.id, { "Title in Calendar Event": e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#020035] focus:border-transparent outline-none transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Description Template <span className="text-red-500">*</span>
                                    <InfoTip text="Detailed instructions for the event. Use {prompt} to have the AI extract specific details or generate text based on the document context." />
                                  </label>
                                  <textarea
                                    value={event["Description in Calendar Event"] || ''}
                                    onChange={(e) => updateEvent(event.id, { "Description in Calendar Event": e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:ring-2 focus:ring-[#020035] focus:border-transparent outline-none transition-all resize-none"
                                    placeholder="e.g. Schedule order for {Judge Name}."
                                  />
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Default Duration (Hours) <span className="text-red-500">*</span>
                                    <InfoTip text="The length of the event in hours. Use 24 for all-day events." />
                                  </label>
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={event["Default Duration (Hours)"] ?? ''}
                                      onChange={(e) => updateEvent(event.id, { "Default Duration (Hours)": e.target.value === '' ? null : parseFloat(e.target.value) })}
                                      className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#020035] focus:border-transparent outline-none transition-all"
                                      placeholder="e.g. 1.5"
                                    />
                                    <span className="text-xs text-slate-500 italic">Use 24 for All Day events</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Default Invitees
                                    <InfoTip text="Who should be automatically invited to this event when it's created." />
                                  </label>
                                  <div className="flex gap-4 mt-2">
                                    <button
                                      onClick={() => updateEvent(event.id, { "Invite All Attorneys": !event["Invite All Attorneys"] })}
                                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border flex-1 transition-all cursor-pointer ${event["Invite All Attorneys"] ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm hover:shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                                    >
                                      <ShieldCheck className={`w-6 h-6 ${event["Invite All Attorneys"] ? 'text-purple-600' : 'text-slate-300'}`} />
                                      <span className="text-xs font-bold">Invite Attorneys</span>
                                    </button>
                                    <button
                                      onClick={() => updateEvent(event.id, { "Invite All Staff Members": !event["Invite All Staff Members"] })}
                                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border flex-1 transition-all cursor-pointer ${event["Invite All Staff Members"] ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm hover:shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                                    >
                                      <UserCheck className={`w-6 h-6 ${event["Invite All Staff Members"] ? 'text-blue-600' : 'text-slate-300'}`} />
                                      <span className="text-xs font-bold">Invite Staff Members</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div 
                              key="view-details"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="grid grid-cols-1 md:grid-cols-2 gap-8"
                            >
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 mb-3">Calendar Template</h4>
                                <div className="space-y-4">
                                   <div>
                                      <p className="text-sm font-bold text-slate-900">{event["Title in Calendar Event"] || 'No title template'}</p>
                                      <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">{event["Description in Calendar Event"] || 'No description template'}</p>
                                   </div>
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 mb-3">Settings</h4>
                                <div className="mb-4">
                                   <span className="text-xs font-bold text-slate-500 block mb-1">Default Duration</span>
                                   <p className="text-sm font-bold text-slate-900">
                                     {event["Default Duration (Hours)"] === 24 ? 'All Day (24h)' : `${event["Default Duration (Hours)"] || 'System Default'} hours`}
                                   </p>
                                </div>
                                <h4 className="text-xs font-bold text-slate-400 mb-3">Default Invitees</h4>
                                <div className="flex gap-4">
                                  <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border flex-1 transition-all ${event["Invite All Attorneys"] ? 'bg-purple-50 border-purple-100 text-purple-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                    <ShieldCheck className={`w-6 h-6 ${event["Invite All Attorneys"] ? 'text-purple-600' : 'text-slate-300'}`} />
                                    <span className="text-xs font-bold">Attorneys</span>
                                  </div>
                                  <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border flex-1 transition-all ${event["Invite All Staff Members"] ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                    <UserCheck className={`w-6 h-6 ${event["Invite All Staff Members"] ? 'text-blue-600' : 'text-slate-300'}`} />
                                    <span className="text-xs font-bold">Staff Members</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                    {/* Reminders Section */}
                    <div className="space-y-4 pt-6 border-t border-slate-200">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Bell className="w-4 h-4" />
                          Reminders
                        </h4>
                        <button
                          onClick={() => addReminder(event.id)}
                          className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-[#020035] text-white rounded-lg hover:bg-[#030050] transition-all shadow-sm hover:shadow-md cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Reminder
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <AnimatePresence initial={false}>
                          {sortReminders(event.Reminders || []).map((reminderId) => {
                            const reminder = sopReminders.find(r => r.id === reminderId);
                            if (!reminder) return null;
                            const isEditing = editingReminderId === reminderId;
                            
                            return (
                              <motion.div 
                                key={reminderId} 
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`group relative bg-white border rounded-xl transition-all ${isEditing ? 'border-[#020035] shadow-md' : 'border-slate-200 hover:border-slate-300 shadow-sm'}`}
                              >
                                <AnimatePresence mode="wait">
                                  {isEditing ? (
                                    <motion.div 
                                      key="edit"
                                      initial={{ opacity: 0, scale: 0.98 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.98 }}
                                      transition={{ duration: 0.2 }}
                                      className="p-5 space-y-5 bg-white rounded-xl"
                                    >
                                      {/* Top Row: Type, Qty, Unit, Title */}
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                        <div className="md:col-span-3">
                                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                            Type of Reminder
                                            <InfoTip text="Choose between a Calendar Event reminder or an Email notification." />
                                          </label>
                                          <select
                                            value={reminder["Type of Reminder"]}
                                            onChange={(e) => updateReminder(reminderId, { "Type of Reminder": e.target.value as any })}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#020035] outline-none bg-slate-50/50"
                                          >
                                            <option value="Calendar Event">Calendar Event</option>
                                            <option value="Email">Email</option>
                                          </select>
                                        </div>
                                        <div className="md:col-span-2">
                                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                            Quantity
                                            <InfoTip text="The number of units before the event." />
                                          </label>
                                          <input
                                            type="number"
                                            value={reminder.Quantity}
                                            onChange={(e) => updateReminder(reminderId, { Quantity: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#020035] outline-none bg-slate-50/50"
                                          />
                                        </div>
                                        <div className="md:col-span-2">
                                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                            Unit
                                            <InfoTip text="The time unit for the reminder (minutes, hours, days, weeks)." />
                                          </label>
                                          <select
                                            value={reminder.Unit}
                                            onChange={(e) => updateReminder(reminderId, { Unit: e.target.value as any })}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#020035] outline-none bg-slate-50/50"
                                          >
                                            <option value="minutes">Minutes</option>
                                            <option value="hours">Hours</option>
                                            <option value="days">Days</option>
                                            <option value="weeks">Weeks</option>
                                          </select>
                                        </div>
                                        <div className="md:col-span-5">
                                          {reminder["Type of Reminder"] === 'Calendar Event' && (
                                            <>
                                              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                                Reminder Title
                                                <InfoTip text="The title that will appear for this reminder calendar event." />
                                              </label>
                                              <input
                                                type="text"
                                                value={reminder["Calendar Event Reminder Title"] || ''}
                                                onChange={(e) => updateReminder(reminderId, { "Calendar Event Reminder Title": e.target.value })}
                                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#020035] outline-none bg-slate-50/50 font-bold"
                                                placeholder="e.g. Final Deadline Reminder"
                                              />
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      {/* Bottom Row: Description and Invitees */}
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                        <div className="md:col-span-7">
                                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                            {reminder["Type of Reminder"] === 'Calendar Event' ? 'Description of the calendar event reminder' : 'Email Details'}
                                            <InfoTip text={reminder["Type of Reminder"] === 'Calendar Event' ? "Detailed instructions for the reminder event." : "Email reminders are sent automatically to selected recipients."} />
                                          </label>
                                          {reminder["Type of Reminder"] === 'Calendar Event' ? (
                                            <textarea
                                              value={reminder["Calendar Event Reminder Description"] || ''}
                                              onChange={(e) => updateReminder(reminderId, { "Calendar Event Reminder Description": e.target.value })}
                                              rows={4}
                                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#020035] outline-none resize-none bg-slate-50/50"
                                              placeholder="Detailed instructions for the calendar event..."
                                            />
                                          ) : (
                                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex items-center gap-3 text-slate-500 h-[108px]">
                                              <Mail className="w-5 h-5" />
                                              <p className="text-xs">Email reminders are sent automatically to selected recipients. No title or body template required.</p>
                                            </div>
                                          )}
                                        </div>
                                        <div className="md:col-span-5">
                                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                            Users to be reminded
                                            <InfoTip text="Who should receive this specific reminder." />
                                          </label>
                                          <div className="flex gap-3 h-[108px]">
                                            <button
                                              onClick={() => updateReminder(reminderId, { "Remind All Attorneys": !reminder["Remind All Attorneys"] })}
                                              className={`flex flex-col items-center justify-center gap-2 rounded-xl border flex-1 transition-all cursor-pointer ${reminder["Remind All Attorneys"] ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm hover:shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                              <ShieldCheck className={`w-6 h-6 ${reminder["Remind All Attorneys"] ? 'text-purple-600' : 'text-slate-300'}`} />
                                              <span className="text-[11px] font-bold">Remind Attorneys</span>
                                            </button>
                                            <button
                                              onClick={() => updateReminder(reminderId, { "Remind All Staff Members": !reminder["Remind All Staff Members"] })}
                                              className={`flex flex-col items-center justify-center gap-2 rounded-xl border flex-1 transition-all cursor-pointer ${reminder["Remind All Staff Members"] ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm hover:shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                              <UserCheck className={`w-6 h-6 ${reminder["Remind All Staff Members"] ? 'text-blue-600' : 'text-slate-300'}`} />
                                              <span className="text-[11px] font-bold">Remind Staff Members</span>
                                            </button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                        <button
                                          onClick={() => deleteReminder(event.id, reminderId)}
                                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" /> Delete Reminder
                                        </button>
                                        <button
                                          onClick={() => setEditingReminderId(null)}
                                          className="px-6 py-2 bg-[#020035] text-white text-xs font-bold rounded-lg hover:bg-[#030050] transition-all shadow-sm hover:shadow-md cursor-pointer"
                                        >
                                          Done
                                        </button>
                                      </div>
                                    </motion.div>
                                  ) : (
                                    <motion.div 
                                      key="view"
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="flex items-center justify-between p-4"
                                    >
                                      <div className="flex items-center gap-4 flex-1">
                                        <div className={`p-2.5 rounded-lg ${reminder["Type of Reminder"] === 'Email' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                          {reminder["Type of Reminder"] === 'Email' ? <Mail className="w-5 h-5" /> : <CalendarIcon className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 flex items-center justify-between">
                                          <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            {reminder["Type of Reminder"] === 'Email' ? (
                                              <>
                                                <span>Email</span>
                                                <span className="text-slate-400 font-normal">{reminder.Quantity} {reminder.Unit} before</span>
                                              </>
                                            ) : (
                                              <span className="flex items-center gap-2">
                                                <span>Calendar event</span>
                                                <span className="text-slate-400 font-normal">{reminder.Quantity} {reminder.Unit} before</span>
                                                <span className="text-[#020035] bg-slate-100 px-2 py-0.5 rounded ml-1">{reminder["Calendar Event Reminder Title"] || 'Untitled'}</span>
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 ml-4">
                                            {reminder["Remind All Attorneys"] && (
                                              <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-purple-100">
                                                <ShieldCheck className="w-3 h-3" /> Attorneys
                                              </span>
                                            )}
                                            {reminder["Remind All Staff Members"] && (
                                              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-blue-100">
                                                <UserCheck className="w-3 h-3" /> Staff Members
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => setEditingReminderId(reminderId)}
                                          className="p-2 text-slate-400 hover:text-[#020035] hover:bg-slate-100 rounded-lg transition-all cursor-pointer hover:shadow-sm"
                                        >
                                          <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => deleteReminder(event.id, reminderId)}
                                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer hover:shadow-sm"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                        {(event.Reminders || []).length === 0 && (
                          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">No reminders configured for this event type.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>

      {/* Add Event Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 flex-shrink-0">
                <h3 className="text-xl font-bold text-slate-900">Add New Event Type</h3>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {validationError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2"
                  >
                    <Info className="w-4 h-4" />
                    {validationError}
                  </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        Event Name <span className="text-red-500">*</span>
                        <InfoTip text="The name used to identify this event type in the system. It will be matched against document content." />
                      </label>
                      <input
                        type="text"
                        required
                        value={newEvent["Event Name"] || ''}
                        onChange={(e) => setNewEvent(prev => ({ ...prev, "Event Name": e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#020035] outline-none transition-all"
                        placeholder="e.g. Physical Examination (Plaintiff)"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          Case Type <span className="text-red-500">*</span>
                          <InfoTip text="The category of case this event belongs to. Helps narrow down relevant SOPs." />
                        </label>
                        <select
                          value={newEvent["Case Type"] || 'Personal Injury'}
                          onChange={(e) => setNewEvent(prev => ({ ...prev, "Case Type": e.target.value }))}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#020035] outline-none"
                        >
                          <option value="Personal Injury">Personal Injury</option>
                          <option value="Civil">Civil</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          Default Duration (Hours) <span className="text-red-500">*</span>
                          <InfoTip text="The length of the event in hours. Use 24 for all-day events." />
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          required
                          value={newEvent["Default Duration (Hours)"] ?? ''}
                          onChange={(e) => setNewEvent(prev => ({ ...prev, "Default Duration (Hours)": e.target.value === '' ? null : parseFloat(e.target.value) }))}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#020035] outline-none transition-all"
                          placeholder="e.g. 1.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        Calendar Title Template <span className="text-red-500">*</span>
                        <InfoTip text="The title that will appear on the calendar. You can use placeholders or static text." />
                      </label>
                      <input
                        type="text"
                        required
                        value={newEvent["Title in Calendar Event"] || ''}
                        onChange={(e) => setNewEvent(prev => ({ ...prev, "Title in Calendar Event": e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#020035] outline-none transition-all"
                        placeholder="e.g. OUR IMEs - DUE TODAY"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        Description Template <span className="text-red-500">*</span>
                        <InfoTip text="Detailed instructions for the event. Use {prompt} to have the AI extract specific details or generate text based on the document context." />
                      </label>
                      <textarea
                        value={newEvent["Description in Calendar Event"] || ''}
                        required
                        onChange={(e) => setNewEvent(prev => ({ ...prev, "Description in Calendar Event": e.target.value }))}
                        rows={8}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 focus:ring-2 focus:ring-[#020035] outline-none transition-all resize-none"
                        placeholder="e.g. Schedule order for {Judge Name}."
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-500 mb-3">
                    Default Invitees
                    <InfoTip text="Who should be automatically invited to this event when it's created." />
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setNewEvent(prev => ({ ...prev, "Invite All Attorneys": !prev["Invite All Attorneys"] }))}
                      className={`flex flex-col items-center gap-2 p-6 rounded-2xl border flex-1 transition-all cursor-pointer ${newEvent["Invite All Attorneys"] ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm hover:shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                    >
                      <ShieldCheck className={`w-8 h-8 ${newEvent["Invite All Attorneys"] ? 'text-purple-600' : 'text-slate-300'}`} />
                      <span className="text-sm font-bold">Invite Attorneys</span>
                    </button>
                    <button
                      onClick={() => setNewEvent(prev => ({ ...prev, "Invite All Staff Members": !prev["Invite All Staff Members"] }))}
                      className={`flex flex-col items-center gap-2 p-6 rounded-2xl border flex-1 transition-all cursor-pointer ${newEvent["Invite All Staff Members"] ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm hover:shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                    >
                      <UserCheck className={`w-8 h-8 ${newEvent["Invite All Staff Members"] ? 'text-blue-600' : 'text-slate-300'}`} />
                      <span className="text-sm font-bold">Invite Staff Members</span>
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all active:scale-95 cursor-pointer hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateEvent}
                  className="px-8 py-2.5 bg-[#020035] text-white font-bold rounded-xl hover:bg-[#030050] transition-all active:scale-95 shadow-lg shadow-slate-200 hover:shadow-xl cursor-pointer"
                >
                  Create Event Type
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SOPDashboard;
