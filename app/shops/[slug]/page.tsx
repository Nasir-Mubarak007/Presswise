import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPrinterExperienceEnabled } from "@/lib/printer-gate";
import { getPublishedShop } from "@/lib/services/printer-service";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublishedShop(slug);
  if (!shop) {
    return { title: "Shop not found · Presswise" };
  }
  return {
    title: `${shop.shop.name} · Presswise`,
    description: shop.shop.tagline ?? undefined,
  };
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isPrinterExperienceEnabled()) {
    notFound();
  }

  const { slug } = await params;
  const shop = await getPublishedShop(slug);
  if (!shop) {
    notFound();
  }

  const imageUrl = (key: string | null): string | undefined =>
    key ? `${process.env.R2_PUBLIC_URL ?? ""}/${key}` : undefined;

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
        <header>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">
            Printer shop
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {shop.shop.name}
          </h1>
          {shop.shop.tagline && (
            <p className="mt-2 text-ink/70">{shop.shop.tagline}</p>
          )}
          <p className="mt-4 text-sm text-ink/60">
            {shop.shop.city}, {shop.shop.state}
            {shop.shop.area ? ` · ${shop.shop.area}` : ""}
          </p>
        </header>

        <section aria-labelledby="catalog-heading">
          <h2 id="catalog-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
            Published catalog
          </h2>
          {shop.products.length === 0 ? (
            <p className="mt-4 text-ink/60">
              This shop has no published products yet.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shop.products.map((product) => (
                <li key={product.id} className="rounded-lg border border-ink/10 p-4">
                  {product.coverObjectKey ? (
                    <img
                      src={imageUrl(product.coverObjectKey)}
                      alt={product.coverAltText ?? product.name}
                      className="w-full h-48 object-cover rounded-lg mb-3"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-48 rounded-lg border border-ink/10 bg-surface/50 mb-3 flex items-center justify-center text-ink/30 text-sm">
                      No photo yet
                    </div>
                  )}
                  <p className="font-medium">{product.name}</p>
                  {product.category && (
                    <p className="mt-1 text-sm text-ink/60">{product.category}</p>
                  )}
                  {product.basePriceKobo != null && product.basePriceKobo > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-ink">
                      ₦{(product.basePriceKobo / 100).toFixed(2)}
                    </p>
                  ) : null}
                  {product.variants.length > 0 && (
                    <p className="mt-2 text-xs text-ink/50">
                      {product.variants.map((v) => `${v.material}, ${v.finish}`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
