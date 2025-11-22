
import { GoogleGenAI, Type } from "@google/genai";
import { Story, CharacterProfile, WorldItem, WORLD_CATEGORIES } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helper: Build Context ---
const buildStoryContextString = (story: Story) => {
  const genreString = [...story.genres, story.customGenres].filter(Boolean).join(', ');
  
  // Convert structured characters to a readable string for the Writer AI
  const charactersString = story.characters.length > 0
    ? story.characters.map(c => `
      - Name: ${c.name} (${c.role})
        Age: ${c.age}
        Appearance: ${c.appearance}
        Personality: ${c.personality}
        Voice/Style: ${c.voice}
        Strengths: ${c.strengths}
        Weaknesses: ${c.weaknesses}
      `).join('\n')
    : "No detailed characters yet.";

  // Convert structured World Items to readable string
  const worldItemsString = story.worldItems && story.worldItems.length > 0
    ? story.worldItems.map(w => `
      - [${w.category}] ${w.name}: 
        ${w.description}
        Sensory: ${w.sensoryDetails}
        Secrets: ${w.secret}
    `).join('\n')
    : "No structured world data yet.";

  return `
    Title: ${story.title}
    Premise: ${story.premise}
    Genres: ${genreString}
    Tone: ${story.tone}
    Style Description: ${story.writingStyle}
    ${story.styleReference ? `USER WRITING SAMPLE (MIMIC THIS STYLE): \n"${story.styleReference.substring(0, 1500)}..."` : ''}
    
    CHARACTERS:
    ${charactersString}
    
    WORLD WIKI (LOCATIONS, FACTIONS, ITEMS, ETC):
    ${worldItemsString}

    WORLD NOTES (UNSTRUCTURED):
    ${story.worldText}
    
    PLOT OUTLINE:
    ${story.plotOutline}
  `;
};

const getLanguageInstruction = (lang: string) => {
  return lang === 'id' 
    ? "Output strictly in Indonesian Language (Bahasa Indonesia)." 
    : "Output strictly in English.";
};

// --- 1. Prose Generation (Writing) ---
export interface WriteOptions {
    length: 'short' | 'medium' | 'long';
    instruction?: string;
}

export const generateProse = async (story: Story, currentChapterId: string, cursorPosition: number, options: WriteOptions) => {
  const currentChapter = story.chapters.find(c => c.id === currentChapterId);
  if (!currentChapter) return "";

  const context = buildStoryContextString(story);
  const textBefore = currentChapter.content.substring(0, cursorPosition);
  
  // Take last 3000 chars for immediate context
  const immediateContext = textBefore.slice(-3000);

  let lengthInstr = "";
  if (options.length === 'short') lengthInstr = "Write about 150-200 words.";
  if (options.length === 'medium') lengthInstr = "Write about 400-500 words.";
  if (options.length === 'long') lengthInstr = "Write about 800-1000 words. Be very detailed.";

  const prompt = `
    Role: You are an expert novelist co-author.
    Task: Continue the story based on the context provided.
    
    STORY BIBLE:
    ${context}
    
    CURRENT CHAPTER CONTENT (Preceding cursor):
    ...${immediateContext}
    
    USER INSTRUCTION: ${options.instruction || "Continue the story naturally."}
    LENGTH TARGET: ${lengthInstr}
    
    Constraints:
    - ${getLanguageInstruction(story.language)}
    - Match the Tone: ${story.tone}
    - Match the Writing Style: ${story.writingStyle}
    ${story.styleReference ? '- CRITICAL: Analyze the "USER WRITING SAMPLE" in the Story Bible and mimic its sentence structure, vocabulary, and rhythm.' : ''}
    - Use the World Wiki and Character profiles details to add depth (sensory details, callbacks).
    - Do not repeat the preceding text.
    - Write only the new content.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "";
  } catch (error) {
    console.error("Prose generation failed", error);
    return "";
  }
};

// --- Panic Mode Helper: Generate Beats ---
export const generateChapterBeats = async (story: Story, currentChapterId: string, precedingText: string) => {
    const context = buildStoryContextString(story);
    const prompt = `
      Role: Novel Plotter.
      Task: The user wants to write the rest of this chapter (about 2000 words). 
      Break down the immediate next events into 4 distinct sequential "Beats" (Scenes).
      
      STORY CONTEXT:
      ${context}
      
      TEXT SO FAR:
      ...${precedingText.slice(-1000)}
      
      Output strictly as a JSON list of strings.
      Example: ["Protagonist enters the bar and orders a drink", "A fight breaks out", "Protagonist escapes via the roof", "Protagonist reflects on the fight at home"]
      
      ${getLanguageInstruction(story.language)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });
        const jsonStr = response.text?.trim();
        if (jsonStr) return JSON.parse(jsonStr);
        return ["Continue the scene", "Build tension", "Climax of the chapter", "Conclusion/Cliffhanger"];
    } catch (e) {
        console.error("Beat gen failed", e);
        return ["Continue the scene", "Next event", "Next event", "Conclusion"];
    }
};

// --- 2. Brainstorming / General Generation ---
export const brainstormStoryElement = async (elementType: string, story: Story, userPrompt: string) => {
  const context = buildStoryContextString(story);
  
  let specificInstruction = "Provide a creative, detailed list or description.";
  
  if (elementType === "Premise") {
    specificInstruction = `
      CRITICAL INSTRUCTION: Do NOT provide a list of options. 
      Synthesize the genres (${story.genres.join(', ')}) and the user's input into ONE single, cohesive, compelling story premise (logline/summary paragraph).
      Make it catchy and professional.
    `;
  }

  const prompt = `
    Role: Creative Writing Assistant.
    Task: Brainstorm/Generate content for: ${elementType}.
    
    STORY CONTEXT:
    ${context}
    
    USER INPUT/IDEA: ${userPrompt}
    
    INSTRUCTION:
    ${specificInstruction}
    - ${getLanguageInstruction(story.language)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "";
  } catch (error) {
    console.error("Brainstorm failed", error);
    return "Error generating content.";
  }
};

// --- Auto-Setup Story (Title, Premise, Tone, Style) ---
export const autoSetupStory = async (story: Story) => {
    const genreString = [...story.genres, story.customGenres].filter(Boolean).join(', ');
    const prompt = `
      Role: Expert Book Editor.
      Task: Create a cohesive story setup based on the selected genres.
      Genres: ${genreString}
      
      Constraint: 
      - ${getLanguageInstruction(story.language)}
      - Output purely in JSON format.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A catchy, best-seller quality title" },
                        premise: { type: Type.STRING, description: "A compelling 1-paragraph logline/summary" },
                        tone: { type: Type.STRING, description: "Atmosphere keywords (e.g. Dark, Whimsical)" },
                        writingStyle: { type: Type.STRING, description: "Writing style keywords (e.g. Fast-paced, Descriptive)" }
                    },
                    required: ["title", "premise", "tone", "writingStyle"]
                }
            }
        });
        
        const jsonStr = response.text?.trim();
        if (jsonStr) {
            return JSON.parse(jsonStr);
        }
        return null;
    } catch (error) {
        console.error("Auto Setup failed", error);
        return null;
    }
};

// --- Analyze User Style ---
export const analyzeWritingStyle = async (sampleText: string, language: string) => {
    const prompt = `
      Role: Literary Analyst.
      Task: Analyze the following writing sample and describe its style in 5-10 keywords or a short phrase.
      Focus on: Sentence structure, vocabulary complexity, pacing, and tone.
      
      SAMPLE:
      "${sampleText.substring(0, 1000)}"
      
      OUTPUT:
      Return ONLY the description string. ${language === 'id' ? 'In Indonesian.' : 'In English.'}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text?.trim() || "";
    } catch (error) {
        console.error("Style analysis failed", error);
        return "";
    }
};

// --- 3. Structured Character Generation (JSON) ---

export const generateStructuredCast = async (story: Story): Promise<CharacterProfile[]> => {
  const context = buildStoryContextString(story);
  
  const prompt = `
    Create a full cast of characters for this story.
    Include a Protagonist, Antagonist, and supporting characters.
    Ensure they fit the genre and tone.
    STORY PREMISE: ${story.premise}
    GENRES: ${story.genres.join(', ')}
    
    ${getLanguageInstruction(story.language)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING, description: "e.g. Protagonist, Villain, Mentor" },
              age: { type: Type.STRING },
              appearance: { type: Type.STRING, description: "Physical traits, height, build, clothing" },
              personality: { type: Type.STRING, description: "Traits, demeanor" },
              voice: { type: Type.STRING, description: "Speaking style, keywords, dialect" },
              strengths: { type: Type.STRING },
              weaknesses: { type: Type.STRING },
              backstory: { type: Type.STRING, description: "Brief history relevant to plot" }
            }
          }
        }
      }
    });

    const jsonStr = response.text?.trim();
    if (jsonStr) {
      const rawData = JSON.parse(jsonStr);
      // Add IDs to the generated characters
      return rawData.map((c: any) => ({
        ...c,
        id: Math.random().toString(36).substr(2, 9)
      }));
    }
    return [];
  } catch (error) {
    console.error("Structured Cast Gen failed", error);
    return [];
  }
};

export const refineCharacterProfile = async (story: Story, currentProfile: CharacterProfile): Promise<CharacterProfile | null> => {
    const context = buildStoryContextString(story);
    
    const prompt = `
      You are an expert Character Designer and Psychologist.
      Your task is to REFINE, DEEPEN, and COMPLETE the character profile below.
      
      INPUT DATA:
      ${JSON.stringify(currentProfile)}
      
      STORY CONTEXT:
      Premise: ${story.premise}
      Tone: ${story.tone}
      
      INSTRUCTIONS:
      1. Fill in any missing fields.
      2. ENHANCE existing fields to be more specific and creative.
      3. **BACKSTORY**: Must be deep and emotional. Give the character a 'soul'. Explain WHY they move, WHY they hate/love things. Include a "Ghost" or a "Lie" they believe. Ensure it fits the Story Premise perfectly.
      4. **APPEARANCE**: Must be detailed. Include height, body build, distinctive features (scars, tattoos, accessories), hair texture, and clothing style.
      5. **PERSONALITY**: Ensure it is consistent with the Backstory.
      
      ${getLanguageInstruction(story.language)}
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              age: { type: Type.STRING },
              appearance: { type: Type.STRING, description: "Visual description: height, build, features, style" },
              personality: { type: Type.STRING },
              voice: { type: Type.STRING },
              strengths: { type: Type.STRING },
              weaknesses: { type: Type.STRING },
              backstory: { type: Type.STRING, description: "Deep, emotional, motivation-driven history" }
            },
            required: ["name", "role", "backstory", "appearance", "personality"]
          }
        }
      });
  
      const jsonStr = response.text?.trim();
      if (jsonStr) {
        const refinedData = JSON.parse(jsonStr);
        return {
            ...currentProfile,
            ...refinedData,
            id: currentProfile.id,
            avatarBase64: currentProfile.avatarBase64,
            imageStyle: currentProfile.imageStyle
        };
      }
      return null;
    } catch (error) {
      console.error("Character refinement failed", error);
      return null;
    }
  };

// --- 4. World Wiki Refinement (Deepen Engine) ---

export const refineWorldItem = async (story: Story, currentItem: WorldItem): Promise<WorldItem | null> => {
    const context = buildStoryContextString(story);
    
    const prompt = `
      You are an expert World Builder for novels.
      Your task is to REFINE, DEEPEN, and VISUALIZE the world building element below.
      
      INPUT DATA:
      Name: ${currentItem.name}
      Category: ${currentItem.category}
      Description (Partial): ${currentItem.description}
      
      STORY CONTEXT:
      Premise: ${story.premise}
      Tone: ${story.tone}
      
      INSTRUCTIONS:
      1. **Description**: Make it evocative. Don't just say "It is a city". Say "It is a city of glass hovering above a sulfur pit".
      2. **Sensory Details**: CRITICAL. Describe how it smells, sounds, feels, and the specific atmosphere/vibe. 
      3. **Secrets**: Add a "Ghost" or a "Rumor" about this element. Something that can be used as a plot hook. A hidden history, a curse, or a political conspiracy.
      
      ${getLanguageInstruction(story.language)}
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: { type: Type.STRING },
              description: { type: Type.STRING, description: "Evocative description" },
              sensoryDetails: { type: Type.STRING, description: "Smell, sound, atmosphere, humidity, lighting" },
              secret: { type: Type.STRING, description: "Rumors, legends, hidden truths, conspiracies" }
            },
            required: ["name", "description", "sensoryDetails", "secret"]
          }
        }
      });
  
      const jsonStr = response.text?.trim();
      if (jsonStr) {
        const refinedData = JSON.parse(jsonStr);
        return {
            ...currentItem,
            ...refinedData,
            id: currentItem.id,
            imageUrl: currentItem.imageUrl,
            imageStyle: currentItem.imageStyle
        };
      }
      return null;
    } catch (error) {
      console.error("World refinement failed", error);
      return null;
    }
};

// --- 5. Image Generation ---

export const generateCharacterImage = async (character: CharacterProfile, style: string): Promise<string | null> => {
  const prompt = `
    Character Portrait.
    Subject: ${character.name}, ${character.age} years old.
    Appearance: ${character.appearance}.
    Role: ${character.role}.
    Personality hint: ${character.personality}.
    Art Style: ${style}.
    High quality, detailed, white background.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
    });
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data; 
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation failed", error);
    return null;
  }
};

export const generateWorldItemImage = async (item: WorldItem, style: string): Promise<string | null> => {
    const isLocation = item.category === 'Location';
    const prompt = `
      World Building Concept Art.
      Subject: ${item.name} (${item.category}).
      Description: ${item.description}.
      Atmosphere/Vibe: ${item.sensoryDetails}.
      Art Style: ${style}.
      ${isLocation ? 'Wide shot, detailed environment, atmospheric.' : 'Focus on the object/subject, detailed.'}
      High quality.
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: prompt,
      });
      
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return part.inlineData.data; 
          }
        }
      }
      return null;
    } catch (error) {
      console.error("World image generation failed", error);
      return null;
    }
  };


// --- 6. World & Plot Generators (Text based for now) ---

export const generateCharacterProfile = async (story: Story, name: string, archetype: string) => {
  return brainstormStoryElement("Character Profile", story, `Create a detailed character profile for "${name}" (Archetype: ${archetype}). Include appearance, personality, strengths, weaknesses, and backstory.`);
};

export const generateWorldElement = async (story: Story, category: string, topic: string) => {
  return brainstormStoryElement("World Building Element", story, `Create a detailed world building entry. Category: ${category}, Topic: ${topic}. Include sensory details and significance to the plot.`);
};

export const generatePlotStructure = async (story: Story, structureType: string) => {
  return brainstormStoryElement(`Plot Outline using ${structureType} structure`, story, "Create a detailed plot outline using this specific story structure. Break it down into the standard beats of that structure.");
};

export const generateComprehensiveList = async (story: Story, type: 'characters' | 'world') => {
    return brainstormStoryElement("List", story, `Create a list of ${type}.`);
};


// --- 7. Chat ---
export const chatWithAssistant = async (history: any[], story: Story) => {
  const context = buildStoryContextString(story);
  const systemInstr = `
    You are an AI writing assistant for a novel.
    Answer the user's questions based on the provided Story Context.
    Be helpful, encouraging, and creative.
    ${getLanguageInstruction(story.language)}
  `;

  const geminiHistory = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));
  
  const lastMsg = geminiHistory.pop();
  const prompt = `
    STORY CONTEXT:
    ${context}
    
    USER QUERY: ${lastMsg?.parts[0].text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { systemInstruction: systemInstr }
    });
    return response.text || "";
  } catch (e) {
    return "I'm having trouble connecting to the Muse right now.";
  }
};

// --- 8. GENESIS MODE (Chained Generation) ---

// Step 1: Generate World
export const generateGenesisWorld = async (story: Story): Promise<WorldItem[]> => {
  const prompt = `
    Role: Master World Builder.
    Task: Create the foundation of a world based on this premise.
    Premise: ${story.premise}
    Genres: ${story.genres.join(', ')}
    
    Output Requirement:
    Create 3 distinct Locations, 2 Factions/Groups, and 1 Magic System or Technology System.
    For each, provide vivid descriptions, sensory details, and a secret.
    
    ${getLanguageInstruction(story.language)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: { type: Type.STRING, description: "Location, Faction, Magic, etc." },
              description: { type: Type.STRING },
              sensoryDetails: { type: Type.STRING },
              secret: { type: Type.STRING }
            },
            required: ["name", "category", "description", "sensoryDetails", "secret"]
          }
        }
      }
    });
    const jsonStr = response.text?.trim();
    if (jsonStr) {
      return JSON.parse(jsonStr).map((i: any) => ({...i, id: Math.random().toString(36).substr(2, 9)}));
    }
    return [];
  } catch (e) {
    console.error("Genesis World failed", e);
    return [];
  }
};

// Step 2: Generate Characters (Context Aware)
export const generateGenesisCharacters = async (story: Story, worldItems: WorldItem[]): Promise<CharacterProfile[]> => {
  const worldContext = worldItems.map(w => `- ${w.name} (${w.category}): ${w.description}`).join('\n');
  
  const prompt = `
    Role: Master Character Architect.
    Task: Create a cast of characters that are deeply rooted in the world provided below.
    Premise: ${story.premise}
    
    WORLD CONTEXT (Use this!):
    ${worldContext}
    
    Output Requirement:
    Create 1 Protagonist, 1 Antagonist, and 1 Support Character.
    They MUST have relationships with the Factions or come from the Locations mentioned in the World Context.
    
    ${getLanguageInstruction(story.language)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              age: { type: Type.STRING },
              appearance: { type: Type.STRING },
              personality: { type: Type.STRING },
              voice: { type: Type.STRING },
              strengths: { type: Type.STRING },
              weaknesses: { type: Type.STRING },
              backstory: { type: Type.STRING, description: "Connect this to the World Context" }
            },
             required: ["name", "role", "backstory", "appearance", "personality"]
          }
        }
      }
    });
    const jsonStr = response.text?.trim();
    if (jsonStr) {
      return JSON.parse(jsonStr).map((i: any) => ({...i, id: Math.random().toString(36).substr(2, 9)}));
    }
    return [];
  } catch (e) {
     console.error("Genesis Char failed", e);
     return [];
  }
};

// Step 3: Generate Plot (Context Aware)
export const generateGenesisPlot = async (story: Story, worldItems: WorldItem[], characters: CharacterProfile[]): Promise<string> => {
  const worldContext = worldItems.map(w => `- ${w.name} (${w.category})`).join('\n');
  const charContext = characters.map(c => `- ${c.name} (${c.role}): ${c.backstory}`).join('\n');

  const prompt = `
    Role: Master Storyteller.
    Task: Create a structured plot outline (Save the Cat style) based on the generated world and characters.
    
    STORY PREMISE: ${story.premise}
    
    WORLD ELEMENTS:
    ${worldContext}
    
    CHARACTERS:
    ${charContext}
    
    INSTRUCTION:
    Write a compelling outline. The conflict must stem from the Factions and the Character's goals.
    Use the locations for specific scenes.
    
    ${getLanguageInstruction(story.language)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "";
  } catch (e) {
    console.error("Genesis Plot failed", e);
    return "";
  }
};

// --- 9. Import / Extract Story DNA ---

export interface ExtractedStoryDNA {
    title: string;
    premise: string;
    tone: string;
    writingStyle: string;
    characters: any[];
    worldItems: any[];
    plotOutline: string;
}

export const extractStoryDna = async (fullText: string, language: string): Promise<ExtractedStoryDNA | null> => {
    // We allow the model to read as much as it can. Flash model has 1M context window.
    // We won't substring unnecessarily, but just to be safe against browser string limits, we cap at 2 Million chars.
    const textSample = fullText.substring(0, 2000000);
    
    const allowedCategories = WORLD_CATEGORIES.join(', ');
    const langInstruction = language === 'id' 
        ? "Input Text is likely Indonesian. OUTPUT ALL JSON VALUES IN INDONESIAN." 
        : "Input Text is likely English. OUTPUT ALL JSON VALUES IN ENGLISH.";

    const prompt = `
      Role: Senior Editor & Analyst.
      Task: Deeply analyze the provided novel text (which may contain multiple chapters).
      Extract the core "DNA" of the story into a structured JSON format.
      
      INSTRUCTION:
      READ THE ENTIRE TEXT PROVIDED. Do not just read the beginning.
      ${langInstruction}

      NOVEL TEXT SAMPLE:
      ${textSample}
      
      OUTPUT REQUIREMENTS:
      1. Title: If the text has a title, use it. If not, create a catchy one.
      2. Premise: Summarize the entire plot so far into a 1-paragraph logline.
      3. Characters: Extract main characters found in the text. Infer their roles, traits, and appearance based on the text actions.
      4. World: Extract key locations, items, or factions mentioned. 
         CRITICAL: World Item Category MUST be one of: [${allowedCategories}]. 
         If a world item does not fit these exact categories, put it in 'Other'. 
         DO NOT INVENT NEW CATEGORIES like "Social Structure" or "Concept".
      5. Plot Outline: Summarize what happened in these chapters sequentially.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        premise: { type: Type.STRING },
                        tone: { type: Type.STRING, description: "e.g. Gritty, Humorous" },
                        writingStyle: { type: Type.STRING, description: "Analysis of the author's voice" },
                        plotOutline: { type: Type.STRING, description: "Summary of events in the text" },
                        characters: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    role: { type: Type.STRING },
                                    age: { type: Type.STRING },
                                    appearance: { type: Type.STRING },
                                    personality: { type: Type.STRING },
                                    backstory: { type: Type.STRING }
                                }
                            }
                        },
                        worldItems: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    category: { type: Type.STRING, description: `Must be one of: ${allowedCategories}` },
                                    description: { type: Type.STRING },
                                    sensoryDetails: { type: Type.STRING },
                                    secret: { type: Type.STRING }
                                }
                            }
                        }
                    },
                    required: ["title", "premise", "tone", "writingStyle", "characters", "plotOutline", "worldItems"]
                }
            }
        });

        const jsonStr = response.text?.trim();
        if (jsonStr) return JSON.parse(jsonStr);
        return null;
    } catch (error) {
        console.error("Extract DNA failed", error);
        return null;
    }
};

// Heuristic helper to split text into chapters locally without wasting AI tokens
export const smartSplitText = (fullText: string): { title: string, content: string }[] => {
    // Improved Regex to find Chapter headings. 
    // Matches: "Chapter 1", "Bab 1", "Bagian I", "## Title", "1." (at start of line)
    const chapterRegex = /(?:^|\n)\s*(?:#{1,3}\s+)?(?:Chapter|Bab|Bagian|Part|Book|Vol|Volume|Prologue|Epilogue|Prolog|Epilog|Permulaan|Akhiran|Episode|Satu|Dua|Tiga|Empat|Lima|Enam|Tujuh|Delapan|Sembilan|Sepuluh|[0-9]+)\s*(?:[0-9]+|[IVXLCDM]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Satu|Dua|Tiga|Empat|Lima|Enam|Tujuh|Delapan|Sembilan|Sepuluh)?(?:\s*[:\.-])?.*$/gim;
    
    const splits: { title: string, content: string }[] = [];
    let match;

    // Find all headings
    const indices = [];
    while ((match = chapterRegex.exec(fullText)) !== null) {
        // Heuristic: Headers usually aren't super long sentences (>100 chars is suspicious)
        if(match[0].trim().length < 100 && match[0].trim().length > 2) { 
             indices.push({ index: match.index, title: match[0].trim() });
        }
    }

    if (indices.length === 0) {
        // Fallback: If the text is very long (>20k chars) and no headers found, split by length approx every 15k chars
        if (fullText.length > 20000) {
             const chunkSize = 15000;
             let numChunks = Math.ceil(fullText.length / chunkSize);
             for(let i=0; i<numChunks; i++) {
                 splits.push({
                     title: `Part ${i+1}`,
                     content: fullText.substring(i*chunkSize, (i+1)*chunkSize)
                 });
             }
             return splits;
        }
        return [{ title: "Imported Text", content: fullText }];
    }

    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        
        // If there is text BEFORE the first chapter heading (e.g. Prologue or Title page), capture it
        if (i === 0 && current.index > 100) { // Only if substantial text before
            const introContent = fullText.substring(0, current.index).trim();
            if (introContent.length > 0) {
                splits.push({
                    title: "Front Matter / Intro",
                    content: introContent
                });
            }
        }

        const content = fullText.substring(current.index + current.title.length, next ? next.index : fullText.length).trim();
        // Avoid creating empty chapters if there are adjacent headers
        if (content.length > 0) {
             splits.push({
                 title: current.title.replace(/^[#\s]+/, '').trim(), // Clean markdown syntax from title
                 content: content
             });
        }
    }

    return splits.length > 0 ? splits : [{ title: "Imported Text", content: fullText }];
};
