import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type");
  const sessionId = searchParams.get("session_id");
  const [session, setSession] = useState(null);
  const [transfers, setTransfers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    const typeQuery = type ? `?type=${encodeURIComponent(type)}` : "";
    fetch(`/api/session/${sessionId}${typeQuery}`)
      .then((r) => r.json())
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  useEffect(() => {
    if (type !== "separate" || !sessionId) return;
    if (session?.payment_status !== "paid") return;

    fetch("/api/separate/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTransfers(data.transfers || []);
      })
      .catch((e) => setError(e.message));
  }, [type, sessionId, session?.payment_status]);

  const labels = {
    direct: "Direct charge (on connected account)",
    destination: "Destination charge (platform → one account)",
    separate: "Separate charge & transfers (platform → multiple accounts)",
  };

  return (
    <div className="container">
      <header>
        <h1>Payment successful</h1>
        <p>{labels[type] || "Checkout completed"}.</p>
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
