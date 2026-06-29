/**
 * types.ts — 受注請書 (order-request) intake shapes.
 *
 * Mirrors the `order-request` schema served by the self-hosted `po-extract`
 * API (`POST /extract/order-request`, see docker-compose/ai-stack/extractor).
 * All fields are nullable — the vision model sets anything it can't read to null.
 */

export interface OrderRequestItem {
  product_name: string | null;
  product_code: string | null;
  order_type: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  delivery_date: string | null;
  notes: string | null;
}

export interface OrderRequest {
  customer_name: string | null;
  customer_branch: string | null;
  customer_order_ref: string | null;
  order_date: string | null;
  desired_delivery_date: string | null;
  delivery_location: string | null;
  payment_terms: string | null;
  items: OrderRequestItem[] | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  notes: string | null;
}

export const emptyOrderItem = (): OrderRequestItem => ({
  product_name: null,
  product_code: null,
  order_type: null,
  quantity: null,
  unit: null,
  unit_price: null,
  amount: null,
  delivery_date: null,
  notes: null,
});

export const emptyOrderRequest = (): OrderRequest => ({
  customer_name: null,
  customer_branch: null,
  customer_order_ref: null,
  order_date: null,
  desired_delivery_date: null,
  delivery_location: null,
  payment_terms: null,
  items: [emptyOrderItem()],
  subtotal: null,
  tax_amount: null,
  total_amount: null,
  notes: null,
});
