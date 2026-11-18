import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { z } from "zod";
import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess } from "@/lib/printer-dashboard";
import { getProductPhotoEditorData } from "@/lib/services/printer-asset-service";
import NewProductForm from "./form";
import ProductPhotoUploader from "./photo-uploader";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireDashboardAccess();
  const isWriter = ctx.membership.role === "owner" || ctx.membership.role === "manager";

  if (!isWriter) {
    redirect("/printer/catalog");
  }
  const params = await searchParams;
  const productId = typeof params.productId === "string" ? params.productId : null;
  if (productId && !z.string().uuid().safeParse(productId).success) {
    notFound();
  }
  const editorData = productId
    ? await getProductPhotoEditorData({
        shopId: ctx.membership.shopId,
        actorUserId: ctx.user.id,
        productId,
      })
    : null;
  if (editorData && !editorData.ok) {
    notFound();
  }

  return (
    <PrinterDashboardShell
      activePage="catalog"
      isOwner={ctx.roleContext.roles.includes("printer_owner")}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-3xl">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {editorData?.ok ? "Add product photos" : "Add product"}
            </h1>
            <p className="mt-1 text-ink/60">
              {editorData?.ok
                ? `Your draft, ${editorData.data.product.name}, is saved. Add its real photos next.`
                : "Create a private draft, then add real photos before publishing it."}
            </p>
          </div>
          <a
            href="/printer/catalog"
            className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink hover:bg-ink/5"
          >
            Back to catalog
          </a>
        </header>

        {editorData?.ok ? (
          <ProductPhotoUploader
            productId={editorData.data.product.id}
            photos={editorData.data.photos}
            reservedCount={editorData.data.reservedCount}
            productStatus={editorData.data.product.status}
            isShopOwner={ctx.membership.role === "owner"}
          />
        ) : (
          <NewProductForm />
        )}
      </div>
    </PrinterDashboardShell>
  );
}
