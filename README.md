# Stripe Connect React demo

Basic full-stack example showing three [Stripe Connect](https://docs.stripe.com/connect) charge patterns:

| Pattern | Where the charge lives | Money flow |
|--------|-------------------------|------------|
| **Direct** | Connected account | Customer → connected account; platform takes `application_fee_amount` |
| **Destination** | Platform | Customer → platform; auto-transfer to one `destination` account |
| **Separate** | Platform | Customer → platform; you create multiple `Transfer`s after payment |

## Prerequisites

1. [Stripe account](https://dashboard.stripe.com/register) in **test mode**
2. At least **two** test [connected accounts](https://dashboard.stripe.com/test/connect/accounts/overview) (Express or Standard). Copy their IDs (`acct_...`).
3. Node.js 18+ (TypeScript for client and server)

For direct charges, the connected account must be able to accept charges (complete Connect onboarding in test mode).

## Setup

```bash
cd stripeConnect
npm install
npm run install:all

cp server/.env.example server/.env
# Edit server/.env with your keys and connected account IDs

npm run dev
```

- React app: http://localhost:5173  
- API: http://localhost:4242  

## Project layout

```
server/src/index.ts   Express routes for each Checkout flow + separate transfer finalization
client/src/App.tsx    UI to start each demo checkout
client/src/types.ts   Shared API response types (client-side)
```

### API endpoints

- `POST /api/checkout/direct` — Checkout on connected account A (`stripeAccount` header)
- `POST /api/checkout/destination` — Platform Checkout with `transfer_data.destination`
- `POST /api/checkout/separate` — Platform Checkout with `transfer_group`; then transfers to A ($12) and B ($6)
- `POST /api/separate/finalize` — Creates transfers after pay (demo fallback; use webhooks in production)
- `POST /webhook` — Optional; handles `checkout.session.completed` for separate charges

## Test card

Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.

## Optional: webhooks

For separate charges without calling finalize from the success page:

```bash
stripe listen --forward-to localhost:4242/webhook
```

Put the signing secret in `STRIPE_WEBHOOK_SECRET`.

## License

MIT — example code only; not production-ready.
