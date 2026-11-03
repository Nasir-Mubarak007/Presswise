import { DELIVERY_OPTIONS, FINISHES, MATERIALS, PRINTER_CHARGES_VAT, VAT_RATE } from "./catalog";
import type { CheckoutDetails, PriceBreakdown, ProductDesign } from "./types";

const BULK_DISCOUNT_KOBO = 50_000;
const BULK_QUANTITY = 10;

export function calculatePrice(design: ProductDesign, basePriceKobo: number): PriceBreakdown {
  const material = MATERIALS.find((item) => item.name === design.material);
  const finish = FINISHES.find((item) => item.name === design.finish);
  const minimumQuantity = finish?.minimumQuantity ?? 1;
  const discount = design.quantity >= BULK_QUANTITY ? BULK_DISCOUNT_KOBO : 0;
  const unitKobo = basePriceKobo + (material?.addKobo ?? 0) + (finish?.addKobo ?? 0) - discount;
  const subtotalKobo = unitKobo * design.quantity;
  return {
    unitKobo,
    subtotalKobo,
    deliveryKobo: 0,
    vatKobo: 0,
    totalKobo: subtotalKobo,
    minimumQuantity,
  };
}

export function calculateCheckoutPrice(
  design: ProductDesign,
  basePriceKobo: number,
  deliveryMethod: CheckoutDetails["deliveryMethod"],
): PriceBreakdown {
  const itemPrice = calculatePrice(design, basePriceKobo);
  const deliveryKobo = DELIVERY_OPTIONS[deliveryMethod].feeKobo;
  const vatKobo = PRINTER_CHARGES_VAT ? Math.round(itemPrice.subtotalKobo * VAT_RATE) : 0;
  return {
    ...itemPrice,
    deliveryKobo,
    vatKobo,
    totalKobo: itemPrice.subtotalKobo + deliveryKobo + vatKobo,
  };
}

export function formatNaira(amountKobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amountKobo / 100);
}
