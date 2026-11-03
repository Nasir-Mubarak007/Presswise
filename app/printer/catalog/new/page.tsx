import { redirect } from "next/navigation";
import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess } from "@/lib/printer-dashboard";
import NewProductForm from "./form";

export default async function NewProductPage() {
  const ctx = await requireDashboardAccess();
  const isWriter =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.membership.role === "manager" ||
    ctx.membership.role === "staff";

  if (!isWriter) {
    redirect("/printer/catalog");
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
            <h1 className="text-2xl font-semibold tracking-tight">Add product</h1>
            <p className="mt-1 text-ink/60">
              Create a draft product. Add variants with material, finish, and price, then publish
              when you have a real cover photo.
            </p>
          </div>
          <a
            href="/printer/catalog"
            className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink hover:bg-ink/5"
          >
            Back to catalog
          </a>
        </header>

        <NewProductForm />
      </div>
    </PrinterDashboardShell>
  );
}
