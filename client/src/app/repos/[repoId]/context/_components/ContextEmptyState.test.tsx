import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../messages/en/context.json";
import { ContextEmptyState } from "./ContextEmptyState";

afterEach(cleanup);

describe("ContextEmptyState", () => {
  it("AC-10: no_clone and no_folders each show their own instructions, not an error", () => {
    const wrap = (state: "no_clone" | "no_folders") => (
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <ContextEmptyState state={state} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(wrap("no_clone"));
    expect(screen.getByText(contextMessages.emptyState.noClone.title)).toBeInTheDocument();
    rerender(wrap("no_folders"));
    expect(screen.getByText(contextMessages.emptyState.noFolders.title)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
