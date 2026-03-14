// supabase/functions/_shared/stripeProducts.ts
// Stripe V2 Workspace — Product and Price IDs for V23 pricing

/**
 * Stripe V2 Workspace — Product and Price IDs
 *
 * Two environments:
 *   Sandbox: acct_1TB0AaGdHLW4FdBl (sk_test_...)
 *   Live:    acct via .env.production  (sk_live_...)
 *
 * The edge function reads STRIPE_SECRET_KEY_V2 from env — sandbox vs live
 * is determined by which key is set. Price IDs below are from LIVE mode.
 * Sandbox IDs are in the comment block for reference.
 *
 * 6 products, 18 prices (USD/GBP/EUR per product).
 * Created via Stripe API on 2026-03-14.
 *
 * SANDBOX PRICE IDs (for reference):
 *   founding_member: USD price_1TB0D2GdHLW4FdBlFYlsBLwB | GBP price_1TB0D2GdHLW4FdBlLaxFwrm7 | EUR price_1TB0D3GdHLW4FdBl3jL2N4ba
 *   basic_monthly:   USD price_1TB0D3GdHLW4FdBlQoHKwlQE | GBP price_1TB0D3GdHLW4FdBl1gFvTtFw | EUR price_1TB0D4GdHLW4FdBlLfFjOnK0
 *   pro_monthly:     USD price_1TB0D4GdHLW4FdBlkY297b3J | GBP price_1TB0D4GdHLW4FdBllfqPAcIu | EUR price_1TB0D5GdHLW4FdBlFL22PzoF
 *   credit_signal:   USD price_1TB0D5GdHLW4FdBl899d3C2e | GBP price_1TB0D5GdHLW4FdBlZccTUPAC | EUR price_1TB0D5GdHLW4FdBljJDBmHYV
 *   credit_insight:  USD price_1TB0D6GdHLW4FdBlYN64F8Mc | GBP price_1TB0D6GdHLW4FdBlbnJcytOt | EUR price_1TB0D6GdHLW4FdBlDLVTFOyr
 *   credit_intel:    USD price_1TB0D7GdHLW4FdBlxcfJ2jhy | GBP price_1TB0D7GdHLW4FdBlQwNNOc6O | EUR price_1TB0D7GdHLW4FdBlRA3ppOZu
 */

export const STRIPE_V2_PRODUCTS = {
  founding_member: {
    productId: 'prod_U9IyvemK5y0HzA',
    prices: {
      USD: 'price_1TB0MvGlDAbFFVjyylTrkeqK', // $299 one-time
      GBP: 'price_1TB0MwGlDAbFFVjyfsQeBymQ', // £239 one-time
      EUR: 'price_1TB0MwGlDAbFFVjyz7jqiy6M', // €279 one-time
    },
  },
  basic_monthly: {
    productId: 'prod_U9IyrpA9lA3TWi',
    prices: {
      USD: 'price_1TB0MwGlDAbFFVjy1aaR32Yq', // $29/mo
      GBP: 'price_1TB0MxGlDAbFFVjyMstfvD4D', // £23/mo
      EUR: 'price_1TB0MxGlDAbFFVjyZm0BxOpl', // €27/mo
    },
  },
  pro_monthly: {
    productId: 'prod_U9IyWdA4bIf5wH',
    prices: {
      USD: 'price_1TB0MyGlDAbFFVjyOqLtlGnA', // $99/mo
      GBP: 'price_1TB0MyGlDAbFFVjyXWJUtbk9', // £79/mo
      EUR: 'price_1TB0MyGlDAbFFVjyrFXBRft4', // €92/mo
    },
  },
  credit_signal: {
    productId: 'prod_U9IykwsTLCD1TE',
    prices: {
      USD: 'price_1TB0MyGlDAbFFVjy2k3Be2mQ', // $19 one-time (100 credits)
      GBP: 'price_1TB0MzGlDAbFFVjyytQwDuEs', // £15
      EUR: 'price_1TB0MzGlDAbFFVjywxBPXg6l', // €17
    },
  },
  credit_insight: {
    productId: 'prod_U9IyuYMvxGZGJD',
    prices: {
      USD: 'price_1TB0MzGlDAbFFVjySddLdQha', // $38 one-time (250 credits)
      GBP: 'price_1TB0N0GlDAbFFVjyR7fuiJq5', // £30
      EUR: 'price_1TB0N0GlDAbFFVjyZ6aVEHpk', // €35
    },
  },
  credit_intelligence: {
    productId: 'prod_U9IyrvRh12ZAOF',
    prices: {
      USD: 'price_1TB0N0GlDAbFFVjywrtmU9Tu', // $63 one-time (500 credits)
      GBP: 'price_1TB0N1GlDAbFFVjyjynCgtuV', // £50
      EUR: 'price_1TB0N1GlDAbFFVjy4jcy5Y27', // €58
    },
  },
} as const;

export type StripeV2Product = keyof typeof STRIPE_V2_PRODUCTS;
export type StripeCurrency = 'USD' | 'GBP' | 'EUR';

/**
 * Look up the Stripe Price ID for a given product and currency.
 * Throws if the price has not been configured yet (empty string).
 */
export function getStripeV2PriceId(
  product: StripeV2Product,
  currency: StripeCurrency,
): string {
  const prices = STRIPE_V2_PRODUCTS[product].prices;
  const priceId = prices[currency];
  if (!priceId) {
    throw new Error(`No Stripe price configured for ${product} in ${currency}`);
  }
  return priceId;
}

/**
 * Look up the Stripe Product ID for a given product.
 * Throws if the product has not been configured yet (empty string).
 */
export function getStripeV2ProductId(product: StripeV2Product): string {
  const productId = STRIPE_V2_PRODUCTS[product].productId;
  if (!productId) {
    throw new Error(`No Stripe product ID configured for ${product}`);
  }
  return productId;
}
