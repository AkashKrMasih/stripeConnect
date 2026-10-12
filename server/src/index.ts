import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import Stripe from "stripe";

type ChargeType = "direct" | "destination" | "separate";

const app = express();
const port = Number(process.env.PORT) || 4242;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

const stripeSecret = process.env.STRIPE_SECRET_KEY ?? "";
const stripe = new Stripe(stripeSecret);

const connectedA = process.env.STRIPE_CONNECTED_ACCOUNT_A;
const connectedB = process.env.STRIPE_CONNECTED_ACCOUNT_B;

const DEMO_AMOUNT_CENTS = 2000;
const PLATFORM_FEE_CENTS = 200;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function requireEnv(): void {
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (!connectedA) missing.push("STRIPE_CONNECTED_ACCOUNT_A");
  if (!connectedB) missing.push("STRIPE_CONNECTED_ACCOUNT_B");
  if (missing.length) {
    console.warn(
      `Warning: missing env vars: ${missing.join(", ")}. Copy server/.env.example to server/.env`
    );
  }
}
requireEnv();

app.use(
  cors({
    origin: clientUrl,
  })
);

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(400).send("STRIPE_WEBHOOK_SECRET not configured");
    }
    if (!sig || Array.isArray(sig)) {
      return res.status(400).send("Missing stripe-signature header");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error("Webhook signature verification failed.", errorMessage(err));
      return res.status(400).send(`Webhook Error: ${errorMessage(err)}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.charge_type === "separate") {
        try {
          await createSeparateTransfers(session);
        } catch (err) {
          console.error("Separate transfers failed:", err);
          return res.status(500).send("Transfer creation failed");
        }
      }
    }

    res.json({ received: true });
  }
);

app.use(express.json());

app.get("/api/config", (_req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    connectedAccountA: connectedA || null,
    connectedAccountB: connectedB || null,
    demoAmountCents: DEMO_AMOUNT_CENTS,
    platformFeeCents: PLATFORM_FEE_CENTS,
  });
});

const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
  price_data: {
    currency: "usd",
    product_data: {
      name: "Stripe Connect demo purchase",
      description: "Example line item for Connect charge patterns",
    },
    unit_amount: DEMO_AMOUNT_CENTS,
  },
  quantity: 1,
};

function successCancelUrls(chargeType: ChargeType) {
  return {
    success_url: `${clientUrl}/success?type=${chargeType}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/?canceled=${chargeType}`,
  };
}

app.post("/api/checkout/direct", async (_req, res) => {
  if (!connectedA) {
    return res.status(400).json({ error: "STRIPE_CONNECTED_ACCOUNT_A is not set" });
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [lineItem],
        payment_intent_data: {
          application_fee_amount: PLATFORM_FEE_CENTS,
        },
        metadata: { charge_type: "direct" },
        ...successCancelUrls("direct"),
      },
      { stripeAccount: connectedA }
    );

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.post("/api/checkout/destination", async (_req, res) => {
  if (!connectedA) {
    return res.status(400).json({ error: "STRIPE_CONNECTED_ACCOUNT_A is not set" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [lineItem],
      payment_intent_data: {
        transfer_data: {
          destination: connectedA,
        },
        application_fee_amount: PLATFORM_FEE_CENTS,
      },
      metadata: { charge_type: "destination" },
      ...successCancelUrls("destination"),
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.post("/api/checkout/separate", async (_req, res) => {
  if (!connectedA || !connectedB) {
    return res.status(400).json({
      error: "STRIPE_CONNECTED_ACCOUNT_A and STRIPE_CONNECTED_ACCOUNT_B are required",
    });
  }

  const transferGroup = `demo_${Date.now()}`;
  const splitA = 1200;
  const splitB = 600;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [lineItem],
      payment_intent_data: {
        transfer_group: transferGroup,
      },
      metadata: {
        charge_type: "separate",
        transfer_group: transferGroup,
        split_a_account: connectedA,
        split_a_amount: String(splitA),
        split_b_account: connectedB,
        split_b_amount: String(splitB),
      },
      ...successCancelUrls("separate"),
    });

    res.json({
      url: session.url,
      sessionId: session.id,
      transferGroup,
      splits: [
        { account: connectedA, amountCents: splitA },
        { account: connectedB, amountCents: splitB },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

async function resolveChargeId(session: Stripe.Checkout.Session) {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    throw new Error("No payment_intent on completed session");
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeId =
    typeof pi.latest_charge === "string"
      ? pi.latest_charge
      : pi.latest_charge?.id;

  if (!chargeId) {
    throw new Error("No charge on payment intent yet");
  }

  return chargeId;
}

async function createSeparateTransfers(session: Stripe.Checkout.Session) {
  const chargeId = await resolveChargeId(session);

  const transferGroup = session.metadata?.transfer_group;
  const accountA = session.metadata?.split_a_account;
  const amountA = Number(session.metadata?.split_a_amount || 0);
  const accountB = session.metadata?.split_b_account;
  const amountB = Number(session.metadata?.split_b_amount || 0);

  if (!transferGroup || !accountA || !accountB || !amountA || !amountB) {
    throw new Error("Missing split metadata on session");
  }

  await stripe.transfers.create({
    amount: amountA,
    currency: "usd",
    destination: accountA,
    transfer_group: transferGroup,
    source_transaction: chargeId,
    metadata: { demo: "separate_split_a" },
  });

  await stripe.transfers.create({
    amount: amountB,
    currency: "usd",
    destination: accountB,
    transfer_group: transferGroup,
    source_transaction: chargeId,
    metadata: { demo: "separate_split_b" },
  });
}

app.post("/api/separate/finalize", async (req, res) => {
  const sessionId = req.body?.sessionId as string | undefined;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Session is not paid yet" });
    }

    if (session.metadata?.charge_type !== "separate") {
      return res.status(400).json({ error: "Not a separate-charge session" });
    }

    const transferGroup = session.metadata.transfer_group;
    if (!transferGroup) {
      return res.status(400).json({ error: "Missing transfer_group metadata" });
    }

    const existing = await stripe.transfers.list({
      transfer_group: transferGroup,
      limit: 10,
    });

    if (existing.data.length >= 2) {
      return res.json({
        message: "Transfers already created",
        transfers: existing.data.map((t) => ({
          id: t.id,
          amount: t.amount,
          destination: t.destination,
        })),
      });
    }

    await createSeparateTransfers(session);

    const transfers = await stripe.transfers.list({
      transfer_group: transferGroup,
      limit: 10,
    });

    res.json({
      message: "Transfers created",
      transfers: transfers.data.map((t) => ({
        id: t.id,
        amount: t.amount,
        destination: t.destination,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/api/session/:id", async (req, res) => {
  try {
    const requestOptions =
      req.query.type === "direct" && connectedA
        ? { stripeAccount: connectedA }
        : undefined;
    const session = await stripe.checkout.sessions.retrieve(
      req.params.id,
      {},
      requestOptions
    );
    res.json({
      id: session.id,
      payment_status: session.payment_status,
      metadata: session.metadata,
      amount_total: session.amount_total,
    });
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.listen(port, () => {
  console.log(`Stripe Connect demo API listening on http://localhost:${port}`);
});
