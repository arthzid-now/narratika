
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
    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
          <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-md text-sm">AI</span>
          {t.genCharTitle}
        </h3>
        <Button variant="ghost" onClick={handleBulkSuggest} isLoading={bulkLoading} className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200">
          {t.suggestAllChars}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">{t.genName}</label>
          <input 
            className="w-full border border-gray-300 bg-white rounded-lg text-sm px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm" 
            placeholder="e.g. Elara Vance"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">{t.genArchetype}</label>
          <input 
            className="w-full border border-gray-300 bg-white rounded-lg text-sm px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm" 
            placeholder="e.g. Reluctant Hero, Cyber-Ninja"
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
          />
        </div>
      </div>
      
      {!generated ? (
        <Button onClick={handleGenerate} isLoading={loading} disabled={!name || !archetype} className="w-full py-2.5 shadow-sm">
          {t.genBtnChar}
        </Button>
      ) : (
        <div className="animate-fade-in">
          <div className="bg-white p-5 rounded-lg text-sm mb-4 max-h-80 overflow-y-auto border border-gray-200 shadow-inner">
            <MarkdownRenderer content={generated} />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { onSave(generated); setGenerated(''); setName(''); setArchetype(''); }} size="sm" className="flex-1 shadow-sm">
              {t.addToChar}
            </Button>
            <Button variant="secondary" onClick={() => setGenerated('')} size="sm">
              {t.discard}
            </Button>
          </div>
        </div>
      )}
    </div>
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
    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
          <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-md text-sm">AI</span>
          {t.genWorldTitle}
        </h3>
        <Button variant="ghost" onClick={handleBulkSuggest} isLoading={bulkLoading} className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200">
          {t.suggestAllWorld}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">{t.genCategory}</label>
          <select 
            className="w-full border border-gray-300 bg-white rounded-lg text-sm px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm appearance-none cursor-pointer"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">{t.genTopic}</label>
          <input 
            className="w-full border border-gray-300 bg-white rounded-lg text-sm px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm" 
            placeholder="e.g. The Floating Isles, The Great War"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
      </div>
      
      {!generated ? (
        <Button onClick={handleGenerate} isLoading={loading} disabled={!topic} className="w-full py-2.5 shadow-sm">
          {t.genBtnWorld}
        </Button>
      ) : (
        <div className="animate-fade-in">
          <div className="bg-white p-5 rounded-lg text-sm mb-4 max-h-80 overflow-y-auto border border-gray-200 shadow-inner">
            <MarkdownRenderer content={generated} />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { onSave(generated); setGenerated(''); setTopic(''); }} size="sm" className="flex-1 shadow-sm">
              {t.addToWorld}
            </Button>
            <Button variant="secondary" onClick={() => setGenerated('')} size="sm">
              {t.discard}
            </Button>
          </div>
        </div>
      )}
    </div>
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
    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mb-8">
      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-lg">
        <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-md text-sm">AI</span>
        {t.genPlotTitle}
      </h3>
      <div className="mb-5">
        <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">{t.genStructure}</label>
        <select 
          className="w-full border border-gray-300 bg-white rounded-lg text-sm px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm appearance-none cursor-pointer"
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        >
          {PLOT_STRUCTURES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 leading-relaxed">
           <span className="font-bold">ℹ️ {structure}: </span>
           {t[getDescKey(structure)] || t.plotHelp}
        </div>
      </div>
      
      {!generated ? (
        <Button onClick={handleGenerate} isLoading={loading} className="w-full py-2.5 shadow-sm">
          {t.genBtnPlot}
        </Button>
      ) : (
        <div className="animate-fade-in">
          <div className="bg-white p-5 rounded-lg text-sm mb-4 max-h-80 overflow-y-auto border border-gray-200 shadow-inner">
             <MarkdownRenderer content={generated} />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { onSave(generated); setGenerated(''); }} size="sm" className="flex-1 shadow-sm">
              {t.addToPlot}
            </Button>
            <Button variant="secondary" onClick={() => setGenerated('')} size="sm">
              {t.discard}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
