import { DELIVERY_OPTIONS, FINISHES, getProduct, PRODUCTS } from "./catalog";
import { calculateCheckoutPrice } from "./pricing";
import type {
  CheckoutDetails,
  DemoIdentity,
  DemoOrder,
  DemoResult,
  OrderEvent,
  OrderStatus,
  Product,
  ProductCategory,
  ProductDesign,
} from "./types";

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  paid: ["in_production", "refunded"],
  in_production: ["shipped", "refunded"],
  shipped: ["delivered"],
  delivered: [],
  refunded: [],
};

function failure<T>(code: string, message: string): DemoResult<T> {
  return { ok: false, error: { code, message } };
}

function success<T>(data: T): DemoResult<T> {
  return { ok: true, data };
}

function cloneOrder(order: DemoOrder): DemoOrder {
  return structuredClone(order);
}

function makeSeedOrder(
  orderNumber: string,
  productId: ProductDesign["productId"],
  status: OrderStatus,
  occurredAt: string,
  customerName: string,
  trackingNumber: string | null = null,
): DemoOrder {
  const product = getProduct(productId);
  const design: ProductDesign = {
    productId,
    side: "front",
    color: product.colors[0],
    size: product.sizes[0],
    material: "Standard",
    finish: "Printed",
    quantity: 1,
    photoUrl: null,
    photoWidth: null,
    photoHeight: null,
    photoPosition: { x: 50, y: 48 },
    photoSize: 60,
    text: "Made with care",
    textFont: "display",
    textColor: "",
    textBold: true,
  };
  const checkout: CheckoutDetails = {
    name: customerName,
    email: "demo@example.com",
    phone: "0803 123 4567",
    addressLine1: "12 Demo Street",
    addressLine2: "",
    city: "Lagos",
    state: "Lagos",
    deliveryMethod: "standard",
    designApproved: true,
  };
  const price = calculateCheckoutPrice(design, product.basePriceKobo, checkout.deliveryMethod);
  const history: OrderEvent[] = [
    { status: "paid", occurredAt, note: "Your order was received." },
  ];
  if (status === "in_production" || status === "shipped" || status === "delivered") {
    history.push({
      status: "in_production",
      occurredAt: new Date(Date.parse(occurredAt) + 60 * 60 * 1000).toISOString(),
      note: "The shop has started preparing your order.",
    });
  }
  if (status === "shipped" || status === "delivered") {
    history.push({
      status: "shipped",
      occurredAt: new Date(Date.parse(occurredAt) + 4 * 60 * 60 * 1000).toISOString(),
      note: "Your order is on its way.",
    });
  }
  if (status === "delivered") {
    history.push({
      status: "delivered",
      occurredAt: new Date(Date.parse(occurredAt) + 24 * 60 * 60 * 1000).toISOString(),
      note: "Your order has been delivered.",
    });
  }
  return {
    orderNumber,
    email: checkout.email,
    customerName,
    design,
    checkout,
    subtotalKobo: price.subtotalKobo,
    deliveryKobo: price.deliveryKobo,
    vatKobo: price.vatKobo,
    totalKobo: price.totalKobo,
    paymentResult: "simulated_success",
    status,
    history,
    trackingNumber,
    declineReason: null,
  };
}

export function createDemoStorefrontService() {
  const orders = new Map<string, DemoOrder>([
    ["PW-10001", makeSeedOrder("PW-10001", "cap", "paid", "2026-10-24T10:00:00.000Z", "Ada Okafor")],
    [
      "PW-10002",
      makeSeedOrder(
        "PW-10002",
        "tee",
        "in_production",
        "2026-10-23T09:00:00.000Z",
        "Tunde Adebayo",
      ),
    ],
    [
      "PW-10003",
      makeSeedOrder(
        "PW-10003",
        "tote",
        "shipped",
        "2026-10-22T08:30:00.000Z",
        "Chika Nwosu",
        "PW-TRK-103",
      ),
    ],
    [
      "PW-10004",
      makeSeedOrder(
        "PW-10004",
        "hoodie",
        "delivered",
        "2026-10-20T11:00:00.000Z",
        "Bola Hassan",
        "PW-TRK-104",
      ),
    ],
  ]);
  let identity: DemoIdentity | null = null;
  let nextOrder = 10_005;

  return {
    async listProducts(category: ProductCategory | "all", query: string): Promise<DemoResult<Product[]>> {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      const products = PRODUCTS.filter(
        (product) =>
          (category === "all" || product.category === category) &&
          product.name.toLocaleLowerCase().includes(normalizedQuery),
      );
      return success(products);
    },

    async signInDemo(email: string, password: string): Promise<DemoResult<DemoIdentity>> {
      if (!email.includes("@") || password.length < 8) {
        return failure("auth.invalid_demo_input", "Enter a valid email and a password with at least 8 characters.");
      }
      identity = { displayName: email.split("@")[0] || "Demo customer", email, demoOnly: true };
      return success(identity);
    },

    async signUpDemo(
      firstName: string,
      email: string,
      password: string,
      acceptedTerms: boolean,
    ): Promise<DemoResult<{ email: string }>> {
      if (!firstName.trim() || !email.includes("@") || password.length < 8 || !acceptedTerms) {
        return failure("auth.invalid_demo_signup", "Check your details and accept the terms to continue.");
      }
      return success({ email });
    },

    async verifyDemoCode(email: string, code: string): Promise<DemoResult<DemoIdentity>> {
      if (!email.includes("@") || !/^\d{6}$/.test(code)) {
        return failure("auth.invalid_demo_code", "Enter a six digit demo verification code.");
      }
      identity = { displayName: email.split("@")[0] || "Demo customer", email, demoOnly: true };
      return success(identity);
    },

    async requestDemoPasswordReset(email: string): Promise<DemoResult<{ email: string }>> {
      if (!email.includes("@")) {
        return failure("auth.invalid_demo_email", "Enter a valid email address.");
      }
      return success({ email });
    },

    async resetDemoPassword(
      email: string,
      code: string,
      newPassword: string,
    ): Promise<DemoResult<DemoIdentity>> {
      if (!email.includes("@") || !/^\d{6}$/.test(code) || newPassword.length < 8) {
        return failure("auth.invalid_demo_reset", "Check the six digit code and use at least 8 characters.");
      }
      identity = { displayName: email.split("@")[0] || "Demo customer", email, demoOnly: true };
      return success(identity);
    },

    async signOutDemo(): Promise<DemoResult<null>> {
      identity = null;
      return success(null);
    },

    getIdentity(): DemoIdentity | null {
      return identity;
    },

    async createDemoOrder(
      design: ProductDesign,
      checkout: CheckoutDetails,
    ): Promise<DemoResult<DemoOrder>> {
      const product = getProduct(design.productId);
      const finish = FINISHES.find((item) => item.name === design.finish);
      const minimumQuantity = finish?.minimumQuantity ?? 1;
      if (
        !checkout.name.trim() ||
        !checkout.email.includes("@") ||
        !checkout.phone.trim() ||
        !checkout.designApproved ||
        (checkout.deliveryMethod !== "pickup" &&
          (!checkout.addressLine1.trim() || !checkout.city.trim() || !checkout.state)) ||
        design.quantity < minimumQuantity
      ) {
        return failure("order.invalid_demo_checkout", "Check the required details and product minimum quantity.");
      }
      if (!DELIVERY_OPTIONS[checkout.deliveryMethod]) {
        return failure("order.invalid_delivery", "Choose an available delivery option.");
      }
      const price = calculateCheckoutPrice(design, product.basePriceKobo, checkout.deliveryMethod);
      const orderNumber = `PW-${nextOrder++}`;
      const now = new Date().toISOString();
      const order: DemoOrder = {
        orderNumber,
        email: checkout.email,
        customerName: checkout.name,
        design: structuredClone(design),
        checkout: structuredClone(checkout),
        subtotalKobo: price.subtotalKobo,
        deliveryKobo: price.deliveryKobo,
        vatKobo: price.vatKobo,
        totalKobo: price.totalKobo,
        paymentResult: "simulated_success",
        status: "paid",
        history: [{ status: "paid", occurredAt: now, note: "Demo payment simulated successfully." }],
        trackingNumber: null,
        declineReason: null,
      };
      orders.set(orderNumber, order);
      return success(cloneOrder(order));
    },

    async findDemoOrder(orderNumber: string, email: string): Promise<DemoResult<DemoOrder>> {
      const normalizedOrderNumber = orderNumber.replace(/\s+/g, "").toUpperCase();
      const order = orders.get(normalizedOrderNumber);
      if (!order || order.email.toLocaleLowerCase() !== email.trim().toLocaleLowerCase()) {
        return failure("order.not_found", "We could not find an order with those details. Check the number and email, then try again.");
      }
      return success(cloneOrder(order));
    },

    async advanceDemoOrder(
      orderNumber: string,
      nextStatus: OrderStatus,
      trackingNumber = "",
    ): Promise<DemoResult<DemoOrder>> {
      const order = orders.get(orderNumber);
      if (!order) {
        return failure("order.not_found", "This demo order could not be found.");
      }
      if (!ORDER_TRANSITIONS[order.status].includes(nextStatus)) {
        return failure("order.invalid_transition", "That status change is not available for this order.");
      }
      if (nextStatus === "shipped" && order.checkout.deliveryMethod !== "pickup" && !trackingNumber.trim()) {
        return failure("order.tracking_required", "Add a tracking number before marking this order as shipped.");
      }
      order.status = nextStatus;
      if (nextStatus === "shipped") {
        order.trackingNumber = trackingNumber.trim() || null;
      }
      order.history.push({
        status: nextStatus,
        occurredAt: new Date().toISOString(),
        note: nextStatus === "refunded" ? "A refund was started in this demo." : "",
      });
      return success(cloneOrder(order));
    },

    async declineDemoOrder(orderNumber: string, reason: string): Promise<DemoResult<DemoOrder>> {
      const order = orders.get(orderNumber);
      if (!order) {
        return failure("order.not_found", "This demo order could not be found.");
      }
      if (order.status !== "paid") {
        return failure("order.invalid_decline", "A printer can only decline an order before production starts.");
      }
      if (reason.trim().length < 10) {
        return failure("order.reason_required", "Write a short reason so the customer knows why the order was declined.");
      }
      const now = new Date().toISOString();
      order.declineReason = reason.trim();
      order.status = "refunded";
      order.history.push(
        { status: "refunded", occurredAt: now, note: `Declined before production: ${order.declineReason}` },
      );
      return success(cloneOrder(order));
    },

    async listRecentOrders(): Promise<DemoResult<DemoOrder[]>> {
      return success(
        [...orders.values()]
          .sort((left, right) => right.history[0].occurredAt.localeCompare(left.history[0].occurredAt))
          .slice(0, 5)
          .map(cloneOrder),
      );
    },

    async resetDemoOrder(orderNumber: string): Promise<DemoResult<DemoOrder>> {
      const order = orders.get(orderNumber);
      if (!order) {
        return failure("order.not_found", "This demo order could not be found.");
      }
      const resetOrder = makeSeedOrder(
        order.orderNumber,
        order.design.productId,
        "paid",
        order.history[0]?.occurredAt ?? new Date().toISOString(),
        order.customerName,
      );
      orders.set(orderNumber, resetOrder);
      return success(cloneOrder(resetOrder));
    },
  };
}

export type DemoStorefrontService = ReturnType<typeof createDemoStorefrontService>;
