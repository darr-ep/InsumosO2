import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserAvatar } from "@/components/UserAvatar";

describe("UserAvatar", () => {
  it("renders the given image when an avatarUrl is provided", () => {
    // Decorative (`alt=""`) on purpose — the row's own visible name already
    // announces who this is, so this img is presentation-role, not "img".
    const { container } = render(
      <UserAvatar name="Nava" avatarUrl="https://example.com/nava.png" />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/nava.png",
    );
  });

  it("falls back to the uppercased first initial when there's no avatarUrl", () => {
    const { container } = render(<UserAvatar name="nava" avatarUrl={null} />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("falls back to '?' for an empty name", () => {
    render(<UserAvatar name="" avatarUrl={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders the initial fallback with tone='soft' the same as the default tone (design-fidelity §4.2)", () => {
    // Behavioral floor for the new prop: it must not change WHAT is shown
    // (still the uppercased initial), only its color treatment — which is a
    // CSS-only concern this suite doesn't assert on.
    render(<UserAvatar name="Ana" avatarUrl={null} tone="soft" />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
