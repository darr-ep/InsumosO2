import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "@/app/App";

describe("App", () => {
  it("redirects to the Dashboard tab and renders the 3-tab nav (§16.5)", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboard/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Nueva renta/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buscar/ })).toBeInTheDocument();
  });
});
