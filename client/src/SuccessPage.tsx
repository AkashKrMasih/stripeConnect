import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  ChargeType,
  FinalizeResponse,
  SessionSummary,
  TransferSummary,
} from "./types";

const LABELS: Record<ChargeType, string> = {
  direct: "Direct charge (on connected account)",
  destination: "Destination charge (platform → one account)",
  separate: "Separate charge & transfers (platform → multiple accounts)",
};

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  const type = typeParam as ChargeType | null;
  const sessionId = searchParams.get("session_id");
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [transfers, setTransfers] = useState<TransferSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const typeQuery = type ? `?type=${encodeURIComponent(type)}` : "";
    fetch(`/api/session/${sessionId}${typeQuery}`)
      .then((r) => r.json())
      .then((data: SessionSummary) => setSession(data))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
  }, [sessionId, type]);

  useEffect(() => {
    if (type !== "separate" || !sessionId) return;
    if (session?.payment_status !== "paid") return;

    fetch("/api/separate/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .then((data: FinalizeResponse) => {
        if (data.error) throw new Error(data.error);
        setTransfers(data.transfers ?? []);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
  }, [type, sessionId, session?.payment_status]);

  const label =
    type && type in LABELS ? LABELS[type as ChargeType] : "Checkout completed";

  return (
    <div className="container">
      <header>
        <h1>Payment successful</h1>
        <p>{label}.</p>
      </header>

      {session && (
        <div className="success-box">
          <p>
            <strong>Session:</strong> <code>{session.id}</code>
          </p>
          <p>
            <strong>Status:</strong> {session.payment_status}
          </p>
          <p>
            <strong>Amount:</strong>{" "}
            {session.amount_total != null
              ? `$${(session.amount_total / 100).toFixed(2)}`
              : "—"}
          </p>
        </div>
      )}

      {type === "separate" && transfers && transfers.length > 0 && (
        <div className="success-box" style={{ marginTop: "1rem" }}>
          <p><strong>Transfers created:</strong></p>
          <ul>
            {transfers.map((t) => (
              <li key={t.id}>
                <code>{t.id}</code> — ${(t.amount / 100).toFixed(2)} →{" "}
                <code>{t.destination}</code>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            In production, prefer a <code>checkout.session.completed</code> webhook
            instead of finalizing from the browser.
          </p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <p style={{ marginTop: "2rem" }}>
        <Link to="/">← Back to demos</Link>
      </p>
    </div>
  );
}
