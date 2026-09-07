import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeMenu } from "@/components/ThemeMenu";
import { getThemePreference, setThemePreference } from "@/lib/theme";

describe("ThemeMenu (3-state Claro/Oscuro/Sistema switch)", () => {
  beforeEach(() => {
    setThemePreference("system");
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    setThemePreference("system");
    document.documentElement.classList.remove("dark");
  });

  it("renders a reachable theme menu trigger", () => {
    render(<ThemeMenu />);

    expect(screen.getByRole("button", { name: "Tema" })).toBeInTheDocument();
  });

  it("opens to reveal exactly Claro, Oscuro and Sistema, in that order", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    await user.click(screen.getByRole("button", { name: "Tema" }));

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Claro");
    expect(items[1]).toHaveTextContent("Oscuro");
    expect(items[2]).toHaveTextContent("Sistema");
  });

  it("selecting Oscuro persists the preference and applies the .dark class", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    await user.click(screen.getByRole("button", { name: "Tema" }));
    await user.click(screen.getByRole("menuitem", { name: "Oscuro" }));

    expect(getThemePreference()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("selecting Claro after Oscuro removes the .dark class", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    await user.click(screen.getByRole("button", { name: "Tema" }));
    await user.click(screen.getByRole("menuitem", { name: "Oscuro" }));
    await user.click(screen.getByRole("button", { name: "Tema" }));
    await user.click(screen.getByRole("menuitem", { name: "Claro" }));

    expect(getThemePreference()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("shows a check mark next to the currently selected preference", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    await user.click(screen.getByRole("button", { name: "Tema" }));
    const sistemaItem = screen.getByRole("menuitem", { name: /Sistema/ });
    expect(sistemaItem.querySelector("svg.lucide-check")).not.toBeNull();

    const claroItem = screen.getByRole("menuitem", { name: /Claro/ });
    expect(claroItem.querySelector("svg.lucide-check")).toBeNull();
  });
});
