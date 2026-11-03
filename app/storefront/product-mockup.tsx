import { COLOR_TONES } from "@/lib/storefront/catalog";
import type { Product, ProductColor, ProductSide } from "@/lib/storefront/types";
import { useId } from "react";

type ProductMockupProps = {
  product: Product;
  color: ProductColor;
  side: ProductSide;
  className?: string;
};

export default function ProductMockup({
  product,
  color,
  side,
  className,
}: ProductMockupProps) {
  const [light, mid, dark] = COLOR_TONES[color];
  const gradientId = useId().replaceAll(":", "");

  return (
    <svg
      className={className}
      viewBox="0 0 300 300"
      fill="none"
      role="img"
      aria-label={`${color} ${product.name} mockup, ${side} view`}
    >
      <defs>
        <linearGradient id={gradientId} x1="30" y1="20" x2="250" y2="270" gradientUnits="userSpaceOnUse">
          <stop stopColor={light} />
          <stop offset=".52" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <filter id={`${gradientId}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <ellipse cx="150" cy="265" rx="105" ry="9" fill="var(--sf-shadow-color)" opacity=".14" filter={`url(#${gradientId}-shadow)`} />
      {product.mockup === "cap" && (
        <>
          <path
            d="M30 170C30 82 82 28 150 28s120 54 120 142H30Z"
            fill={`url(#${gradientId})`}
            stroke="var(--sf-outline)"
            strokeOpacity=".2"
            strokeWidth="2"
          />
          <path d="M150 30c-36 17-56 58-56 137m56-137c36 17 56 58 56 137" stroke="var(--sf-outline)" strokeOpacity=".22" strokeWidth="2" />
          <path d="M20 169q130 50 260 0v19q-130 49-260 0v-19Z" fill={dark} />
          <circle cx="150" cy="30" r="6" fill={dark} stroke="white" strokeOpacity=".25" />
        </>
      )}
      {product.mockup === "shirt" && (
        <>
          <path
            d="m110 36-30-14-45 44 26 34 24-16v184h130V84l24 16 26-34-45-44-30 14c-12 17-68 17-80 0Z"
            fill={`url(#${gradientId})`}
            stroke="var(--sf-outline)"
            strokeOpacity=".2"
            strokeWidth="2"
          />
          {side === "front" ? (
            <path d="M110 36c12 18 68 18 80 0" stroke="var(--sf-outline)" strokeOpacity=".25" strokeWidth="3" />
          ) : (
            <path d="M150 38v25" stroke="var(--sf-outline)" strokeOpacity=".2" strokeWidth="3" />
          )}
        </>
      )}
      {product.mockup === "hoodie" && (
        <>
          <path
            d="m110 37-30-15-45 44 26 34 24-16v184h130V84l24 16 26-34-45-44-30 15c-10 14-22 20-40 20s-30-6-40-20Z"
            fill={`url(#${gradientId})`}
            stroke="var(--sf-outline)"
            strokeOpacity=".2"
            strokeWidth="2"
          />
          {side === "front" ? (
            <>
              <path d="M120 152q30 16 60 0v36q-30 17-60 0v-36Z" stroke="var(--sf-outline)" strokeOpacity=".25" strokeWidth="2" />
              <path d="m137 58 5 31m21-31-5 31" stroke="var(--sf-outline)" strokeOpacity=".4" strokeWidth="2" />
            </>
          ) : (
            <path d="M150 44c-20 12-20 36 0 46 20-10 20-34 0-46Z" stroke="var(--sf-outline)" strokeOpacity=".25" strokeWidth="2" />
          )}
        </>
      )}
      {product.mockup === "tote" && (
        <>
          <path d="M100 78c0-34 20-52 50-52s50 18 50 52" stroke={dark} strokeWidth="11" strokeLinecap="round" />
          <rect x="55" y="72" width="190" height="195" rx="14" fill={`url(#${gradientId})`} stroke="var(--sf-outline)" strokeOpacity=".2" strokeWidth="2" />
          <path d="M56 110h188" stroke="var(--sf-outline)" strokeOpacity=".14" strokeWidth="3" />
        </>
      )}
      {product.mockup === "drawstring" && (
        <>
          <path d="M68 72q82-20 164 0l-10 188q-72 20-144 0L68 72Z" fill={`url(#${gradientId})`} stroke="var(--sf-outline)" strokeOpacity=".2" strokeWidth="2" />
          <path d="M68 72c-12-18-12-32 0-45m164 45c12-18 12-32 0-45" stroke={dark} strokeWidth="7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
