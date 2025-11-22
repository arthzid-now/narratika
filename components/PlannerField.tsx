
import React, { useState } from 'react';
import { Button } from './Button';
import { brainstormStoryElement } from '../services/geminiService';
import { Story, Language } from '../types';
import { translations } from '../translations';

interface PlannerFieldProps {
  label: string;
  fieldKey: keyof Story;
  value: string;
  story: Story;
  uiLanguage: Language;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  headerAction?: React.ReactNode;
}

export const PlannerField: React.FC<PlannerFieldProps> = ({
  label,
  fieldKey,
  value,
  story,
  uiLanguage,
  onChange,
  placeholder,
  rows = 4,
  className = "mb-10",
  headerAction
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  
  const t = translations[uiLanguage];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    const result = await brainstormStoryElement(label, story, prompt);
    setIsGenerating(false);
    setShowPromptInput(false);
    
    const newValue = value ? `${value}\n\n${result}` : result;
    onChange(newValue);
  };

  return (
    <div className={`last:mb-0 group ${className}`}>
      {/* FIX: Layout Alignment (items-center instead of items-end) and spacing */}
      <div className="flex justify-between items-center mb-3 gap-2">
        <div className="flex items-center gap-2">
            <label className="block text-xs font-extrabold text-ink uppercase tracking-widest">
            {label}
            </label>
            {headerAction}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowPromptInput(!showPromptInput)}
          className={`text-[10px] uppercase tracking-wider font-bold transition-all whitespace-nowrap ${showPromptInput ? 'text-indigo-600 bg-indigo-50' : 'text-stone-400'}`}
        >
          {/* FIX: Double Icon Removed (Icon is inside translation string) */}
          {showPromptInput ? 'Close AI' : t.aiBrainstorm}
        </Button>
      </div>

      {showPromptInput && (
        <div className="mb-4 p-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-fade-in">
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-indigo-900 mb-3 font-bold uppercase tracking-wide flex items-center gap-2">
              <span>✨ Muse Engine</span>
              <span className="h-px flex-1 bg-indigo-100"></span>
            </p>
            <div className="flex gap-2">
              <input 
                type="text" 
                className="flex-1 text-base md:text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-ink placeholder-stone-400 transition-all"
                placeholder={t.charPromptPlace}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
              <Button 
                variant="magic"
                onClick={handleGenerate} 
                isLoading={isGenerating}
                disabled={!prompt.trim()}
                size="sm"
              >
                {t.generate}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <textarea
          className="w-full p-4 text-base md:text-sm block bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 focus:border-transparent text-ink placeholder-stone-300 font-serif leading-relaxed shadow-sm transition-all hover:border-stone-300 resize-y"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="absolute bottom-3 right-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
           <svg className="w-3 h-3 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
           </svg>
        </div>
      </div>
    </div>
  );
};
