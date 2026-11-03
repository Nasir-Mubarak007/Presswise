import type { Product, ProductColor, ProductDesign, ProductId } from "./types";

export const PRODUCTS: readonly Product[] = [
  {
    id: "cap",
    name: "Embroidered Cap",
    category: "caps",
    basePriceKobo: 800_000,
    mockup: "cap",
    hasBackView: false,
    sizes: ["S/M", "L/XL"],
    colors: ["navy", "black", "khaki", "forest", "white"],
  },
  {
    id: "tee",
    name: "Crewneck Tee",
    category: "apparel",
    basePriceKobo: 650_000,
    mockup: "shirt",
    hasBackView: true,
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["grey", "black", "white", "navy", "forest", "maroon"],
  },
  {
    id: "hoodie",
    name: "Pullover Hoodie",
    category: "apparel",
    basePriceKobo: 1_100_000,
    mockup: "hoodie",
    hasBackView: true,
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["charcoal", "black", "navy", "grey", "forest", "maroon"],
  },
  {
    id: "snapback",
    name: "Snapback Cap",
    category: "caps",
    basePriceKobo: 720_000,
    mockup: "cap",
    hasBackView: false,
    sizes: ["S/M", "L/XL"],
    colors: ["brown", "black", "navy", "olive", "white"],
  },
  {
    id: "tote",
    name: "Canvas Tote",
    category: "bags",
    basePriceKobo: 450_000,
    mockup: "tote",
    hasBackView: false,
    sizes: ["Standard", "Large"],
    colors: ["natural", "black", "navy", "white"],
  },
  {
    id: "drawstring",
    name: "Drawstring Bag",
    category: "bags",
    basePriceKobo: 380_000,
    mockup: "drawstring",
    hasBackView: false,
    sizes: ["Standard", "Large"],
    colors: ["sage", "black", "navy", "red"],
  },
];

export const CATEGORY_LABELS = {
  all: "All",
  caps: "Caps",
  apparel: "Apparel",
  bags: "Bags",
} as const;

export const COLOR_LABELS: Record<ProductColor, string> = {
  black: "Black",
  white: "White",
  navy: "Navy",
  grey: "Heather Grey",
  charcoal: "Charcoal",
  forest: "Forest",
  maroon: "Maroon",
  brown: "Brown",
  natural: "Natural",
  sage: "Sage",
  red: "Red",
  khaki: "Khaki",
  olive: "Olive",
};

export const COLOR_TONES: Record<ProductColor, readonly [string, string, string]> = {
  black: ["#4d4d52", "#2b2b2f", "#101012"],
  white: ["#ffffff", "#efefef", "#d2d4d6"],
  navy: ["#55697c", "#32425a", "#1a2433"],
  grey: ["#8b94a0", "#5c6670", "#3b434c"],
  charcoal: ["#798089", "#474d55", "#292d32"],
  forest: ["#5f8f6f", "#3c6a4d", "#22402e"],
  maroon: ["#a85a63", "#7a2f3a", "#4a1620"],
  brown: ["#8a7a63", "#5c4f3d", "#332b20"],
  natural: ["#d8c8a4", "#bba684", "#a08a62"],
  sage: ["#9fb3a4", "#7b9484", "#5f7868"],
  red: ["#e0626a", "#c23a44", "#8f1f28"],
  khaki: ["#d9c9a3", "#b5a27a", "#8a7a57"],
  olive: ["#8f9a62", "#667040", "#414a24"],
};

export const MATERIALS = [
  { name: "Standard" as const, addKobo: 0 },
  { name: "Premium" as const, addKobo: 150_000 },
];

export const FINISHES = [
  { name: "Printed" as const, addKobo: 0, minimumQuantity: 1 },
  { name: "Embroidered" as const, addKobo: 200_000, minimumQuantity: 10 },
];

export const DELIVERY_OPTIONS = {
  pickup: { label: "Pick up from the shop", feeKobo: 0, timing: "Ready in 3 to 5 days" },
  standard: { label: "Standard delivery", feeKobo: 250_000, timing: "3 to 5 business days" },
  express: { label: "Express delivery", feeKobo: 500_000, timing: "1 to 2 business days" },
} as const;

export const VAT_RATE = 0.075;
export const PRINTER_CHARGES_VAT = true;

export function getProduct(productId: ProductId): Product {
  const product = PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    throw new Error(`Unknown storefront product: ${productId}`);
  }
  return product;
}

export function defaultDesign(productId: ProductId): ProductDesign {
  const product = getProduct(productId);
  return {
    productId,
    side: "front",
    color: product.colors[0],
    size: product.sizes[product.sizes.length > 2 ? 1 : 0],
    material: "Standard",
    finish: "Printed",
    quantity: 1,
    photoUrl: null,
    photoWidth: null,
    photoHeight: null,
    photoPosition: { x: 50, y: 48 },
    photoSize: 60,
    text: "",
    textFont: "sans",
    textColor: "",
    textBold: false,
  };
}

export function isProductId(value: string): value is ProductId {
  return PRODUCTS.some((product) => product.id === value);
}
