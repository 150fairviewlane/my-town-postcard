---
name: Stripe SDK version lag
description: Stripe's docs lead their Node SDK — verify a method/field exists in the installed package types before using it.
---

## Rule
Before using any Stripe API method or session field, verify it exists in the **installed** SDK types:

```bash
grep -r "methodName\|FieldName" node_modules/stripe/types/
```

If the grep returns nothing, the feature is not yet in the installed SDK version — do not use it regardless of what the Stripe docs say.

**Why:** Stripe ships REST API features and updates their documentation before the Node SDK ships types for them. The gap can be months. Using an untyped method compiles without error (TypeScript treats `stripe.unknownMethod` as `any` on some SDK versions) but Stripe's API rejects the payload server-side with "The string did not match the expected pattern" or a similar validation error.

**How to apply:**
- Before using `stripe.paymentMethodConfigurations`, `payment_method_configuration`, `wallet_options`, or any field not seen in the existing codebase, run the grep above.
- If the field isn't typed, use the simpler well-supported alternative. For card-only Stripe Checkout (hosted), `payment_method_types: ["card"]` is the correct SDK v22 approach — it IS typed and suppresses Apple Pay, Google Pay, and Link on hosted Checkout pages when set explicitly.
- This was the root cause of Tasks #421–#424: PMC API used in docs but absent from SDK v22 types, causing "The string did not match the expected pattern" on every subscription checkout attempt.
