import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../messages/en/context.json";

const mutate = vi.fn();
const state = vi.hoisted(() => ({
  docs: [] as { path: string; type: string; size: number; tokens: number }[],
  attachments: [] as { owner_type: string; owner_id: string; repo_id: string; path: string; order: number }[],
  serialized: undefined as string | undefined,
}));

vi.mock("../../lib/hooks/context", () => ({
  useContextDocuments: () => ({ isLoading: false, isError: false, data: { documents: state.docs } }),
  useOwnerContext: () => ({
    isLoading: false,
    isError: false,
    data: { attachments: state.attachments, missing: [], tokens_total: 12, over_threshold: false },
  }),
  useSetOwnerContext: () => ({ mutate, error: null }),
  useOwnerEffectiveContext: () => ({ data: state.serialized === undefined ? undefined : { text: state.serialized } }),
  useContextDocument: () => ({ data: undefined, isLoading: true }),
}));

import { ContextAttachments } from "./ContextAttachments";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const att = (path: string, order: number) => ({ owner_type: "skill", owner_id: "s1", repo_id: "r1", path, order });
const renderIt = (ownerType: "agent" | "skill" = "skill") =>
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <ContextAttachments ownerType={ownerType} ownerId="s1" repoId="r1" />
    </NextIntlClientProvider>,
  );

describe("ContextAttachments states", () => {
  it("AC-18: with no documents shows an empty state linking to Project Context", () => {
    state.docs = [];
    state.attachments = [];
    renderIt("agent");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/repos/r1/context");
  });

  it("AC-14/16/20: drag reorders and persists; filter narrows without persisting; skill tab shows serialized block and total", () => {
    state.docs = [
      { path: ".devdigest/specs/a.md", type: "specs", size: 5, tokens: 2 },
      { path: ".devdigest/specs/b.md", type: "specs", size: 5, tokens: 2 },
      { path: ".devdigest/docs/other.md", type: "docs", size: 5, tokens: 2 },
    ];
    state.attachments = [att(".devdigest/specs/a.md", 0), att(".devdigest/specs/b.md", 1)];
    state.serialized = "## Project context\nSERIALIZED";
    renderIt();
    expect(screen.getByText(/SERIALIZED/)).toBeInTheDocument();
    expect(screen.getByText("≈ 12 tokens", { exact: false })).toBeInTheDocument();

    const a = screen.getByTestId("ctx-row-.devdigest/specs/a.md");
    const b = screen.getByTestId("ctx-row-.devdigest/specs/b.md");
    fireEvent.dragStart(a);
    fireEvent.drop(b);
    expect(mutate.mock.calls[0]![0]).toEqual([".devdigest/specs/b.md", ".devdigest/specs/a.md"]);

    mutate.mockClear();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "other" } });
    expect(screen.queryByTestId("ctx-row-.devdigest/specs/a.md")).toBeNull();
    expect(screen.getByTestId("ctx-row-.devdigest/docs/other.md")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
