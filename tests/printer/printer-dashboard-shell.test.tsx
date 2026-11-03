import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

import PrinterDashboardShell from "@/components/printer-dashboard-shell";

function renderShell() {
  return render(
    <PrinterDashboardShell
      activePage="overview"
      isOwner
      isPlatformAdmin={false}
    >
      <h1>Overview page</h1>
    </PrinterDashboardShell>,
  );
}

describe("PrinterDashboardShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the bottom navigation mobile only and provides the four mobile destinations", () => {
    renderShell();

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile printer dashboard",
    });
    expect(mobileNavigation).toHaveClass("md:hidden");
    expect(within(mobileNavigation).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/printer",
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/printer/orders",
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "href",
      "/printer/catalog",
    );
    expect(within(mobileNavigation).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("lets a user reopen the desktop navigation after collapsing it", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Collapse desktop navigation" }));

    const expandButton = screen.getByRole("button", { name: "Expand desktop navigation" });
    expect(expandButton).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("md:ml-0");

    fireEvent.click(expandButton);

    expect(screen.getByRole("button", { name: "Collapse desktop navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("md:ml-64");
  });

  it("remembers the collapsed desktop navigation between visits", () => {
    const firstVisit = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse desktop navigation" }));

    expect(localStorage.getItem("printer.dashboard.sidebar")).toBe("collapsed");

    firstVisit.unmount();
    renderShell();

    expect(screen.getByRole("button", { name: "Expand desktop navigation" })).toBeInTheDocument();
  });

  it("shows secondary destinations and logout from the mobile More menu", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    const moreMenu = screen.getByRole("navigation", { name: "More printer pages" });
    expect(within(moreMenu).getByRole("link", { name: "Storefront" })).toHaveAttribute(
      "href",
      "/printer/storefront",
    );
    expect(within(moreMenu).getByRole("link", { name: "Team" })).toHaveAttribute(
      "href",
      "/printer/team",
    );
    expect(screen.getAllByRole("button", { name: "Log out" })).toHaveLength(2);
  });
});
