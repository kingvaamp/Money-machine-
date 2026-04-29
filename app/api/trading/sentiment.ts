/**
 * Real Fear & Greed Index integration via alternative.me API.
 * Free, no API key, updated daily.
 * Endpoint: https://api.alternative.me/fng/?limit=1
 */

export interface FearGreedData {
  score: number;         // 0–100 (0 = Extreme Fear, 100 = Extreme Greed)
  label: string;         // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  timestamp: number;     // Unix ms
  lastFetched: number;   // When we last fetched this (for caching)
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache — API updates daily
let cache: FearGreedData | null = null;

export class FearGreedSentiment {
  /**
   * Fetch the current Fear & Greed Index.
   * Returns cached value if within TTL. Falls back to neutral (50) on error.
   */
  async fetch(): Promise<FearGreedData> {
    const now = Date.now();

    if (cache && now - cache.lastFetched < CACHE_TTL_MS) {
      return cache;
    }

    try {
      const resp = await fetch("https://api.alternative.me/fng/?limit=1", {
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json() as {
        data: Array<{ value: string; value_classification: string; timestamp: string }>;
      };

      const entry = json.data?.[0];
      if (!entry) throw new Error("Empty FNG response");

      cache = {
        score: parseInt(entry.value, 10),
        label: entry.value_classification,
        timestamp: parseInt(entry.timestamp, 10) * 1000,
        lastFetched: now,
      };

      console.log(`[FearGreed] Score: ${cache.score} (${cache.label})`);
      return cache;
    } catch (err) {
      console.warn("[FearGreed] Failed to fetch, using neutral fallback:", err);
      return {
        score: 50,
        label: "Neutral",
        timestamp: now,
        lastFetched: now,
      };
    }
  }

  /**
   * Convert score to a sentiment modifier for signal confidence.
   * Extreme Fear (<20): strong BUY boost for mean-reversion strategies
   * Extreme Greed (>80): strong SELL boost / avoid new longs
   */
  toSignalModifier(score: number, side: "buy" | "sell"): number {
    if (score <= 20) {
      // Extreme Fear — historically good entry for longs
      return side === "buy" ? 0.15 : -0.05;
    } else if (score <= 40) {
      // Fear — mild long bias
      return side === "buy" ? 0.08 : 0;
    } else if (score >= 80) {
      // Extreme Greed — risk-off, avoid longs
      return side === "sell" ? 0.15 : -0.10;
    } else if (score >= 60) {
      // Greed — mild short bias
      return side === "sell" ? 0.05 : 0;
    }
    return 0; // Neutral zone — no adjustment
  }
}
