import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

const stack = [
  "Next.js 16, App Router, React 19",
  "Neon Postgres with Drizzle ORM",
  "Better Auth with the organization plugin",
  "Cloudflare R2, Resend, Paystack",
];

describe("Home", () => {
  it("names the page with a single top level heading", () => {
    render(<Home />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAccessibleName("Presswise");
  });

  it("says what the product is for", () => {
    render(<Home />);

    expect(
      screen.getByText("Print on demand for Nigerian print shops and their customers."),
    ).toBeVisible();
  });

  it("shows the stack as a labelled section", () => {
    render(<Home />);

    const region = screen.getByRole("region", { name: "Scaffold stack" });
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Scaffold stack",
    );
  });

  it("lists every stack entry once, in order", () => {
    render(<Home />);

    const region = screen.getByRole("region", { name: "Scaffold stack" });
    const items = within(region).getAllByRole("listitem");

    expect(items.map((item) => item.textContent)).toEqual(stack);
  });

  it("is honest that the scaffold is not a product yet", () => {
    render(<Home />);

    expect(screen.getByText(/Empty scaffold/i)).toHaveTextContent(
      "Empty scaffold. The data model and accounts land here next, then the order loop.",
    );
  });

  it("renders inside a single main landmark", () => {
    render(<Home />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("offers nothing to click or type yet, so the page has no hidden controls", () => {
    render(<Home />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
