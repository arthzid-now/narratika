

import React, { useState, useEffect, useRef } from 'react';
import { Story, Chapter, ViewState, PlannerTab, GENRE_OPTIONS, TONE_OPTIONS, STYLE_OPTIONS, ChatMessage, Language, CharacterProfile, IMAGE_STYLES, WorldItem, WORLD_CATEGORIES, WorldCategory } from './types';
import { Button } from './components/Button';
import { PlannerField } from './components/PlannerField';
import { generateProse, chatWithAssistant, generateStructuredCast, generateCharacterImage, refineCharacterProfile, autoSetupStory, analyzeWritingStyle, refineWorldItem, generateWorldItemImage, generateGenesisWorld, generateGenesisCharacters, generateGenesisPlot, WriteOptions, generateChapterBeats, extractStoryDna, smartSplitText } from './services/geminiService';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { WorldGenerator, PlotGenerator } from './components/StoryGenerators';
import { translations } from './translations';

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  // --- State ---
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [plannerTab, setPlannerTab] = useState<PlannerTab>(PlannerTab.GENERAL);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  
  // Language State
  const [uiLanguage, setUiLanguage] = useState<Language>('en');

  // Editor State
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [editorSidebarTab, setEditorSidebarTab] = useState<'chat' | 'cast' | 'wiki' | 'plot'>('chat');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isWriterLoading, setIsWriterLoading] = useState(false);
  const [writerStatus, setWriterStatus] = useState(""); // Text like "Writing Scene 1/4..."

  // Director Mode (Write Settings)
  const [showDirectorMenu, setShowDirectorMenu] = useState(false);
  const [writeLength, setWriteLength] = useState<'short' | 'medium' | 'long' | 'panic'>('medium');
  const [writeInstruction, setWriteInstruction] = useState('');

  // Modular Character State
  const [editingCharacter, setEditingCharacter] = useState<CharacterProfile | null>(null);
  const [isGeneratingCast, setIsGeneratingCast] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(false);
  const [isRefiningChar, setIsRefiningChar] = useState(false);

  // Modular World State
  const [editingWorldItem, setEditingWorldItem] = useState<WorldItem | null>(null);
  const [worldFilter, setWorldFilter] = useState<WorldCategory | 'All'>('All');
  const [isRefiningWorld, setIsRefiningWorld] = useState(false);
  const [isWorldImgLoading, setIsWorldImgLoading] = useState(false);

  // Setup & Style State
  const [isAutoSettingUp, setIsAutoSettingUp] = useState(false);
  const [showStyleRef, setShowStyleRef] = useState(false);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);

  // Genesis Mode State
  const [isGenesisOpen, setIsGenesisOpen] = useState(false);
  const [genesisStep, setGenesisStep] = useState(0); // 0: Idle, 1: World, 2: Chars, 3: Plot, 4: Done
  const [genesisLog, setGenesisLog] = useState<string[]>([]);

  // Import Mode State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLanguage, setImportLanguage] = useState<Language>('id');
  const [isExtracting, setIsExtracting] = useState(false);

  const activeStory = stories.find(s => s.id === activeStoryId);
  const activeChapter = activeStory?.chapters.find(c => c.id === activeChapterId);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
  const t = translations[uiLanguage];

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('novella_stories');
    if (saved) {
      try {
        const parsedStories = JSON.parse(saved);
        // Migration: ensure worldItems exists
        const migratedStories = parsedStories.map((s: any) => ({
            ...s,
            worldItems: s.worldItems || []
        }));
        setStories(migratedStories);
      } catch (e) {
        console.error("Failed to load stories", e);
      }
    }
  }, []);

  useEffect(() => {
    if (stories.length > 0) {
      localStorage.setItem('novella_stories', JSON.stringify(stories));
    }
  }, [stories]);

  // Default import language to UI language when UI language changes
  useEffect(() => {
      setImportLanguage(uiLanguage);
  }, [uiLanguage]);

  // --- Stats Calculation ---
  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const getCharCount = (text: string) => text.length;
  const getReadTime = (text: string) => Math.ceil(getWordCount(text) / 250);

  // --- Handlers: Dashboard ---
  const createNewStory = () => {
    const newStory: Story = {
      id: generateId(),
      title: uiLanguage === 'id' ? 'Cerita Tanpa Judul' : 'Untitled Story',
      language: uiLanguage,
      genres: [],
      customGenres: '',
      premise: '',
      characters: [], 
      worldItems: [], // Init empty
      worldText: '',
      plotOutline: '',
      charactersText: '', 
      tone: '',
      writingStyle: '',
      styleReference: '',
      chapters: [],
      lastUpdated: Date.now(),
    };
    setStories([newStory, ...stories]);
    setActiveStoryId(newStory.id);
    setView(ViewState.PLANNER);
    setPlannerTab(PlannerTab.GENERAL);
  };

  const deleteStory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm(t.deleteConfirm)) {
      setStories(stories.filter(s => s.id !== id));
      if (activeStoryId === id) setActiveStoryId(null);
    }
  };

  const handleImportStory = async () => {
      if (!importText.trim()) return;
      setIsExtracting(true);
      
      // 1. Extract DNA (Metadata, Chars, Wiki, Plot)
      // Use importLanguage for the extraction process to ensure correct output language
      const dna = await extractStoryDna(importText, importLanguage);
      
      // 2. Smart Split Text into Chapters
      const textChunks = smartSplitText(importText);
      const chapters: Chapter[] = textChunks.map(chunk => ({
          id: generateId(),
          title: chunk.title,
          content: chunk.content
      }));

      if (dna) {
          const newStory: Story = {
              id: generateId(),
              title: dna.title || "Imported Story",
              language: importLanguage, // Set story language to the imported language
              genres: [], // User can select later
              customGenres: '',
              premise: dna.premise || '',
              characters: dna.characters.map((c: any) => ({...c, id: generateId()})) || [],
              worldItems: dna.worldItems.map((w: any) => ({...w, id: generateId()})) || [],
              plotOutline: dna.plotOutline || '',
              worldText: '',
              charactersText: '',
              tone: dna.tone || '',
              writingStyle: dna.writingStyle || '',
              styleReference: importText.substring(0, 2000), // Use the imported text as style ref
              chapters: chapters,
              lastUpdated: Date.now()
          };
          
          setStories([newStory, ...stories]);
          setActiveStoryId(newStory.id);
          setIsImportModalOpen(false);
          setImportText('');
          setView(ViewState.PLANNER);
      } else {
          alert("Failed to extract story DNA. Please try again or shorter text.");
      }
      
      setIsExtracting(false);
  };

  // --- Handlers: Planner ---
  const updateStoryField = (key: keyof Story, value: any) => {
    if (!activeStoryId) return;
    setStories(stories.map(s => s.id === activeStoryId ? { ...s, [key]: value, lastUpdated: Date.now() } : s));
  };

  const toggleGenre = (genreId: string) => {
    if (!activeStory) return;
    const currentGenres = activeStory.genres;
    const newGenres = currentGenres.includes(genreId)
      ? currentGenres.filter(g => g !== genreId)
      : [...currentGenres, genreId];
    updateStoryField('genres', newGenres);
  };

  const handleAutoSetup = async () => {
      if(!activeStory) return;
      setIsAutoSettingUp(true);
      const result = await autoSetupStory(activeStory);
      if(result) {
          setStories(stories.map(s => s.id === activeStoryId ? { 
              ...s, 
              title: result.title, 
              premise: result.premise,
              tone: result.tone,
              writingStyle: result.writingStyle,
              lastUpdated: Date.now() 
          } : s));
      }
      setIsAutoSettingUp(false);
  };

  const handleAnalyzeStyle = async () => {
      if(!activeStory || !activeStory.styleReference) return;
      setIsAnalyzingStyle(true);
      const description = await analyzeWritingStyle(activeStory.styleReference, activeStory.language);
      if (description) {
          updateStoryField('writingStyle', description);
      }
      setIsAnalyzingStyle(false);
  };

  // --- GENESIS MODE HANDLER ---
  const handleIgniteGenesis = async () => {
      if (!activeStory) return;
      if (!activeStory.premise || activeStory.genres.length === 0) {
          alert(t.genesisWarn);
          return;
      }
      
      setIsGenesisOpen(true);
      setGenesisStep(1);
      setGenesisLog([t.genesisPhase1]);
      
      // Step 1: World
      const genWorldItems = await generateGenesisWorld(activeStory);
      setGenesisLog(prev => [...prev, `✅ ${genWorldItems.length} World Elements Created`, t.genesisPhase2]);
      setGenesisStep(2);
      
      // Step 2: Characters (fed with World Data)
      const genCharacters = await generateGenesisCharacters(activeStory, genWorldItems);
      setGenesisLog(prev => [...prev, `✅ ${genCharacters.length} Characters Summoned`, t.genesisPhase3]);
      setGenesisStep(3);
      
      // Step 3: Plot (fed with World + Char Data)
      const genPlot = await generateGenesisPlot(activeStory, genWorldItems, genCharacters);
      setGenesisLog(prev => [...prev, `✅ Destiny Woven`, t.genesisComplete]);
      setGenesisStep(4);

      // Save All
      setStories(stories.map(s => s.id === activeStoryId ? {
          ...s,
          worldItems: [...s.worldItems, ...genWorldItems],
          characters: [...s.characters, ...genCharacters],
          plotOutline: (s.plotOutline ? s.plotOutline + '\n\n' : '') + genPlot,
          lastUpdated: Date.now()
      } : s));
  };


  // --- Handlers: Character Module ---
  const handleGenerateFullCast = async () => {
    if (!activeStory) return;
    setIsGeneratingCast(true);
    const newCharacters = await generateStructuredCast(activeStory);
    if (newCharacters.length > 0) {
      updateStoryField('characters', [...activeStory.characters, ...newCharacters]);
    }
    setIsGeneratingCast(false);
  };

  const saveCharacter = (char: CharacterProfile) => {
    if (!activeStory) return;
    let updatedList;
    if (activeStory.characters.some(c => c.id === char.id)) {
      updatedList = activeStory.characters.map(c => c.id === char.id ? char : c);
    } else {
      updatedList = [...activeStory.characters, char];
    }
    updateStoryField('characters', updatedList);
    setEditingCharacter(null);
  };

  const deleteCharacter = (id: string) => {
    if (!activeStory) return;
    if (confirm("Delete this character?")) {
      updateStoryField('characters', activeStory.characters.filter(c => c.id !== id));
      setEditingCharacter(null);
    }
  };

  const handleGeneratePortrait = async (char: CharacterProfile) => {
    setIsImgLoading(true);
    const style = char.imageStyle || "Semi-Realistic Digital Art";
    const base64 = await generateCharacterImage(char, style);
    if (base64) {
      const updatedChar = { ...char, avatarBase64: base64 };
      setEditingCharacter(updatedChar);
      if (activeStory) {
         const updatedList = activeStory.characters.map(c => c.id === char.id ? updatedChar : c);
         updateStoryField('characters', updatedList);
      }
    }
    setIsImgLoading(false);
  };
  
  const handleRefineCharacter = async () => {
      if(!activeStory || !editingCharacter) return;
      setIsRefiningChar(true);
      const refined = await refineCharacterProfile(activeStory, editingCharacter);
      if (refined) {
          setEditingCharacter(refined);
      }
      setIsRefiningChar(false);
  };

  // --- Handlers: World Module ---
  const saveWorldItem = (item: WorldItem) => {
      if (!activeStory) return;
      // Ensure worldItems exists (migration safety)
      const currentItems = activeStory.worldItems || [];
      let updatedList;
      if (currentItems.some(i => i.id === item.id)) {
          updatedList = currentItems.map(i => i.id === item.id ? item : i);
      } else {
          updatedList = [...currentItems, item];
      }
      updateStoryField('worldItems', updatedList);
      setEditingWorldItem(null);
  };

  const deleteWorldItem = (id: string) => {
      if(!activeStory) return;
      if(confirm("Delete this world entry?")) {
          const currentItems = activeStory.worldItems || [];
          updateStoryField('worldItems', currentItems.filter(i => i.id !== id));
          setEditingWorldItem(null);
      }
  };

  const handleRefineWorld = async () => {
      if(!activeStory || !editingWorldItem) return;
      setIsRefiningWorld(true);
      const refined = await refineWorldItem(activeStory, editingWorldItem);
      if (refined) {
          setEditingWorldItem(refined);
      }
      setIsRefiningWorld(false);
  };

  const handleGenWorldImage = async (item: WorldItem) => {
      setIsWorldImgLoading(true);
      const style = item.imageStyle || (item.category === 'Location' ? "Concept Art (Environment)" : "Concept Art (Item/Prop)");
      const base64 = await generateWorldItemImage(item, style);
      if (base64) {
          const updatedItem = { ...item, imageUrl: base64 };
          setEditingWorldItem(updatedItem);
          if (activeStory) {
              const currentItems = activeStory.worldItems || [];
              const updatedList = currentItems.map(i => i.id === item.id ? updatedItem : i);
              updateStoryField('worldItems', updatedList);
          }
      }
      setIsWorldImgLoading(false);
  };


  // --- Handlers: Editor ---
  const createChapter = () => {
    if (!activeStoryId) return;
    const newChapter: Chapter = {
      id: generateId(),
      title: `${uiLanguage === 'id' ? 'Bab' : 'Chapter'} ${activeStory!.chapters.length + 1}`,
      content: ''
    };
    const updatedChapters = [...activeStory!.chapters, newChapter];
    updateStoryField('chapters', updatedChapters);
    setActiveChapterId(newChapter.id);
  };

  const updateChapterContent = (content: string) => {
    if (!activeStoryId || !activeChapterId) return;
    const updatedChapters = activeStory!.chapters.map(c => 
      c.id === activeChapterId ? { ...c, content } : c
    );
    updateStoryField('chapters', updatedChapters);
  };
  
  const updateChapterTitle = (title: string) => {
    if (!activeStoryId || !activeChapterId) return;
    const updatedChapters = activeStory!.chapters.map(c => 
      c.id === activeChapterId ? { ...c, title } : c
    );
    updateStoryField('chapters', updatedChapters);
  };

  const handleAiWrite = async () => {
    if (!activeStory || !activeChapter || !editorRef.current) return;
    setShowDirectorMenu(false);
    setIsWriterLoading(true);
    setWriterStatus(t.generating);

    const cursor = editorRef.current.selectionStart;
    let currentContent = activeChapter.content;
    
    if (writeLength === 'panic') {
        // PANIC MODE LOGIC
        setWriterStatus("Brainstorming Beats...");
        const precedingText = currentContent.substring(0, cursor);
        const beats = await generateChapterBeats(activeStory, activeChapter.id, precedingText);
        
        // Generate each beat sequentially
        for (let i = 0; i < beats.length; i++) {
            setWriterStatus(`Writing Scene ${i+1}/${beats.length}: "${beats[i].substring(0, 20)}..."`);
            
            // Update cursor to end of current content to append correctly in next loop or current loop
            const currentCursor = currentContent.length; 
            
            // We force 'medium' length for each beat (approx 500 words x 4 = 2000)
            const chunk = await generateProse(
                {...activeStory, chapters: activeStory.chapters.map(c => c.id === activeChapterId ? {...c, content: currentContent} : c)}, // Hack: Pass updated content in story object
                activeChapter.id, 
                currentCursor, 
                { 
                    length: 'medium', 
                    instruction: `Write this specific scene: ${beats[i]}. ${writeInstruction}` 
                }
            );

            if (chunk) {
                currentContent = currentContent + "\n\n" + chunk;
                updateChapterContent(currentContent); // Update State incrementally so user sees progress
            }
        }

    } else {
        // Standard Mode
        const generatedText = await generateProse(activeStory, activeChapter.id, cursor, {
            length: writeLength,
            instruction: writeInstruction
        });
        if (generatedText) {
            const before = currentContent.substring(0, cursor);
            const after = currentContent.substring(cursor);
            updateChapterContent(before + generatedText + after);
        }
    }

    setWriterStatus("");
    setIsWriterLoading(false);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeStory) return;
    const newUserMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: Date.now() };
    const updatedHistory = [...chatHistory, newUserMsg];
    setChatHistory(updatedHistory);
    setChatInput('');
    setIsChatLoading(true);
    const responseText = await chatWithAssistant(updatedHistory, activeStory);
    setChatHistory([...updatedHistory, { role: 'model', text: responseText, timestamp: Date.now() }]);
    setIsChatLoading(false);
  };

  // --- Renderers ---

  const renderDashboard = () => (
    <div className="max-w-5xl mx-auto p-8">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900">{t.appTitle}</h1>
          <p className="text-gray-500 mt-2">{t.appDesc}</p>
        </div>
        <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <button 
                    className={`px-3 py-1 text-sm rounded-md transition ${uiLanguage === 'en' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500'}`}
                    onClick={() => setUiLanguage('en')}
                >English</button>
                <button 
                    className={`px-3 py-1 text-sm rounded-md transition ${uiLanguage === 'id' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500'}`}
                    onClick={() => setUiLanguage('id')}
                >Indonesia</button>
            </div>
            <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} className="h-10 border-gray-300 text-gray-700 hover:bg-gray-50">
                    📂 {t.importStory}
                </Button>
                <Button onClick={createNewStory} className="h-10">{t.createNew}</Button>
            </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stories.length === 0 ? (
          <div className="col-span-full text-center py-20 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-400 mb-4">{t.noStories}</p>
            <Button variant="secondary" onClick={createNewStory}>{t.startNovel}</Button>
          </div>
        ) : (
          stories.map(story => (
            <div 
              key={story.id} 
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer group relative"
              onClick={() => { setActiveStoryId(story.id); setView(ViewState.PLANNER); }}
            >
              <div className="flex justify-between items-start mb-2">
                  <h3 className="font-serif font-bold text-xl text-gray-800 truncate flex-1">{story.title}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-100 text-cyan-800 border border-cyan-200 px-2 py-1 rounded ml-2">
                    {story.language === 'id' ? 'ID' : 'EN'}
                  </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4 h-16 overflow-hidden content-start">
                {story.genres.slice(0, 3).map(g => (
                  <span key={g} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{g}</span>
                ))}
              </div>
              <p className="text-gray-500 text-sm line-clamp-3 mb-4 h-14">
                {story.premise || "..."}
              </p>
              <div className="text-xs text-gray-400 flex justify-between items-center">
                <span>{story.chapters.length} {t.chapters}</span>
                <span>{t.updated} {new Date(story.lastUpdated).toLocaleDateString()}</span>
              </div>
              <button 
                className="absolute top-4 right-4 text-gray-300 hover:text-red-500 hidden group-hover:block p-1 bg-white/80 rounded-full"
                onClick={(e) => deleteStory(e, story.id)}
              >🗑️</button>
            </div>
          ))
        )}
      </div>
      {renderImportModal()}
    </div>
  );

  const renderImportModal = () => {
      if (!isImportModalOpen) return null;
      return (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh]">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div>
                          <h2 className="text-2xl font-serif font-bold text-gray-800">{t.importStory}</h2>
                          <p className="text-xs text-gray-500">{t.importDesc}</p>
                      </div>
                      <button onClick={() => setIsImportModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  
                  <div className="px-6 pt-4 bg-white">
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.sourceLang}</label>
                       <select 
                         className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                         value={importLanguage}
                         onChange={(e) => setImportLanguage(e.target.value as Language)}
                       >
                           <option value="id">Indonesia</option>
                           <option value="en">English</option>
                       </select>
                       <p className="text-[10px] text-gray-400 mt-1 mb-2">{t.selectSourceLang}</p>
                  </div>

                  <div className="flex-1 p-6 pt-2 bg-white flex flex-col overflow-hidden">
                      <textarea 
                          className="flex-1 w-full p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                          placeholder={t.pasteText}
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                      />
                      <div className="mt-2 text-xs text-gray-400 flex justify-between">
                          <span>{getCharCount(importText)} chars</span>
                          <span className="text-amber-600">{t.importWarn}</span>
                      </div>
                  </div>

                  <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                      <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>{t.discard}</Button>
                      <Button onClick={handleImportStory} isLoading={isExtracting} disabled={!importText.trim()}>
                          {isExtracting ? t.extracting : t.importBtn}
                      </Button>
                  </div>
              </div>
          </div>
      );
  };

  const renderGenesisModal = () => {
    if (!isGenesisOpen) return null;
    const progress = (genesisStep / 4) * 100;
    
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8 backdrop-blur-sm animate-fade-in">
        <div className="max-w-2xl w-full text-center">
           <div className="mb-8">
               <h2 className="text-4xl md:text-5xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-indigo-300 mb-4 animate-pulse">
                   {t.genesisTitle}
               </h2>
               <p className="text-indigo-200/80 text-lg">{t.genesisDesc}</p>
           </div>

           <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden mb-8 border border-gray-700">
               <div 
                 className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-1000 ease-in-out"
                 style={{ width: `${progress}%` }}
               ></div>
           </div>

           <div className="space-y-2 min-h-[100px] mb-8 text-left bg-black/50 p-4 rounded-lg border border-gray-800 font-mono text-sm overflow-y-auto max-h-48">
               {genesisLog.map((log, i) => (
                   <div key={i} className="text-green-400/90">> {log}</div>
               ))}
               {genesisStep < 4 && <span className="animate-pulse text-green-400/50">_</span>}
           </div>

           {genesisStep === 4 && (
               <Button onClick={() => { setIsGenesisOpen(false); setPlannerTab(PlannerTab.WORLD); }} className="bg-white text-black hover:bg-gray-200 font-bold text-lg px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                   Enter Universe
               </Button>
           )}
        </div>
      </div>
    );
  };

  const renderCharacterModal = () => {
    if (!editingCharacter) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
             <div>
                 <h2 className="text-2xl font-bold text-gray-800">{editingCharacter.name ? editingCharacter.name : t.addChar}</h2>
                 <p className="text-xs text-gray-400">{t.fillInInfo}</p>
             </div>
             <div className="flex items-center gap-3">
                 <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleRefineCharacter}
                    isLoading={isRefiningChar}
                    className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-700 border-indigo-100"
                 >
                     {isRefiningChar ? t.refining : t.aiRefine}
                 </Button>
                 <button onClick={() => setEditingCharacter(null)} className="text-gray-400 hover:text-gray-600 p-2">✕</button>
             </div>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
             {/* Left Col: Visuals */}
             <div className="md:col-span-1 flex flex-col gap-4">
                <div className="aspect-[3/4] bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative group shadow-inner">
                   {editingCharacter.avatarBase64 ? (
                     <img src={`data:image/png;base64,${editingCharacter.avatarBase64}`} alt="Avatar" className="w-full h-full object-cover" />
                   ) : (
                     <div className="text-gray-400 text-5xl">👤</div>
                   )}
                   {isImgLoading && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><div className="animate-spin text-white text-2xl">⚙️</div></div>}
                </div>
                
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase">{t.imgStyle}</label>
                    <select 
                        className="w-full p-2 text-sm border border-gray-300 rounded-md"
                        value={editingCharacter.imageStyle || ""}
                        onChange={(e) => setEditingCharacter({...editingCharacter, imageStyle: e.target.value})}
                    >
                        <option value="">{t.selectImgStyle}</option>
                        {IMAGE_STYLES.map(style => (
                            <option key={style} value={style}>{style}</option>
                        ))}
                    </select>
                    <Button 
                      size="sm" 
                      onClick={() => handleGeneratePortrait(editingCharacter)}
                      isLoading={isImgLoading}
                      disabled={!editingCharacter.appearance || !editingCharacter.name}
                      className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white border-none shadow-md"
                    >
                      {t.genPortrait}
                    </Button>
                </div>
             </div>

             {/* Right Col: Details */}
             <div className="md:col-span-2 space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.charName}</label>
                    <input 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                      value={editingCharacter.name} 
                      onChange={(e) => setEditingCharacter({...editingCharacter, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.charAge}</label>
                    <input 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                      value={editingCharacter.age} 
                      onChange={(e) => setEditingCharacter({...editingCharacter, age: e.target.value})}
                    />
                  </div>
                </div>
                
                <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.charRole}</label>
                   <input 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                      value={editingCharacter.role} 
                      placeholder="Protagonist, Antagonist..."
                      onChange={(e) => setEditingCharacter({...editingCharacter, role: e.target.value})}
                   />
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
                       {t.charApp}
                       <span className="text-[10px] font-normal normal-case text-gray-400">Inc. Height, Build, Style</span>
                   </label>
                   <textarea 
                      className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm leading-relaxed"
                      value={editingCharacter.appearance} 
                      placeholder="Hair color, eye color, clothing style, distinguishing marks..."
                      onChange={(e) => setEditingCharacter({...editingCharacter, appearance: e.target.value})}
                   />
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.charPers}</label>
                   <textarea 
                      className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm leading-relaxed"
                      value={editingCharacter.personality} 
                      placeholder="Traits, demeanor, internal conflicts..."
                      onChange={(e) => setEditingCharacter({...editingCharacter, personality: e.target.value})}
                   />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.charVoice}</label>
                    <input 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                      value={editingCharacter.voice} 
                      placeholder="Formal, Slang, Soft..."
                      onChange={(e) => setEditingCharacter({...editingCharacter, voice: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.charStr}</label>
                    <input 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                      value={editingCharacter.strengths} 
                      onChange={(e) => setEditingCharacter({...editingCharacter, strengths: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
                       {t.charBack}
                       <span className="text-[10px] font-normal normal-case text-gray-400">Motivation, Ghost/Wound, The 'Why'</span>
                   </label>
                   <textarea 
                      className="w-full p-3 border border-gray-300 rounded-lg h-32 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm leading-relaxed"
                      value={editingCharacter.backstory} 
                      onChange={(e) => setEditingCharacter({...editingCharacter, backstory: e.target.value})}
                   />
                </div>
             </div>
          </div>
          
          <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50">
             <Button variant="danger" onClick={() => deleteCharacter(editingCharacter.id)}>{t.deleteChar}</Button>
             <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditingCharacter(null)}>{t.discard}</Button>
                <Button onClick={() => saveCharacter(editingCharacter)}>{t.save}</Button>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWorldItemModal = () => {
      if (!editingWorldItem) return null;
      return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
               <div>
                   <h2 className="text-2xl font-bold text-gray-800">{editingWorldItem.name ? editingWorldItem.name : t.addWorldItem}</h2>
                   <p className="text-xs text-gray-400">{t.fillInInfo}</p>
               </div>
               <div className="flex items-center gap-3">
                   <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={handleRefineWorld}
                      isLoading={isRefiningWorld}
                      className="bg-gradient-to-r from-emerald-50 to-teal-50 text-teal-700 border-teal-100"
                   >
                       {isRefiningWorld ? t.deepening : t.aiDeepen}
                   </Button>
                   <button onClick={() => setEditingWorldItem(null)} className="text-gray-400 hover:text-gray-600 p-2">✕</button>
               </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
               {/* Left Col: Visuals */}
               <div className="md:col-span-1 flex flex-col gap-4">
                  <div className="aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative group shadow-inner">
                     {editingWorldItem.imageUrl ? (
                       <img src={`data:image/png;base64,${editingWorldItem.imageUrl}`} alt="Visual" className="w-full h-full object-cover" />
                     ) : (
                       <div className="text-gray-400 text-5xl">🌍</div>
                     )}
                     {isWorldImgLoading && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><div className="animate-spin text-white text-2xl">⚙️</div></div>}
                  </div>
                  
                  <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase">{t.imgStyle}</label>
                      <select 
                          className="w-full p-2 text-sm border border-gray-300 rounded-md"
                          value={editingWorldItem.imageStyle || ""}
                          onChange={(e) => setEditingWorldItem({...editingWorldItem, imageStyle: e.target.value})}
                      >
                          <option value="">{t.selectImgStyle}</option>
                          {IMAGE_STYLES.map(style => (
                              <option key={style} value={style}>{style}</option>
                          ))}
                      </select>
                      <Button 
                        size="sm" 
                        onClick={() => handleGenWorldImage(editingWorldItem)}
                        isLoading={isWorldImgLoading}
                        disabled={!editingWorldItem.description || !editingWorldItem.name}
                        className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-none shadow-md"
                      >
                        {t.genVisual}
                      </Button>
                  </div>
               </div>
  
               {/* Right Col: Details */}
               <div className="md:col-span-2 space-y-5">
                  <div className="grid grid-cols-2 gap-5">
                    <div className='col-span-2 sm:col-span-1'>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.worldName}</label>
                      <input 
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                        value={editingWorldItem.name} 
                        onChange={(e) => setEditingWorldItem({...editingWorldItem, name: e.target.value})}
                      />
                    </div>
                    <div className='col-span-2 sm:col-span-1'>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.worldCat}</label>
                      <select 
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                        value={editingWorldItem.category} 
                        onChange={(e) => setEditingWorldItem({...editingWorldItem, category: e.target.value as WorldCategory})}
                      >
                          {WORLD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
  
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t.worldDesc}</label>
                     <textarea 
                        className="w-full p-3 border border-gray-300 rounded-lg h-32 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm leading-relaxed"
                        value={editingWorldItem.description} 
                        onChange={(e) => setEditingWorldItem({...editingWorldItem, description: e.target.value})}
                     />
                  </div>
  
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-amber-800 uppercase mb-1 flex justify-between">
                            {t.worldSensory}
                            <span className="text-[10px] font-normal normal-case text-amber-600/70">{t.worldSensoryHelp}</span>
                        </label>
                        <textarea 
                            className="w-full p-3 border border-amber-200 rounded-lg h-24 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm leading-relaxed bg-white"
                            value={editingWorldItem.sensoryDetails} 
                            onChange={(e) => setEditingWorldItem({...editingWorldItem, sensoryDetails: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-amber-800 uppercase mb-1 flex justify-between">
                            {t.worldSecret}
                            <span className="text-[10px] font-normal normal-case text-amber-600/70">{t.worldSecretHelp}</span>
                        </label>
                        <textarea 
                            className="w-full p-3 border border-amber-200 rounded-lg h-24 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm leading-relaxed bg-white"
                            value={editingWorldItem.secret} 
                            onChange={(e) => setEditingWorldItem({...editingWorldItem, secret: e.target.value})}
                        />
                    </div>
                  </div>
               </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50">
               <Button variant="danger" onClick={() => deleteWorldItem(editingWorldItem.id)}>{t.deleteWorldItem}</Button>
               <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditingWorldItem(null)}>{t.discard}</Button>
                  <Button onClick={() => saveWorldItem(editingWorldItem)}>{t.save}</Button>
               </div>
            </div>
          </div>
        </div>
      );
  };

  const renderPlanner = () => {
    if (!activeStory) return null;

    const tabs = [
      { id: PlannerTab.GENERAL, label: t.overview },
      { id: PlannerTab.CHARACTERS, label: t.characters },
      { id: PlannerTab.WORLD, label: t.worldBuilding },
      { id: PlannerTab.PLOT, label: t.plotStructure },
    ];

    return (
      <div className="flex h-screen bg-white">
        {/* Navigation Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
           <div className="p-4 border-b border-gray-200">
             <Button variant="ghost" className="w-full justify-start mb-2 text-sm" onClick={() => setView(ViewState.DASHBOARD)}>{t.backToDash}</Button>
             <h2 className="font-serif font-bold text-lg truncate text-gray-900" title={activeStory.title}>{activeStory.title}</h2>
           </div>
           <nav className="flex-1 overflow-y-auto p-4 space-y-1">
             <div className="text-xs font-bold text-gray-400 uppercase px-2 mb-2">Planning</div>
             {tabs.map(tab => (
               <button
                 key={tab.id}
                 onClick={() => setPlannerTab(tab.id)}
                 className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition ${plannerTab === tab.id ? 'bg-indigo-100 text-indigo-800' : 'text-gray-600 hover:bg-gray-200'}`}
               >{tab.label}</button>
             ))}
             <div className="my-4 border-t border-gray-200"></div>
             <div className="text-xs font-bold text-gray-400 uppercase px-2 mb-2">Writing</div>
             <button 
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-200 transition" 
              onClick={() => {
                if(activeStory.chapters.length === 0) createChapter();
                else setActiveChapterId(activeStory.chapters[0].id);
                setView(ViewState.EDITOR);
              }}
             >{t.startWriting}</button>
           </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-white p-8 md:p-12 relative">
          <div className="max-w-5xl mx-auto">
             {plannerTab === PlannerTab.GENERAL && (
               <div className="animate-fade-in">
                  <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                    <h1 className="text-3xl font-serif font-bold text-gray-900">{t.overview}</h1>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold uppercase text-gray-500">{t.storyLang}:</label>
                      <select
                        className="border border-gray-300 rounded-md p-1 text-sm font-bold text-gray-700"
                        value={activeStory.language}
                        onChange={(e) => updateStoryField('language', e.target.value)}
                      >
                         <option value="en">English</option>
                         <option value="id">Indonesia</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="mb-10">
                    <label className="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">{t.title}</label>
                    <input 
                        type="text" 
                        className="w-full text-4xl font-serif font-bold text-gray-900 border-b-2 border-gray-200 focus:border-indigo-600 outline-none py-2 bg-transparent placeholder-gray-300 transition-colors"
                        value={activeStory.title}
                        onChange={(e) => updateStoryField('title', e.target.value)}
                        placeholder="Enter Story Title"
                    />
                  </div>

                  <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
                      <div className="flex justify-between items-end mb-3">
                          <label className="block text-sm font-bold text-gray-800 uppercase tracking-wide">{t.genres}</label>
                          <div className="flex gap-2">
                            <Button 
                                onClick={handleAutoSetup} 
                                isLoading={isAutoSettingUp} 
                                disabled={activeStory.genres.length === 0}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md"
                                size="sm"
                            >
                                {isAutoSettingUp ? "Initializing..." : t.autoSetup}
                            </Button>
                          </div>
                      </div>
                      <p className="text-xs text-gray-500 mb-4">{t.autoSetupHelp}</p>
                      
                      <div className="flex flex-wrap gap-2 mb-4">
                        {GENRE_OPTIONS.map(g => (
                          <button
                              key={g.id}
                              onClick={() => toggleGenre(g.id)}
                              className={`px-4 py-2 rounded-full text-sm border transition-all shadow-sm ${activeStory.genres.includes(g.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}
                          >{g.label}</button>
                        ))}
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-gray-500 mb-1">{t.customGenres}</label>
                         <input 
                            type="text"
                            className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900 placeholder-gray-400 shadow-sm"
                            placeholder={t.customGenresPlaceholder}
                            value={activeStory.customGenres || ''}
                            onChange={(e) => updateStoryField('customGenres', e.target.value)}
                         />
                      </div>
                  </div>

                  <PlannerField 
                      label={t.premise} 
                      fieldKey="premise"
                      story={activeStory}
                      uiLanguage={uiLanguage}
                      value={activeStory.premise}
                      onChange={(val) => updateStoryField('premise', val)}
                      placeholder={t.premisePlaceholder}
                      rows={3}
                  />

                  {/* GENESIS IGNITION BUTTON */}
                  <div className="mb-10">
                      <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 rounded-xl shadow-xl border border-gray-700 text-center relative overflow-hidden group">
                          <div className="absolute inset-0 bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20 transition duration-500"></div>
                          <h3 className="text-2xl font-serif font-bold text-white mb-2 relative z-10">{t.genesisTitle}</h3>
                          <p className="text-indigo-200 text-sm mb-6 relative z-10 max-w-lg mx-auto">{t.genesisDesc}</p>
                          <button 
                            onClick={handleIgniteGenesis}
                            className="relative z-10 bg-white text-gray-900 hover:bg-indigo-50 font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-1"
                          >
                              {t.genesisBtn}
                          </button>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div>
                        <label className="block text-sm font-bold text-gray-800 uppercase tracking-wide border-l-4 border-indigo-500 pl-3 mb-3">{t.tone}</label>
                        <select
                           className="w-full p-3 mb-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800"
                           value={TONE_OPTIONS.includes(activeStory.tone) ? activeStory.tone : ""}
                           onChange={(e) => e.target.value && updateStoryField('tone', e.target.value)}
                        >
                           <option value="">{t.selectTone}</option>
                           {TONE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <input 
                            type="text"
                            className="w-full p-3 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-400"
                            placeholder={t.tonePlaceholder}
                            value={activeStory.tone}
                            onChange={(e) => updateStoryField('tone', e.target.value)}
                        />
                      </div>
                      
                      {/* Enhanced Writing Style Section */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                            <label className="block text-sm font-bold text-gray-800 uppercase tracking-wide border-l-4 border-pink-500 pl-3">{t.style}</label>
                            <Button variant="ghost" size="sm" onClick={() => setShowStyleRef(!showStyleRef)} className="text-xs text-pink-600 bg-pink-50 hover:bg-pink-100">
                                {showStyleRef ? "Hide Ref" : t.styleRef}
                            </Button>
                        </div>
                        
                        {showStyleRef && (
                            <div className="mb-3 p-4 bg-pink-50 rounded-lg border border-pink-100 animate-fade-in">
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t.pasteSample}</label>
                                <p className="text-[10px] text-gray-500 mb-2">{t.styleRefHelp}</p>
                                <textarea 
                                    className="w-full p-2 text-xs border border-pink-200 rounded mb-2 h-24"
                                    placeholder={t.styleRefPlaceholder}
                                    value={activeStory.styleReference || ''}
                                    onChange={(e) => updateStoryField('styleReference', e.target.value)}
                                />
                                <Button 
                                    size="sm" 
                                    onClick={handleAnalyzeStyle} 
                                    isLoading={isAnalyzingStyle}
                                    disabled={!activeStory.styleReference}
                                    className="w-full bg-pink-600 text-white hover:bg-pink-700"
                                >
                                    {t.analyzeStyle}
                                </Button>
                            </div>
                        )}

                        <select
                           className="w-full p-3 mb-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800"
                           value={STYLE_OPTIONS.includes(activeStory.writingStyle) ? activeStory.writingStyle : ""}
                           onChange={(e) => e.target.value && updateStoryField('writingStyle', e.target.value)}
                        >
                           <option value="">{t.selectStyle}</option>
                           {STYLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <textarea 
                            className="w-full p-3 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-400 min-h-[50px]"
                            placeholder={t.stylePlaceholder}
                            rows={3}
                            value={activeStory.writingStyle}
                            onChange={(e) => updateStoryField('writingStyle', e.target.value)}
                        />
                      </div>
                  </div>
               </div>
             )}

             {plannerTab === PlannerTab.CHARACTERS && (
               <div className="animate-fade-in">
                 <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                   <h1 className="text-3xl font-serif font-bold text-gray-900">{t.characters}</h1>
                   <div className="flex gap-2">
                     <Button 
                        variant="secondary" 
                        onClick={handleGenerateFullCast} 
                        isLoading={isGeneratingCast}
                        disabled={!activeStory.premise}
                        className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 text-indigo-700 hover:from-indigo-100 hover:to-purple-100"
                      >
                       {t.genFullCast}
                     </Button>
                     <Button onClick={() => setEditingCharacter({
                       id: generateId(), name: '', role: '', age: '', appearance: '', personality: '', voice: '', strengths: '', weaknesses: '', backstory: ''
                     })}>
                       {t.addChar}
                     </Button>
                   </div>
                 </div>
                 
                 {activeStory.characters.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                       <div className="text-4xl mb-4">👥</div>
                       <p className="text-gray-500 mb-4">No characters yet. Generate a cast or add one manually.</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                       {activeStory.characters.map(char => (
                         <div 
                            key={char.id} 
                            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md hover:border-indigo-300 transition group relative overflow-hidden"
                            onClick={() => setEditingCharacter(char)}
                         >
                            <div className="flex gap-4 items-start">
                               <div className="w-16 h-16 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                                 {char.avatarBase64 ? (
                                   <img src={`data:image/png;base64,${char.avatarBase64}`} alt={char.name} className="w-full h-full object-cover" />
                                 ) : (
                                   <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                                 )}
                               </div>
                               <div>
                                 <h3 className="font-bold text-gray-900">{char.name || "Unnamed"}</h3>
                                 <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">{char.role}</p>
                                 <p className="text-sm text-gray-500 line-clamp-2">{char.appearance || char.personality}</p>
                               </div>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                         </div>
                       ))}
                    </div>
                 )}
                 
                 {/* Simple text area for loose notes */}
                 <PlannerField 
                    label={t.charNotes} 
                    fieldKey="charactersText"
                    story={activeStory}
                    uiLanguage={uiLanguage}
                    value={activeStory.charactersText}
                    onChange={(val) => updateStoryField('charactersText', val)}
                    placeholder={t.charNotesPlaceholder}
                    rows={5}
                 />

                 {renderCharacterModal()}
               </div>
             )}

             {plannerTab === PlannerTab.WORLD && (
               <div className="animate-fade-in">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-100 pb-4 gap-4">
                     <div>
                        <h1 className="text-3xl font-serif font-bold text-gray-900">{t.worldBuilding}</h1>
                     </div>
                     <div className="flex gap-2">
                        {/* Filter */}
                        <select 
                            className="bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-3 py-2 outline-none"
                            value={worldFilter}
                            onChange={(e) => setWorldFilter(e.target.value as WorldCategory | 'All')}
                        >
                            <option value="All">{t.filterAll}</option>
                            {WORLD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <Button onClick={() => setEditingWorldItem({
                            id: generateId(), name: '', category: 'Location', description: '', sensoryDetails: '', secret: ''
                        })}>
                            {t.addWorldItem}
                        </Button>
                     </div>
                 </div>

                 {/* World Wiki Grid */}
                 {(!activeStory.worldItems || activeStory.worldItems.length === 0) ? (
                      <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 mb-8">
                         <div className="text-4xl mb-4">🌍</div>
                         <p className="text-gray-500 mb-4">{t.emptyWorld}</p>
                      </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                         {activeStory.worldItems
                             .filter(item => worldFilter === 'All' || item.category === worldFilter)
                             .map(item => (
                                 <div 
                                     key={item.id} 
                                     className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-teal-300 transition cursor-pointer group"
                                     onClick={() => setEditingWorldItem(item)}
                                 >
                                     <div className="h-32 bg-gray-200 relative">
                                         {item.imageUrl ? (
                                             <img src={`data:image/png;base64,${item.imageUrl}`} className="w-full h-full object-cover" alt={item.name} />
                                         ) : (
                                             <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl bg-gray-100">🗺️</div>
                                         )}
                                         <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 text-xs font-bold rounded shadow-sm uppercase tracking-wide text-gray-700">
                                             {item.category}
                                         </div>
                                     </div>
                                     <div className="p-4">
                                         <h3 className="font-bold text-gray-900 text-lg mb-1">{item.name || "Unnamed"}</h3>
                                         <p className="text-sm text-gray-500 line-clamp-2">{item.description || "No description..."}</p>
                                     </div>
                                     {item.secret && (
                                         <div className="px-4 pb-4">
                                             <div className="text-[10px] bg-amber-50 text-amber-800 px-2 py-1 rounded border border-amber-100 flex items-center gap-1">
                                                 <span>🤫</span> Has Secret
                                             </div>
                                         </div>
                                     )}
                                 </div>
                             ))
                         }
                     </div>
                 )}
                 
                 <PlannerField 
                    label={t.worldScratchpad}
                    fieldKey="worldText"
                    story={activeStory}
                    uiLanguage={uiLanguage}
                    value={activeStory.worldText}
                    onChange={(val) => updateStoryField('worldText', val)}
                    placeholder={t.worldNotesPlaceholder}
                    rows={10}
                 />

                 {renderWorldItemModal()}
               </div>
             )}

             {plannerTab === PlannerTab.PLOT && (
               <div className="animate-fade-in">
                 <h1 className="text-3xl font-serif font-bold text-gray-900 mb-8 border-b border-gray-100 pb-4">{t.plotStructure}</h1>
                 <PlotGenerator story={activeStory} uiLanguage={uiLanguage} onSave={(text) => {
                     const current = activeStory.plotOutline || '';
                     updateStoryField('plotOutline', current + (current ? '\n\n' : '') + text);
                 }} />
                 <PlannerField 
                    label={t.plotNotes}
                    fieldKey="plotOutline"
                    story={activeStory}
                    uiLanguage={uiLanguage}
                    value={activeStory.plotOutline}
                    onChange={(val) => updateStoryField('plotOutline', val)}
                    placeholder={t.plotNotesPlaceholder}
                    rows={15}
                 />
               </div>
             )}
          </div>
        </div>
        {/* Genesis Modal Overlay */}
        {renderGenesisModal()}
      </div>
    );
  };

  const renderEditor = () => {
    if (!activeStory) return null;

    const currentContent = activeChapter?.content || '';
    const wordCount = getWordCount(currentContent);
    const charCount = getCharCount(currentContent);
    const readTime = getReadTime(currentContent);

    return (
      <div className="flex h-screen bg-gray-100 overflow-hidden">
        {/* Left Sidebar: Navigation */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col hidden md:flex">
          <div className="p-4 border-b border-gray-200">
             <Button variant="ghost" className="w-full justify-start mb-2 text-xs" onClick={() => setView(ViewState.PLANNER)}>{t.backToPlanner}</Button>
             <h2 className="font-serif font-bold text-md truncate text-gray-900">{activeStory.title}</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase p-2">{t.chapters}</h3>
            <ul className="space-y-1">
              {activeStory.chapters.map((chap, idx) => (
                <li key={chap.id}>
                  <button 
                    className={`w-full text-left px-3 py-2 rounded-md text-sm truncate ${activeChapterId === chap.id ? 'bg-white shadow-sm font-medium text-indigo-700 border border-gray-200' : 'text-gray-600 hover:bg-gray-200'}`}
                    onClick={() => setActiveChapterId(chap.id)}
                  >{idx + 1}. {chap.title}</button>
                </li>
              ))}
            </ul>
            <div className="p-2 mt-2">
              <Button size="sm" variant="secondary" className="w-full text-xs" onClick={createChapter}>{t.newChapter}</Button>
            </div>
          </div>
        </div>

        {/* Center: Writing Area */}
        <div className="flex-1 flex flex-col bg-[#fdfbf7] relative">
           <div className="h-14 border-b border-[#eeeae0] flex items-center justify-between px-6 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-4 flex-1">
                 <input 
                    type="text" 
                    className="bg-transparent font-medium text-gray-800 outline-none focus:border-b border-indigo-400 w-full max-w-md"
                    value={activeChapter?.title || ''}
                    onChange={(e) => updateChapterTitle(e.target.value)}
                    placeholder="Chapter Title"
                 />
              </div>
              
              {/* Director Mode Menu */}
              <div className="relative">
                  <div className="flex items-center gap-2">
                    {isWriterLoading && <span className="text-xs text-indigo-600 font-medium animate-pulse mr-2">{writerStatus || t.generating}</span>}
                    <Button 
                        variant="ghost" 
                        className="text-indigo-600 text-sm font-bold flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100" 
                        onClick={() => setShowDirectorMenu(!showDirectorMenu)}
                        disabled={isWriterLoading}
                    >
                      <span>🎬</span> {t.autoComplete}
                    </Button>
                    <button onClick={() => setIsAiPanelOpen(!isAiPanelOpen)} className={`p-2 rounded-md transition ${isAiPanelOpen ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                      📝
                    </button>
                  </div>

                  {showDirectorMenu && (
                      <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50 animate-fade-in">
                          <h4 className="text-xs font-bold uppercase text-gray-500 mb-3">{t.directorMode}</h4>
                          
                          <div className="mb-4">
                              <label className="block text-xs font-bold text-gray-700 mb-1">{t.writeInstr}</label>
                              <textarea 
                                  className="w-full p-2 text-sm border border-gray-300 rounded-md h-16"
                                  placeholder={t.writeInstrPlaceholder}
                                  value={writeInstruction}
                                  onChange={(e) => setWriteInstruction(e.target.value)}
                              />
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-4">
                              {['short', 'medium', 'long', 'panic'].map((len) => (
                                  <button
                                      key={len}
                                      onClick={() => setWriteLength(len as any)}
                                      className={`text-xs py-2 px-1 rounded border transition ${
                                          writeLength === len 
                                          ? (len === 'panic' ? 'bg-red-50 border-red-500 text-red-700 font-bold' : 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold') 
                                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                      }`}
                                  >
                                      {len === 'short' && t.lenShort}
                                      {len === 'medium' && t.lenMed}
                                      {len === 'long' && t.lenLong}
                                      {len === 'panic' && t.len