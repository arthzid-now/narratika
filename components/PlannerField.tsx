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
}

export const PlannerField: React.FC<PlannerFieldProps> = ({
  label,
  fieldKey,
  value,
  story,
  uiLanguage,
  onChange,
  placeholder,
  rows = 4
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
    <div className="mb-8 pb-2 last:border-0 group">
      <div className="flex justify-between items-center mb-3">
        <label className="block text-sm font-bold text-gray-800 uppercase tracking-wide border-l-4 border-indigo-500 pl-3">
          {label}
        </label>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowPromptInput(!showPromptInput)}
          className="text-xs text-indigo-600 hover:bg-indigo-50 font-medium"
        >
          {t.aiBrainstorm}
        </Button>
      </div>

      {showPromptInput && (
        <div className="mb-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100 shadow-sm animate-fade-in">
          <p className="text-xs text-indigo-800 mb-2 font-bold uppercase tracking-wide">
            {t.genPromptHelp} {label.toLowerCase()} 
            <span className="text-indigo-400 ml-2 font-normal normal-case hidden sm:inline">{t.thinkingMode}</span>
          </p>
          <div className="flex gap-2">
            <input 
              type="text" 
              className="flex-1 text-sm border border-indigo-200 bg-white rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-800 placeholder-indigo-300"
              placeholder={t.charPromptPlace}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <Button 
              onClick={handleGenerate} 
              isLoading={isGenerating}
              disabled={!prompt.trim()}
              size="sm"
              className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            >
              {t.generate}
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <textarea
          className="w-full p-4 text-base block w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 placeholder-gray-400 font-serif leading-relaxed shadow-sm transition-all hover:border-gray-400"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
           <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
           </svg>
        </div>
      </div>
    </div>
  );
};