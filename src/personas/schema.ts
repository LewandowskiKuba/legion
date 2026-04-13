// ─────────────────────────────────────────────────────────────────────────────
// Persona schema – Synthetic Population Sandbox
// Każda persona to niezmienny profil stateless wstrzykiwany jako system prompt.
// Brand memory layer jest opcjonalnym nadpisaniem per-badanie.
// ─────────────────────────────────────────────────────────────────────────────

export type Gender = "male" | "female";

export type SettlementType =
  | "village"           // wieś
  | "small_city"        // miasto < 50k
  | "medium_city"       // miasto 50–250k
  | "large_city"        // miasto > 250k (bez metropolii)
  | "metropolis";       // Warszawa, Kraków, Wrocław, Gdańsk, Poznań, Łódź

export type Region =
  | "dolnoslaskie"
  | "kujawsko-pomorskie"
  | "lubelskie"
  | "lubuskie"
  | "lodzkie"
  | "malopolskie"
  | "mazowieckie"
  | "opolskie"
  | "podkarpackie"
  | "podlaskie"
  | "pomorskie"
  | "slaskie"
  | "swietokrzyskie"
  | "warminsko-mazurskie"
  | "wielkopolskie"
  | "zachodniopomorskie";

export type EducationLevel =
  | "primary"           // podstawowe
  | "vocational"        // zawodowe
  | "secondary"         // średnie
  | "higher";           // wyższe

export type HouseholdType =
  | "single"
  | "couple_no_kids"
  | "family_young_kids"   // dzieci < 12 lat
  | "family_teen_kids"    // dzieci 12–18 lat
  | "family_adult_kids"   // dzieci 18+ w domu
  | "multigenerational"
  | "single_parent";

export type IncomeLevel =
  | "below_2000"          // netto miesięcznie (PLN)
  | "2000_3500"
  | "3500_5000"
  | "5000_8000"
  | "above_8000";

export type PoliticalAffiliation =
  | "pis"
  | "ko"
  | "td"                  // Trzecia Droga (PSL + Polska2050)
  | "lewica"
  | "konfederacja"
  | "undecided"
  | "apolitical";

// ─────────────────────────────────────────────────────────────────────────────
// OCEAN – Big Five (0–100, gdzie 50 = przeciętna)
// ─────────────────────────────────────────────────────────────────────────────

export interface OceanProfile {
  openness: number;           // 0–100: zamknięty ↔ otwarty na doświadczenia
  conscientiousness: number;  // 0–100: spontaniczny ↔ sumienny/zorganizowany
  extraversion: number;       // 0–100: introwertyk ↔ ekstrawertyk
  agreeableness: number;      // 0–100: rywalizacyjny ↔ ugodowy/empatyczny
  neuroticism: number;        // 0–100: stabilny ↔ neurotyczny/niespokojny
}

// ─────────────────────────────────────────────────────────────────────────────
// Warstwy profilu
// ─────────────────────────────────────────────────────────────────────────────

export interface DemographicProfile {
  age: number;
  gender: Gender;
  education: EducationLevel;
  region: Region;
  settlementType: SettlementType;
  householdType: HouseholdType;
}

export interface FinancialProfile {
  incomeLevel: IncomeLevel;
  ownsProperty: boolean;
  hasSavings: boolean;             // > 3 miesiące dochodów
  hasDebt: boolean;                // kredyt gotówkowy/hipoteczny
  creditAttitude: "positive" | "neutral" | "negative";
  priceSensitivity: number;        // 0–100: niska ↔ wysoka wrażliwość cenowa
}

export interface PsychographicProfile {
  ocean: OceanProfile;
  riskTolerance: number;           // 0–100: awersja ↔ apetyt na ryzyko
  traditionalism: number;          // 0–100: postępowy ↔ tradycjonalistyczny
  collectivism: number;            // 0–100: indywidualista ↔ kolektywista
  institutionalTrust: number;      // 0–100: brak zaufania ↔ wysokie zaufanie
  mediaTrust: number;              // 0–100
  brandTrust: number;              // 0–100: sceptyczny wobec marek ↔ lojalny
}

export type ProductCategory =
  | "fmcg"
  | "electronics"
  | "fashion"
  | "financial_services"
  | "automotive"
  | "home_appliances"
  | "food_delivery"
  | "travel"
  | "healthcare"
  | "entertainment"
  | "beauty";

export type MediaPlatform =
  | "tv_public"           // TVP
  | "tv_private"          // Polsat, TVN
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x_twitter"
  | "linkedin"
  | "print_press"
  | "online_news"
  | "podcast"
  | "radio";

export type CommunicationStyle =
  | "emotional"           // emocjonalna
  | "rational"            // racjonalna/informacyjna
  | "humorous"            // humorystyczna
  | "authority"           // argumenty z autorytetu/eksperta
  | "social_proof"        // społeczny dowód słuszności
  | "aspirational"        // aspiracyjna/lifestyle
  | "fear_of_missing";    // FOMO

export interface ConsumerProfile {
  primaryCategories: ProductCategory[];   // główne kategorie zakupowe
  brandLoyalty: number;                   // 0–100: switcher ↔ lojalny
  shoppingChannels: Array<"offline" | "online" | "mixed">;
  mediaHabits: MediaPlatform[];           // platformy używane regularnie
  dailyMediaHours: number;                // łączny czas mediów (h/dobę)
  responsiveTo: CommunicationStyle[];     // style komunikacji, na które reaguje
}

export interface PoliticalProfile {
  affiliation: PoliticalAffiliation;
  engagementLevel: number;               // 0–100: apolityczny ↔ bardzo zaangażowany
  euAttitude: number;                    // 0–100: eurosceptyczny ↔ proeuropejski
  securityFocus: number;                 // 0–100: niski ↔ wysoki priorytet bezpieczeństwa
  climateAwareness: number;              // 0–100: ignoruje ↔ bardzo świadomy
  migrationAttitude: number;             // 0–100: otwarty ↔ restrykcyjny
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand memory layer (opcjonalny, per-badanie)
// Nie rośnie eksplodująco – mały słownik marek
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandMemoryEntry {
  brandName: string;
  awareness: boolean;             // 0 = nie zna, 1 = zna
  lastInteractionType?: "used" | "considered" | "rejected" | "just_heard";
  sentiment: -1 | 0 | 1;        // -1 negatywny, 0 neutralny, 1 pozytywny
}

export interface BrandMemoryLayer {
  brands: BrandMemoryEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pełna persona
// ─────────────────────────────────────────────────────────────────────────────

export interface Persona {
  id: string;
  name: string;                   // fikcyjne imię dla czytelności logów
  demographic: DemographicProfile;
  financial: FinancialProfile;
  psychographic: PsychographicProfile;
  consumer: ConsumerProfile;
  political: PoliticalProfile;
  brandMemory?: BrandMemoryLayer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dane wejściowe badania
// ─────────────────────────────────────────────────────────────────────────────

export interface AdMaterial {
  headline: string;
  body: string;
  cta: string;
  brandName?: string;
  productCategory?: ProductCategory;
  context?: string;               // opcjonalny kontekst medium (np. "scroll Instagram")
  imageBase64?: string;           // base64 kreacji graficznej (opcjonalny)
  imageMimeType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

// ─────────────────────────────────────────────────────────────────────────────
// Strukturyzowana odpowiedź bota (JSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface BotResponse {
  personaId: string;
  attentionScore: number;         // 0–10
  resonanceScore: number;         // 0–10
  purchaseIntentDelta: number;    // -5 do +5
  trustImpact: number;            // -5 do +5
  brandRecognitionScore: number;  // 0–10
  recall: string;                 // co persona "zapamiętała"
  womSimulation: string;          // co powiedziałaby znajomemu
  rejectionSignals: string[];     // elementy wywołujące opór
}
