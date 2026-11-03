export type ProductCategory = "caps" | "apparel" | "bags";
export type ProductId = "cap" | "tee" | "hoodie" | "snapback" | "tote" | "drawstring";
export type ProductColor =
  | "black"
  | "white"
  | "navy"
  | "grey"
  | "charcoal"
  | "forest"
  | "maroon"
  | "brown"
  | "natural"
  | "sage"
  | "red"
  | "khaki"
  | "olive";
export type ProductSide = "front" | "back";
export type DeliveryMethod = "pickup" | "standard" | "express";
export type OrderStatus =
  | "paid"
  | "in_production"
  | "shipped"
  | "delivered"
  | "refunded";

export type Product = {
  id: ProductId;
  name: string;
  category: ProductCategory;
  basePriceKobo: number;
  mockup: "cap" | "shirt" | "hoodie" | "tote" | "drawstring";
  hasBackView: boolean;
  sizes: readonly string[];
  colors: readonly ProductColor[];
};

export type ProductDesign = {
  productId: ProductId;
  side: ProductSide;
  color: ProductColor;
  size: string;
  material: "Standard" | "Premium";
  finish: "Printed" | "Embroidered";
  quantity: number;
  photoUrl: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  photoPosition: { x: number; y: number };
  photoSize: number;
  text: string;
  textFont: string;
  textColor: string;
  textBold: boolean;
};

export type CheckoutDetails = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  deliveryMethod: DeliveryMethod;
  designApproved: boolean;
};

export type OrderEvent = {
  status: OrderStatus;
  occurredAt: string;
  note: string;
};

export type DemoOrder = {
  orderNumber: string;
  email: string;
  customerName: string;
  design: ProductDesign;
  checkout: CheckoutDetails;
  subtotalKobo: number;
  deliveryKobo: number;
  vatKobo: number;
  totalKobo: number;
  paymentResult: "simulated_success";
  status: OrderStatus;
  history: OrderEvent[];
  trackingNumber: string | null;
  declineReason: string | null;
};

export type DemoIdentity = {
  displayName: string;
  email: string;
  demoOnly: true;
};

export type DemoServiceError = {
  code: string;
  message: string;
};

export type DemoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DemoServiceError };

export type PriceBreakdown = {
  unitKobo: number;
  subtotalKobo: number;
  deliveryKobo: number;
  vatKobo: number;
  totalKobo: number;
  minimumQuantity: number;
};
