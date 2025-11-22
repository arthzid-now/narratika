
export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export type Language = 'en' | 'id';

export interface CharacterProfile {
  id: string;
  name: string;
  role: string; // Protagonist, Antagonist, Support
  age: string;
  appearance: string; // Visual description
  personality: string;
  voice: string; // Speaking style
  strengths: string;
  weaknesses: string;
  backstory: string;
  avatarBase64?: string; // For the image
  imageStyle?: string; // Preferred art style for this character
}

export type WorldCategory = 'Location' | 'Faction' | 'Item' | 'Magic' | 'History' | 'Creature' | 'Cosmology' | 'Other';

export interface WorldItem {
  id: string;
  name: string;
  category: WorldCategory;
  description: string;
  sensoryDetails: string; // Sights, sounds, smells, atmosphere
  secret: string; // Rumors, hidden truths, plot hooks
  imageUrl?: string;
  imageStyle?: string;
}

export interface Story {
  id: string;
  title: string;
  language: Language; 
  genres: string[]; 
  customGenres: string; 
  premise: string;
  
  // Modular Data
  characters: CharacterProfile[];
  worldItems: WorldItem[]; // New structured world data
  
  // Free Text Fields (for World/Plot/Notes)
  worldText: string; // Kept as "Scratchpad"
  plotOutline: string;
  charactersText: string;
  
  tone: string; 
  writingStyle: string; 
  styleReference: string; 
  
  chapters: Chapter[];
  lastUpdated: number;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  PLANNER = 'PLANNER',
  EDITOR = 'EDITOR',
}

export enum PlannerTab {
  GENERAL = 'GENERAL',
  CHARACTERS = 'CHARACTERS',
  WORLD = 'WORLD',
  PLOT = 'PLOT',
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface GenreDefinition {
  id: string;
  label: string;
  description: string;
}

export const GENRE_OPTIONS: GenreDefinition[] = [
  { id: "Fantasy", label: "Fantasy", description: "Magic, supernatural elements, and imaginary worlds." },
  { id: "Sci-Fi", label: "Sci-Fi", description: "Futuristic science, space exploration, and advanced technology." },
  { id: "System", label: "System", description: "Game-like interfaces, status screens, and leveling up in real life or fantasy." },
  { id: "LitRPG", label: "LitRPG", description: "Narratives explicitly governed by RPG mechanics and stats." },
  { id: "Urban Fantasy", label: "Urban Fantasy", description: "Magic and supernatural elements existing in a modern city setting." },
  { id: "Xianxia", label: "Xianxia", description: "Chinese martial arts fantasy focused on cultivation and immortality." },
  { id: "Romance", label: "Romance", description: "Focus on romantic love and emotional relationships." },
  { id: "Mystery", label: "Mystery", description: "Solving a crime or unraveling secrets." },
  { id: "Thriller", label: "Thriller", description: "High suspense, excitement, and anticipation." },
  { id: "Horror", label: "Horror", description: "Intended to frighten, scare, or disgust." },
  { id: "Slice of Life", label: "Slice of Life", description: "Mundane realism depicting everyday experiences." },
  { id: "Cyberpunk", label: "Cyberpunk", description: "High-tech low-life, dystopia, cybernetics." },
  { id: "Historical", label: "Historical", description: "Set in a specific period in the past." },
  { id: "Comedy", label: "Comedy", description: "Humorous tone, intended to make readers laugh." },
  { id: "Drama", label: "Drama", description: "Serious, plot-driven, portraying realistic characters and emotions." }
];

export const TONE_OPTIONS = [
  "Dark & Gritty", "Lighthearted & Fun", "Serious & Emotional", 
  "Cynical & Sarcastic", "Optimistic & Hopeful", "Suspenseful & Tense", 
  "Whimsical & Magical", "Melancholic"
];

export const STYLE_OPTIONS = [
  "Descriptive & Flowery", "Minimalist & Direct", "Fast-Paced & Action-Oriented",
  "Dialogue-Heavy", "Introspective & Psychological", "Journalistic / Objective"
];

export const IMAGE_STYLES = [
  "Anime / Manga Style",
  "Semi-Realistic Digital Art",
  "Photorealistic",
  "Oil Painting",
  "Watercolor",
  "Cyberpunk / Neon",
  "Dark Fantasy / Gothic",
  "Sketch / Pencil",
  "3D Render (Pixar Style)",
  "Retro / Pixel Art",
  "Fantasy Map / Cartography",
  "Concept Art (Environment)",
  "Concept Art (Item/Prop)"
];

export const WORLD_CATEGORIES: WorldCategory[] = [
  'Location', 'Faction', 'Item', 'Magic', 'History', 'Creature', 'Cosmology', 'Other'
];

export interface PlotStructureDef {
  id: string;
  name: string;
}

export const PLOT_STRUCTURES: PlotStructureDef[] = [
  { id: "Hero's Journey", name: "Hero's Journey" },
  { id: "Save the Cat", name: "Save the Cat" },
  { id: "Three-Act Structure", name: "Three-Act Structure" },
  { id: "Fichtean Curve", name: "Fichtean Curve" },
  { id: "Seven Point Story Structure", name: "Seven Point Story Structure" },
  { id: "Dan Harmon's Story Circle", name: "Dan Harmon's Story Circle" },
  { id: "Kishōtenketsu", name: "Kishōtenketsu (East Asian)" }
];
