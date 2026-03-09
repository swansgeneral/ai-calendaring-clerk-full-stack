
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Bell, FileText, Plus, Mail, Calendar as CalendarIcon, Loader2, Users, Search, CheckSquare, Square, ChevronDown, Edit2, UserPlus, ShieldAlert, ShieldCheck, Clock, RefreshCw, Gavel, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Event, Reminder, Calendar as CalendarType, User } from '../types';
import { getUsers } from '../services/webhookService';

interface EventEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  onUpdate: (updatedEvent: Event) => void;
  onDelete: (id: string) => void;
  involvedStaff?: string[];
  involvedAttorneys?: string[];
  availableCalendars?: CalendarType[];
  defaultCalendarName?: string;
}

const EventEditorModal: React.FC<EventEditorModalProps> = ({
  isOpen,
  onClose,
  event,
  onUpdate,
  onDelete,
  involvedStaff = [],
  involvedAttorneys = [],
  availableCalendars = [],
  defaultCalendarName = ''
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'calendar' | 'reminders'>('details');
  const [editForm, setEditForm] = useState<Event>(event);
  
  // Tab: Calendar & Invitees States
  const [useDefaultCalendar, setUseDefaultCalendar] = useState(!event.targetCalendar || event.targetCalendar === defaultCalendarName);
  const [isInviteStaffActive, setIsInviteStaffActive] = useState(event.inviteAllStaff ?? true);
  const [isInviteAttorneysActive, setIsInviteAttorneysActive] = useState(event.inviteAllAttorneys ?? true);
  const [selectedOtherInvitees, setSelectedOtherInvitees] = useState<string[]>(event.manualInvitees || []);
  const [isClientInviteActive, setIsClientInviteActive] = useState(event.inviteClient || false);

  // Reminder Section State
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [selectedOtherUsers, setSelectedOtherUsers] = useState<string[]>([]);
  const [isStaffToggleActive, setIsStaffToggleActive] = useState(true);
  const [isAttorneyToggleActive, setIsAttorneyToggleActive] = useState(true);
  const [newType, setNewType] = useState<'Email' | 'Calendar Event'>('Email');
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderDescription, setNewReminderDescription] = useState('');
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [newUnit, setNewUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks'>('days');
  
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isInviteeDropdownOpen, setIsInviteeDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [inviteeSearch, setInviteeSearch] = useState('');

  const [isCalendarDropdownOpen, setIsCalendarDropdownOpen] = useState(false);
  const [calendarSearch, setCalendarSearch] = useState('');
  
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const inviteeDropdownRef = useRef<HTMLDivElement>(null);
  const calendarDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setEditForm(event);
      setUseDefaultCalendar(!event.targetCalendar || event.targetCalendar === defaultCalendarName);
      setIsClientInviteActive(event.inviteClient || false);
      setIsInviteStaffActive(event.inviteAllStaff ?? true);
      setIsInviteAttorneysActive(event.inviteAllAttorneys ?? true);
      setSelectedOtherInvitees(event.manualInvitees || []);
      
      const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
          const users = await getUsers();
          setAvailableUsers(users || []);
        } catch (error) {
          console.error("Error loading users", error);
        } finally {
          setIsLoadingUsers(false);
        }
      };
      fetchUsers();
    }
  }, [isOpen, event, defaultCalendarName]);

  // Redundancy Cleanup: Remove manual user selections if they are covered by an "All" toggle
  useEffect(() => {
    if (isStaffToggleActive || isAttorneyToggleActive) {
      setSelectedOtherUsers(prev => prev.filter(userName => {
        if (isStaffToggleActive && involvedStaff.includes(userName)) return false;
        if (isAttorneyToggleActive && involvedAttorneys.includes(userName)) return false;
        return true;
      }));
    }
  }, [isStaffToggleActive, isAttorneyToggleActive, involvedStaff, involvedAttorneys]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
      if (inviteeDropdownRef.current && !inviteeDropdownRef.current.contains(e.target as Node)) {
        setIsInviteeDropdownOpen(false);
      }
      if (calendarDropdownRef.current && !calendarDropdownRef.current.contains(e.target as Node)) {
        setIsCalendarDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGlobalSave = () => {
    const finalEvent = {
      ...editForm,
      targetCalendar: useDefaultCalendar ? defaultCalendarName : (editForm.targetCalendar || (availableCalendars[0]?.name || '')),
      inviteAllStaff: isInviteStaffActive,
      inviteAllAttorneys: isInviteAttorneysActive,
      manualInvitees: selectedOtherInvitees,
      inviteClient: isClientInviteActive
    };
    onUpdate(finalEvent);
    onClose();
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    handleGlobalSave();
  };

  const toggleOtherUser = (userName: string) => {
    setSelectedOtherUsers(prev => 
      prev.includes(userName) ? prev.filter(u => u !== userName) : [...prev, userName]
    );
  };

  const toggleOtherInvitee = (userName: string) => {
    setSelectedOtherInvitees(prev => 
      prev.includes(userName) ? prev.filter(u => u !== userName) : [...prev, userName]
    );
  };

  const handleEditReminder = (reminder: Reminder) => {
    setEditingReminderId(reminder.id);
    setIsStaffToggleActive(reminder.remindStaff);
    setIsAttorneyToggleActive(reminder.remindAttorneys);
    setSelectedOtherUsers(reminder.manualUsers);
    setNewType(reminder.type);
    setNewReminderTitle(reminder.calendarTitle || '');
    setNewReminderDescription(reminder.calendarDescription || '');
    setNewQuantity(reminder.quantity);
    setNewUnit(reminder.unit);
  };

  const handleAddOrUpdateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAttorneyToggleActive && !isStaffToggleActive && selectedOtherUsers.length === 0) {
      alert("Please select at least one recipient toggle or manual user.");
      return;
    }

    if (newType === 'Calendar Event' && !newReminderTitle.trim()) {
        alert("Please enter a title for the calendar reminder.");
        return;
    }

    const reminderData: Reminder = {
      id: editingReminderId || crypto.randomUUID(),
      remindStaff: isStaffToggleActive,
      remindAttorneys: isAttorneyToggleActive,
      manualUsers: selectedOtherUsers,
      type: newType,
      quantity: newQuantity,
      unit: newUnit,
      calendarTitle: newType === 'Calendar Event' ? newReminderTitle : undefined,
      calendarDescription: newType === 'Calendar Event' ? newReminderDescription : undefined
    };

    let updatedReminders: Reminder[];
    if (editingReminderId) {
      updatedReminders = (editForm.reminders || []).map(r => r.id === editingReminderId ? reminderData : r);
    } else {
      updatedReminders = [...(editForm.reminders || []), reminderData];
    }

    const newEventState = { ...editForm, reminders: updatedReminders };
    setEditForm(newEventState);
    onUpdate(newEventState);
    
    // Reset form
    setEditingReminderId(null);
    setSelectedOtherUsers([]);
    setNewReminderTitle('');
    setNewReminderDescription('');
    setIsStaffToggleActive(true);
    setIsAttorneyToggleActive(true);
  };

  const removeReminder = (id: string) => {
    const updatedReminders = (editForm.reminders || []).filter(r => r.id !== id);
    const newEventState = { ...editForm, reminders: updatedReminders };
    setEditForm(newEventState);
    onUpdate(newEventState);
    if (editingReminderId === id) setEditingReminderId(null);
  };

  const calculateReminderDate = (reminder: { quantity: number, unit: string }) => {
    if (!editForm.start_date) return "N/A";

    const baseDateStr = editForm.is_all_day || !editForm.start_time 
      ? `${editForm.start_date}T00:00:00` 
      : `${editForm.start_date}T${editForm.start_time}:00`;
    
    const baseDate = new Date(baseDateStr);
    if (isNaN(baseDate.getTime())) return "Invalid Date";

    let msOffset = 0;
    const { quantity, unit } = reminder;
    switch (unit) {
      case 'minutes': msOffset = quantity * 60 * 1000; break;
      case 'hours': msOffset = quantity * 60 * 60 * 1000; break;
      case 'days': msOffset = quantity * 24 * 60 * 60 * 1000; break;
      case 'weeks': msOffset = quantity * 7 * 24 * 60 * 60 * 1000; break;
    }

    const reminderDate = new Date(baseDate.getTime() - msOffset);
    return reminderDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Logic: Filter out users who are already covered by active "All" toggles for the Reminders tab
  const filteredUsers = availableUsers
    .filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()))
    .filter(u => {
      if (isAttorneyToggleActive && involvedAttorneys.includes(u.name)) return false;
      if (isStaffToggleActive && involvedStaff.includes(u.name)) return false;
      return true;
    });

  // Logic: Filter available calendars for the "Invite Other Calendars" dropdown
  const filteredCalendarsForInvitees = availableCalendars
    .filter(cal => cal.name.toLowerCase().includes(inviteeSearch.toLowerCase()))
    .filter(cal => {
      // 1. Exclude the calendar currently acting as the host for this event
      const currentHostName = useDefaultCalendar ? defaultCalendarName : (editForm.targetCalendar || (availableCalendars[0]?.name || ''));
      const isHost = cal.name === currentHostName;
      
      // 2. Exclude members already selected as "Involved" (to prevent redundant invitations)
      const isAlreadyInvolved = involvedAttorneys.includes(cal.name) || involvedStaff.includes(cal.name);
      
      return !isHost && !isAlreadyInvolved;
    });

  const filteredCalendars = availableCalendars
    .filter(cal => cal.name.toLowerCase().includes(calendarSearch.toLowerCase()));

  // Preview date for the new/edit reminder form
  const previewReminderDate = calculateReminderDate({ quantity: newQuantity, unit: newUnit });

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.3 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#020035] px-6 py-4 flex justify-between items-center flex-shrink-0">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-blue-200" />
                  Event Editor
                </h3>
                <span className="text-[11px] text-blue-200 uppercase tracking-widest font-bold truncate max-w-[400px]">
                  {editForm.title}
                </span>
              </div>
              <button onClick={onClose} className="text-white/80 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex bg-slate-50 border-b border-gray-200">
              <button 
                onClick={() => setActiveTab('details')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'details' ? 'bg-white text-[#00076F] border-b-2 border-[#00076F]' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4" /> Details
              </button>
              <button 
                onClick={() => setActiveTab('calendar')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'calendar' ? 'bg-white text-[#00076F] border-b-2 border-[#00076F]' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-100'
                }`}
              >
                <UserPlus className="w-4 h-4" /> Calendar & Invitees
              </button>
              <button 
                onClick={() => setActiveTab('reminders')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'reminders' ? 'bg-white text-[#00076F] border-b-2 border-[#00076F]' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-100'
                }`}
              >
                <Bell className="w-4 h-4" /> Reminders 
                {(editForm.reminders?.length || 0) > 0 && (
                  <span className="bg-[#00076F] text-white text-[9px] px-1.5 py-0.5 rounded-full ml-1.5">
                    {editForm.reminders?.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {activeTab === 'details' && (
                <form id="event-details-form" onSubmit={handleSaveDetails} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Main Information</h4>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Event Title</label>
                    <input 
                      type="text" 
                      required
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-[#00076F]/20 focus:border-[#00076F] border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Start Date</label>
                      <input 
                        type="date" 
                        required
                        value={editForm.start_date}
                        onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                        className="w-full text-sm border-gray-300 rounded-lg border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">End Date</label>
                      <input 
                        type="date" 
                        required
                        value={editForm.end_date || editForm.start_date}
                        onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                        className="w-full text-sm border-gray-300 rounded-lg border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-2">
                    <input
                      id="all-day-toggle"
                      type="checkbox"
                      checked={editForm.is_all_day}
                      onChange={(e) => setEditForm({
                        ...editForm, 
                        is_all_day: e.target.checked,
                        start_time: e.target.checked ? "" : (editForm.start_time || ""),
                        end_time: e.target.checked ? "" : (editForm.end_time || "")
                      })}
                      className="h-4 w-4 text-[#00076F] border-gray-300 rounded focus:ring-[#00076F]"
                    />
                    <label htmlFor="all-day-toggle" className="text-xs text-gray-700 font-bold uppercase">All Day Event</label>
                  </div>

                  {!editForm.is_all_day && (
                    <div className="grid grid-cols-2 gap-4 animate-fade-in-down">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Start Time</label>
                        <input 
                          type="time"
                          required={!editForm.is_all_day}
                          value={editForm.start_time || ''}
                          onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                          className="w-full text-sm border-gray-300 rounded-lg border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">End Time</label>
                        <input 
                          type="time"
                          required={!editForm.is_all_day}
                          value={editForm.end_time || ''}
                          onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                          className="w-full text-sm border-gray-300 rounded-lg border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Location</label>
                    <input 
                      type="text" 
                      value={editForm.location || ''}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      placeholder="e.g. Courtroom 4B"
                      className="w-full text-sm border-gray-300 rounded-lg border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Description / Context</label>
                    <textarea 
                      rows={3}
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full text-sm border-gray-300 rounded-lg border p-2.5 bg-slate-50/50 text-gray-900 font-medium"
                    />
                  </div>
                </form>
              )}

          {activeTab === 'calendar' && (
            <div className="space-y-6">
              {/* Calendar Section */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Calendar Hosting</h4>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-[#00076F]" />
                      <span className="text-xs font-bold text-gray-700">Add Event to Default Calendar</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseDefaultCalendar(!useDefaultCalendar)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                        useDefaultCalendar ? 'bg-[#00076F]' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${useDefaultCalendar ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {!useDefaultCalendar && (
                    <div className="space-y-1 animate-fade-in-down">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Alternative Calendar</label>
                      <div className="relative" ref={calendarDropdownRef}>
                        <div 
                            onClick={() => setIsCalendarDropdownOpen(!isCalendarDropdownOpen)}
                            className="flex items-center gap-2 border rounded-md px-2 shadow-sm cursor-pointer transition-all h-[32px] overflow-hidden bg-white border-slate-200 hover:border-slate-300"
                        >
                            <CalendarIcon className="w-3 h-3 flex-shrink-0 text-slate-500" />
                            <div className="flex-1 truncate text-xs font-bold text-slate-800">
                                {editForm.targetCalendar || (availableCalendars[0]?.name || '')}
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
                                    {filteredCalendars.length > 0 ? filteredCalendars.map(cal => {
                                        const isSelected = editForm.targetCalendar === cal.name;
                                        return (
                                            <div 
                                                key={cal.id} 
                                                onClick={(e) => { e.stopPropagation(); setEditForm({...editForm, targetCalendar: cal.name}); setIsCalendarDropdownOpen(false); }}
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
                  )}
                  {useDefaultCalendar && (
                    <p className="text-[11px] text-gray-400 italic">Hosting on: <span className="font-bold">{defaultCalendarName || "Not selected"}</span></p>
                  )}
                </div>
              </div>

              {/* Firm Invitees Section */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Firm Invitees</h4>
                
                <div className="grid grid-cols-2 gap-4">
                   {/* Attorney Invite Toggle Card */}
                   <div 
                      onClick={() => setIsInviteAttorneysActive(!isInviteAttorneysActive)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${isInviteAttorneysActive ? 'bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-100 hover:shadow-lg' : 'bg-slate-50 border-slate-200 opacity-70 hover:opacity-100 hover:bg-slate-100'}`}
                   >
                      <Gavel className={`w-6 h-6 mb-2 ${isInviteAttorneysActive ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-bold uppercase tracking-tight text-center ${isInviteAttorneysActive ? 'text-blue-700' : 'text-slate-500'}`}>All Involved Attorneys</span>
                      <div className={`mt-3 h-1.5 w-10 rounded-full transition-all ${isInviteAttorneysActive ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                   </div>

                   {/* Staff Invite Toggle Card */}
                   <div 
                      onClick={() => setIsInviteStaffActive(!isInviteStaffActive)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${isInviteStaffActive ? 'bg-purple-50 border-purple-400 shadow-md ring-2 ring-purple-100 hover:shadow-lg' : 'bg-slate-50 border-slate-200 opacity-70 hover:opacity-100 hover:bg-slate-100'}`}
                   >
                      <Users className={`w-6 h-6 mb-2 ${isInviteStaffActive ? 'text-purple-600' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-bold uppercase tracking-tight text-center ${isInviteStaffActive ? 'text-purple-700' : 'text-slate-500'}`}>All Involved Staff Members</span>
                      <div className={`mt-3 h-1.5 w-10 rounded-full transition-all ${isInviteStaffActive ? 'bg-purple-600' : 'bg-slate-300'}`}></div>
                   </div>
                </div>

                <div className="relative pt-2" ref={inviteeDropdownRef}>
                  <label className="text-[11px] font-bold text-gray-600 ml-1 mb-1 block">Invite Other Calendars:</label>
                  <div 
                    onClick={() => setIsInviteeDropdownOpen(!isInviteeDropdownOpen)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-slate-50/50 cursor-pointer hover:border-gray-400 transition-all flex items-center justify-between min-h-[42px]"
                  >
                    <div className="flex-1 truncate pr-2 text-[11px] font-bold text-slate-800">
                      {selectedOtherInvitees.length > 0 ? selectedOtherInvitees.join(', ') : <span className="text-slate-400 font-normal">Select other calendars...</span>}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isInviteeDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isInviteeDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                      <div className="p-2 border-b border-slate-50 bg-slate-50/50 flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search calendars..." 
                          className="bg-transparent text-[11px] w-full outline-none font-medium"
                          value={inviteeSearch}
                          onChange={(e) => setInviteeSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredCalendarsForInvitees.length > 0 ? filteredCalendarsForInvitees.map(calendar => {
                          const isSelected = selectedOtherInvitees.includes(calendar.name);
                          return (
                            <label 
                              key={calendar.id} 
                              className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={(e) => { e.stopPropagation(); toggleOtherInvitee(calendar.name); }}
                            >
                              {isSelected ? <CheckSquare className="w-4 h-4 text-[#00076F]" /> : <Square className="w-4 h-4 text-slate-300" />}
                              <span className={`text-[11px] ${isSelected ? 'font-bold text-[#00076F]' : 'text-slate-600'}`}>{calendar.name}</span>
                            </label>
                          );
                        }) : (
                          <div className="p-4 text-center text-[11px] text-gray-400 italic">No available calendars found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Invite Section */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">External Invitees</h4>
                <div className="flex flex-col gap-2 py-2 px-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isClientInviteActive ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldAlert className="w-4 h-4 text-red-600" />}
                      <span className="text-xs font-bold text-gray-700">Invite Client to Event</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsClientInviteActive(!isClientInviteActive)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none ring-2 ring-offset-2 cursor-pointer ${
                        isClientInviteActive ? 'bg-green-500 ring-green-100' : 'bg-red-500 ring-red-100'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isClientInviteActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {isClientInviteActive && (
                    <div className="mt-1 bg-blue-50/80 border border-blue-100 rounded-lg p-3 animate-fade-in-down flex gap-2.5">
                      <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                        Turning this <span className="font-bold">ON</span> will add the client's email to this event, and a calendar invite will be automatically sent to them when this event is <span className="italic">'Exported to System'</span>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Scheduled Reminders</h4>
                {(!editForm.reminders || editForm.reminders.length === 0) ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400 italic">
                    No reminders scheduled yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editForm.reminders.map((reminder) => {
                      const list = [];
                      if (reminder.remindAttorneys) list.push(<span key="attorneys" className="font-extrabold text-blue-600">All Attorneys</span>);
                      if (reminder.remindStaff) list.push(<span key="staff" className="font-extrabold text-purple-600">All Staff Members</span>);
                      if (reminder.manualUsers && reminder.manualUsers.length > 0) {
                         reminder.manualUsers.forEach(u => list.push(<span key={u} className="font-normal">{u}</span>));
                      }

                      const displayList = list.reduce((acc: any[], curr, i) => {
                          if (i === 0) return [curr];
                          return [...acc, <span key={`sep-${i}`} className="font-normal">, </span>, curr];
                      }, []);

                      return (
                        <div key={reminder.id} className={`flex items-center justify-between p-3 rounded-xl transition-all shadow-sm border ${editingReminderId === reminder.id ? 'bg-[#00076F]/5 border-[#00076F]/20 ring-1 ring-[#00076F]/10' : 'bg-slate-50 border-slate-100 hover:border-[#00076F]/20'}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="bg-white p-2 rounded-lg border border-slate-200 text-[#00076F] flex-shrink-0">
                              {reminder.type === 'Email' ? <Mail className="w-4 h-4" /> : <CalendarIcon className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-800 truncate">
                                {displayList}
                              </p>
                              <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5 mt-0.5">
                                {reminder.type} • {reminder.quantity} {reminder.unit} before
                                {reminder.calendarTitle && ` • ${reminder.calendarTitle}`}
                              </p>
                              <p className="text-[11px] text-[#00076F] font-bold bg-[#00076F]/5 px-1.5 py-0.5 rounded inline-flex items-center mt-1">
                                <Clock className="w-2.5 h-2.5 mr-1" />
                                {calculateReminderDate(reminder)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleEditReminder(reminder)}
                              className="p-1.5 text-gray-400 hover:text-[#00076F] hover:bg-[#00076F]/10 rounded-lg transition-all cursor-pointer"
                              title="Edit Reminder"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => removeReminder(reminder.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                              title="Delete Reminder"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <form onSubmit={handleAddOrUpdateReminder} className="border-t border-gray-100 pt-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    {editingReminderId ? 'Update Selected Reminder' : 'Schedule New Reminder'}
                  </h4>
                  {isLoadingUsers && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                </div>
                
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-600 ml-1">What Type of Reminder do you want to Schedule?</label>
                  <select 
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#00076F]/20 outline-none bg-slate-50/50 text-gray-900 font-bold"
                  >
                    <option value="Email">Email</option>
                    <option value="Calendar Event">Calendar Event</option>
                  </select>
                </div>

                {newType === 'Calendar Event' && (
                  <div className="space-y-3 animate-fade-in-down">
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 ml-1">Title of Reminder in Calendar</label>
                        <input 
                        type="text"
                        required
                        value={newReminderTitle}
                        onChange={(e) => setNewReminderTitle(e.target.value)}
                        placeholder="e.g. Follow up on Scheduling Order"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#00076F]/20 outline-none bg-slate-50/50 text-gray-900 font-bold"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 ml-1">Description of Reminder in Calendar</label>
                         <textarea 
                            rows={2}
                            value={newReminderDescription}
                            onChange={(e) => setNewReminderDescription(e.target.value)}
                            placeholder="e.g. Include Zoom link from original event"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#00076F]/20 outline-none bg-slate-50/50 text-gray-900 font-medium"
                        />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                   {/* Attorney Reminder Toggle Card */}
                   <div 
                      onClick={() => setIsAttorneyToggleActive(!isAttorneyToggleActive)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${isAttorneyToggleActive ? 'bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-100 hover:shadow-lg' : 'bg-slate-50 border-slate-200 opacity-70 hover:opacity-100 hover:bg-slate-100'}`}
                   >
                      <Gavel className={`w-6 h-6 mb-2 ${isAttorneyToggleActive ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-bold uppercase tracking-tight text-center ${isAttorneyToggleActive ? 'text-blue-700' : 'text-slate-500'}`}>Remind Attorneys</span>
                      <div className={`mt-3 h-1.5 w-10 rounded-full transition-all ${isAttorneyToggleActive ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                   </div>

                   {/* Staff Reminder Toggle Card */}
                   <div 
                      onClick={() => setIsStaffToggleActive(!isStaffToggleActive)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${isStaffToggleActive ? 'bg-purple-50 border-purple-400 shadow-md ring-2 ring-purple-100 hover:shadow-lg' : 'bg-slate-50 border-slate-200 opacity-70 hover:opacity-100 hover:bg-slate-100'}`}
                   >
                      <Users className={`w-6 h-6 mb-2 ${isStaffToggleActive ? 'text-purple-600' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-bold uppercase tracking-tight text-center ${isStaffToggleActive ? 'text-purple-700' : 'text-slate-500'}`}>Remind Staff Members</span>
                      <div className={`mt-3 h-1.5 w-10 rounded-full transition-all ${isStaffToggleActive ? 'bg-purple-600' : 'bg-slate-300'}`}></div>
                   </div>
                </div>

                <div className="relative" ref={userDropdownRef}>
                  <label className="text-[11px] font-bold text-gray-600 ml-1 mb-1 block">Remind Other Users:</label>
                  <div 
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-slate-50/50 cursor-pointer hover:border-gray-400 transition-all flex items-center justify-between min-h-[42px]"
                  >
                    <div className="flex-1 truncate pr-2 text-[11px] font-bold text-slate-800">
                      {selectedOtherUsers.length > 0 ? selectedOtherUsers.join(', ') : <span className="text-slate-400 font-normal">Select other users...</span>}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isUserDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isUserDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                      <div className="p-2 border-b border-slate-50 bg-slate-50/50 flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search users..." 
                          className="bg-transparent text-[11px] w-full outline-none font-medium"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredUsers.length > 0 ? filteredUsers.map(user => {
                          const isSelected = selectedOtherUsers.includes(user.name);
                          return (
                            <label 
                              key={user.id} 
                              className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={(e) => { e.stopPropagation(); toggleOtherUser(user.name); }}
                            >
                              {isSelected ? <CheckSquare className="w-4 h-4 text-[#00076F]" /> : <Square className="w-4 h-4 text-slate-300" />}
                              <span className={`text-[11px] ${isSelected ? 'font-bold text-[#00076F]' : 'text-slate-600'}`}>{user.name}</span>
                            </label>
                          );
                        }) : (
                          <div className="p-4 text-center text-[11px] text-gray-400 italic">No available users found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 ml-1">Quantity</label>
                    <input 
                      type="number"
                      min="1"
                      required
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#00076F]/20 outline-none bg-slate-50/50 text-gray-900 font-bold"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 ml-1">Unit</label>
                    <select 
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value as any)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#00076F]/20 outline-none bg-slate-50/50 text-gray-900 font-bold"
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                    </select>
                  </div>
                </div>

                <div className="text-center">
                  <span className="text-xs font-bold text-[#00076F] bg-[#00076F]/5 px-3 py-1.5 rounded-md inline-block">
                    Calculated Date: {previewReminderDate}
                  </span>
                </div>

                <div className="flex gap-3">
                  {editingReminderId && (
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingReminderId(null);
                        setSelectedOtherUsers([]);
                        setNewReminderTitle('');
                        setNewReminderDescription('');
                      }}
                      className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-3 rounded-xl transition-all active:scale-95 text-sm cursor-pointer hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    type="submit"
                    className="flex-[2] bg-[#00076F] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[#00076F]/90 transition-all active:scale-95 shadow-md hover:shadow-lg text-sm cursor-pointer"
                  >
                    {editingReminderId ? <><RefreshCw className="w-4 h-4" /> Update Reminder</> : <><Plus className="w-4 h-4" /> Add Reminder</>}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 flex justify-between flex-shrink-0 border-t border-gray-200">
          <div className="text-[11px] text-gray-400 flex items-center italic">
            All changes auto-save when editing details or reminders
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-gray-100 transition-all cursor-pointer shadow-sm"
            >
              Cancel
            </button>
            <button 
              onClick={handleGlobalSave}
              className="px-6 py-2.5 bg-[#00076F] text-white font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[#00076F]/90 transition-all active:scale-95 shadow-lg hover:shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save Changes
            </button>
          </div>
        </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>,
  document.body
);
};

export default EventEditorModal;
