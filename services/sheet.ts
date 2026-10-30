
import { Cocktail } from '../types';

// The specific sheet URL provided, converted to a CSV export link
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1UlGW20fCsz33TLgHcMmnnkibgy-TjQWYN6IBWcYU07c/export?format=csv';

const MANUAL_DRIVE_IDS: Record<string, string> = {};

// Your pre-generated cocktail photos (mgritzbach/Cocktails repo)
const FALLBACK_IMAGES: Record<string, string> = {
  'amaretto sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Amaretto%20Sour.png',
  'aperol sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Aperol%20Sour.png',
  'appletini': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Appletini.png',
  'aviation': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Aviation.png',
  'blue curasour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Blue%20Curasour.png',
  'whisky sour / blue curasour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Blue%20Curasour.png',
  'whisky sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Blue%20Curasour.png',
  'whiskey sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Blue%20Curasour.png',
  'blue lady': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Blue%20Lady.png',
  'boulevardier': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Boulevardier.png',
  'brandy alexander': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Brandy%20Alexander.png',
  'clover club': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Clover%20Club.png',
  'coconut campari sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Coconut%20Campari%20Sour.png',
  'coconut & campari sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Coconut%20Campari%20Sour.png',
  'cosmopolitan': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Cosmopolitan.png',
  'crystal skies': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Crystal%20Skies.png',
  'daiquiri': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Daiquiri.png',
  'dark n stormy': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Dark%20n%20Stormy.png',
  'dark and stormy': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Dark%20n%20Stormy.png',
  'dark & stormy': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Dark%20n%20Stormy.png',
  "dark'n'stormy": 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Dark%20n%20Stormy.png',
  'stormy': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Dark%20n%20Stormy.png',
  'espresso martini': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Espresso%20Martini.png',
  'french martini': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/French%20Martini.png',
  'gin fizz': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Gin%20Fizz.png',
  'grasshopper': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Grasshopper.png',
  'hemingway daiquiri': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Hemingway%20Daiquiri.png',
  'jack rose': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Jack%20Rose.png',
  'kapp-heinz': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Kapp-Heinz.png',
  'lavender gin sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Lavender%20Gin%20Sour.png',
  'mai tai': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Mai%20Tai.png',
  'manhattan': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Manhattan.png',
  'mojito': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Mojito.png',
  'negroni': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Negroni.png',
  'old fashioned': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Old%20Fashioned.png',
  'orange martini': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Orange%20Martini.png',
  'orange margarita': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Organge%20Margarita.png',
  'organge margarita': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Organge%20Margarita.png',
  'pina colada': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Pina%20Colada.png',
  'pineapple bourbon sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Pineapple%20Bourbon%20Sour.png',
  'pink lady': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Pink%20Lady.png',
  'side car': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Side%20Car.png',
  'sidecar': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Side%20Car.png',
  'singapore sling': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Singapore%20Sling.png',
  'strawberry jam sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Strawberry%20Jam%20Sour.png',
  'strawberry negroni sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Strawberry%20Negroni%20Sour.png',
  '(straw)berry negroni sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Strawberry%20Negroni%20Sour.png',
  '(strawberry) negroni sour': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Strawberry%20Negroni%20Sour.png',
  'swimming pool': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Swimming%20Pool.png',
  'tequila sunrise': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Tequila%20Sunrise.png',
  'vesper': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Vesper.png',
  'water melon mojito': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Water%20Melon%20Mojito.png',
  'watermelon mojito': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/Water%20Melon%20Mojito.png',
  'white russian': 'https://raw.githubusercontent.com/mgritzbach/Cocktails/main/White%20Russian.png'
};

// STRICT list of allowed taste profiles
const ALLOWED_PROFILES = ['Sweet', 'Sour', 'Bitter', 'Strong', 'Fruity', 'Creamy', 'Herbal', 'Refreshing'];

// Injected Data from User Prompt - Mapped to strict list
const LOCAL_TASTE_PROFILES: Record<string, string> = {
  "whisky sour": "Sweet, Strong",
  "whiskey sour": "Sweet, Strong", 
  "blue curasour": "Sweet, Strong",
  "whisky sour / blue curasour": "Sweet, Strong",
  "pina colada": "Sweet, Fruity, Creamy",
  "swimming pool": "Sweet, Creamy, Refreshing, Herbal",
  "daiquiri": "Sour, Refreshing, Herbal",
  "appletini": "Sweet, Fruity, Strong",
  "aviation": "Sour, Herbal, Strong",
  "grasshopper": "Sweet, Creamy",
  "side car": "Sour, Strong",
  "sidecar": "Sour, Strong",
  "boulevardier": "Bitter, Strong",
  "negroni": "Bitter, Strong, Herbal",
  "pink lady": "Sweet, Fruity, Strong",
  "watermelon mojito": "Sweet, Fruity, Refreshing",
  "water melon mojito": "Sweet, Fruity, Refreshing",
  "singapore sling": "Sweet, Fruity, Herbal, Refreshing",
  "gin fizz": "Sour, Refreshing",
  "orange margarita": "Sour, Fruity",
  "tequila sunrise": "Sweet, Fruity",
  "orange martini": "Sweet, Fruity, Strong",
  "brandy alexander": "Sweet, Creamy, Strong",
  "old fashioned": "Sweet, Bitter, Strong",
  "jack rose": "Sour, Fruity, Strong",
  "cosmopolitan": "Sour, Fruity",
  "vesper": "Strong, Herbal",
  "hemingway daiquiri": "Sour, Strong",
  "lavender gin sour": "Sour, Herbal, Bitter",
  "kapp-heinz": "Bitter, Strong, Herbal",
  "clover club": "Sweet, Fruity",
  "french martini": "Sweet, Fruity",
  "strawberry jam sour": "Sweet, Sour, Fruity",
  "blue lady": "Sweet, Fruity",
  "aperol sour": "Bitter, Sour",
  "coconut & campari sour": "Bitter, Sour, Creamy",
  "coconut campari sour": "Bitter, Sour, Creamy",
  "crystal skies": "Refreshing, Fruity",
  "pineapple bourbon sour": "Sweet, Sour, Fruity",
  "strawberry negroni sour": "Bitter, Sour, Fruity",
  "(straw)berry negroni sour": "Bitter, Sour, Fruity",
  "manhattan": "Strong, Bitter",
  "white russian": "Sweet, Creamy, Strong",
  "dark'n'stormy": "Strong, Refreshing, Herbal",
  "dark n stormy": "Strong, Refreshing, Herbal",
  "mai tai": "Sweet, Fruity, Strong",
  "amaretto sour": "Sweet, Sour"
};

const sanitizeForFilename = (name: string): string => {
  if (!name) return 'cocktail';
  return name.split('/')[0].trim();
};

const transformSheetImageUrl = (url: string): string => {
  if (!url) return '';
  const cleanUrl = url.trim();
  if (!cleanUrl.includes('drive.google.com')) return cleanUrl;
  let id = '';
  const idMatch = cleanUrl.match(/\/d\/([-\w]+)/) || cleanUrl.match(/[?&]id=([-\w]+)/);
  if (idMatch && idMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
  }
  return cleanUrl;
};

const parseCSVLine = (text: string): string[] => {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells.map(c => c.replace(/^"|"$/g, '').trim());
};

const extractStrictTasteProfiles = (rawText: string): string[] => {
  if (!rawText) return [];
  const lowerText = rawText.toLowerCase();
  const profiles = new Set<string>();
  
  ALLOWED_PROFILES.forEach(profile => {
    // Check if the specific keyword exists in the text
    if (lowerText.includes(profile.toLowerCase())) {
      profiles.add(profile);
    }
  });
  
  return Array.from(profiles);
};

export const fetchCocktailsFromSheet = async (): Promise<Cocktail[]> => {
  try {
    // Add timestamp to prevent caching
    const response = await fetch(`${SHEET_CSV_URL}&t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Failed to fetch Google Sheet data');
    const csvText = await response.text();
    
    const lines: string[] = [];
    let currentLine = "";
    let inQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      if (char === '"') inQuotes = !inQuotes;
      if (char === '\n' && !inQuotes) {
        lines.push(currentLine);
        currentLine = "";
      } else {
        currentLine += char;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length < 2) return [];

    // 1. Dynamic Header Finding
    let headerIndex = -1;
    let headers: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const row = parseCSVLine(lines[i]).map(c => c.toLowerCase().trim());
      if (row.includes('name') || row.includes('cocktail') || row.includes('drink')) {
        headerIndex = i;
        headers = row;
        break;
      }
    }

    // 2. Map Column Indices
    const colMap = {
      image: 0,
      name: 1,
      desc: 2,
      spirit: 3,
      liqueur: 4,
      nonAlc: 5,
      garnish: 6,
      instr: 7,
      taste: -1
    };

    if (headerIndex !== -1) {
      headers.forEach((h, idx) => {
        if (h.includes('image') || h.includes('photo')) colMap.image = idx;
        else if (h.includes('name') || h.includes('cocktail') || h.includes('drink')) colMap.name = idx;
        else if (h.includes('desc') || h.includes('note')) colMap.desc = idx;
        else if (h.includes('spirit') || h.includes('base')) colMap.spirit = idx;
        else if (h.includes('liqueur')) colMap.liqueur = idx;
        else if (h.includes('juice') || h.includes('mix') || h.includes('non')) colMap.nonAlc = idx;
        else if (h.includes('garnish')) colMap.garnish = idx;
        else if (h.includes('instruct') || h.includes('method')) colMap.instr = idx;
        else if (h.includes('taste') || h.includes('profile') || h.includes('flavor')) colMap.taste = idx;
      });
    }

    const dataRows = headerIndex !== -1 ? lines.slice(headerIndex + 1) : lines.slice(1);

    // 3. FALLBACK: Content-Based Detection for Taste Column
    // (Kept for robustness, but strict filtering makes it safer)
    if (colMap.taste === -1 && dataRows.length > 0) {
      const checkRows = dataRows.slice(0, 5).map(l => parseCSVLine(l));
      const colScores: number[] = [];
      const maxCols = Math.max(...checkRows.map(r => r.length));

      for (let c = 0; c < maxCols; c++) {
        let score = 0;
        checkRows.forEach(row => {
          const cell = (row[c] || '').toLowerCase();
          if (ALLOWED_PROFILES.some(k => cell.includes(k.toLowerCase()))) {
            score++;
          }
        });
        colScores[c] = score;
      }
      
      let bestCol = -1;
      let maxScore = 0;
      colScores.forEach((score, idx) => {
        if (score > maxScore) {
            maxScore = score;
            bestCol = idx;
        }
      });

      if (maxScore >= 1) colMap.taste = bestCol;
    }

    const cocktails: Cocktail[] = dataRows.map((line, idx) => {
      const clean = parseCSVLine(line);
      
      const rawName = clean[colMap.name] || '';
      if (!rawName || /^\d+$/.test(rawName)) return null;

      // --- IMAGE LOGIC ---
      let imageUrl = '';
      const sheetImageValue = clean[colMap.image] || '';
      const rawNameLower = rawName.toLowerCase();

      if (sheetImageValue.startsWith('http')) {
        imageUrl = transformSheetImageUrl(sheetImageValue);
      }
      if (!imageUrl && MANUAL_DRIVE_IDS[rawNameLower]) {
        imageUrl = `https://drive.google.com/uc?export=view&id=${MANUAL_DRIVE_IDS[rawNameLower]}`;
      }
      if (!imageUrl) {
        if (FALLBACK_IMAGES[rawNameLower]) {
          imageUrl = FALLBACK_IMAGES[rawNameLower];
        } else {
           const fallbackKey = Object.keys(FALLBACK_IMAGES).find(k => rawNameLower.includes(k));
           if (fallbackKey) imageUrl = FALLBACK_IMAGES[fallbackKey];
        }
      }
      if (!imageUrl) {
         const baseName = sheetImageValue || sanitizeForFilename(rawName);
         const fileName = baseName.includes('.') ? baseName : `${baseName}.png`;
         imageUrl = `/images/${fileName}`;
      }

      // --- INGREDIENTS ---
      const spirit = clean[colMap.spirit] || '';
      const liqueur = clean[colMap.liqueur] || '';
      const nonAlc = clean[colMap.nonAlc] || '';
      const garnish = clean[colMap.garnish] || '';
      
      const combinedIngredients = [spirit, liqueur, nonAlc, garnish]
        .flatMap(col => col.split(/[;,\n]+/).map(i => i.trim()))
        .filter(i => i && !/^\d+$/.test(i));

      if (rawNameLower.includes('whisky sour') || rawNameLower.includes('whiskey sour')) {
        const hasFoamer = combinedIngredients.some(i => i.toLowerCase().includes('foamer') || i.toLowerCase().includes('egg'));
        if (!hasFoamer) combinedIngredients.push('Foamer');
      }

      // --- TASTE PROFILES (Strict Filtering) ---
      let rawTasteText = '';
      
      // 1. Get from Sheet
      if (colMap.taste !== -1 && clean[colMap.taste]) {
        rawTasteText += clean[colMap.taste] + ' ';
      }
      
      // 2. Get from Local Fallback
      const localKey = Object.keys(LOCAL_TASTE_PROFILES).find(k => rawNameLower.includes(k) || k === rawNameLower);
      if (localKey) {
        rawTasteText += LOCAL_TASTE_PROFILES[localKey];
      }

      // 3. Extract only allowed keywords
      const tasteProfiles = extractStrictTasteProfiles(rawTasteText);

      return {
        id: `cocktail-${rawName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        imageUrl,
        name: rawName,
        description: clean[colMap.desc] || 'A premium selection.',
        ingredients: Array.from(new Set(combinedIngredients)),
        instructions: clean[colMap.instr] || 'Serve and enjoy.',
        tasteProfiles
      };
    }).filter((c): c is Cocktail => c !== null);

    return cocktails;
  } catch (error) {
    console.error('Sheet fetch error:', error);
    return [];
  }
};
