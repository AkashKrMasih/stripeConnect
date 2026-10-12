import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import type { ApiConfig, ChargeType, CheckoutResponse } from "./types";

const CHARGE_TYPES: {
  id: ChargeType;
  tag: string;
  title: string;
  description: string;
  bullets: string[];
  endpoint: string;
}[] = [
  {
    id: "direct",
    tag: "Direct charge",
    title: "Payment on the connected account",
    description:
      "Checkout Session is created with the Stripe-Account header. The charge appears on the connected account; your platform can collect an application fee.",
    bullets: [
      "API: checkout.sessions.create(..., { stripeAccount: CONNECTED_ID })",
      "payment_intent_data.application_fee_amount → platform fee",
      "Best when the seller is the merchant of record",
    ],
    endpoint: "/api/checkout/direct",
  },
  {
    id: "destination",
    tag: "Destination charge",
    title: "Platform charge, auto-transfer to one account",
    description:
      "The PaymentIntent is created on your platform. Stripe automatically transfers funds to a single destination connected account.",
    bullets: [
      "payment_intent_data.transfer_data.destination = acct_...",
      "Optional application_fee_amount retained on platform",
      "One recipient per charge",
    ],
    endpoint: "/api/checkout/destination",
  },
  {
    id: "separate",
    tag: "Separate charge & transfers",
    title: "One platform charge, multiple transfers",
    description:
      "Customer pays your platform. After payment, you create Transfer objects to split funds across multiple connected accounts (demo: $12 + $6).",
    bullets: [
      "payment_intent_data.transfer_group links charge and transfers",
      "transfers.create({ source_transaction: payment_intent })",
      "Use when splitting one cart across sellers",
    ],
    endpoint: "/api/checkout/separate",
  },
];

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function App() {
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get("canceled");
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState<ChargeType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: ApiConfig) => setConfig(data))
      .catch(() => setConfig(null));
  }, []);

  async function startCheckout(chargeType: ChargeType) {
    const meta = CHARGE_TYPES.find((c) => c.id === chargeType);
    if (!meta) return;

    setLoading(chargeType);
    setError(null);

    try {
      const res = await fetch(meta.endpoint, { method: "POST" });
      const data = (await res.json()) as CheckoutResponse;
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(null);
    }
  }

  const envOk =
    config?.publishableKey &&
    config?.connectedAccountA &&
    config?.connectedAccountB;

  return (
    <div className="container">
      <header>
        <h1>Stripe Connect charge patterns</h1>
        <p>
          React + TypeScript frontend and Express API using Stripe Checkout. Each
          button starts a test payment demonstrating a different Connect flow.
        </p>
      </header>

      {!envOk && (
        <div className="env-banner">
          Configure <code>server/.env</code> from <code>server/.env.example</code>{" "}
          (secret key, publishable key, and two connected account IDs), then
          restart the API server.
        </div>
      )}

      {canceled && (
        <div className="env-banner" style={{ borderColor: "var(--border)" }}>
          Checkout canceled ({canceled}). <Link to="/">Try again</Link>
        </div>
      )}

      {config && (
        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
          }}
        >
          Demo price: {formatUsd(config.demoAmountCents)} · Platform fee (direct &
          destination): {formatUsd(config.platformFeeCents)}
        </p>
      )}

      <div className="grid">
        {CHARGE_TYPES.map((charge) => (
          <article key={charge.id} className="card">
            <span className="tag">{charge.tag}</span>
            <h2>{charge.title}</h2>
            <p>{charge.description}</p>
            <ul>
              {charge.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              className="primary"
              disabled={!envOk || loading !== null}
              onClick={() => startCheckout(charge.id)}
            >
              {loading === charge.id ? "Redirecting…" : `Pay with ${charge.tag}`}
            </button>
          </article>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <p style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--muted)" }}>
        Docs:{" "}
        <a
          href="https://docs.stripe.com/connect/direct-charges"
          target="_blank"
          rel="noreferrer"
        >
          Direct
        </a>
        {" · "}
        <a
          href="https://docs.stripe.com/connect/destination-charges"
          target="_blank"
          rel="noreferrer"
        >
          Destination
        </a>
        {" · "}
        <a
          href="https://docs.stripe.com/connect/separate-charges-and-transfers"
          target="_blank"
          rel="noreferrer"
        >
          Separate
        </a>
      </p>
    </div>
  );
}
