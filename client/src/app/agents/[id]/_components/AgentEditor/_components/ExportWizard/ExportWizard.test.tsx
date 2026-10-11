import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import { ExportWizard } from "./ExportWizard";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";
const FILES = [
  { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: x\n", editable: false, size_bytes: 8 },
  { path: ".devdigest/runner/index.js", contents: "", editable: false, size_bytes: 2_500_000 },
  { path: WORKFLOW_PATH, contents: "name: DevDigest\n", editable: true, size_bytes: 16 },
];

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}
let calls: Call[];
let exportResponse: { status: number; json: unknown };

function stubFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, "");
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method, path, body });
      const reply = (status: number, json: unknown) =>
        new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
      if (path.endsWith("/ci/preview")) return reply(200, { files: FILES });
      if (path.endsWith("/ci/export")) return reply(exportResponse.status, exportResponse.json);
      if (path === "/ci/readiness") return reply(200, { openrouter_key_ready: false });
      return reply(200, []); // /repos etc.
    }),
  );
}

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <ExportWizard agent={AGENT} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const lastExport = () => calls.filter((c) => c.path.endsWith("/ci/export")).at(-1);

beforeEach(() => {
  exportResponse = { status: 200, json: {} };
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ExportWizard", () => {
  it("AC-1/2/3/7/8/10: defaults to GitHub Actions, previews files with only the workflow editable, shows secrets, and installs the edited workflow as a PR", async () => {
    renderWizard();

    // Target step: four targets, GHA selected by default and recommended.
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /GitHub Actions/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("recommended")).toBeInTheDocument();
    next();

    // Preview step: all files listed; runner is a read-only placeholder with its size.
    await screen.findByRole("option", { name: new RegExp(WORKFLOW_PATH.replace(/\./g, "\\.")) });
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getAllByText("editable")).toHaveLength(1);
    expect(screen.getAllByText("read-only")).toHaveLength(2);
    fireEvent.click(screen.getByRole("option", { name: /runner\/index\.js/ }));
    expect(screen.getByText(/Bundled agent runner \(.+\) — too large to display/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // Only the workflow is editable.
    fireEvent.click(screen.getByRole("option", { name: /devdigest-review\.yml/ }));
    const editor = screen.getByRole("textbox");
    expect(editor).toHaveValue("name: DevDigest\n");
    fireEvent.change(editor, { target: { value: "name: Edited\n" } });
    next();

    // Configure step: secrets rows (key not ready, token auto-provided) + branch protection hint.
    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("GITHUB_TOKEN")).toBeInTheDocument();
    expect(await screen.findByText("not set")).toBeInTheDocument();
    expect(screen.getByText("auto-provided by Actions")).toBeInTheDocument();
    expect(screen.getByText(/branch protection/)).toBeInTheDocument();
    next();

    // Install step: PR summary shows repo, title and file count; the edit is sent.
    const repo = screen.getByLabelText("Target repository");
    expect(screen.getByRole("button", { name: "Open PR" })).toBeDisabled();
    fireEvent.change(repo, { target: { value: "acme/widgets" } });
    expect(screen.getByText(/Opens a PR in acme\/widgets titled “Add DevDigest CI review” with the 3 generated files/)).toBeInTheDocument();

    exportResponse = {
      status: 200,
      json: { installation: null, files: FILES, pr_url: "https://github.com/acme/widgets/pull/9", zip_base64: null },
    };
    fireEvent.click(screen.getByRole("button", { name: "Open PR" }));

    await screen.findByText("Pull request ready in acme/widgets.");
    expect(screen.getByRole("link", { name: /View pull request/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/pull/9",
    );
    expect(lastExport()!.body).toMatchObject({
      repo: "acme/widgets",
      target: "gha",
      action: "open_pr",
      post_as: "github_review",
      triggers: ["opened", "synchronize"],
      workflow_contents: "name: Edited\n",
    });
  });

  it("AC-7/13: changing triggers regenerates the preview, and the zip fallback downloads a file instead of opening a PR", async () => {
    const createObjectURL = vi.fn(() => "blob:zip");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWizard();
    next();
    await screen.findByRole("option", { name: /devdigest-review\.yml/ });
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: "reopened" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path.endsWith("/ci/preview") && (c.body?.triggers as string[]).includes("reopened"))).toBe(true),
    );
    // Continue is disabled while the regenerated preview loads.
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    next();

    fireEvent.change(screen.getByLabelText("Target repository"), { target: { value: "acme/widgets" } });
    fireEvent.click(screen.getByRole("radio", { name: /Copy files as a zip/ }));
    exportResponse = {
      status: 200,
      json: { installation: null, files: FILES, pr_url: null, zip_base64: btoa("PK") },
    };
    fireEvent.click(screen.getByRole("button", { name: "Download zip" }));

    await screen.findByText("Zip downloaded.");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
    expect(lastExport()!.body).toMatchObject({ action: "files", triggers: ["opened", "synchronize", "reopened"] });
    expect(lastExport()!.body).not.toHaveProperty("workflow_contents");
  });

  it("AC-14: shows the server error and keeps the form so the install can be retried", async () => {
    renderWizard();
    next();
    await screen.findByRole("option", { name: /devdigest-review\.yml/ });
    next();
    next();
    fireEvent.change(screen.getByLabelText("Target repository"), { target: { value: "acme/widgets" } });

    exportResponse = {
      status: 502,
      json: { error: { code: "external_service_error", message: "GitHub export failed: branch protected" } },
    };
    fireEvent.click(screen.getByRole("button", { name: "Open PR" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t complete the install: GitHub export failed: branch protected");
    expect(screen.getByLabelText("Target repository")).toHaveValue("acme/widgets");
    expect(screen.getByRole("button", { name: "Open PR" })).toBeEnabled();
  });
});
