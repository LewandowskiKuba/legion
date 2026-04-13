// ─────────────────────────────────────────────────────────────────────────────
// BeliefState – śledzi ewoluujące opinie, pewność i zaufanie agentów
// Port z MiroShark (aaronjmars/MiroShark) z adaptacjami do TypeScript/Legion
//
// Każdy agent ma:
//   positions:  temat → stanowisko (-1.0 silnie przeciw ↔ +1.0 silnie za)
//   confidence: temat → pewność (0.0 bardzo niepewny ↔ 1.0 twardo przekonany)
//   trust:      personaId → zaufanie (0.0–1.0, domyślnie 0.5)
//   exposureHistory: Set hashy argumentów (zapobiega ponownemu przetwarzaniu)
//
// Przekonania aktualizowane heurystycznie po każdej rundzie na podstawie:
//   - Postów które agent przeczytał (ważone zaufaniem do autora)
//   - Zaangażowania w własne posty (wzmocnienie społeczne)
//   - Nowości argumentu (2× wpływ przy pierwszym spotkaniu)
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

const MAX_EXPOSURE_HISTORY = 2000;
const BASE_LEARNING_RATE = 0.08;

export interface PostSeen {
  content: string;
  authorId?: string;
  numLikes?: number;
  numDislikes?: number;
}

export interface OwnEngagement {
  likesReceived: number;
  dislikesReceived: number;
}

export interface BeliefStateData {
  positions: Record<string, number>;
  confidence: Record<string, number>;
  trust: Record<string, number>;
  exposureCount: number;
}

export class BeliefState {
  positions: Record<string, number> = {};
  confidence: Record<string, number> = {};
  trust: Record<string, number> = {};
  private exposureHistory: Set<string> = new Set();

  // ── Inicjalizacja ──────────────────────────────────────────────────────────

  static fromProfile(params: {
    stance?: string;
    sentimentBias?: number;
    topics: string[];
  }): BeliefState {
    const bs = new BeliefState();
    const { stance = "neutral", sentimentBias = 0.0, topics } = params;

    const stanceMap: Record<string, number> = {
      supportive: 0.6,
      strongly_supportive: 0.9,
      opposing: -0.6,
      strongly_opposing: -0.9,
      neutral: 0.0,
      observer: 0.0,
    };
    const basePosition = stanceMap[stance] ?? 0.0;
    const baseConfidence = Math.min(1.0, Math.max(0.1, 0.4 + Math.abs(sentimentBias) * 0.4));

    for (const topic of topics) {
      const posNoise = gaussNoise(0, 0.15);
      const confNoise = gaussNoise(0, 0.05);
      bs.positions[topic] = clamp(basePosition + sentimentBias * 0.2 + posNoise, -1, 1);
      bs.confidence[topic] = clamp(baseConfidence + confNoise, 0.1, 1.0);
    }

    return bs;
  }

  // ── Aktualizacja po rundzie ────────────────────────────────────────────────

  updateFromRound(params: {
    postsSeen: PostSeen[];
    ownEngagement: OwnEngagement;
    roundNum: number;
  }): Record<string, number> {
    const { postsSeen, ownEngagement } = params;
    const deltas: Record<string, number> = {};

    // Przetwórz posty które agent przeczytał
    for (const post of postsSeen) {
      if (!post.content) continue;

      const hash = crypto.createHash("md5").update(post.content).digest("hex").slice(0, 12);
      const isNovel = !this.exposureHistory.has(hash);
      this.exposureHistory.add(hash);

      // Wyczyść stare wpisy jeśli za duże
      if (this.exposureHistory.size > MAX_EXPOSURE_HISTORY) {
        const toRemove = Array.from(this.exposureHistory).slice(0, 500);
        for (const h of toRemove) this.exposureHistory.delete(h);
      }

      const postStance = estimateStance(post.content);
      if (postStance === null) continue;

      const authorTrust = post.authorId ? (this.trust[post.authorId] ?? 0.5) : 0.5;
      const likes = post.numLikes ?? 0;
      const socialWeight = Math.min(1.0, 0.3 + likes * 0.07);
      const noveltyMult = isNovel ? 1.5 : 0.5;

      for (const topic of Object.keys(this.positions)) {
        if (!contentRelatesToTopic(post.content, topic)) continue;

        const currentPos = this.positions[topic];
        const currentConf = this.confidence[topic] ?? 0.5;

        // Wysokie confidence = większy opór na zmianę
        const resistance = 0.3 + currentConf * 0.7;
        const nudge =
          ((postStance - currentPos) * authorTrust * socialWeight * noveltyMult * BASE_LEARNING_RATE)
          / resistance;

        this.positions[topic] = clamp(currentPos + nudge, -1, 1);
        deltas[topic] = (deltas[topic] ?? 0) + nudge;
      }
    }

    // Wzmocnienie społeczne z własnych postów
    const { likesReceived, dislikesReceived } = ownEngagement;
    if (likesReceived > 0 || dislikesReceived > 0) {
      for (const topic of Object.keys(this.confidence)) {
        const currentConf = this.confidence[topic] ?? 0.5;
        if (likesReceived > dislikesReceived) {
          const boost = Math.min(0.15, (likesReceived - dislikesReceived) * 0.03);
          this.confidence[topic] = Math.min(1.0, currentConf + boost);
        } else if (dislikesReceived > likesReceived) {
          const drop = Math.min(0.15, (dislikesReceived - likesReceived) * 0.03);
          this.confidence[topic] = Math.max(0.1, currentConf - drop);
        }
      }
    }

    return deltas;
  }

  // ── Aktualizacja zaufania ──────────────────────────────────────────────────

  updateTrust(otherPersonaId: string, action: "like" | "dislike" | "follow" | "unfollow" | "mute"): void {
    const adjustments: Record<string, number> = {
      like: 0.05,
      dislike: -0.05,
      follow: 0.10,
      unfollow: -0.10,
      mute: -0.20,
    };
    const current = this.trust[otherPersonaId] ?? 0.5;
    this.trust[otherPersonaId] = clamp(current + (adjustments[action] ?? 0), 0, 1);
  }

  // ── Generowanie tekstu dla promptu ────────────────────────────────────────

  toPromptText(): string {
    if (Object.keys(this.positions).length === 0) return "";

    const lines = [
      "TWOJE AKTUALNE PRZEKONANIA:",
      "Odzwierciedlają Twoją ewoluującą perspektywę na podstawie obserwacji. Niech kierują Twoimi reakcjami.",
      "",
    ];

    for (const [topic, position] of Object.entries(this.positions)) {
      const conf = this.confidence[topic] ?? 0.5;
      lines.push(`- ${topic}: ${stanceLabel(position)} (pewność: ${confidenceLabel(conf)})`);
    }

    const trusted = Object.entries(this.trust).filter(([, t]) => t > 0.7).slice(0, 5);
    const distrusted = Object.entries(this.trust).filter(([, t]) => t < 0.3).slice(0, 5);

    if (trusted.length > 0) {
      lines.push("");
      lines.push(`Ufasz perspektywom: ${trusted.map(([id]) => id).join(", ")}`);
    }
    if (distrusted.length > 0) {
      lines.push(`Sceptycznie podchodzisz do: ${distrusted.map(([id]) => id).join(", ")}`);
    }

    return lines.join("\n");
  }

  // ── Serializacja ───────────────────────────────────────────────────────────

  toDict(): BeliefStateData {
    return {
      positions: { ...this.positions },
      confidence: { ...this.confidence },
      trust: { ...this.trust },
      exposureCount: this.exposureHistory.size,
    };
  }

  static fromDict(data: BeliefStateData): BeliefState {
    const bs = new BeliefState();
    bs.positions = data.positions ?? {};
    bs.confidence = data.confidence ?? {};
    bs.trust = data.trust ?? {};
    // exposureHistory nie jest persistowana (rozmiar), zaczyna się od zera
    return bs;
  }
}

// ── Helpery ────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

// Box-Muller transform dla szumu gaussowskiego
function gaussNoise(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function estimateStance(content: string): number | null {
  const lower = content.toLowerCase();
  if (lower.trim().length < 3) return null;

  const positive = [
    "support", "agree", "great", "excellent", "beneficial", "important",
    "necessary", "progress", "opportunity", "innovative", "promising",
    "approve", "endorse", "welcome", "positive", "dobry", "dobra", "świetny",
    "zgadzam", "popieramy", "popieramy", "tak", "fajny", "popieram",
  ];
  const negative = [
    "oppose", "disagree", "terrible", "harmful", "dangerous", "threat",
    "unacceptable", "disastrous", "fail", "wrong", "corrupt", "scandal",
    "outrage", "protest", "condemn", "reject", "zły", "zła", "straszny",
    "nie", "sprzeciw", "protest", "katastrofa", "skandal", "beznadziejny",
  ];

  const posCount = positive.filter(w => lower.includes(w)).length;
  const negCount = negative.filter(w => lower.includes(w)).length;
  const total = posCount + negCount;

  if (total > 0) return (posCount - negCount) / total;

  // Szerokie słownictwo jako fallback
  const broadPos = ["love", "like", "happy", "hope", "better", "win", "podoba", "lubię", "fajnie"];
  const broadNeg = ["hate", "bad", "sad", "fear", "worse", "lose", "nie podoba", "denerwuje", "szkoda"];
  const bp = broadPos.filter(w => lower.includes(w)).length;
  const bn = broadNeg.filter(w => lower.includes(w)).length;
  const broad = bp + bn;

  if (broad > 0) return 0.6 * (bp - bn) / broad;

  return 0.0; // Neutralny sygnał zamiast null — nie pomijamy posta
}

function contentRelatesToTopic(content: string, topic: string): boolean {
  const lower = content.toLowerCase();
  const topicLower = topic.toLowerCase();

  if (lower.includes(topicLower)) return true;

  const words = topicLower.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return true;
  return words.some(w => lower.includes(w));
}

function stanceLabel(position: number): string {
  if (position > 0.6) return "silnie za";
  if (position > 0.2) return "skłaniający się ku poparciu";
  if (position > -0.2) return "neutralny / niezdecydowany";
  if (position > -0.6) return "skłaniający się ku sprzeciwowi";
  return "silnie przeciw";
}

function confidenceLabel(confidence: number): string {
  if (confidence > 0.8) return "bardzo wysoka — twarde przekonanie";
  if (confidence > 0.6) return "umiarkowana — otwarty na silne argumenty";
  if (confidence > 0.4) return "niska — szczerze niepewny";
  return "bardzo niska — aktywnie szuka perspektyw";
}

// ── Ekstrakcja tematów z opisu symulacji ──────────────────────────────────

export function extractTopicsFromRequirement(requirement: string): string[] {
  const stopwords = new Set([
    "the", "a", "an", "is", "are", "of", "to", "in", "for", "and", "or",
    "on", "at", "by", "how", "what", "will", "this", "that", "with",
    "simulate", "simulation", "predict", "reaction", "focus", "public",
    "który", "która", "które", "jest", "są", "się", "nie", "na", "do", "że",
  ]);

  const words = requirement.split(/\s+/)
    .map(w => w.replace(/[.,;:!?"'()[\]{}]/g, ""))
    .filter(w => w.length > 3 && !stopwords.has(w.toLowerCase()));

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const w of words) {
    if (!seen.has(w.toLowerCase())) {
      seen.add(w.toLowerCase());
      topics.push(w);
    }
    if (topics.length >= 4) break;
  }

  return topics.length > 0 ? topics : [requirement.slice(0, 50)];
}
