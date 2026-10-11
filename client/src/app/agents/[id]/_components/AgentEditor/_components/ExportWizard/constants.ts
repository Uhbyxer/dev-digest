import type { CiPostAs, CiTarget, CiTrigger } from "@devdigest/shared";

export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** Exactly four targets (AC-2); GitHub Actions is the default + recommended. */
export const TARGETS: readonly CiTarget[] = ["gha", "circle", "jenkins", "cli"];
export const DEFAULT_TARGET: CiTarget = "gha";

export const TRIGGER_OPTIONS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const POST_AS_OPTIONS: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];
export const DEFAULT_POST_AS: CiPostAs = "github_review";

export const DEFAULT_BASE = "main";
export const PR_TITLE = "Add DevDigest CI review";
export const OPENROUTER_SECRET = "OPENROUTER_API_KEY";
export const GITHUB_SECRET = "GITHUB_TOKEN";
export const REPO_DATALIST_ID = "devdigest-ci-repos";
export const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
