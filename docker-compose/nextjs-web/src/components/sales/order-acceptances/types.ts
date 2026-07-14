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
  version: string | null;
  customization: string | null;
  order_type: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  delivery_date: string | null;
  ship_to: string | null;
  notes: string | null;
}

export interface OrderRequest {
  customer_name: string | null;
  customer_branch: string | null;
  customer_contact: string | null;
  customer_order_ref: string | null;
  order_date: string | null;
  desired_delivery_date: string | null;
  delivery_location: string | null;
  payment_terms: string | null;
  items: OrderRequestItem[] | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  notes: string | null;
}

export const emptyOrderItem = (): OrderRequestItem => ({
  product_name: null,
  product_code: null,
  version: null,
  customization: null,
  order_type: null,
  quantity: null,
  unit: null,
  unit_price: null,
  amount: null,
  delivery_date: null,
  ship_to: null,
  notes: null,
});

/**
 * One accepted 受注請書 = one 注文請書 (sales order) + N 指示書 (work orders).
 * Work orders group the line items by product & version, customization,
 * delivery date, and ship-to address.
 */
export interface WorkOrderGroup {
  product_name: string | null;
  product_code: string | null;
  version: string | null;
  customization: string | null;
  delivery_date: string | null;
  ship_to: string | null;
  total_quantity: number;
  unit: string | null;
  items: OrderRequestItem[];
}

export function groupWorkOrders(data: OrderRequest): WorkOrderGroup[] {
  const groups = new Map<string, WorkOrderGroup>();
  for (const it of data.items ?? []) {
    const shipTo = it.ship_to ?? data.delivery_location;
    const key = JSON.stringify([
      it.product_code ?? it.product_name,
      it.version,
      it.customization,
      it.delivery_date ?? data.desired_delivery_date,
      shipTo,
    ]);
    let g = groups.get(key);
    if (!g) {
      g = {
        product_name: it.product_name,
        product_code: it.product_code,
        version: it.version,
        customization: it.customization,
        delivery_date: it.delivery_date ?? data.desired_delivery_date,
        ship_to: shipTo,
        total_quantity: 0,
        unit: it.unit,
        items: [],
      };
      groups.set(key, g);
    }
    g.total_quantity += it.quantity ?? 0;
    g.items.push(it);
  }
  return [...groups.values()];
}

export const emptyOrderRequest = (): OrderRequest => ({
  customer_name: null,
  customer_branch: null,
  customer_contact: null,
  customer_order_ref: null,
  order_date: null,
  desired_delivery_date: null,
  delivery_location: null,
  payment_terms: null,
  items: [emptyOrderItem()],
  subtotal: null,
  tax_rate: null,
  tax_amount: null,
  total_amount: null,
  notes: null,
});
