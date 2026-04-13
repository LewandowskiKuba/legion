// Mock API utilities for synthetic population sandbox

export interface PopulationStats {
  total: number;
  averageAge: number;
  genderDistribution: { male: number; female: number };
  regions: { urban: number; suburban: number; rural: number };
  incomeDistribution: { low: number; medium: number; high: number };
  education: { basic: number; secondary: number; higher: number };
  politicalPreferences: { left: number; center: number; right: number };
}

export interface Campaign {
  id: string;
  name: string;
  brand: string;
  date: string;
  attentionScore: number;
  resonance: number;
  purchaseIntentDelta: number;
  trustDelta: number;
}

export interface StudyResult {
  id: string;
  campaignName: string;
  date: string;
  metrics: {
    attention: number;
    resonance: number;
    purchaseIntentDelta: number;
    trustDelta: number;
  };
  segmentData: {
    age: Array<{ segment: string; attention: number; resonance: number; purchaseIntent: number }>;
    gender: Array<{ segment: string; attention: number; resonance: number; purchaseIntent: number }>;
    location: Array<{ segment: string; attention: number; resonance: number; purchaseIntent: number }>;
  };
  topRecall: string[];
  womQuotes: string[];
  rejectionSignals: string[];
  socialSpread?: {
    viralScore: number;
    chains: Array<{ depth: number; reach: number; engagement: number }>;
  };
}

// Mock population data
export const mockPopulation: PopulationStats = {
  total: 50,
  averageAge: 41,
  genderDistribution: { male: 48, female: 52 },
  regions: { urban: 45, suburban: 35, rural: 20 },
  incomeDistribution: { low: 25, medium: 50, high: 25 },
  education: { basic: 20, secondary: 45, higher: 35 },
  politicalPreferences: { left: 30, center: 45, right: 25 },
};

// Mock recent campaigns
export const mockRecentCampaigns: Campaign[] = [
  {
    id: '1',
    name: 'Kampania Q1 2026 - Premium Line',
    brand: 'Nike',
    date: '2026-03-20',
    attentionScore: 7.8,
    resonance: 8.2,
    purchaseIntentDelta: 12,
    trustDelta: 5,
  },
  {
    id: '2',
    name: 'Wiosna 2026 Launch',
    brand: 'Adidas',
    date: '2026-03-18',
    attentionScore: 6.9,
    resonance: 7.1,
    purchaseIntentDelta: 8,
    trustDelta: 3,
  },
  {
    id: '3',
    name: 'Test A/B Social Media',
    brand: 'Puma',
    date: '2026-03-15',
    attentionScore: 7.2,
    resonance: 6.8,
    purchaseIntentDelta: 6,
    trustDelta: 2,
  },
];

// Mock brands
export const mockBrands = [
  'Nike',
  'Adidas',
  'Puma',
  'Coca-Cola',
  'Pepsi',
  'Apple',
  'Samsung',
  'Toyota',
  'Volkswagen',
  'IKEA',
  'H&M',
  'Zara',
  'Netflix',
  'Spotify',
  'Amazon',
];

// Mock study categories
export const mockCategories = [
  'Odzież i Obuwie',
  'Napoje',
  'Elektronika',
  'Motoryzacja',
  'Meble i Wyposażenie',
  'Streaming i Media',
  'E-commerce',
  'Żywność',
  'Kosmetyki',
  'Usługi Finansowe',
];

// Mock exposure contexts
export const mockContexts = [
  'Facebook Feed',
  'Instagram Stories',
  'YouTube Pre-roll',
  'Desktop Display',
  'Mobile Banner',
  'TikTok In-Feed',
  'LinkedIn Sponsored',
  'Twitter Feed',
];

// Simulate study with SSE-like progress
export async function simulateStudy(
  onProgress: (progress: number) => void,
  onComplete: (result: StudyResult) => void,
  abTest: boolean = false,
  socialSpread: boolean = false
): Promise<void> {
  const steps = [
    { label: 'Inicjalizacja populacji', duration: 800 },
    { label: 'Ekspozycja kreacji', duration: 1500 },
    { label: 'Zbieranie reakcji', duration: 1200 },
    { label: 'Analiza segmentowa', duration: 1000 },
    { label: 'Generowanie raportu', duration: 700 },
  ];

  if (socialSpread) {
    steps.push({ label: 'Symulacja social spread', duration: 1500 });
  }

  let currentProgress = 0;
  const progressIncrement = 100 / steps.length;

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, step.duration));
    currentProgress += progressIncrement;
    onProgress(Math.min(currentProgress, 100));
  }

  // Generate mock result
  const result: StudyResult = {
    id: `study-${Date.now()}`,
    campaignName: 'Nowe badanie',
    date: new Date().toISOString(),
    metrics: {
      attention: Math.random() * 3 + 7, // 7-10
      resonance: Math.random() * 3 + 6, // 6-9
      purchaseIntentDelta: Math.floor(Math.random() * 15) + 5, // 5-20
      trustDelta: Math.floor(Math.random() * 10) + 2, // 2-12
    },
    segmentData: {
      age: [
        { segment: '18-24', attention: 8.2, resonance: 7.9, purchaseIntent: 15 },
        { segment: '25-34', attention: 7.8, resonance: 8.1, purchaseIntent: 18 },
        { segment: '35-44', attention: 7.5, resonance: 7.3, purchaseIntent: 12 },
        { segment: '45-54', attention: 6.9, resonance: 6.8, purchaseIntent: 8 },
        { segment: '55+', attention: 6.2, resonance: 6.1, purchaseIntent: 5 },
      ],
      gender: [
        { segment: 'Kobiety', attention: 7.8, resonance: 8.0, purchaseIntent: 14 },
        { segment: 'Mężczyźni', attention: 7.2, resonance: 7.1, purchaseIntent: 11 },
      ],
      location: [
        { segment: 'Miasta >500k', attention: 8.1, resonance: 7.8, purchaseIntent: 16 },
        { segment: 'Miasta 100-500k', attention: 7.4, resonance: 7.2, purchaseIntent: 12 },
        { segment: 'Miasta <100k', attention: 6.8, resonance: 6.9, purchaseIntent: 9 },
        { segment: 'Wieś', attention: 6.5, resonance: 6.6, purchaseIntent: 7 },
      ],
    },
    topRecall: [
      'Produkt był widoczny i zapadał w pamięć',
      'Podobała mi się kolorystyka i dynamika',
      'Ciekawy przekaz, ale trochę zbyt agresywny',
      'Marka jest rozpoznawalna, to dodaje wartości',
      'Czuję, że to dla młodszej grupy docelowej',
    ],
    womQuotes: [
      '"Pokazałbym to znajomym, bo to coś nowego"',
      '"Fajne, ale nie wiem czy bym kupił"',
      '"To ma potencjał viralowy, szczególnie na TikToku"',
      '"Nie dla mnie, ale rozumiem grupę docelową"',
    ],
    rejectionSignals: [
      'Zbyt nachalny przekaz (23% respondentów)',
      'Niejasny CTA (18% respondentów)',
      'Nie pasuje do mojego stylu życia (15% respondentów)',
    ],
  };

  if (socialSpread) {
    result.socialSpread = {
      viralScore: Math.random() * 40 + 60, // 60-100
      chains: [
        { depth: 1, reach: 50, engagement: 8.2 },
        { depth: 2, reach: 120, engagement: 6.8 },
        { depth: 3, reach: 280, engagement: 4.5 },
        { depth: 4, reach: 380, engagement: 2.1 },
      ],
    };
  }

  onComplete(result);
}

// Get population data
export async function getPopulation(): Promise<PopulationStats> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return mockPopulation;
}

// Get campaigns
export async function getCampaigns(): Promise<Campaign[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return mockRecentCampaigns;
}

// Get brands
export async function getBrands(): Promise<string[]> {
  await new Promise(resolve => setTimeout(resolve, 200));
  return mockBrands;
}
