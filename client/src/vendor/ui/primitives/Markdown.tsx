import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (replaces prototype mdLite). Inline + GFM.
 *  `untrusted`: for repo-sourced content — images are never loaded (rendered as
 *  their alt text, so no remote fetch/leak) and links open with
 *  rel="noopener noreferrer" target="_blank". */
export function Markdown({ children, untrusted = false }: { children?: string | null; untrusted?: boolean }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          ...(untrusted ? { img: ({ alt }) => <>{alt ?? ""}</> } : {}),
          a: ({ children, href }) => (
            <a
              href={href}
              {...(untrusted ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{ color: "var(--accent-text)", textDecoration: "underline" }}
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
