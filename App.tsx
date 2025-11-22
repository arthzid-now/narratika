
import React, { useState, useEffect, useRef } from 'react';
import { Story, Chapter, ViewState, PlannerTab, GENRE_OPTIONS, TONE_OPTIONS, STYLE_OPTIONS, ChatMessage, Language, CharacterProfile, IMAGE_STYLES, WorldItem, WORLD_CATEGORIES, WorldCategory } from './types';
import { Button } from './components/Button';
import { PlannerField } from './components/PlannerField';
import { generateProse, chatWithAssistant, generateStructuredCast, generateCharacterImage, refineCharacterProfile, autoSetupStory, analyzeWritingStyle, refineWorldItem, generateWorldItemImage, generateGenesisWorld, generateGenesisCharacters, generateGenesisPlot, WriteOptions, generateChapterBeats, extractStoryDna, smartSplitText } from './services/geminiService';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { WorldGenerator, PlotGenerator, CharacterGenerator } from './components/StoryGenerators';
import { translations } from './translations';

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// FIX 1: LocalStorage Bomb Prevention (Image Compressor)
// Compresses Gemini's high-res PNGs to smaller JPEGs before saving to LocalStorage
const compressImage = (base64Str: string, maxWidth = 256): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Calculate aspect ratio to keep it square or original
      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * ratio;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Convert to JPEG with 0.7 quality (Massive size reduction)
      const newStr = canvas.toDataURL('image/jpeg', 0.7);
      // Remove the data:image/jpeg;base64, prefix to match existing logic
      resolve(newStr.split(',')[1]);
    };
    img.onerror = () => resolve(base64Str); // Fallback if loading fails
  });
};

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
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false); // Closed by default on mobile for better first impression
  const [isChapterDrawerOpen, setIsChapterDrawerOpen] = useState(false); 
  const [editorSidebarTab, setEditorSidebarTab] = useState<'chat' | 'cast' | 'wiki' | 'plot'>('chat');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isWriterLoading, setIsWriterLoading] = useState(false);
  const [writerStatus, setWriterStatus] = useState(""); 

  // Director Mode 
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
  const [genesisStep, setGenesisStep] = useState(0); 
  const [genesisLog, setGenesisLog] = useState<string[]>([]);

  // Import Mode State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLanguage, setImportLanguage] = useState<Language>('id');
  const [isExtracting, setIsExtracting] = useState(false);

  const activeStory = stories.find(s => s.id === activeStoryId);
  const activeChapter = activeStory?.chapters.find(c => c.id === activeChapterId);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
  const t = translations[uiLanguage];

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('novella_stories');
    if (saved) {
      try {
        const parsedStories = JSON.parse(saved);
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
      try {
        localStorage.setItem('novella_stories', JSON.stringify(stories));
      } catch (e) {
        alert("Storage Full! Please delete some images or stories.");
      }
    }
  }, [stories]);

  useEffect(() => {
      setImportLanguage(uiLanguage);
  }, [uiLanguage]);

  useEffect(() => {
      setIsChapterDrawerOpen(false);
      setShowDirectorMenu(false);
  }, [view]);
  
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, editorSidebarTab]);

  // Adjust textarea height to content automatically
  useEffect(() => {
    if (view === ViewState.EDITOR && editorRef.current) {
      editorRef.current.style.height = 'auto';
      editorRef.current.style.height = editorRef.current.scrollHeight + 'px';
    }
  }, [activeChapter?.content, view]);

  // --- Stats Calculation ---
  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const getCharCount = (text: string) => text.length;
  const getReadTime = (text: string) => Math.ceil(getWordCount(text) / 250);

  // --- Handlers ---
  const createNewStory = () => {
    const newStory: Story = {
      id: generateId(),
      title: uiLanguage === 'id' ? 'Cerita Tanpa Judul' : 'Untitled Story',
      language: uiLanguage,
      genres: [],
      customGenres: '',
      premise: '',
      characters: [], 
      worldItems: [], 
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
      const dna = await extractStoryDna(importText, importLanguage);
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
              language: importLanguage,
              genres: [],
              customGenres: '',
              premise: dna.premise || '',
              characters: dna.characters.map((c: any) => ({...c, id: generateId()})) || [],
              worldItems: dna.worldItems.map((w: any) => ({...w, id: generateId()})) || [],
              plotOutline: dna.plotOutline || '',
              worldText: '',
              charactersText: '',
              tone: dna.tone || '',
              writingStyle: dna.writingStyle || '',
              styleReference: importText.substring(0, 2000),
              chapters: chapters,
              lastUpdated: Date.now()
          };
          setStories([newStory, ...stories]);
          setActiveStoryId(newStory.id);
          setIsImportModalOpen(false);
          setImportText('');
          setView(ViewState.PLANNER);
      } else {
          alert("Failed to extract story DNA.");
      }
      setIsExtracting(false);
  };

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
      if (description) updateStoryField('writingStyle', description);
      setIsAnalyzingStyle(false);
  };

  const handleIgniteGenesis = async () => {
      if (!activeStory) return;
      if (!activeStory.premise || activeStory.genres.length === 0) {
          alert(t.genesisWarn);
          return;
      }
      setIsGenesisOpen(true);
      setGenesisStep(1);
      setGenesisLog([t.genesisPhase1]);
      
      const genWorldItems = await generateGenesisWorld(activeStory);
      setGenesisLog(prev => [...prev, `✅ ${genWorldItems.length} World Elements Created`, t.genesisPhase2]);
      setGenesisStep(2);
      
      const genCharacters = await generateGenesisCharacters(activeStory, genWorldItems);
      setGenesisLog(prev => [...prev, `✅ ${genCharacters.length} Characters Summoned`, t.genesisPhase3]);
      setGenesisStep(3);
      
      const genPlot = await generateGenesisPlot(activeStory, genWorldItems, genCharacters);
      setGenesisLog(prev => [...prev, `✅ Destiny Woven`, t.genesisComplete]);
      setGenesisStep(4);

      setStories(stories.map(s => s.id === activeStoryId ? {
          ...s,
          worldItems: [...s.worldItems, ...genWorldItems],
          characters: [...s.characters, ...genCharacters],
          plotOutline: (s.plotOutline ? s.plotOutline + '\n\n' : '') + genPlot,
          lastUpdated: Date.now()
      } : s));
  };

  const handleGenerateFullCast = async () => {
    if (!activeStory) return;
    setIsGeneratingCast(true);
    const newCharacters = await generateStructuredCast(activeStory);
    if (newCharacters.length > 0) updateStoryField('characters', [...activeStory.characters, ...newCharacters]);
    setIsGeneratingCast(false);
  };

  const saveCharacter = (char: CharacterProfile) => {
    if (!activeStory) return;
    let updatedList = activeStory.characters.some(c => c.id === char.id)
      ? activeStory.characters.map(c => c.id === char.id ? char : c)
      : [...activeStory.characters, char];
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
    const rawBase64 = await generateCharacterImage(char, style);
    
    if (rawBase64) {
      // Compress before saving to state
      const compressedBase64 = await compressImage(rawBase64);
      const updatedChar = { ...char, avatarBase64: compressedBase64 };
      setEditingCharacter(updatedChar);
      if (activeStory) updateStoryField('characters', activeStory.characters.map(c => c.id === char.id ? updatedChar : c));
    }
    setIsImgLoading(false);
  };
  
  const handleRefineCharacter = async () => {
      if(!activeStory || !editingCharacter) return;
      setIsRefiningChar(true);
      const refined = await refineCharacterProfile(activeStory, editingCharacter);
      if (refined) setEditingCharacter(refined);
      setIsRefiningChar(false);
  };

  const saveWorldItem = (item: WorldItem) => {
      if (!activeStory) return;
      const currentItems = activeStory.worldItems || [];
      let updatedList = currentItems.some(i => i.id === item.id) 
        ? currentItems.map(i => i.id === item.id ? item : i) 
        : [...currentItems, item];
      updateStoryField('worldItems', updatedList);
      setEditingWorldItem(null);
  };

  const deleteWorldItem = (id: string) => {
      if(!activeStory) return;
      if(confirm("Delete this world entry?")) {
          updateStoryField('worldItems', (activeStory.worldItems || []).filter(i => i.id !== id));
          setEditingWorldItem(null);
      }
  };

  const handleRefineWorld = async () => {
      if(!activeStory || !editingWorldItem) return;
      setIsRefiningWorld(true);
      const refined = await refineWorldItem(activeStory, editingWorldItem);
      if (refined) setEditingWorldItem(refined);
      setIsRefiningWorld(false);
  };

  const handleGenWorldImage = async (item: WorldItem) => {
      setIsWorldImgLoading(true);
      const style = item.imageStyle || (item.category === 'Location' ? "Concept Art (Environment)" : "Concept Art (Item/Prop)");
      const rawBase64 = await generateWorldItemImage(item, style);
      
      if (rawBase64) {
          // Compress before saving
          const compressedBase64 = await compressImage(rawBase64);
          const updatedItem = { ...item, imageUrl: compressedBase64 };
          setEditingWorldItem(updatedItem);
          if (activeStory) updateStoryField('worldItems', (activeStory.worldItems || []).map(i => i.id === item.id ? updatedItem : i));
      }
      setIsWorldImgLoading(false);
  };

  const createChapter = () => {
    if (!activeStoryId) return;
    const newChapter: Chapter = {
      id: generateId(),
      title: `${uiLanguage === 'id' ? 'Bab' : 'Chapter'} ${activeStory!.chapters.length + 1}`,
      content: ''
    };
    updateStoryField('chapters', [...activeStory!.chapters, newChapter]);
  };

  const handleStartWriting = () => {
    if (!activeStory) return;
    
    if (activeStory.chapters.length === 0) {
        // Manually creating chapter here to ensure synchronous state update logic
        const newChapterId = generateId();
        const newChapter: Chapter = {
          id: newChapterId,
          title: `${uiLanguage === 'id' ? 'Bab' : 'Chapter'} 1`,
          content: ''
        };
        // Direct state update to ensure immediate availability
        const updatedChapters = [newChapter];
        setStories(stories.map(s => s.id === activeStoryId ? { ...s, chapters: updatedChapters, lastUpdated: Date.now() } : s));
        setActiveChapterId(newChapterId);
    } else {
        if (!activeChapterId || !activeStory.chapters.find(c => c.id === activeChapterId)) {
            setActiveChapterId(activeStory.chapters[0].id);
        }
    }
    setView(ViewState.EDITOR);
  };

  const handleCreateNewChapter = () => {
      if (!activeStory) return;
      const newChapterId = generateId();
      const newChapter: Chapter = {
        id: newChapterId,
        title: `${uiLanguage === 'id' ? 'Bab' : 'Chapter'} ${activeStory.chapters.length + 1}`,
        content: ''
      };
      const updatedChapters = [...activeStory.chapters, newChapter];
      setStories(stories.map(s => s.id === activeStoryId ? { ...s, chapters: updatedChapters, lastUpdated: Date.now() } : s));
      setActiveChapterId(newChapterId);
  }

  const updateChapterContent = (content: string) => {
    if (!activeStoryId || !activeChapterId) return;
    
    const updatedChapters = activeStory!.chapters.map(c => c.id === activeChapterId ? { ...c, content } : c);
    setStories(stories.map(s => s.id === activeStoryId ? { ...s, chapters: updatedChapters, lastUpdated: Date.now() } : s));
  };
  
  const updateChapterTitle = (title: string) => {
    if (!activeStoryId || !activeChapterId) return;
    updateStoryField('chapters', activeStory!.chapters.map(c => c.id === activeChapterId ? { ...c, title } : c));
  };

  const handleAiWrite = async () => {
    if (!activeStory || !activeChapter || !editorRef.current) return;
    setShowDirectorMenu(false);
    setIsWriterLoading(true);
    setWriterStatus(t.generating);

    // FIX 2: Phantom Cursor Logic
    let cursor = editorRef.current.selectionStart;
    if (cursor === 0 && activeChapter.content.length > 0) {
        cursor = activeChapter.content.length;
    }

    const textBefore = activeChapter.content.substring(0, cursor);
    const textAfter = activeChapter.content.substring(cursor);
    
    let generatedText = "";
    
    if (writeLength === 'panic') {
        const beats = await generateChapterBeats(activeStory, activeChapterId!, textBefore);
        generatedText = beats.map((beat: string, i: number) => `[SCENE ${i+1}: ${beat}]`).join('\n\n');
    } else {
        const options: WriteOptions = {
            length: writeLength,
            instruction: writeInstruction
        };
        generatedText = await generateProse(activeStory, activeChapterId!, cursor, options);
    }

    const newContent = textBefore + (textBefore.endsWith(' ') ? '' : ' ') + generatedText + textAfter;
    updateChapterContent(newContent);
    
    setIsWriterLoading(false);
    setWriterStatus("");
  };

  const handleChat = async () => {
    if (!activeStory || !chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: Date.now() };
    setChatHistory([...chatHistory, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    
    const reply = await chatWithAssistant([...chatHistory, userMsg], activeStory);
    const aiMsg: ChatMessage = { role: 'model', text: reply, timestamp: Date.now() };
    setChatHistory(prev => [...prev, aiMsg]);
    setIsChatLoading(false);
  };

  // --- Render Helpers ---
  const renderHeader = () => (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-stone-200 flex items-center justify-between px-4 md:px-8 flex-shrink-0 z-40">
      <div className="flex items-center gap-4">
         {view !== ViewState.DASHBOARD && (
           <Button variant="ghost" onClick={() => setView(ViewState.DASHBOARD)} size="sm">
             {t.backToDash}
           </Button>
         )}
         <h1 className="font-serif font-bold text-lg md:text-xl tracking-tight text-ink truncate max-w-[150px] md:max-w-md">
           {view === ViewState.DASHBOARD ? t.appTitle : activeStory?.title}
         </h1>
      </div>
      <div className="flex items-center gap-3">
        <select 
            value={uiLanguage} 
            onChange={(e) => setUiLanguage(e.target.value as Language)}
            className="bg-transparent text-xs font-bold uppercase tracking-widest text-stone-500 focus:outline-none cursor-pointer hover:text-ink"
        >
            <option value="en">EN</option>
            <option value="id">ID</option>
        </select>
      </div>
    </header>
  );

  // --- View: Dashboard ---
  if (view === ViewState.DASHBOARD) {
    return (
      <div className="h-screen bg-bone font-sans text-ink flex flex-col overflow-hidden">
        {renderHeader()}
        
        <main className="flex-1 overflow-y-auto p-4 md:p-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 gap-4">
                <div>
                <h2 className="text-3xl md:text-4xl font-serif font-bold mb-2 md:mb-3 text-ink tracking-tight">{t.startNovel}</h2>
                <p className="text-stone-500 font-medium text-sm md:text-base">{t.appDesc}</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Button onClick={() => setIsImportModalOpen(true)} variant="secondary" className="flex-1 md:flex-none shadow-sm justify-center">
                    📥 {t.importStory}
                    </Button>
                    <Button onClick={createNewStory} variant="primary" className="flex-1 md:flex-none shadow-lg shadow-stone-900/20 justify-center">
                    {t.createNew}
                    </Button>
                </div>
            </div>

            {stories.length === 0 ? (
                <div className="border-2 border-dashed border-stone-300 rounded-3xl p-8 md:p-16 text-center bg-white/50">
                <div className="text-6xl mb-6 opacity-20">📚</div>
                <p className="text-xl font-serif text-stone-400 mb-6">{t.noStories}</p>
                <Button onClick={createNewStory} variant="magic">{t.createNew}</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 pb-10">
                {stories.map(story => (
                    <div 
                    key={story.id} 
                    onClick={() => { setActiveStoryId(story.id); setView(ViewState.PLANNER); }}
                    className="group bg-white rounded-3xl p-6 md:p-8 border border-stone-200 shadow-sm md:hover:shadow-2xl md:hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col h-64 md:h-72 active:scale-[0.98]"
                    >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-stone-200 to-stone-100 group-hover:from-indigo-500 group-hover:to-purple-500 transition-colors duration-300"></div>
                    
                    <div className="flex-1">
                        <div className="flex justify-between items-start mb-4">
                        <span className="inline-block px-3 py-1 rounded-full bg-stone-100 text-stone-500 text-xs font-bold uppercase tracking-widest">
                            {story.language === 'id' ? 'Bahasa' : 'English'}
                        </span>
                        <button 
                            onClick={(e) => deleteStory(e, story.id)}
                            className="text-stone-300 hover:text-red-500 transition-colors p-2"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        </div>
                        
                        <h3 className="text-xl md:text-2xl font-serif font-bold mb-2 line-clamp-2 text-ink group-hover:text-indigo-900 transition-colors">
                            {story.title}
                        </h3>
                        <p className="text-sm text-stone-500 line-clamp-3 leading-relaxed">
                            {story.premise || story.plotOutline || t.premisePlaceholder}
                        </p>
                    </div>

                    <div className="pt-6 border-t border-stone-100 mt-4 flex justify-between items-center text-xs font-bold text-stone-400 uppercase tracking-wide">
                        <span>{story.chapters.length} {t.chapters}</span>
                        <span>{new Date(story.lastUpdated).toLocaleDateString()}</span>
                    </div>
                    </div>
                ))}
                </div>
            )}
          </div>
        </main>

        {/* Import Modal */}
        {isImportModalOpen && (
            <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 md:p-8 animate-slide-up">
                    <h2 className="text-2xl font-bold font-serif mb-2">{t.importStory}</h2>
                    <p className="text-stone-500 mb-6">{t.importDesc}</p>
                    
                    <div className="mb-4">
                        <label className="block text-xs font-bold text-stone-500 uppercase mb-2">{t.sourceLang}</label>
                        <select 
                            value={importLanguage} 
                            onChange={(e) => setImportLanguage(e.target.value as Language)}
                            className="w-full p-2 border border-stone-300 rounded-lg bg-stone-50 text-base md:text-sm"
                        >
                            <option value="en">English</option>
                            <option value="id">Bahasa Indonesia</option>
                        </select>
                    </div>

                    <textarea 
                        className="w-full h-64 p-4 bg-stone-50 border border-stone-300 rounded-xl text-base md:text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none mb-6 placeholder-stone-400"
                        placeholder={t.pasteText}
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                    />
                    
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>{t.discard}</Button>
                        <Button variant="magic" onClick={handleImportStory} isLoading={isExtracting} disabled={!importText.trim()}>
                            {isExtracting ? t.extracting : t.importBtn}
                        </Button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // --- View: Planner (Swiss Style) ---
  if (view === ViewState.PLANNER && activeStory) {
    const tabs = [
        { id: PlannerTab.GENERAL, label: t.overview, icon: '📋' },
        { id: PlannerTab.CHARACTERS, label: t.characters, icon: '👥' },
        { id: PlannerTab.WORLD, label: t.worldBuilding, icon: '🌍' },
        { id: PlannerTab.PLOT, label: t.plotStructure, icon: '📈' },
    ];

    return (
      <div className="h-screen bg-bone font-sans text-ink flex flex-col overflow-hidden">
        {renderHeader()}
        
        {/* FIX: Layout logic - Main is flex row, but inside we have nav and section stacked */}
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Mobile Navigation: Static block, no sticky needed as parent doesn't scroll */}
            <nav className="md:hidden bg-white border-b border-stone-200 flex overflow-x-auto scrollbar-hide flex-shrink-0 z-30 shadow-sm">
                {tabs.map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setPlannerTab(tab.id)}
                        className={`flex-none px-6 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${plannerTab === tab.id ? 'border-ink text-ink bg-stone-50' : 'border-transparent text-stone-500'}`}
                    >
                        <span className="mr-2">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Desktop Planner Sidebar */}
            <aside className="w-64 border-r border-stone-200 bg-white hidden md:flex flex-col flex-shrink-0">
                <nav className="p-4 space-y-1">
                    {tabs.map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setPlannerTab(tab.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-3 ${plannerTab === tab.id ? 'bg-stone-100 text-ink' : 'text-stone-500 hover:bg-stone-50 hover:text-ink'}`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </nav>
                <div className="mt-auto p-4 border-t border-stone-100">
                    <Button onClick={handleStartWriting} className="w-full" variant="primary" size="lg">
                        {t.startWriting}
                    </Button>
                </div>
            </aside>

            {/* Planner Content Area: This creates the scroll container */}
            <section className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-12 bg-bone">
                <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-stone-200 shadow-sm p-6 md:p-12 min-h-full">
                    
                    {/* Genesis Modal (Overlay) */}
                    {isGenesisOpen && (
                        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                             <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-10 max-w-lg w-full text-center relative overflow-hidden">
                                 <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-pink-50/50 z-0"></div>
                                 <div className="relative z-10">
                                     <div className="text-6xl mb-6 animate-bounce">⚡</div>
                                     <h2 className="text-3xl font-serif font-bold mb-2">{t.genesisTitle}</h2>
                                     <p className="text-stone-500 mb-8">{t.genesisDesc}</p>
                                     
                                     <div className="space-y-3 mb-8 text-left bg-white/60 p-6 rounded-2xl border border-white/50 shadow-inner h-48 overflow-y-auto">
                                         {genesisLog.map((log, i) => (
                                             <div key={i} className="text-sm text-stone-700 font-mono animate-fade-in">{log}</div>
                                         ))}
                                         {genesisStep < 4 && <div className="animate-pulse text-indigo-500">...</div>}
                                     </div>

                                     {genesisStep === 4 && (
                                         <Button variant="magic" onClick={() => setIsGenesisOpen(false)} className="w-full">
                                             {t.startWriting}
                                         </Button>
                                     )}
                                 </div>
                             </div>
                        </div>
                    )}

                    {/* Tab: General */}
                    {plannerTab === PlannerTab.GENERAL && (
                        <div className="space-y-8 md:space-y-10 animate-fade-in">
                             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                 <h2 className="text-2xl md:text-3xl font-serif font-bold">{t.overview}</h2>
                                 <div className="relative group w-full md:w-auto">
                                    <Button variant="magic" size="sm" onClick={handleIgniteGenesis} disabled={!activeStory.premise} className="w-full md:w-auto">
                                        {t.genesisBtn}
                                    </Button>
                                    <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-ink text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        {t.genesisTooltip}
                                    </div>
                                 </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                 <div className="col-span-1 md:col-span-2">
                                     <PlannerField className="mb-0" label={t.title} fieldKey="title" value={activeStory.title} story={activeStory} uiLanguage={uiLanguage} onChange={(v) => updateStoryField('title', v)} />
                                 </div>
                                 
                                 <div className="col-span-1 md:col-span-2">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-xs font-extrabold text-ink uppercase tracking-widest">{t.genres}</label>
                                        <div className="relative group">
                                            <Button variant="ghost" size="sm" onClick={handleAutoSetup} isLoading={isAutoSettingUp} className="text-[10px] text-indigo-600 px-2 py-0 h-6 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg">
                                            ✨ {t.autoSetup}
                                            </Button>
                                            <div className="absolute right-0 bottom-full mb-2 w-48 p-2 bg-ink text-white text-[10px] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                {t.autoSetupTooltip}
                                            </div>
                                        </div>
                                    </div>
                                     {/* Genre Wall Mobile - Horizontal Scroll */}
                                     <div className="flex overflow-x-auto pb-2 gap-2 mb-4 -mx-6 px-6 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
                                         {GENRE_OPTIONS.map(g => (
                                             <button
                                                 key={g.id}
                                                 onClick={() => toggleGenre(g.id)}
                                                 className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeStory.genres.includes(g.id) ? 'bg-ink text-white border-ink' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'}`}
                                             >
                                                 {g.label}
                                             </button>
                                         ))}
                                     </div>
                                     <input 
                                         className="w-full bg-transparent border-b border-stone-300 py-2 text-base md:text-sm focus:border-ink outline-none placeholder-stone-400 transition-colors"
                                         placeholder={t.customGenresPlaceholder}
                                         value={activeStory.customGenres}
                                         onChange={(e) => updateStoryField('customGenres', e.target.value)}
                                     />
                                 </div>

                                 <div className="col-span-1 md:col-span-2">
                                      <PlannerField 
                                        className="mb-0"
                                        label={t.premise} 
                                        fieldKey="premise" 
                                        value={activeStory.premise} 
                                        story={activeStory} 
                                        uiLanguage={uiLanguage} 
                                        onChange={(v) => updateStoryField('premise', v)} 
                                        placeholder={t.premisePlaceholder} 
                                        rows={3} 
                                      />
                                 </div>

                                 {/* Tone & Style Section - Compact Grid on Mobile */}
                                 <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-3 md:gap-8">
                                     {/* Tone Column */}
                                     <div className="space-y-2">
                                        <label className="block text-[10px] md:text-xs font-extrabold text-ink uppercase tracking-widest">{t.tone}</label>
                                        <select 
                                            className="w-full p-2 md:p-3 rounded-xl border border-stone-300 bg-stone-50 text-sm md:text-sm font-medium focus:ring-2 focus:ring-ink outline-none appearance-none"
                                            value={activeStory.tone}
                                            onChange={(e) => updateStoryField('tone', e.target.value)}
                                        >
                                            <option value="">{t.selectTone}</option>
                                            {TONE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                        <textarea
                                            className="w-full p-2 md:p-3 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-ink outline-none resize-none h-20 md:h-24 placeholder-stone-400"
                                            placeholder={t.tonePlaceholder}
                                            value={activeStory.tone} 
                                            onChange={(e) => updateStoryField('tone', e.target.value)}
                                        />
                                     </div>

                                     {/* Style Column */}
                                     <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="block text-[10px] md:text-xs font-extrabold text-ink uppercase tracking-widest">{t.style}</label>
                                            <Button variant="ghost" size="sm" onClick={() => setShowStyleRef(!showStyleRef)} className="text-[9px] md:text-[10px] uppercase font-bold text-stone-400 hover:text-ink px-1">
                                                {showStyleRef ? 'Hide' : 'Ref'}
                                            </Button>
                                        </div>
                                        
                                        {showStyleRef && (
                                            <div className="absolute left-6 right-6 z-10 bg-white shadow-xl p-4 rounded-xl border border-stone-200 animate-fade-in md:static md:shadow-none md:p-0 md:border-none md:bg-transparent md:mb-2">
                                                <textarea
                                                    className="w-full p-3 bg-stone-50 border border-stone-300 rounded-lg text-xs mb-2 h-24 resize-none focus:ring-2 focus:ring-ink outline-none placeholder-stone-400"
                                                    placeholder={t.styleRefPlaceholder}
                                                    value={activeStory.styleReference}
                                                    onChange={(e) => updateStoryField('styleReference', e.target.value)}
                                                />
                                                <div className="flex justify-end">
                                                    <Button size="sm" onClick={handleAnalyzeStyle} isLoading={isAnalyzingStyle} disabled={!activeStory.styleReference} className="text-xs py-1">
                                                        {t.analyzeStyle}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        <textarea
                                            className="w-full p-2 md:p-3 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-ink outline-none resize-none h-20 md:h-24 placeholder-stone-400"
                                            placeholder={t.stylePlaceholder}
                                            value={activeStory.writingStyle}
                                            onChange={(e) => updateStoryField('writingStyle', e.target.value)}
                                        />
                                     </div>
                                 </div>
                             </div>
                        </div>
                    )}

                    {/* Tab: Characters (Modular) */}
                    {plannerTab === PlannerTab.CHARACTERS && (
                        <div className="animate-fade-in">
                            <CharacterGenerator story={activeStory} uiLanguage={uiLanguage} onSave={(text) => updateStoryField('charactersText', activeStory.charactersText + '\n\n' + text)} />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                                <div className="md:col-span-2 flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                                    <h3 className="text-xl font-bold font-serif">{t.characters} ({activeStory.characters.length})</h3>
                                    <div className="flex gap-2 w-full md:w-auto">
                                         <Button variant="secondary" size="sm" onClick={handleGenerateFullCast} isLoading={isGeneratingCast} className="flex-1 md:flex-none">{t.genFullCast}</Button>
                                         <Button variant="primary" size="sm" onClick={() => setEditingCharacter({
                                             id: generateId(), name: '', role: '', age: '', appearance: '', personality: '', voice: '', strengths: '', weaknesses: '', backstory: ''
                                         })} className="flex-1 md:flex-none">{t.addChar}</Button>
                                    </div>
                                </div>
                                
                                {activeStory.characters.map(char => (
                                    <div key={char.id} className="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-lg transition-shadow relative group">
                                        <div className="flex gap-4">
                                            <div className="w-20 h-20 rounded-full bg-stone-100 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                                                {char.avatarBase64 ? (
                                                    <img src={`data:image/png;base64,${char.avatarBase64}`} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">👤</div>
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-lg">{char.name}</h4>
                                                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1">{char.role}</p>
                                                <p className="text-sm text-stone-500 line-clamp-2">{char.backstory}</p>
                                            </div>
                                        </div>
                                        <div className="absolute top-4 right-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <Button size="sm" variant="ghost" onClick={() => setEditingCharacter(char)}>✏️</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Character Edit Modal */}
                    {editingCharacter && (
                        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            {/* FIX: Modal Bottom Cliff. Added pb-32 to allow scrolling past bottom elements */}
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8 pb-32 animate-slide-up">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl md:text-2xl font-serif font-bold">{editingCharacter.name ? editingCharacter.name : t.newCharacter}</h3>
                                    <div className="flex gap-2">
                                        <Button variant="magic" size="sm" onClick={handleRefineCharacter} isLoading={isRefiningChar}>{t.aiRefine}</Button>
                                        <Button variant="danger" size="sm" onClick={() => deleteCharacter(editingCharacter.id)}>{t.deleteChar}</Button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="col-span-2 flex flex-col md:flex-row gap-4 items-center p-4 bg-stone-50 rounded-xl border border-stone-200">
                                         <div className="w-24 h-24 rounded-full bg-stone-200 overflow-hidden flex-shrink-0">
                                            {editingCharacter.avatarBase64 ? (
                                                <img src={`data:image/png;base64,${editingCharacter.avatarBase64}`} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-stone-400 text-3xl">👤</div>
                                            )}
                                         </div>
                                         <div className="flex-1 w-full">
                                             <select 
                                                 className="w-full text-base md:text-xs p-2 rounded mb-2 border border-stone-300"
                                                 value={editingCharacter.imageStyle || ""}
                                                 onChange={(e) => setEditingCharacter({...editingCharacter, imageStyle: e.target.value})}
                                             >
                                                 <option value="">{t.selectImgStyle}</option>
                                                 {IMAGE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                                             </select>
                                             <Button size="sm" variant="secondary" onClick={() => handleGeneratePortrait(editingCharacter)} isLoading={isImgLoading} className="w-full">
                                                 {t.genPortrait}
                                             </Button>
                                         </div>
                                    </div>

                                    <div className="col-span-2 md:col-span-1">
                                        <label className="text-xs font-bold uppercase text-stone-500">{t.charName}</label>
                                        <input className="w-full p-2 border-b border-stone-300 focus:border-ink outline-none bg-transparent text-base md:text-sm" value={editingCharacter.name} onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} />
                                    </div>
                                    <div className="col-span-2 md:col-span-1">
                                        <label className="text-xs font-bold uppercase text-stone-500">{t.charRole}</label>
                                        <input className="w-full p-2 border-b border-stone-300 focus:border-ink outline-none bg-transparent text-base md:text-sm" value={editingCharacter.role} onChange={e => setEditingCharacter({...editingCharacter, role: e.target.value})} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs font-bold uppercase text-stone-500">{t.charBack}</label>
                                        <textarea className="w-full p-2 border rounded-lg border-stone-300 focus:ring-1 focus:ring-ink outline-none h-24 text-base md:text-sm" value={editingCharacter.backstory} onChange={e => setEditingCharacter({...editingCharacter, backstory: e.target.value})} />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <Button variant="ghost" onClick={() => setEditingCharacter(null)}>{t.discard}</Button>
                                    <Button variant="primary" onClick={() => saveCharacter(editingCharacter)}>{t.save}</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab: World (Modular) */}
                    {plannerTab === PlannerTab.WORLD && (
                         <div className="animate-fade-in">
                             <WorldGenerator story={activeStory} uiLanguage={uiLanguage} onSave={(text) => updateStoryField('worldText', activeStory.worldText + '\n\n' + text)} />
                             
                             <div className="mt-8">
                                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                     <div className="flex gap-2 overflow-x-auto pb-2 w-full md:w-auto scrollbar-hide">
                                         <button onClick={() => setWorldFilter('All')} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold ${worldFilter === 'All' ? 'bg-ink text-white' : 'bg-stone-100 text-stone-500'}`}>{t.filterAll}</button>
                                         {WORLD_CATEGORIES.map(c => (
                                             <button key={c} onClick={() => setWorldFilter(c)} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold ${worldFilter === c ? 'bg-ink text-white' : 'bg-stone-100 text-stone-500'}`}>{c}</button>
                                         ))}
                                     </div>
                                     <Button variant="primary" size="sm" onClick={() => setEditingWorldItem({
                                         id: generateId(), name: '', category: 'Location', description: '', sensoryDetails: '', secret: ''
                                     })} className="w-full md:w-auto">{t.addWorldItem}</Button>
                                 </div>

                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     {(activeStory.worldItems || []).filter(i => worldFilter === 'All' || i.category === worldFilter).map(item => (
                                         <div key={item.id} className="group bg-white border border-stone-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setEditingWorldItem(item)}>
                                             <div className="h-32 bg-stone-200 relative">
                                                 {item.imageUrl ? (
                                                     <img src={`data:image/png;base64,${item.imageUrl}`} className="w-full h-full object-cover" />
                                                 ) : (
                                                     <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-4xl opacity-50">🗺️</div>
                                                 )}
                                                 <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded uppercase">
                                                     {item.category}
                                                 </div>
                                             </div>
                                             <div className="p-4">
                                                 <h4 className="font-bold text-lg mb-1">{item.name}</h4>
                                                 <p className="text-xs text-stone-500 line-clamp-2">{item.description}</p>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         </div>
                    )}

                    {/* Tab: Plot */}
                    {plannerTab === PlannerTab.PLOT && (
                        <div className="animate-fade-in">
                            <PlotGenerator story={activeStory} uiLanguage={uiLanguage} onSave={(text) => updateStoryField('plotOutline', activeStory.plotOutline + '\n\n' + text)} />
                            <PlannerField label={t.plotNotes} fieldKey="plotOutline" value={activeStory.plotOutline} story={activeStory} uiLanguage={uiLanguage} onChange={(v) => updateStoryField('plotOutline', v)} placeholder={t.plotNotesPlaceholder} rows={12} />
                        </div>
                    )}

                </div>
            </section>

            {/* Mobile Planner Start Writing Floating Button (if needed) */}
             <div className="md:hidden absolute bottom-6 right-6 z-20">
                 <Button onClick={handleStartWriting} variant="primary" className="shadow-xl rounded-full h-14 w-14 flex items-center justify-center p-0">
                    ✎
                </Button>
            </div>
        </main>
      </div>
    );
  }

  // --- View: Editor ---
  if (view === ViewState.EDITOR && activeStory && activeChapter) {
    const wordCount = getWordCount(activeChapter.content);
    const readTime = getReadTime(activeChapter.content);

    return (
      <div className="h-screen flex flex-col bg-bone overflow-hidden">
        {/* Editor Header */}
        <header className="h-14 bg-white border-b border-stone-200 flex items-center justify-between px-4 z-20 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-2 md:gap-3">
             <Button variant="ghost" size="sm" onClick={() => setView(ViewState.PLANNER)} className="text-stone-500 px-2 md:px-4">
                {t.backToPlanner}
             </Button>
             <div className="h-4 w-px bg-stone-300"></div>
             <button 
               onClick={() => setIsChapterDrawerOpen(true)} 
               className="md:hidden text-ink font-bold flex items-center gap-1 truncate max-w-[120px] text-sm"
             >
               <span>📚</span> <span className="truncate">{activeChapter.title}</span>
             </button>
             <span className="hidden md:block font-bold text-ink text-sm">{activeChapter.title}</span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 text-xs font-medium text-stone-500">
              {/* Mobile: Simplified Stats */}
              <span className="md:hidden font-mono">{wordCount}w</span>
              {/* Desktop: Full Stats */}
              <span className="hidden md:inline">{wordCount} {t.wordCount}</span>
              <span className="hidden md:inline">•</span>
              <span className="hidden md:inline">{readTime} {t.minRead}</span>
              
              <div className="h-4 w-px bg-stone-300 mx-1 md:mx-2"></div>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                className={`${isAiPanelOpen ? 'text-indigo-600 bg-indigo-50' : 'text-stone-400'}`}
              >
                <span className="md:hidden text-lg">✨</span>
                <span className="hidden md:inline">{isAiPanelOpen ? 'Hide AI' : 'Show AI'}</span>
              </Button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
            {/* Chapter Drawer (Desktop: Static, Mobile: Slide-over) */}
            <aside className={`
                fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-stone-200 transform transition-transform duration-300 ease-in-out
                md:relative md:translate-x-0
                ${isChapterDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="p-4 flex justify-between items-center border-b border-stone-100 md:hidden">
                    <h3 className="font-bold">{t.chapters}</h3>
                    <button onClick={() => setIsChapterDrawerOpen(false)} className="p-2">✕</button>
                </div>
                <div className="p-4 space-y-2 overflow-y-auto h-full pb-20">
                    {activeStory.chapters.map((chapter) => (
                        <div 
                            key={chapter.id}
                            onClick={() => { setActiveChapterId(chapter.id); setIsChapterDrawerOpen(false); }}
                            className={`p-3 rounded-xl text-sm cursor-pointer transition-all ${activeChapterId === chapter.id ? 'bg-ink text-white font-medium shadow-md' : 'hover:bg-stone-100 text-stone-600'}`}
                        >
                           {chapter.title}
                        </div>
                    ))}
                    <Button onClick={handleCreateNewChapter} variant="secondary" size="sm" className="w-full mt-4 border-dashed">
                        {t.newChapter}
                    </Button>
                </div>
            </aside>

            {/* Mobile Drawer Backdrop */}
            {isChapterDrawerOpen && (
                <div className="fixed inset-0 bg-black/20 z-20 md:hidden" onClick={() => setIsChapterDrawerOpen(false)}></div>
            )}

            {/* Main Editor Area - Refactored for Mobile Scrolling */}
            <main className="flex-1 relative bg-bone flex flex-col overflow-hidden">
                 {/* Scrollable Container */}
                 <div className="flex-1 overflow-y-auto">
                     <div className="max-w-3xl mx-auto w-full min-h-screen bg-white shadow-sm my-0 md:my-8 p-6 md:p-16 pb-48 outline-none">
                         <input 
                            className="w-full text-3xl md:text-4xl font-serif font-bold mb-8 text-ink outline-none placeholder-stone-300 bg-transparent"
                            value={activeChapter.title}
                            onChange={(e) => updateChapterTitle(e.target.value)}
                         />
                         <textarea
                            ref={editorRef}
                            className="w-full min-h-[60vh] resize-none outline-none prose-editor bg-transparent overflow-hidden"
                            value={activeChapter.content}
                            onChange={(e) => updateChapterContent(e.target.value)}
                            placeholder="Once upon a time..."
                         />
                    </div>
                 </div>
                 
                 {/* Floating Director Button - Positioned Absolute relative to main container, outside scroll */}
                 <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10">
                    <div className="relative pointer-events-auto">
                        {showDirectorMenu && (
                             <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-72 bg-white rounded-2xl shadow-2xl border border-indigo-100 p-4 animate-slide-up">
                                 <h4 className="text-xs font-bold uppercase text-indigo-500 mb-3 tracking-wide">{t.directorMode}</h4>
                                 <div className="space-y-3">
                                     <input 
                                         className="w-full text-xs p-2 bg-stone-50 rounded-lg border border-stone-200"
                                         placeholder={t.writeInstrPlaceholder}
                                         value={writeInstruction}
                                         onChange={(e) => setWriteInstruction(e.target.value)}
                                     />
                                     <div className="grid grid-cols-2 gap-2">
                                         {['short', 'medium', 'long', 'panic'].map((len) => (
                                             <button 
                                                 key={len}
                                                 onClick={() => setWriteLength(len as any)}
                                                 className={`text-[10px] font-bold py-2 rounded-lg border ${writeLength === len ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-stone-500 border-stone-200'}`}
                                             >
                                                 {len === 'panic' ? '🔥 PANIC' : len.toUpperCase()}
                                             </button>
                                         ))}
                                     </div>
                                     <Button variant="magic" size="sm" className="w-full" onClick={handleAiWrite} isLoading={isWriterLoading}>
                                         {t.writeBtn}
                                     </Button>
                                 </div>
                             </div>
                        )}
                        <button 
                            onClick={() => setShowDirectorMenu(!showDirectorMenu)}
                            className="flex items-center gap-2 bg-ink text-white px-6 py-3 rounded-full shadow-xl hover:scale-105 transition-transform font-medium text-sm"
                        >
                           <span>✨ {isWriterLoading ? writerStatus : t.autoComplete}</span>
                        </button>
                    </div>
                 </div>
            </main>

            {/* Right Sidebar (AI Tools) - FIXED UI FOR MOBILE */}
            <aside className={`
                fixed inset-0 z-[60] bg-white/95 backdrop-blur-md transition-transform duration-300 ease-in-out flex flex-col
                md:relative md:z-0 md:w-[400px] md:border-l md:border-stone-200 md:bg-stone-50/50 md:backdrop-blur-none
                ${isAiPanelOpen ? 'translate-x-0' : 'translate-x-full md:hidden'}
            `}>
                 {/* Mobile Header for Sidebar */}
                 <div className="md:hidden flex items-center justify-between p-4 border-b border-stone-200 bg-white">
                     <h3 className="font-bold text-ink flex items-center gap-2">✨ AI Assistant</h3>
                     <Button variant="ghost" size="sm" onClick={() => setIsAiPanelOpen(false)} className="bg-stone-100">✕ Close</Button>
                 </div>

                 {/* Tabs */}
                 <div className="flex p-2 bg-white border-b border-stone-200 flex-shrink-0">
                     {['chat', 'cast', 'wiki', 'plot'].map(tab => (
                         <button 
                             key={tab}
                             onClick={() => setEditorSidebarTab(tab as any)}
                             className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition-colors ${editorSidebarTab === tab ? 'bg-indigo-50 text-indigo-700' : 'text-stone-400 hover:text-ink'}`}
                         >
                             {t[`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`]}
                         </button>
                     ))}
                 </div>

                 {/* Content */}
                 <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
                     {editorSidebarTab === 'chat' && (
                         <div className="flex flex-col h-full">
                             <div className="flex-1 space-y-4 mb-4">
                                 {chatHistory.length === 0 && (
                                     <div className="text-center text-stone-400 text-sm mt-10 italic">
                                         "{t.askAiPlaceholder}"
                                     </div>
                                 )}
                                 {chatHistory.map((msg, i) => (
                                     <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                         <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-ink text-white' : 'bg-white border border-stone-200 shadow-sm text-ink'}`}>
                                             <MarkdownRenderer content={msg.text} />
                                         </div>
                                     </div>
                                 ))}
                                 <div ref={chatBottomRef}></div>
                             </div>
                             <div className="sticky bottom-0 bg-white border-t border-stone-200 p-2 -m-4 mt-auto">
                                 <div className="relative">
                                     <textarea 
                                         className="w-full p-3 pr-12 bg-stone-50 rounded-xl text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500 placeholder-stone-400"
                                         rows={2}
                                         placeholder={t.askAiPlaceholder}
                                         value={chatInput}
                                         onChange={(e) => setChatInput(e.target.value)}
                                         onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                                     />
                                     <button 
                                         className="absolute right-2 bottom-2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50"
                                         onClick={handleChat}
                                         disabled={isChatLoading || !chatInput.trim()}
                                     >
                                         {isChatLoading ? '⏳' : '➤'}
                                     </button>
                                 </div>
                             </div>
                         </div>
                     )}

                     {editorSidebarTab === 'cast' && (
                         <div className="space-y-4">
                             {activeStory.characters.map(char => (
                                 <div key={char.id} className="bg-white p-3 rounded-xl border border-stone-200 flex gap-3 items-center shadow-sm">
                                     <div className="w-12 h-12 rounded-full bg-stone-100 overflow-hidden flex-shrink-0">
                                         {char.avatarBase64 ? <img src={`data:image/png;base64,${char.avatarBase64}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">👤</div>}
                                     </div>
                                     <div>
                                         <h5 className="font-bold text-sm">{char.name}</h5>
                                         <p className="text-[10px] font-bold uppercase text-stone-400">{char.role}</p>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     )}

                     {editorSidebarTab === 'wiki' && (
                         <div className="space-y-4">
                              {activeStory.worldItems.map(item => (
                                  <div key={item.id} className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                                      <div className="flex justify-between items-start mb-1">
                                          <h5 className="font-bold text-sm">{item.name}</h5>
                                          <span className="text-[10px] bg-stone-100 px-2 py-1 rounded text-stone-500">{item.category}</span>
                                      </div>
                                      <p className="text-xs text-stone-500 line-clamp-3">{item.description}</p>
                                  </div>
                              ))}
                         </div>
                     )}

                     {editorSidebarTab === 'plot' && (
                         <div className="bg-white p-4 rounded-xl border border-stone-200 text-sm leading-relaxed whitespace-pre-wrap">
                             {activeStory.plotOutline || <span className="text-stone-400 italic">{t.noStories}</span>}
                         </div>
                     )}
                 </div>
            </aside>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
