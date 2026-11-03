"use client";

import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CATEGORY_LABELS,
  COLOR_LABELS,
  DELIVERY_OPTIONS,
  FINISHES,
  MATERIALS,
  PRODUCTS,
  defaultDesign,
  getProduct,
} from "@/lib/storefront/catalog";
import { createDemoStorefrontService, type DemoStorefrontService } from "@/lib/storefront/mock-service";
import { calculateCheckoutPrice, calculatePrice, formatNaira } from "@/lib/storefront/pricing";
import { validateImageFile } from "@/lib/storefront/uploads";
import type {
  CheckoutDetails,
  DemoIdentity,
  DemoOrder,
  OrderStatus,
  Product,
  ProductCategory,
  ProductColor,
  ProductDesign,
  ProductId,
  ProductSide,
} from "@/lib/storefront/types";
import ProductMockup from "./product-mockup";
import Product3DPreview from "./product-3d-preview";
import styles from "./storefront.module.css";

type View =
  | "store"
  | "editor"
  | "preview"
  | "checkout"
  | "confirm"
  | "lookup"
  | "track"
  | "auth"
  | "account";
type AuthStep = "signin" | "signup" | "verify" | "forgot" | "reset";
type DemoTheme = "light" | "dark";
type DesignMap = Partial<Record<ProductId, Partial<Record<ProductSide, ProductDesign>>>>;

const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT (Abuja)",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Received",
  in_production: "In production",
  shipped: "Shipped",
  delivered: "Delivered",
  refunded: "Refund started",
};

const STATUS_FLOW: OrderStatus[] = ["paid", "in_production", "shipped", "delivered"];

const DECLINE_REASONS = [
  {
    label: "Image resolution too low",
    value:
      "The photo you uploaded is too small to print clearly at this size. Please send a larger version and place the order again.",
  },
  {
    label: "Content we cannot print",
    value: "We cannot print the content of this design. Please contact the shop if you think this is a mistake.",
  },
  {
    label: "Out of stock",
    value: "Sorry, this item is out of stock in the colour and size you chose, so we cannot make it right now.",
  },
];

function priceFor(product: Product, design: ProductDesign) {
  return calculatePrice(design, product.basePriceKobo);
}

function fieldValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function orderLine(order: DemoOrder): string {
  const product = getProduct(order.design.productId);
  return `${product.name}, ${COLOR_LABELS[order.design.color]}, size ${order.design.size}, quantity ${order.design.quantity}`;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

function ProductTile({
  product,
  onChoose,
}: {
  product: Product;
  onChoose: (product: Product) => void;
}) {
  const design = defaultDesign(product.id);
  const price = priceFor(product, design);
  return (
    <article className={styles.productCard}>
      <button
        className={styles.productArtwork}
        type="button"
        onClick={() => onChoose(product)}
        aria-label={`Customize ${product.name}`}
      >
        <ProductMockup product={product} color={design.color} side="front" />
        <span className={styles.artworkLabel}>Made for your idea</span>
      </button>
      <div className={styles.productInfo}>
        <div>
          <p className={styles.productCategory}>{CATEGORY_LABELS[product.category]}</p>
          <h3>{product.name}</h3>
          <p className={styles.productPrice}>From {formatNaira(price.unitKobo)}</p>
        </div>
        <button className={styles.smallPrimary} type="button" onClick={() => onChoose(product)}>
          Customize
        </button>
      </div>
    </article>
  );
}

function PriceLines({
  design,
  product,
  deliveryMethod,
}: {
  design: ProductDesign;
  product: Product;
  deliveryMethod?: CheckoutDetails["deliveryMethod"];
}) {
  const price = deliveryMethod
    ? calculateCheckoutPrice(design, product.basePriceKobo, deliveryMethod)
    : calculateCheckoutPrice(design, product.basePriceKobo, "pickup");
  return (
    <dl className={styles.priceLines}>
      <div>
        <dt>Item subtotal · {design.quantity} {design.quantity === 1 ? "item" : "items"}</dt>
        <dd>{formatNaira(price.subtotalKobo)}</dd>
      </div>
      {deliveryMethod && (
        <div>
          <dt>Delivery</dt>
          <dd>{price.deliveryKobo ? formatNaira(price.deliveryKobo) : "Free"}</dd>
        </div>
      )}
      {deliveryMethod && (
        <div>
          <dt>VAT · demo estimate</dt>
          <dd>{formatNaira(price.vatKobo)}</dd>
        </div>
      )}
      <div className={styles.priceTotal}>
        <dt>Total</dt>
        <dd>{formatNaira(price.totalKobo)}</dd>
      </div>
    </dl>
  );
}

function MockupWithDesign({
  product,
  design,
  className,
}: {
  product: Product;
  design: ProductDesign;
  className?: string;
}) {
  const clipClass = {
    cap: styles.clipCap,
    shirt: styles.clipShirt,
    hoodie: styles.clipShirt,
    tote: styles.clipTote,
    drawstring: styles.clipDrawstring,
  }[product.mockup];
  return (
    <div className={`${styles.mockupStage} ${className ?? ""}`}>
      <ProductMockup product={product} color={design.color} side={design.side} />
      <div className={`${styles.designClip} ${clipClass}`}>
        {design.photoUrl && (
          <span
            className={`${styles.designPhoto} ${design.finish === "Embroidered" ? styles.embroidered : ""}`}
            style={
              {
                "--photo": `url("${design.photoUrl}")`,
                "--photo-x": `${design.photoPosition.x}%`,
                "--photo-y": `${design.photoPosition.y}%`,
                "--photo-size": `${design.photoSize}%`,
              } as CSSProperties
            }
          />
        )}
        {design.text.trim() && (
          <span
            className={`${styles.previewText} ${design.finish === "Embroidered" ? styles.embroidered : ""}`}
            style={
              {
                "--text-color": design.textColor || "var(--sf-ink)",
                "--text-font": design.textFont,
                "--text-weight": design.textBold ? 800 : 600,
              } as CSSProperties
            }
          >
            {design.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function StorefrontExperience() {
  const [service] = useState<DemoStorefrontService>(() => createDemoStorefrontService());
  const [view, setView] = useState<View>("store");
  const [theme, setTheme] = useState<DemoTheme>("light");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogError, setCatalogError] = useState("");
  const [productId, setProductId] = useState<ProductId>("cap");
  const [side, setSide] = useState<ProductSide>("front");
  const [designs, setDesigns] = useState<DesignMap>({ cap: { front: defaultDesign("cap") } });
  const [deliveryMethod, setDeliveryMethod] = useState<CheckoutDetails["deliveryMethod"]>("standard");
  const [checkoutError, setCheckoutError] = useState("");
  const [demoMessage, setDemoMessage] = useState("");
  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<DemoOrder | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupOrderNumber, setLookupOrderNumber] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [identity, setIdentity] = useState<DemoIdentity | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [recentOrders, setRecentOrders] = useState<DemoOrder[]>([]);
  const [declineReason, setDeclineReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingActionError, setTrackingActionError] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageWarning, setImageWarning] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainHeadingRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const product = getProduct(productId);
  const design = designs[productId]?.[side] ?? defaultDesign(productId);
  const unitPrice = priceFor(product, design);
  const productSearchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return products.filter(
      (item) =>
        (category === "all" || item.category === category) &&
        item.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [category, products, query]);

  function updateDesign(next: Partial<ProductDesign>) {
    const sharedOptions: Partial<ProductDesign> = {
      ...(next.color !== undefined ? { color: next.color } : {}),
      ...(next.size !== undefined ? { size: next.size } : {}),
      ...(next.material !== undefined ? { material: next.material } : {}),
      ...(next.finish !== undefined ? { finish: next.finish } : {}),
      ...(next.quantity !== undefined ? { quantity: next.quantity } : {}),
    };
    const hasSharedOptions = Object.keys(sharedOptions).length > 0;
    const oppositeSide = side === "front" ? "back" : "front";

    setDesigns((current) => {
      const productDesigns = current[productId] ?? {};
      const currentDesign = productDesigns[side] ?? defaultDesign(productId);
      const oppositeDesign = productDesigns[oppositeSide] ?? defaultDesign(productId);

      return {
        ...current,
        [productId]: {
          ...productDesigns,
          [side]: { ...currentDesign, ...next },
          ...(product.hasBackView && hasSharedOptions
            ? { [oppositeSide]: { ...oppositeDesign, ...sharedOptions } }
            : {}),
        },
      };
    });
  }

  function changeView(nextView: View) {
    setView(nextView);
    setMobileMenuOpen(false);
    setDemoMessage("");
  }

  function openEditor(nextProduct: Product) {
    setProductId(nextProduct.id);
    setSide("front");
    setImageError("");
    setImageWarning("");
    changeView("editor");
  }

  function openPreview() {
    if (!design.photoUrl && !design.text.trim()) {
      setImageError("Upload a photo or add text before reviewing your design.");
      return;
    }
    if (design.quantity < unitPrice.minimumQuantity) {
      setImageError(`This finish needs at least ${unitPrice.minimumQuantity} units.`);
      return;
    }
    setImageError("");
    changeView("preview");
  }

  function beginCheckout() {
    setCheckoutError("");
    setDeliveryError("");
    changeView("checkout");
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutError("");
    const values = new FormData(event.currentTarget);
    const checkout: CheckoutDetails = {
      name: fieldValue(values, "name"),
      email: fieldValue(values, "email"),
      phone: fieldValue(values, "phone"),
      addressLine1: fieldValue(values, "addressLine1"),
      addressLine2: fieldValue(values, "addressLine2"),
      city: fieldValue(values, "city"),
      state: fieldValue(values, "state"),
      deliveryMethod,
      designApproved: values.get("designApproved") === "on",
    };
    const result = await service.createDemoOrder(design, checkout);
    if (!result.ok) {
      setCheckoutError(result.error.message);
      return;
    }
    setOrder(result.data);
    setTrackedOrder(result.data);
    setIdentity(service.getIdentity());
    changeView("confirm");
  }

  async function searchOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupError("");
    const result = await service.findDemoOrder(lookupOrderNumber, lookupEmail);
    if (!result.ok) {
      setLookupError(result.error.message);
      return;
    }
    setTrackedOrder(result.data);
    setTrackingActionError("");
    setShowDeclineForm(false);
    changeView("track");
  }

  async function advanceTrackedOrder() {
    if (!trackedOrder) return;
    setTrackingActionError("");
    const nextStatusByCurrent: Partial<Record<OrderStatus, OrderStatus>> = {
      paid: "in_production",
      in_production: "shipped",
      shipped: "delivered",
    };
    const nextStatus = nextStatusByCurrent[trackedOrder.status];
    if (!nextStatus) {
      setTrackingActionError("There are no more demo status changes for this order.");
      return;
    }
    const result = await service.advanceDemoOrder(
      trackedOrder.orderNumber,
      nextStatus,
      trackingNumber,
    );
    if (!result.ok) {
      setTrackingActionError(result.error.message);
      return;
    }
    setTrackedOrder(result.data);
    setTrackingNumber("");
  }

  async function declineTrackedOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trackedOrder) return;
    setTrackingActionError("");
    const result = await service.declineDemoOrder(trackedOrder.orderNumber, declineReason);
    if (!result.ok) {
      setTrackingActionError(result.error.message);
      return;
    }
    setTrackedOrder(result.data);
    setShowDeclineForm(false);
    setDeclineReason("");
  }

  async function resetTrackedOrder() {
    if (!trackedOrder) return;
    setTrackingActionError("");
    const result = await service.resetDemoOrder(trackedOrder.orderNumber);
    if (!result.ok) {
      setTrackingActionError(result.error.message);
      return;
    }
    setTrackedOrder(result.data);
    setShowDeclineForm(false);
    setTrackingNumber("");
  }

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    const values = new FormData(event.currentTarget);
    const email = fieldValue(values, "email");
    const password = fieldValue(values, "password");
    const result = await service.signInDemo(email, password);
    event.currentTarget.reset();
    if (!result.ok) {
      setAuthError(result.error.message);
      return;
    }
    setIdentity(result.data);
    setAuthEmail(result.data.email);
    setAuthNotice("You are signed in to this demo only. Your sign in is not saved.");
    changeView("account");
  }

  async function submitSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    const values = new FormData(event.currentTarget);
    const email = fieldValue(values, "email");
    const result = await service.signUpDemo(
      fieldValue(values, "firstName"),
      email,
      fieldValue(values, "password"),
      values.get("terms") === "on",
    );
    event.currentTarget.reset();
    if (!result.ok) {
      setAuthError(result.error.message);
      return;
    }
    setAuthEmail(email);
    setAuthStep("verify");
    setAuthNotice("This is a demo. Use any six digit code to continue.");
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const values = new FormData(event.currentTarget);
    const result = await service.verifyDemoCode(authEmail, fieldValue(values, "code"));
    event.currentTarget.reset();
    if (!result.ok) {
      setAuthError(result.error.message);
      return;
    }
    setIdentity(result.data);
    setAuthNotice("Your demo account is ready. No real account was created.");
    changeView("account");
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const values = new FormData(event.currentTarget);
    const email = fieldValue(values, "email");
    const result = await service.requestDemoPasswordReset(email);
    event.currentTarget.reset();
    if (!result.ok) {
      setAuthError(result.error.message);
      return;
    }
    setAuthEmail(email);
    setAuthStep("reset");
    setAuthNotice("Demo only. Use any six digit code to continue.");
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const values = new FormData(event.currentTarget);
    const result = await service.resetDemoPassword(
      authEmail,
      fieldValue(values, "code"),
      fieldValue(values, "password"),
    );
    event.currentTarget.reset();
    if (!result.ok) {
      setAuthError(result.error.message);
      return;
    }
    setIdentity(result.data);
    setAuthNotice("Your demo password was checked, not changed or stored.");
    changeView("account");
  }

  async function signOut() {
    await service.signOutDemo();
    setIdentity(null);
    setAuthNotice("");
    changeView("store");
  }

  async function loadRecentOrders() {
    const result = await service.listRecentOrders();
    if (result.ok) {
      setRecentOrders(result.data);
      setDemoMessage("");
    } else {
      setDemoMessage(result.error.message);
    }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setImageError("");
    setImageWarning("");
    const nextUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(nextUrl);
    const image = new Image();
    image.onload = () => {
      const validation = validateImageFile(file, image.naturalWidth, image.naturalHeight);
      if (!validation.ok) {
        URL.revokeObjectURL(nextUrl);
        objectUrlsRef.current.delete(nextUrl);
        setImageError(validation.message);
        return;
      }
      if (design.photoUrl && objectUrlsRef.current.has(design.photoUrl)) {
        URL.revokeObjectURL(design.photoUrl);
        objectUrlsRef.current.delete(design.photoUrl);
      }
      updateDesign({
        photoUrl: nextUrl,
        photoWidth: image.naturalWidth,
        photoHeight: image.naturalHeight,
      });
      setImageWarning(validation.warning ?? "");
    };
    image.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      objectUrlsRef.current.delete(nextUrl);
      setImageError("We could not open that image. Choose a different PNG, JPEG, or WebP file.");
    };
    image.src = nextUrl;
  }

  function handlePhotoPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canvasRef.current || !design.photoUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: design.photoPosition.x,
      originY: design.photoPosition.y,
    };
  }

  function handlePhotoPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    const size = design.photoSize;
    const deltaX = (event.clientX - drag.startX) / canvas.clientWidth * 100;
    const deltaY = (event.clientY - drag.startY) / canvas.clientHeight * 100;
    const half = size / 2;
    updateDesign({
      photoPosition: {
        x: Math.max(half, Math.min(100 - half, drag.originX + deltaX)),
        y: Math.max(half, Math.min(100 - half, drag.originY + deltaY)),
      },
    });
  }

  function stopPhotoDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handlePhotoKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const change = event.shiftKey ? 5 : 1;
    updateDesign({
      photoPosition: {
        x: Math.max(0, Math.min(100, design.photoPosition.x + (event.key === "ArrowRight" ? change : event.key === "ArrowLeft" ? -change : 0))),
        y: Math.max(0, Math.min(100, design.photoPosition.y + (event.key === "ArrowDown" ? change : event.key === "ArrowUp" ? -change : 0))),
      },
    });
  }

  useEffect(() => {
    let active = true;
    service.listProducts("all", "").then((result) => {
      if (!active) return;
      if (!result.ok) {
        setCatalogError(result.error.message);
        setCatalogState("error");
        return;
      }
      setProducts(result.data);
      setCatalogError("");
      setCatalogState("ready");
    });
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    if (view === "account") {
      service.listRecentOrders().then((result) => {
        if (result.ok) {
          setRecentOrders(result.data);
          setDemoMessage("");
        } else {
          setDemoMessage(result.error.message);
        }
      });
    }
    if (view === "store" || view === "editor" || view === "preview") {
      requestAnimationFrame(() => mainHeadingRef.current?.focus());
    }
  }, [service, view]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
    },
    [],
  );

  function renderHeader() {
    const backLabel: Partial<Record<View, string>> = {
      editor: "Back to shop",
      preview: "Edit design",
      checkout: "Back to preview",
      lookup: "Back to shop",
      track: "Back to shop",
      auth: "Back",
      account: "Back to shop",
    };
    const backAction = () => {
      if (view === "editor" || view === "lookup" || view === "track" || view === "account") {
        changeView("store");
      } else if (view === "preview") {
        changeView("editor");
      } else if (view === "checkout") {
        changeView("preview");
      } else if (view === "auth") {
        setAuthError("");
        changeView("store");
      }
    };
    return (
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          {backLabel[view] ? (
            <button type="button" className={styles.backButton} onClick={backAction}>
              <span aria-hidden="true">←</span> {backLabel[view]}
            </button>
          ) : (
            <button type="button" className={styles.brand} onClick={() => changeView("store")}>
              <span className={styles.brandMark} aria-hidden="true">M</span>
              <span>Mike&apos;s Print Shop</span>
            </button>
          )}
          {(view === "editor" || view === "preview" || view === "checkout") && (
            <span className={styles.breadcrumb}>{product.name}</span>
          )}
        </div>
        <nav className={`${styles.navActions} ${mobileMenuOpen ? styles.navOpen : ""}`} aria-label="Shop">
          {(view === "store" || view === "lookup" || view === "track" || view === "account") && (
            <button type="button" className={styles.navLink} onClick={() => {
              setLookupError("");
              setLookupOrderNumber("");
              setLookupEmail("");
              changeView("lookup");
            }}>
              Track an order
            </button>
          )}
          <button
            type="button"
            className={styles.navLink}
            onClick={() => {
              if (identity) changeView("account");
              else {
                setAuthStep("signin");
                setAuthError("");
                changeView("auth");
              }
            }}
          >
            {identity ? identity.displayName : "Sign in"}
          </button>
          <div className={styles.themeControl} role="group" aria-label="Color theme">
            <button
              type="button"
              aria-pressed={theme === "light"}
              className={theme === "light" ? styles.themeActive : ""}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              type="button"
              aria-pressed={theme === "dark"}
              className={theme === "dark" ? styles.themeActive : ""}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
          </div>
        </nav>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close shop menu" : "Open shop menu"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{mobileMenuOpen ? "×" : "☰"}</span>
        </button>
      </header>
    );
  }

  function renderProgress(step: number) {
    const labels = ["Upload", "Customize", "Specs", "Preview", "Order"];
    return (
      <div className={styles.progress} aria-label={`Customization step ${step + 1} of ${labels.length}: ${labels[step]}`}>
        <div className={styles.progressDots} aria-hidden="true">
          {labels.map((label, index) => (
            <span
              key={label}
              className={`${styles.progressDot} ${index < step ? styles.progressDone : ""} ${index === step ? styles.progressCurrent : ""}`}
            />
          ))}
        </div>
        <p>{labels[step]}</p>
      </div>
    );
  }

  function renderStore() {
    return (
      <>
        <section className={styles.hero} aria-labelledby="store-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>MADE FOR YOUR NEXT BIG IDEA</p>
            <h1 id="store-title" ref={mainHeadingRef} tabIndex={-1}>Your design, printed right.</h1>
            <p>Turn your photo into something you can wear, carry, and keep.</p>
            <button
              className={styles.heroButton}
              type="button"
              onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
            >
              Explore products <span aria-hidden="true">↓</span>
            </button>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroOrb} />
            <ProductMockup product={getProduct("tee")} color="forest" side="front" />
            <div className={styles.heroNote}>Your idea<br />belongs here.</div>
          </div>
          <div className={styles.heroTrust}>
            <span><b>01</b> Choose a product</span>
            <span><b>02</b> Make it yours</span>
            <span><b>03</b> We make it real</span>
          </div>
        </section>

        <section className={styles.catalog} id="catalog" aria-labelledby="catalog-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>THE GOOD STUFF</p>
              <h2 id="catalog-title">Pick a product to customize</h2>
              <p>Start with a favourite. Make the rest your own.</p>
            </div>
            <label className={styles.searchBox}>
              <span className={styles.srOnly}>Search products</span>
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
            </label>
          </div>
          <div className={styles.categoryRow} role="group" aria-label="Filter products by category">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={category === key}
                className={`${styles.categoryButton} ${category === key ? styles.categoryActive : ""}`}
                onClick={() => setCategory(key as ProductCategory | "all")}
              >
                {label}
              </button>
            ))}
            <span className={styles.productCount} aria-live="polite">
              {catalogState === "ready" ? `${productSearchResults.length} products` : ""}
            </span>
          </div>
          {catalogState === "loading" && (
            <div className={styles.productGrid} aria-label="Loading products" aria-busy="true">
              {PRODUCTS.slice(0, 3).map((item) => <div key={item.id} className={styles.productSkeleton} />)}
            </div>
          )}
          {catalogState === "error" && (
            <div className={styles.emptyState} role="alert">
              <h3>We could not load the demo products.</h3>
              <p>{catalogError}</p>
              <button className={styles.smallPrimary} type="button" onClick={() => {
                setCatalogState("loading");
                service.listProducts("all", "").then((result) => {
                  if (result.ok) {
                    setProducts(result.data);
                    setCatalogState("ready");
                  } else {
                    setCatalogError(result.error.message);
                    setCatalogState("error");
                  }
                });
              }}>Try again</button>
            </div>
          )}
          {catalogState === "ready" && productSearchResults.length > 0 && (
            <div className={styles.productGrid}>
              {productSearchResults.map((item) => <ProductTile key={item.id} product={item} onChoose={openEditor} />)}
            </div>
          )}
          {catalogState === "ready" && productSearchResults.length === 0 && (
            <div className={styles.emptyState}>
              <h3>No products found</h3>
              <p>Try a different search or choose another category.</p>
              <button className={styles.smallSecondary} type="button" onClick={() => {
                setQuery("");
                setCategory("all");
              }}>Show all products</button>
            </div>
          )}
        </section>
        <footer className={styles.footer}>
          <p><span className={styles.brandMark} aria-hidden="true">M</span> Made with care in Lagos.</p>
          <span>Presswise storefront preview</span>
        </footer>
      </>
    );
  }

  function renderEditor() {
    const colorSelected = design.color;
    const previewSize = Math.max(15, design.photoSize);
    return (
      <>
        {renderProgress(1)}
        <section className={styles.flowIntro}>
          <p className={styles.eyebrow}>MAKE IT YOURS</p>
          <h1 id="editor-title" ref={mainHeadingRef} tabIndex={-1}>Customize your product</h1>
          <p>Place your artwork, choose your details, and make something that feels like you.</p>
        </section>
        <div className={styles.editorLayout}>
          <section className={styles.panel} aria-labelledby="editor-canvas-title">
            <div className={styles.panelHeading}>
              <div>
                <h2 id="editor-canvas-title">{product.name}</h2>
                <p>Drag the photo to position it, or use the controls below.</p>
              </div>
              <span className={styles.demoBadge}>DESIGN PREVIEW</span>
            </div>
            <div className={styles.productTabs} role="group" aria-label="Choose a product">
              {PRODUCTS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={item.id === productId}
                  className={item.id === productId ? styles.productTabActive : ""}
                  onClick={() => {
                    setProductId(item.id);
                    setSide("front");
                    setImageError("");
                    setImageWarning("");
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <div className={styles.editorCanvas} ref={canvasRef} data-product={product.mockup}>
              <ProductMockup product={product} color={design.color} side={side} />
              <div className={`${styles.designClip} ${{
                cap: styles.clipCap,
                shirt: styles.clipShirt,
                hoodie: styles.clipShirt,
                tote: styles.clipTote,
                drawstring: styles.clipDrawstring,
              }[product.mockup]}`}>
                {design.photoUrl ? (
                  <div
                    className={`${styles.designHandle} ${design.finish === "Embroidered" ? styles.embroidered : ""}`}
                    role="group"
                    tabIndex={0}
                    aria-label="Uploaded photo. Use the arrow keys to move it. Hold Shift to move further."
                    onKeyDown={handlePhotoKeyDown}
                    onPointerDown={handlePhotoPointerDown}
                    onPointerMove={handlePhotoPointerMove}
                    onPointerUp={stopPhotoDrag}
                    onPointerCancel={stopPhotoDrag}
                    style={{
                      left: `${design.photoPosition.x}%`,
                      top: `${design.photoPosition.y}%`,
                      width: `${previewSize}%`,
                      aspectRatio: "1",
                      backgroundImage: `url("${design.photoUrl}")`,
                    }}
                  />
                ) : (
                  <div className={styles.emptyArt}>
                    <span aria-hidden="true">✦</span>
                    <b>Your artwork goes here</b>
                    <small>Upload a photo to get started</small>
                  </div>
                )}
                {design.text.trim() && (
                  <span
                    className={`${styles.editorText} ${design.finish === "Embroidered" ? styles.embroidered : ""}`}
                    style={{
                      color: design.textColor || "var(--sf-ink)",
                      fontFamily: design.textFont,
                      fontWeight: design.textBold ? 800 : 600,
                    }}
                  >
                    {design.text}
                  </span>
                )}
              </div>
              <div className={styles.printGuide} aria-hidden="true"><span>PRINT AREA</span></div>
            </div>
            <div className={styles.canvasToolbar}>
              <label className={styles.uploadButton}>
                <span aria-hidden="true">↑</span> Upload photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    void uploadImage(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <button className={styles.smallSecondary} type="button" onClick={() => updateDesign({ photoPosition: { x: 50, y: 48 } })}>
                Center design
              </button>
              {product.hasBackView && (
                <button className={styles.smallSecondary} type="button" onClick={() => setSide(side === "front" ? "back" : "front")}>
                  Flip to {side === "front" ? "back" : "front"}
                </button>
              )}
            </div>
            <div className={styles.designSliders}>
              <label>
                <span>Design size <output>{design.photoSize}%</output></span>
                <input
                  type="range"
                  min="15"
                  max="90"
                  value={design.photoSize}
                  onChange={(event) => updateDesign({ photoSize: Number(event.target.value) })}
                  aria-label="Design size"
                />
              </label>
              <label>
                <span>Move horizontally <output>{Math.round(design.photoPosition.x)}%</output></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={design.photoPosition.x}
                  onChange={(event) => updateDesign({ photoPosition: { ...design.photoPosition, x: Number(event.target.value) } })}
                  aria-label="Move design horizontally"
                />
              </label>
              <label>
                <span>Move vertically <output>{Math.round(design.photoPosition.y)}%</output></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={design.photoPosition.y}
                  onChange={(event) => updateDesign({ photoPosition: { ...design.photoPosition, y: Number(event.target.value) } })}
                  aria-label="Move design vertically"
                />
              </label>
            </div>
            {imageError && <p className={styles.errorMessage} role="alert">{imageError}</p>}
            {imageWarning && <p className={styles.warningMessage} role="status">{imageWarning}</p>}
          </section>

          <aside className={styles.panel} aria-labelledby="options-title">
            <div className={styles.panelHeading}>
              <div>
                <h2 id="options-title">Make the details yours</h2>
                <p>Choose your fit, colour, and finish.</p>
              </div>
            </div>
            <fieldset className={styles.optionGroup}>
              <legend>Color <span>{COLOR_LABELS[colorSelected]}</span></legend>
              <div className={styles.swatches}>
                {product.colors.map((color: ProductColor) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={COLOR_LABELS[color]}
                    aria-pressed={design.color === color}
                    title={COLOR_LABELS[color]}
                    className={`${styles.swatch} ${design.color === color ? styles.swatchSelected : ""}`}
                    data-color={color}
                    onClick={() => updateDesign({ color })}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.optionGroup}>
              <legend>Size</legend>
              <div className={styles.pillRow}>
                {product.sizes.map((size) => (
                  <button
                    type="button"
                    key={size}
                    aria-pressed={design.size === size}
                    className={`${styles.optionPill} ${design.size === size ? styles.optionPillSelected : ""}`}
                    onClick={() => updateDesign({ size })}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.optionGroup}>
              <legend>Material</legend>
              <div className={styles.optionCards}>
                {MATERIALS.map((material) => (
                  <button
                    type="button"
                    key={material.name}
                    aria-pressed={design.material === material.name}
                    className={`${styles.optionCard} ${design.material === material.name ? styles.optionCardSelected : ""}`}
                    onClick={() => updateDesign({ material: material.name })}
                  >
                    <span>{material.name}</span>
                    <small>{material.addKobo ? `+${formatNaira(material.addKobo)}` : "Included"}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.optionGroup}>
              <legend>Finish</legend>
              <div className={styles.optionCards}>
                {FINISHES.map((finish) => (
                  <button
                    type="button"
                    key={finish.name}
                    aria-pressed={design.finish === finish.name}
                    className={`${styles.optionCard} ${design.finish === finish.name ? styles.optionCardSelected : ""}`}
                    onClick={() => updateDesign({ finish: finish.name })}
                  >
                    <span>{finish.name}</span>
                    <small>
                      {finish.addKobo ? `+${formatNaira(finish.addKobo)} · MOQ ${finish.minimumQuantity}` : "Included"}
                    </small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.optionGroup}>
              <legend>Quantity</legend>
              <div className={styles.quantityControl}>
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => updateDesign({ quantity: Math.max(1, design.quantity - 1) })}
                >
                  −
                </button>
                <output aria-live="polite">{design.quantity}</output>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => updateDesign({ quantity: design.quantity + 1 })}
                >
                  +
                </button>
                {design.quantity >= 10 && <span className={styles.bulkTag}>Bulk price applied</span>}
              </div>
              {design.quantity < unitPrice.minimumQuantity && (
                <p className={styles.warningMessage} role="status">
                  This finish needs at least {unitPrice.minimumQuantity} units.
                </p>
              )}
            </fieldset>
            <fieldset className={styles.optionGroup}>
              <legend>Add your own text <span>Optional</span></legend>
              <label className={styles.fieldLabel} htmlFor="design-text">Text on your product</label>
              <input
                id="design-text"
                className={styles.textInput}
                maxLength={40}
                value={design.text}
                onChange={(event) => updateDesign({ text: event.target.value })}
                placeholder="A name, phrase, or number"
              />
              <div className={styles.textOptions}>
                <label className={styles.fieldLabel} htmlFor="design-font">Typeface</label>
                <select
                  id="design-font"
                  className={styles.textInput}
                  value={design.textFont}
                  onChange={(event) => updateDesign({ textFont: event.target.value })}
                >
                  <option value="sans-serif">Clean sans</option>
                  <option value="Georgia, serif">Classic serif</option>
                  <option value="monospace">Typewriter</option>
                  <option value="cursive">Script style</option>
                  <option value="Impact, sans-serif">Heavy block</option>
                </select>
                <label className={styles.fieldLabel} htmlFor="design-text-color">Text color</label>
                <input
                  id="design-text-color"
                  className={styles.colorInput}
                  type="color"
                  value={design.textColor || "#ffffff"}
                  onChange={(event) => updateDesign({ textColor: event.target.value })}
                  aria-label="Text color"
                />
                <button
                  className={`${styles.boldButton} ${design.textBold ? styles.boldActive : ""}`}
                  type="button"
                  aria-pressed={design.textBold}
                  onClick={() => updateDesign({ textBold: !design.textBold })}
                >
                  B
                  <span className={styles.srOnly}>Toggle bold text</span>
                </button>
              </div>
            </fieldset>
            <div className={styles.editorPrice}>
              <div>
                <span>{formatNaira(unitPrice.unitKobo)} each</span>
                <strong>{formatNaira(unitPrice.subtotalKobo)}</strong>
              </div>
              <p>Price shown for this demo. Final prices are set by each printer.</p>
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={design.quantity < unitPrice.minimumQuantity}
              onClick={openPreview}
            >
              Preview and order <span aria-hidden="true">→</span>
            </button>
          </aside>
        </div>
      </>
    );
  }

  function renderPreview() {
    return (
      <>
        {renderProgress(3)}
        <section className={styles.flowIntro}>
          <p className={styles.eyebrow}>ONE LAST LOOK</p>
          <h1 id="preview-title" ref={mainHeadingRef} tabIndex={-1}>Review your design</h1>
          <p>Check the details before you move on to the demo checkout.</p>
        </section>
        <div className={styles.reviewLayout}>
          <section className={styles.panel} aria-label="Product preview">
            <Product3DPreview
              product={product}
              frontDesign={designs[productId]?.front ?? defaultDesign(productId)}
              backDesign={designs[productId]?.back ?? defaultDesign(productId)}
              side={side}
              onSideChange={(nextSide) => {
                if (!product.hasBackView) return;
                setDesigns((current) => {
                  const productDesigns = current[productId] ?? {};
                  const nextDesign = productDesigns[nextSide] ?? defaultDesign(productId);
                  return {
                    ...current,
                    [productId]: {
                      ...productDesigns,
                      [nextSide]: {
                        ...nextDesign,
                        color: design.color,
                        size: design.size,
                        material: design.material,
                        finish: design.finish,
                        quantity: design.quantity,
                      },
                    },
                  };
                });
                setSide(nextSide);
              }}
            />
            <p className={styles.demoCaption}>This is an illustrative preview, the printer confirms the final artwork.</p>
          </section>
          <aside className={styles.panel} aria-labelledby="review-summary-title">
            <h2 id="review-summary-title">Your order summary</h2>
            <p className={styles.summaryProduct}>{product.name}</p>
            <dl className={styles.detailList}>
              <div><dt>Color</dt><dd>{COLOR_LABELS[design.color]}</dd></div>
              <div><dt>Size</dt><dd>{design.size}</dd></div>
              <div><dt>Material</dt><dd>{design.material}</dd></div>
              <div><dt>Finish</dt><dd>{design.finish}</dd></div>
              <div><dt>Quantity</dt><dd>{design.quantity}</dd></div>
              <div><dt>Design</dt><dd>{design.photoUrl ? "Uploaded photo" : "Custom text"}</dd></div>
            </dl>
            <PriceLines design={design} product={product} />
            <button className={styles.primaryButton} type="button" onClick={beginCheckout}>
              Continue to demo checkout <span aria-hidden="true">→</span>
            </button>
            <button className={styles.fullSecondary} type="button" onClick={() => changeView("editor")}>Edit design</button>
          </aside>
        </div>
      </>
    );
  }

  function renderCheckout() {
    const checkoutPrice = calculateCheckoutPrice(design, product.basePriceKobo, deliveryMethod);
    return (
      <>
        {renderProgress(4)}
        <section className={styles.flowIntro}>
          <p className={styles.eyebrow}>DEMO CHECKOUT</p>
          <h1 id="checkout-title" ref={mainHeadingRef} tabIndex={-1}>Where should we send it?</h1>
          <p>Your details stay in this page only. This demo will not place a real order or charge you.</p>
        </section>
        <div className={styles.checkoutLayout}>
          <form className={styles.panel} onSubmit={(event) => void submitCheckout(event)}>
            <div className={styles.demoNotice} role="note">
              <strong>Prototype only.</strong> No real payment will be taken. Please use test details.
            </div>
            <fieldset className={styles.formSet}>
              <legend>Contact details</legend>
              <label className={styles.fieldLabel} htmlFor="checkout-name">Full name</label>
              <input className={styles.textInput} id="checkout-name" name="name" autoComplete="name" required />
              <div className={styles.twoColumns}>
                <div>
                  <label className={styles.fieldLabel} htmlFor="checkout-email">Email</label>
                  <input className={styles.textInput} id="checkout-email" name="email" type="email" autoComplete="email" required />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor="checkout-phone">Phone number</label>
                  <input className={styles.textInput} id="checkout-phone" name="phone" type="tel" autoComplete="tel" placeholder="0803 123 4567" required />
                </div>
              </div>
            </fieldset>
            <fieldset className={styles.formSet}>
              <legend>How would you like to get it?</legend>
              <div className={styles.deliveryOptions}>
                {Object.entries(DELIVERY_OPTIONS).map(([key, option]) => (
                  <label key={key} className={`${styles.deliveryOption} ${deliveryMethod === key ? styles.deliverySelected : ""}`}>
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value={key}
                      checked={deliveryMethod === key}
                      onChange={() => {
                        setDeliveryMethod(key as CheckoutDetails["deliveryMethod"]);
                        setDeliveryError("");
                      }}
                    />
                    <span className={styles.deliveryCopy}>
                      <strong>{option.label}</strong>
                      <small>{option.timing}</small>
                    </span>
                    <b>{option.feeKobo ? formatNaira(option.feeKobo) : "Free"}</b>
                  </label>
                ))}
              </div>
              {deliveryMethod !== "pickup" && (
                <div className={styles.addressFields}>
                  <label className={styles.fieldLabel} htmlFor="checkout-address">Street address</label>
                  <input className={styles.textInput} id="checkout-address" name="addressLine1" autoComplete="address-line1" required />
                  <label className={styles.fieldLabel} htmlFor="checkout-address2">Apartment, landmark, etc. <span>Optional</span></label>
                  <input className={styles.textInput} id="checkout-address2" name="addressLine2" autoComplete="address-line2" />
                  <div className={styles.twoColumns}>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="checkout-city">City or town</label>
                      <input className={styles.textInput} id="checkout-city" name="city" autoComplete="address-level2" required />
                    </div>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="checkout-state">State</label>
                      <select className={styles.textInput} id="checkout-state" name="state" autoComplete="address-level1" required defaultValue="">
                        <option value="" disabled>Select state</option>
                        {NIGERIAN_STATES.map((stateName) => <option key={stateName}>{stateName}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <p className={styles.smallNote}>Demo delivery rates are placeholders. Each printer sets their own.</p>
            </fieldset>
            <label className={styles.approvalCheck}>
              <input type="checkbox" name="designApproved" required />
              <span>I have reviewed the preview and approve it for printing.</span>
            </label>
            {deliveryError && <p className={styles.errorMessage} role="alert">{deliveryError}</p>}
            {checkoutError && <p className={styles.errorMessage} role="alert">{checkoutError}</p>}
            <button className={styles.primaryButton} type="submit">Simulate payment and place demo order</button>
            <p className={styles.smallNote}>No card details are requested, and Paystack is not contacted.</p>
          </form>
          <aside className={`${styles.panel} ${styles.checkoutSummary}`} aria-labelledby="checkout-summary-title">
            <h2 id="checkout-summary-title">Your order</h2>
            <div className={styles.checkoutItem}>
              <MockupWithDesign product={product} design={design} className={styles.miniPreview} />
              <div><strong>{product.name}</strong><span>{orderLine({
                orderNumber: "",
                email: "",
                customerName: "",
                design,
                checkout: { name: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", deliveryMethod, designApproved: false },
                subtotalKobo: 0,
                deliveryKobo: 0,
                vatKobo: 0,
                totalKobo: 0,
                paymentResult: "simulated_success",
                status: "paid",
                history: [],
                trackingNumber: null,
                declineReason: null,
              })}</span></div>
            </div>
            <dl className={styles.priceLines}>
              <div><dt>Subtotal</dt><dd>{formatNaira(checkoutPrice.subtotalKobo)}</dd></div>
              <div><dt>Delivery</dt><dd>{checkoutPrice.deliveryKobo ? formatNaira(checkoutPrice.deliveryKobo) : "Free"}</dd></div>
              <div><dt>VAT · demo estimate</dt><dd>{formatNaira(checkoutPrice.vatKobo)}</dd></div>
              <div className={styles.priceTotal}><dt>Total</dt><dd>{formatNaira(checkoutPrice.totalKobo)}</dd></div>
            </dl>
            <p className={styles.smallNote}>VAT and delivery are illustrative demo amounts only.</p>
          </aside>
        </div>
      </>
    );
  }

  function renderConfirmation() {
    if (!order) return null;
    return (
      <section className={styles.confirmWrap}>
        <div className={styles.successMark} aria-hidden="true">✓</div>
        <p className={styles.eyebrow}>DEMO ORDER COMPLETE</p>
        <h1 id="confirmation-title" ref={mainHeadingRef} tabIndex={-1}>Your design is on its way.</h1>
        <p className={styles.orderNumber}>{order.orderNumber}</p>
        <p className={styles.confirmCopy}>
          We simulated a successful payment for {order.customerName}. No real payment was made.
        </p>
        <OrderProgress status={order.status} />
        <div className={styles.panel}>
          <div className={styles.checkoutItem}>
            <MockupWithDesign product={getProduct(order.design.productId)} design={order.design} className={styles.miniPreview} />
            <div>
              <strong>{getProduct(order.design.productId).name}</strong>
              <span>{COLOR_LABELS[order.design.color]} · {order.design.size} · Qty {order.design.quantity}</span>
              <b>{formatNaira(order.totalKobo)}</b>
            </div>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Delivery</dt><dd>{DELIVERY_OPTIONS[order.checkout.deliveryMethod].label}</dd></div>
            <div><dt>Email</dt><dd>{order.email}</dd></div>
            <div><dt>Payment</dt><dd>Simulated success</dd></div>
          </dl>
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} type="button" onClick={() => {
            setTrackedOrder(order);
            changeView("track");
          }}>Track this demo order</button>
          <button className={styles.smallSecondary} type="button" onClick={() => changeView("store")}>Continue shopping</button>
        </div>
      </section>
    );
  }

  function renderLookup() {
    return (
      <section className={styles.narrowPage}>
        <p className={styles.eyebrow}>RIGHT WHERE YOU LEFT IT</p>
        <h1 id="lookup-title" ref={mainHeadingRef} tabIndex={-1}>Track your order</h1>
        <p>Enter your order number and the email used at checkout.</p>
        <form className={styles.panel} onSubmit={(event) => void searchOrder(event)}>
          <div className={styles.demoNotice}><strong>Demo orders only.</strong> Try PW-10001 to PW-10004 with demo@example.com.</div>
          <label className={styles.fieldLabel} htmlFor="lookup-order">Order number</label>
          <input
            className={styles.textInput}
            id="lookup-order"
            value={lookupOrderNumber}
            onChange={(event) => setLookupOrderNumber(event.target.value)}
            placeholder="PW-10001"
            autoComplete="off"
            required
          />
          <label className={styles.fieldLabel} htmlFor="lookup-email">Email</label>
          <input
            className={styles.textInput}
            id="lookup-email"
            type="email"
            value={lookupEmail}
            onChange={(event) => setLookupEmail(event.target.value)}
            autoComplete="email"
            required
          />
          {lookupError && <p className={styles.errorMessage} role="alert">{lookupError}</p>}
          <button className={styles.primaryButton} type="submit">Find demo order</button>
          <button className={styles.fullSecondary} type="button" onClick={() => changeView("store")}>Back to shop</button>
        </form>
      </section>
    );
  }

  function renderTracking(orderToShow: DemoOrder) {
    const currentStatusIndex = STATUS_FLOW.indexOf(orderToShow.status);
    const canAdvance = ["paid", "in_production", "shipped"].includes(orderToShow.status);
    return (
      <>
        <div className={styles.trackingLayout}>
          <section className={styles.panel} aria-labelledby="tracking-title">
            <div className={styles.trackingHeader}>
              <div>
                <p className={styles.orderNumber}>{orderToShow.orderNumber}</p>
                <h1 id="tracking-title" ref={mainHeadingRef} tabIndex={-1}>
                  {orderToShow.status === "refunded" ? "Your order was declined" : `Order ${STATUS_LABELS[orderToShow.status].toLowerCase()}`}
                </h1>
                <p>Placed {shortDate(orderToShow.history[0].occurredAt)}</p>
              </div>
              <span className={styles.statusBadge}>{STATUS_LABELS[orderToShow.status]}</span>
            </div>
            {orderToShow.status === "refunded" ? (
              <div className={styles.refundNotice}>
                <strong>Refund started</strong>
                <p>{orderToShow.declineReason || "This order was declined before production."}</p>
              </div>
            ) : (
              <OrderProgress status={orderToShow.status} />
            )}
            {orderToShow.trackingNumber && (
              <div className={styles.trackingNumber}>
                <span>Tracking number</span>
                <strong>{orderToShow.trackingNumber}</strong>
              </div>
            )}
            <h2 className={styles.subheading}>Order history</h2>
            <ol className={styles.timeline}>
              {[...orderToShow.history].reverse().map((item, index) => (
                <li key={`${item.status}-${item.occurredAt}`}>
                  <span className={styles.timelineDot} aria-hidden="true">{index === 0 ? "✓" : ""}</span>
                  <div>
                    <strong>{STATUS_LABELS[item.status]}</strong>
                    <time dateTime={item.occurredAt}>{shortDate(item.occurredAt)}</time>
                    {item.note && <p>{item.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <aside className={styles.panel} aria-labelledby="track-details-title">
            <h2 id="track-details-title">Order details</h2>
            <div className={styles.checkoutItem}>
              <MockupWithDesign product={getProduct(orderToShow.design.productId)} design={orderToShow.design} className={styles.miniPreview} />
              <div>
                <strong>{getProduct(orderToShow.design.productId).name}</strong>
                <span>{COLOR_LABELS[orderToShow.design.color]} · {orderToShow.design.size}</span>
                <span>Quantity {orderToShow.design.quantity}</span>
              </div>
            </div>
            <dl className={styles.detailList}>
              <div><dt>Material</dt><dd>{orderToShow.design.material}</dd></div>
              <div><dt>Finish</dt><dd>{orderToShow.design.finish}</dd></div>
              <div><dt>Delivery</dt><dd>{DELIVERY_OPTIONS[orderToShow.checkout.deliveryMethod].label}</dd></div>
              <div><dt>Total</dt><dd>{formatNaira(orderToShow.totalKobo)}</dd></div>
            </dl>
            <button className={styles.fullSecondary} type="button" onClick={() => {
              setLookupError("");
              setLookupOrderNumber("");
              setLookupEmail("");
              changeView("lookup");
            }}>Look up another order</button>
          </aside>
        </div>
        <section className={styles.demoControls} aria-labelledby="demo-controls-title">
          <div>
            <span className={styles.demoBadge}>PROTOTYPE ONLY</span>
            <h2 id="demo-controls-title">Try the printer controls</h2>
            <p>These controls simulate the shop updating your order. No real printer is notified.</p>
          </div>
          {trackingActionError && <p className={styles.errorMessage} role="alert">{trackingActionError}</p>}
          {canAdvance && orderToShow.status === "in_production" && orderToShow.checkout.deliveryMethod !== "pickup" && (
            <label className={styles.fieldLabel} htmlFor="demo-tracking-number">Tracking number to use in this demo</label>
          )}
          {canAdvance && orderToShow.status === "in_production" && orderToShow.checkout.deliveryMethod !== "pickup" && (
            <input
              className={styles.textInput}
              id="demo-tracking-number"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              placeholder="PW-TRK-123"
            />
          )}
          <div className={styles.demoButtonRow}>
            {canAdvance && (
              <button className={styles.smallPrimary} type="button" onClick={() => void advanceTrackedOrder()}>
                Advance demo status
              </button>
            )}
            {orderToShow.status === "paid" && (
              <button className={styles.smallSecondary} type="button" onClick={() => setShowDeclineForm((open) => !open)}>
                {showDeclineForm ? "Cancel decline" : "Simulate printer decline"}
              </button>
            )}
            <button className={styles.smallSecondary} type="button" onClick={() => void resetTrackedOrder()}>
              Reset demo order
            </button>
          </div>
          {showDeclineForm && orderToShow.status === "paid" && (
            <form className={styles.declineForm} onSubmit={(event) => void declineTrackedOrder(event)}>
              <label className={styles.fieldLabel} htmlFor="decline-preset">Common reasons</label>
              <select
                id="decline-preset"
                className={styles.textInput}
                value=""
                onChange={(event) => {
                  if (event.target.value) setDeclineReason(event.target.value);
                }}
              >
                <option value="">Choose, or write your own below</option>
                {DECLINE_REASONS.map((reason) => <option key={reason.label} value={reason.value}>{reason.label}</option>)}
              </select>
              <label className={styles.fieldLabel} htmlFor="decline-reason">Reason shown to the customer, required</label>
              <textarea
                id="decline-reason"
                className={styles.textInput}
                rows={3}
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                required
              />
              <button className={styles.dangerButton} type="submit">Decline and start demo refund</button>
            </form>
          )}
          {currentStatusIndex < 0 && <p className={styles.smallNote}>This order has completed the demo status flow.</p>}
        </section>
      </>
    );
  }

  function renderAuth() {
    const titles: Record<AuthStep, string> = {
      signin: "Sign in",
      signup: "Create your account",
      verify: "Check your email",
      forgot: "Reset your password",
      reset: "Set a new password",
    };
    const commonWarning = (
      <div className={styles.demoNotice} role="note">
        <strong>Demo only.</strong> Do not enter a real password. Nothing you enter is sent or saved.
      </div>
    );
    return (
      <section className={styles.authWrap}>
        <div className={styles.authBrand}>
          <span className={styles.brandMark} aria-hidden="true">M</span>
          <span>Mike&apos;s Print Shop</span>
          <p>A little more you in every order.</p>
        </div>
        <div className={`${styles.panel} ${styles.authCard}`}>
          <p className={styles.eyebrow}>YOUR PRESSWISE DEMO</p>
          <h1 id="auth-title" ref={mainHeadingRef} tabIndex={-1}>{titles[authStep]}</h1>
          {authStep === "signin" && (
            <>
              {commonWarning}
              <p className={styles.smallNote}>Sign in to see the account screens and sample order list.</p>
              <button className={styles.fullSecondary} type="button" onClick={() => setAuthError("Google sign in is not connected in this demo.")}>
                <span className={styles.googleMark} aria-hidden="true">G</span> Continue with Google
              </button>
              <div className={styles.orDivider}><span>or use a demo email</span></div>
              <form onSubmit={(event) => void submitSignIn(event)}>
                <label className={styles.fieldLabel} htmlFor="auth-signin-email">Email</label>
                <input className={styles.textInput} id="auth-signin-email" name="email" type="email" autoComplete="username" required />
                <label className={styles.fieldLabel} htmlFor="auth-signin-password">Demo password</label>
                <input className={styles.textInput} id="auth-signin-password" name="password" type="password" autoComplete="off" minLength={8} required />
                <button className={styles.textLink} type="button" onClick={() => {
                  setAuthStep("forgot");
                  setAuthError("");
                }}>Forgot password?</button>
                {authError && <p className={styles.errorMessage} role="alert">{authError}</p>}
                <button className={styles.primaryButton} type="submit">Continue</button>
              </form>
              <p className={styles.authSwitch}>New here? <button type="button" className={styles.textLink} onClick={() => {
                setAuthStep("signup");
                setAuthError("");
              }}>Create an account</button></p>
            </>
          )}
          {authStep === "signup" && (
            <>
              {commonWarning}
              <p className={styles.smallNote}>Create a temporary identity to preview the account flow.</p>
              <button className={styles.fullSecondary} type="button" onClick={() => setAuthError("Google sign up is not connected in this demo.")}>
                <span className={styles.googleMark} aria-hidden="true">G</span> Continue with Google
              </button>
              <div className={styles.orDivider}><span>or use a demo email</span></div>
              <form onSubmit={(event) => void submitSignUp(event)}>
                <label className={styles.fieldLabel} htmlFor="auth-first-name">First name</label>
                <input className={styles.textInput} id="auth-first-name" name="firstName" autoComplete="given-name" required />
                <label className={styles.fieldLabel} htmlFor="auth-signup-email">Email</label>
                <input className={styles.textInput} id="auth-signup-email" name="email" type="email" autoComplete="email" required />
                <label className={styles.fieldLabel} htmlFor="auth-signup-password">Demo password</label>
                <input className={styles.textInput} id="auth-signup-password" name="password" type="password" autoComplete="off" minLength={8} required />
                <label className={styles.approvalCheck}>
                  <input type="checkbox" name="terms" required />
                  <span>I agree to the demo terms and privacy notice.</span>
                </label>
                {authError && <p className={styles.errorMessage} role="alert">{authError}</p>}
                <button className={styles.primaryButton} type="submit">Continue</button>
              </form>
              <p className={styles.authSwitch}>Already have an account? <button type="button" className={styles.textLink} onClick={() => {
                setAuthStep("signin");
                setAuthError("");
              }}>Sign in</button></p>
            </>
          )}
          {authStep === "verify" && (
            <>
              <p className={styles.smallNote}>A real email was not sent to {authEmail}. Enter any six digit code to preview verification.</p>
              <form onSubmit={(event) => void submitVerification(event)}>
                <label className={styles.fieldLabel} htmlFor="auth-code">Demo verification code</label>
                <input className={styles.textInput} id="auth-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
                {authError && <p className={styles.errorMessage} role="alert">{authError}</p>}
                <button className={styles.primaryButton} type="submit">Verify demo account</button>
              </form>
              <button className={styles.textLink} type="button" onClick={() => setAuthStep("signup")}>Use a different email</button>
            </>
          )}
          {authStep === "forgot" && (
            <>
              {commonWarning}
              <p className={styles.smallNote}>Enter an email to preview the password reset flow. No message is sent.</p>
              <form onSubmit={(event) => void submitForgotPassword(event)}>
                <label className={styles.fieldLabel} htmlFor="auth-forgot-email">Email</label>
                <input className={styles.textInput} id="auth-forgot-email" name="email" type="email" autoComplete="email" required />
                {authError && <p className={styles.errorMessage} role="alert">{authError}</p>}
                <button className={styles.primaryButton} type="submit">Continue</button>
              </form>
              <button className={styles.textLink} type="button" onClick={() => setAuthStep("signin")}>Back to sign in</button>
            </>
          )}
          {authStep === "reset" && (
            <>
              {commonWarning}
              <p className={styles.smallNote}>No reset email was sent to {authEmail}. Enter any six digit code.</p>
              <form onSubmit={(event) => void submitResetPassword(event)}>
                <label className={styles.fieldLabel} htmlFor="auth-reset-code">Demo verification code</label>
                <input className={styles.textInput} id="auth-reset-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
                <label className={styles.fieldLabel} htmlFor="auth-new-password">New demo password</label>
                <input className={styles.textInput} id="auth-new-password" name="password" type="password" autoComplete="off" minLength={8} required />
                {authError && <p className={styles.errorMessage} role="alert">{authError}</p>}
                <button className={styles.primaryButton} type="submit">Finish demo reset</button>
              </form>
            </>
          )}
          {authNotice && <p className={styles.successNotice} role="status">{authNotice}</p>}
        </div>
      </section>
    );
  }

  function renderAccount() {
    return (
      <section className={styles.accountPage}>
        <div className={styles.accountHeader}>
          <div>
            <p className={styles.eyebrow}>YOUR DEMO ACCOUNT</p>
            <h1 id="account-title" ref={mainHeadingRef} tabIndex={-1}>Hello, {identity?.displayName || "there"}.</h1>
            <p>{identity?.email}</p>
          </div>
          <button className={styles.smallSecondary} type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
        <div className={styles.demoNotice}><strong>Demo identity.</strong> You are not signed in to a real Presswise account.</div>
        <div className={styles.accountColumns}>
          <section className={styles.panel} aria-labelledby="account-orders-title">
            <div className={styles.panelHeading}>
              <div>
                <h2 id="account-orders-title">Your sample orders</h2>
                <p>These demo orders are visible to everyone using this page.</p>
              </div>
              <button className={styles.textLink} type="button" onClick={() => void loadRecentOrders()}>Refresh</button>
            </div>
            {demoMessage && <p className={styles.errorMessage} role="alert">{demoMessage}</p>}
            {recentOrders.length ? (
              <ul className={styles.accountOrderList}>
                {recentOrders.map((recentOrder) => (
                  <li key={recentOrder.orderNumber}>
                    <div>
                      <strong>{getProduct(recentOrder.design.productId).name}</strong>
                      <span>{recentOrder.orderNumber} · {STATUS_LABELS[recentOrder.status]}</span>
                    </div>
                    <button className={styles.textLink} type="button" onClick={() => {
                      setTrackedOrder(recentOrder);
                      changeView("track");
                    }}>View</button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}><h3>No demo orders yet</h3><p>Place a demo order to see it here.</p></div>
            )}
          </section>
          <section className={styles.panel} aria-labelledby="account-details-title">
            <h2 id="account-details-title">Account details</h2>
            <p className={styles.smallNote}>These details exist only for this browser session and are cleared when you reload.</p>
            <dl className={styles.detailList}>
              <div><dt>Name</dt><dd>{identity?.displayName || "Demo customer"}</dd></div>
              <div><dt>Email</dt><dd>{identity?.email}</dd></div>
              <div><dt>Account type</dt><dd>Demo only</dd></div>
            </dl>
          </section>
        </div>
      </section>
    );
  }

  const activeTracking = trackedOrder;

  return (
    <div className={styles.shell} data-theme={theme}>
      <div className={styles.mesh} aria-hidden="true"><span /><span /></div>
      <div className={styles.pageFrame}>
        {renderHeader()}
        {demoMessage && view !== "account" && <p className={styles.liveMessage} role="status">{demoMessage}</p>}
        <main className={styles.main}>
          {view === "store" && renderStore()}
          {view === "editor" && renderEditor()}
          {view === "preview" && renderPreview()}
          {view === "checkout" && renderCheckout()}
          {view === "confirm" && renderConfirmation()}
          {view === "lookup" && renderLookup()}
          {view === "track" && (activeTracking ? renderTracking(activeTracking) : (
            <section className={styles.emptyState}>
              <h1 id="tracking-empty-title" ref={mainHeadingRef} tabIndex={-1}>No order selected</h1>
              <p>Look up a demo order to see its tracking details.</p>
              <button className={styles.primaryButton} type="button" onClick={() => changeView("lookup")}>Find a demo order</button>
            </section>
          ))}
          {view === "auth" && renderAuth()}
          {view === "account" && (identity ? renderAccount() : (
            <section className={styles.emptyState}>
              <h1 id="account-empty-title" ref={mainHeadingRef} tabIndex={-1}>Sign in to your demo account</h1>
              <button className={styles.primaryButton} type="button" onClick={() => {
                setAuthStep("signin");
                changeView("auth");
              }}>Continue to demo sign in</button>
            </section>
          ))}
        </main>
        <div className={styles.srOnly} aria-live="polite" aria-atomic="true">{demoMessage}</div>
      </div>
    </div>
  );
}

function OrderProgress({ status }: { status: OrderStatus }) {
  const statusIndex = STATUS_FLOW.indexOf(status);
  return (
    <ol className={styles.orderProgress} aria-label={`Order progress, ${STATUS_LABELS[status]}`}>
      {STATUS_FLOW.map((item, index) => (
        <li key={item} className={index <= statusIndex ? styles.stepDone : ""}>
          <span className={styles.stepDot}>{index < statusIndex ? "✓" : index + 1}</span>
          <span>{STATUS_LABELS[item]}</span>
        </li>
      ))}
    </ol>
  );
}
