
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, Search, Edit2, Clock, MapPin, Calculator, Info, Trash2, Bell, Users, Gavel, CheckCircle } from 'lucide-react';
import { Event, Reminder, Calendar as CalendarType } from '../types';
import EventEditorModal from './EventEditorModal';
import ConfirmModal from './ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';

interface EventCardProps {
  event: Event;
  onFindInDoc?: (event: Event) => void;
  onUpdate: (updatedEvent: Event) => void;
  onDelete: (id: string) => void;
  isExpanded?: boolean;
  onToggleExpand: (expanded: boolean) => void;
  involvedStaff?: string[];
  involvedAttorneys?: string[];
  availableCalendars?: CalendarType[];
  defaultCalendarName?: string;
}

const EventCard: React.FC<EventCardProps> = ({ 
    event, 
    onFindInDoc, 
    onUpdate, 
    onDelete,
    isExpanded = false,
    onToggleExpand,
    involvedStaff = [],
    involvedAttorneys = [],
    availableCalendars = [],
    defaultCalendarName = ''
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const startDateObj = new Date(event.start_date + 'T00:00:00');
  const endDateObj = new Date((event.end_date || event.start_date) + 'T00:00:00');
  const isValidStart = !isNaN(startDateObj.getTime());
  const isValidEnd = !isNaN(endDateObj.getTime());

  const startDay = isValidStart ? startDateObj.getDate() : '?';
  const startMonth = isValidStart ? startDateObj.toLocaleString('default', { month: 'short' }) : 'Unknown';
  const startYear = isValidStart ? startDateObj.getFullYear() : '';
  const startWeekday = isValidStart ? startDateObj.toLocaleString('default', { weekday: 'long' }) : '';
  
  const isMultiDay = event.end_date && event.end_date !== event.start_date;
  const isSameMonth = isValidStart && isValidEnd && 
                    startDateObj.getMonth() === endDateObj.getMonth() && 
                    startDateObj.getFullYear() === endDateObj.getFullYear();
  
  const endDay = isValidEnd ? endDateObj.getDate() : '';
  const endMonth = isValidEnd ? endDateObj.toLocaleString('default', { month: 'short' }) : '';
  const endWeekday = isValidEnd ? endDateObj.toLocaleString('default', { weekday: 'long' }) : '';

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes} ${ampm}`;
    } catch {
        return timeStr;
    }
  };

  const timeDisplay = !event.is_all_day && event.start_time 
      ? `${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ''}`
      : '';

  const dateRangeDisplay = isMultiDay && isValidStart && isValidEnd
    ? `${startWeekday} - ${endWeekday}`
    : startWeekday;

  const handleFindClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFindInDoc) {
        onFindInDoc(event);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditorOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(event.id);
    setShowDeleteConfirm(false);
  };

  const toggleSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onUpdate({ ...event, selected: !event.selected });
  };

  const handleMainClick = () => {
    onToggleExpand(!isExpanded);
  };

  const hasVerification = event.verification && event.verification.quote;
  const isCalculated = event.date_type === 'calculated';
  const reminderCount = event.reminders?.length || 0;

  return (
    <div className={`bg-white rounded-xl shadow-sm border transition-all duration-200 overflow-hidden group ${event.selected ? 'border-l-4 border-l-[#00076F]' : 'border-gray-200 opacity-60 grayscale-[0.5]'}`}>
      <EventEditorModal 
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        event={event}
        onUpdate={onUpdate}
        onDelete={onDelete}
        involvedStaff={involvedStaff}
        involvedAttorneys={involvedAttorneys}
        availableCalendars={availableCalendars}
        defaultCalendarName={defaultCalendarName}
      />

      <ConfirmModal 
        isOpen={showDeleteConfirm}
        title="Delete Event"
        message={`Are you sure you want to delete "${event.title}"? This action cannot be undone.`}
        confirmText="Delete Event"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      
      <div 
        className={`p-5 cursor-pointer transition-colors relative ${isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}
        onClick={handleMainClick}
      >
        <div className="flex items-start gap-3">
          
          <div className="pt-5" onClick={(e) => e.stopPropagation()}>
             <input 
                type="checkbox" 
                style={{ colorScheme: 'light' }}
                checked={event.selected ?? true} 
                onChange={toggleSelection}
                className="h-4 w-4 text-[#00076F] focus:ring-[#00076F] border-gray-300 rounded cursor-pointer"
             />
          </div>

          <div className={`flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-lg border ml-1 relative ${isCalculated ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-[#00076F]/5 text-[#00076F] border-[#00076F]/10'}`}>
            <span className={`font-bold uppercase tracking-wider ${isMultiDay && !isSameMonth ? 'text-[9px]' : 'text-[11px]'}`}>
                {isMultiDay && !isSameMonth ? `${startMonth} - ${endMonth}` : startMonth}
            </span>
            <span className={`${isMultiDay ? (isSameMonth ? 'text-lg' : 'text-sm') : 'text-2xl'} font-bold leading-none my-0.5`}>
              {isMultiDay ? (isSameMonth ? `${startDay}-${endDay}` : `${startDay}-${endDay}`) : startDay}
            </span>
            <span className="text-[11px] opacity-70">{startYear}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className={`text-lg font-semibold truncate ${event.selected ? 'text-gray-900' : 'text-gray-500 line-through decoration-gray-400'}`}>
                    {event.title}
                </h3>
                
                {/* Status Icons for invitations and reminders */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                  {/* Attorney icon (Blue) first, then Staff icon (Purple) */}
                  {event.inviteAllAttorneys && (
                    <span title="All Attorneys Invited">
                      <Gavel className="w-4 h-4 text-blue-600" />
                    </span>
                  )}
                  {event.inviteAllStaff && (
                    <span title="All Staff Members Invited">
                      <Users className="w-4 h-4 text-purple-600" />
                    </span>
                  )}
                  {reminderCount > 0 && (
                    <div className="flex items-center gap-0.5 bg-red-50 px-2 py-0.5 rounded text-[11px] font-bold text-red-600 border border-red-100" title={`${reminderCount} Reminders Added`}>
                      <Bell className="w-2.5 h-2.5" />
                      {reminderCount}
                    </div>
                  )}
                </div>

                {isCalculated && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-tighter" title={`Calculated based on context: ${event.calculation_logic}`}>
                        <Calculator className="w-3 h-3 mr-0.5" /> Implicit
                    </span>
                )}
              </div>
              <div className="flex items-center space-x-1 flex-shrink-0">
                  {event.sopMatchId && (
                      <div 
                        className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-md transition-colors flex items-center justify-center cursor-default"
                        title="Matched with SOP"
                      >
                          <CheckCircle className="w-4 h-4" />
                      </div>
                  )}

                  {hasVerification && onFindInDoc && (
                      <button 
                        onClick={handleFindClick}
                        className="p-1.5 text-[#00076F] hover:text-[#00076F] hover:bg-[#00076F]/10 rounded-md transition-colors cursor-pointer"
                        title="Find in Document"
                      >
                          <Search className="w-4 h-4" />
                      </button>
                  )}
                  
                  <button 
                    onClick={handleEditClick}
                    className="p-1.5 text-gray-400 hover:text-[#00076F] hover:bg-[#00076F]/10 rounded-md transition-colors relative flex items-center justify-center cursor-pointer"
                    title="Edit Details & Reminders"
                  >
                      <Edit2 className="w-4 h-4" />
                  </button>

                  <button 
                    onClick={handleDeleteClick}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Delete Event"
                  >
                      <Trash2 className="w-4 h-4" />
                  </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">{event.description}</p>
            <div className="mt-2 flex flex-wrap items-center text-xs gap-3 font-medium">
               <span className="text-gray-400">
                  {dateRangeDisplay}
               </span>
               {timeDisplay && (
                   <span className="flex items-center text-[#00076F] bg-[#00076F]/10 px-1.5 py-0.5 rounded">
                       <Clock className="w-3 h-3 mr-1" />
                       {timeDisplay}
                   </span>
               )}
               {event.location && (
                   <span className="flex items-center text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                       <MapPin className="w-3 h-3 mr-1" />
                       {event.location}
                   </span>
               )}
            </div>
          </div>

          <div className="flex-shrink-0 self-center ml-2">
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="bg-gray-50 border-t border-gray-100 overflow-hidden"
          >
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-[#00076F] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Verification Source</h4>
                    </div>
                    
                    {isCalculated && event.calculation_logic && (
                        <div className="mb-3 bg-purple-50 border border-purple-100 p-2 rounded-md flex items-start gap-2 text-xs text-purple-800">
                            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold">Calculation Rule:</span> {event.calculation_logic}
                            </div>
                        </div>
                    )}

                    {hasVerification ? (
                        <div className="bg-white p-3 rounded border border-gray-200 shadow-sm">
                            <p className="text-sm text-gray-800 italic font-serif mb-3">"{event.verification.quote}"</p>
                            <div className="flex items-center gap-4 text-xs font-medium text-[#00076F]">
                                <span className="bg-[#00076F]/10 px-2 py-1 rounded">Page: {event.verification.page}</span>
                                <span className="bg-[#00076F]/10 px-2 py-1 rounded">Paragraph: {event.verification.paragraph}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-400 italic">
                            Manual entry - no document source verification available.
                        </div>
                    )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventCard;
