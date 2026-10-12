export type ChargeType = "direct" | "destination" | "separate";

export interface ApiConfig {
  publishableKey: string;
  connectedAccountA: string | null;
  connectedAccountB: string | null;
  demoAmountCents: number;
  platformFeeCents: number;
}

export interface CheckoutResponse {
  url?: string;
  sessionId?: string;
  error?: string;
}

export interface SessionSummary {
  id: string;
  payment_status: string;
  metadata?: Record<string, string>;
  amount_total: number | null;
  error?: string;
}

export interface TransferSummary {
  id: string;
  amount: number;
  destination: string;
}

export interface FinalizeResponse {
  message?: string;
  transfers?: TransferSummary[];
  error?: string;
}
