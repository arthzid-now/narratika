
import React, { useState } from 'react';
import { Button } from './Button';
import { Story, Language, PLOT_STRUCTURES } from '../types';
import { generateCharacterProfile, generateWorldElement, generatePlotStructure, generateComprehensiveList } from '../services/geminiService';
import { MarkdownRenderer } from './MarkdownRenderer';
import { translations } from '../translations';

interface GeneratorProps {
  story: Story;
  uiLanguage: Language;
  onSave: (text: string) => void;
}

const GeneratorCard: React.FC<{ title: string, icon: string, children: React.ReactNode, onBulk?: () => void, bulkLoading?: boolean, bulkLabel?: string }> = ({ title, icon, children, onBulk, bulkLoading, bulkLabel }) => (
  <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow mb-8 relative overflow-hidden">
    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-400 to-purple-500"></div>
    <div className="flex justify-between items-center mb-6 pl-2">
      <h3 className="font-sans font-bold text-ink flex items-center gap-2 text-lg tracking-tight">
        <span className="text-2xl">{icon}</span>
        {title}
      </h3>
      {onBulk && (
        <Button variant="ghost" size="sm" onClick={onBulk} isLoading={bulkLoading} className="text-xs text-purple-600 hover:bg-purple-50">
          {bulkLabel}
        </Button>
      )}
    </div>
    <div className="pl-2">
        {children}
    </div>
  </div>
);

export const CharacterGenerator: React.FC<GeneratorProps> = ({ story, uiLanguage, onSave }) => {
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  
  const t = translations[uiLanguage];

  const handleGenerate = async () => {
    if (!name || !archetype) return;
    setLoading(true);
    const result = await generateCharacterProfile(story, name, archetype);
    setGenerated(result);
    setLoading(false);
  };

  const handleBulkSuggest = async () => {
    setBulkLoading(true);
    const result = await generateComprehensiveList(story, 'characters');
    onSave(result);
    setBulkLoading(false);
  };

  return (
    <GeneratorCard 
        title={t.genCharTitle} 
        icon="👤" 
        onBulk={handleBulkSuggest} 
        bulkLoading={bulkLoading} 
        bulkLabel={t.suggestAllChars}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div>
          <label className="block text-xs font-bold text-stone-500 uppercase mb-2 tracking-wide">{t.genName}</label>
          <input 
            // FIX: iOS Zoom (text-base)
            className="w-full border border-stone-200 bg-stone-50 rounded-xl text-base md:text-sm px-4 py-3 text-ink focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all" 
            placeholder="e.g. Elara Vance"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-stone-500 uppercase mb-2 tracking-wide">{t.genArchetype}</label>
          <input 
            // FIX: iOS Zoom (text-base)
            className="w-full border border-stone-200 bg-stone-50 rounded-xl text-base md:text-sm px-4 py-3 text-ink focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all" 
            placeholder="e.g. Reluctant Hero"
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
          />
        </div>
      </div>
      
      {!generated ? (
        <Button onClick={handleGenerate} isLoading={loading} variant="magic" disabled={!name || !archetype} className="w-full">
          {t.genBtnChar}
        </Button>
      ) : (
        <div className="animate-fade-in">
          <div className="bg-stone-50 p-5 rounded-xl text-sm mb-4 max-h-80 overflow-y-auto border border-stone-200 font-serif leading-relaxed">
            <MarkdownRenderer content={generated} />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { onSave(generated); setGenerated(''); setName(''); setArchetype(''); }} size="sm" className="flex-1">
              {t.addToChar}
            </Button>
            <Button variant="ghost" onClick={() => setGenerated('')} size="sm">
              {t.discard}
            </Button>
          </div>
        </div>
      )}
    </GeneratorCard>
  );
};

export const WorldGenerator: React.FC<GeneratorProps> = ({ story, uiLanguage, onSave }) => {
  const [category, setCategory] = useState('Location');
  const [topic, setTopic] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const t = translations[uiLanguage];
  
  const categories = ["Location", "History", "Magic System", "Technology", "Culture", "Faction", "Creature"];

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    const result = await generateWorldElement(story, category, topic);
    setGenerated(result);
    setLoading(false);
  };

  const handleBulkSuggest = async () => {
    setBulkLoading(true);
    const result = await generateComprehensiveList(story, 'world');
    onSave(result);
    setBulkLoading(false);
  };

  return (
    <GeneratorCard 
        title={t.genWorldTitle} 
        icon="🌍" 
        onBulk={handleBulkSuggest} 
        bulkLoading={bulkLoading} 
        bulkLabel={t.suggestAllWorld}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div>
          <label className="block text-xs font-bold text-stone-500 uppercase mb-2 tracking-wide">{t.genCategory}</label>
          <select 
            // FIX: iOS Zoom (text-base)
            className="w-full border border-stone-200 bg-stone-50 rounded-xl text-base md:text-sm px-4 py-3 text-ink focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-stone-500 uppercase mb-2 tracking-wide">{t.genTopic}</label>
          <input 
            // FIX: iOS Zoom (text-base)
            className="w-full border border-stone-200 bg-stone-50 rounded-xl text-base md:text-sm px-4 py-3 text-ink focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all" 
            placeholder="e.g. The Floating Isles"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
      </div>
      
      {!generated ? (
        <Button onClick={handleGenerate} isLoading={loading} variant="magic" disabled={!topic} className="w-full">
          {t.genBtnWorld}
        </Button>
      ) : (
        <div className="animate-fade-in">
          <div className="bg-stone-50 p-5 rounded-xl text-sm mb-4 max-h-80 overflow-y-auto border border-stone-200 font-serif leading-relaxed">
            <MarkdownRenderer content={generated} />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { onSave(generated); setGenerated(''); setTopic(''); }} size="sm" className="flex-1">
              {t.addToWorld}
            </Button>
            <Button variant="ghost" onClick={() => setGenerated('')} size="sm">
              {t.discard}
            </Button>
          </div>
        </div>
      )}
    </GeneratorCard>
  );
};

export const PlotGenerator: React.FC<GeneratorProps> = ({ story, uiLanguage, onSave }) => {
  const [structure, setStructure] = useState("Hero's Journey");
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);

  const t = translations[uiLanguage];

  // Map structure ID to translation key for description
  const getDescKey = (id: string) => {
    switch (id) {
        case "Hero's Journey": return 'plotDesc_Hero';
        case "Save the Cat": return 'plotDesc_Cat';
        case "Three-Act Structure": return 'plotDesc_Three';
        case "Fichtean Curve": return 'plotDesc_Fich';
        case "Seven Point Story Structure": return 'plotDesc_Seven';
        case "Dan Harmon's Story Circle": return 'plotDesc_Harmon';
        case "Kishōtenketsu": return 'plotDesc_Kisho';
        default: return '';
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    const result = await generatePlotStructure(story, structure);
    setGenerated(result);
    setLoading(false);
  };

  return (
    <GeneratorCard title={t.genPlotTitle} icon="📈">
      <div className="mb-6">
        <label className="block text-xs font-bold text-stone-500 uppercase mb-2 tracking-wide">{t.genStructure}</label>
        <select 
          // FIX: iOS Zoom (text-base)
          className="w-full border border-stone-200 bg-stone-50 rounded-xl text-base md:text-sm px-4 py-3 text-ink focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        >
          {PLOT_STRUCTURES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="mt-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
           <span className="font-bold">ℹ️ {structure}: </span>
           {t[getDescKey(structure)] || t.plotHelp}
        </div>
      </div>
      
      {!generated ? (
        <Button onClick={handleGenerate} isLoading={loading} variant="magic" className="w-full">
          {t.genBtnPlot}
        </Button>
      ) : (
        <div className="animate-fade-in">
          <div className="bg-stone-50 p-5 rounded-xl text-sm mb-4 max-h-80 overflow-y-auto border border-stone-200 font-serif leading-relaxed">
             <MarkdownRenderer content={generated} />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { onSave(generated); setGenerated(''); }} size="sm" className="flex-1">
              {t.addToPlot}
            </Button>
            <Button variant="ghost" onClick={() => setGenerated('')} size="sm">
              {t.discard}
            </Button>
          </div>
        </div>
      )}
    </GeneratorCard>
  );
};
