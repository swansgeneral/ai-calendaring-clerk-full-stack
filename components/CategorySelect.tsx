import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { Category } from '../types';

interface CategorySelectProps {
  categories: Category[];
  value?: string; // selected category name
  onChange: (categoryName: string | undefined) => void;
  placeholder?: string;
}

/**
 * Dropdown that mirrors Outlook calendar categories: shows a color swatch + name
 * per option. Used both in the event editor and the SOP dashboard.
 */
const CategorySelect: React.FC<CategorySelectProps> = ({
  categories,
  value,
  onChange,
  placeholder = 'No category'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = categories.find(c => c.name === value);

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-slate-50/50 cursor-pointer hover:border-gray-400 transition-all flex items-center justify-between min-h-[42px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected ? (
            <>
              <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10" style={{ backgroundColor: selected.color }} />
              <span className="text-[13px] font-bold text-slate-800 truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-[13px] text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-[70] overflow-hidden animate-fade-in">
          <div className="max-h-56 overflow-y-auto custom-scrollbar">
            <div
              onClick={() => { onChange(undefined); setIsOpen(false); }}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-[12px] text-slate-500 italic">{placeholder}</span>
            </div>
            {categories.map(cat => {
              const isSelected = cat.name === value;
              return (
                <div
                  key={cat.id}
                  onClick={() => { onChange(cat.name); setIsOpen(false); }}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10" style={{ backgroundColor: cat.color }} />
                    <span className={`text-[12px] truncate ${isSelected ? 'font-bold text-[#00076F]' : 'text-slate-700'}`}>{cat.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#00076F] flex-shrink-0" />}
                </div>
              );
            })}
            {categories.length === 0 && (
              <div className="p-4 text-center text-[11px] text-slate-400 italic">No categories configured yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySelect;
