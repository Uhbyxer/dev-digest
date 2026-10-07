#!/usr/bin/env node
/**
 * Collects dependency facts for every package in this repo and prints ONE JSON document.
 * Read-only, zero npm dependencies, never touches the network.
 *
 *   node .claude/skills/dependency-checker/scripts/collect.mjs [--repo <path>]
 *
 * "Package" = any direct child folder of the repo root that has a package.json. The repo is NOT
 * a pnpm/npm workspace: packages share code through tsconfig `paths` aliases, so internal edges
 * are discovered from import specifiers, not from `workspace:*` ranges.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const argRepo = process.argv.indexOf("--repo");
const ROOT = resolve(argRepo > -1 ? process.argv[argRepo + 1] : process.cwd());

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage", ".git", "clones", "results", ".turbo"]);
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const CSS_EXT = /\.css$/;
const TEST_PATH = /(^|\/)(test|tests|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(["'])([^"'\n]+)\1/gm;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const readLenientJson = (p) => {
  // tsconfig allows comments and trailing commas; strip them without touching string contents
  const src = readFileSync(p, "utf8");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
};
const pkgName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(join(dir, e.name));
    } else if (CODE_EXT.test(e.name) || CSS_EXT.test(e.name)) yield join(dir, e.name);
  }
}

function sizeKb(pkgDir, dep) {
  const p = join(pkgDir, "node_modules", dep);
  if (!existsSync(p)) return null;
  try {
    // pnpm installs symlink into a store; size the real folder (the package's OWN files only).
    return Number(execFileSync("du", ["-sk", realpathSync(p)], { encoding: "utf8" }).split(/\s+/)[0]);
  } catch {
    return null;
  }
}

const packages = readdirSync(ROOT)
  .filter((d) => !SKIP_DIRS.has(d) && statSync(join(ROOT, d)).isDirectory() && existsSync(join(ROOT, d, "package.json")))
  .sort();

const out = { root: ROOT, generatedAt: new Date().toISOString(), packages: {}, internalEdges: [], versionDrift: [], notes: [] };
const declaredVersions = {}; // dep -> { range -> [packages] }
const edgeMap = new Map();

for (const name of packages) {
  const dir = join(ROOT, name);
  const pj = readJson(join(dir, "package.json"));
  const prod = pj.dependencies ?? {};
  const dev = pj.devDependencies ?? {};
  const installed = existsSync(join(dir, "node_modules"));

  // alias table from tsconfig paths -> absolute target dir/file
  const aliases = [];
  const tsconfig = join(dir, "tsconfig.json");
  if (existsSync(tsconfig)) {
    try {
      const co = readLenientJson(tsconfig).compilerOptions ?? {};
      const base = resolve(dir, co.baseUrl ?? ".");
      for (const [alias, targets] of Object.entries(co.paths ?? {})) {
        aliases.push({ alias, wildcard: alias.endsWith("/*"), prefix: alias.replace(/\/\*$/, ""), target: resolve(base, targets[0].replace(/\/\*$/, "")) });
      }
    } catch (e) {
      out.notes.push(`${name}: could not parse tsconfig.json (${e.message})`);
    }
  }

  // text where scripts/configs may use a dependency without importing it
  const toolingText = [JSON.stringify(pj.scripts ?? {}), ...readdirSync(dir).filter((f) => f !== "package.json" && /config|\.json$|\.mjs$|\.cjs$/.test(f)).map((f) => { try { return readFileSync(join(dir, f), "utf8"); } catch { return ""; } })].join("\n");

  const declaredNames = [...Object.keys(prod), ...Object.keys(dev)];
  const used = new Map(); // external package -> sample file (prefers a non-test file)
  const stringRefs = new Map(); // dep named only as a string literal / css @import
  const markUsed = (n, rel) => { const cur = used.get(n); if (!cur || (TEST_PATH.test(cur) && !TEST_PATH.test(rel))) used.set(n, rel); };
  const files = [...walk(dir)];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    for (const dep of declaredNames) {
      if (!stringRefs.has(dep) && (text.includes(`"${dep}`) || text.includes(`'${dep}`))) stringRefs.set(dep, rel);
    }
    if (CSS_EXT.test(file)) continue;
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[2];
      if (spec.startsWith("node:")) continue;
      let targetAbs = null;
      let kind = null;
      let alias = null;
      let publicEntry = false;
      if (spec.startsWith(".")) {
        const abs = resolve(dirname(file), spec);
        if (!abs.startsWith(dir + sep)) { targetAbs = abs; kind = "relative"; }
      } else {
        const hit = aliases.find((a) => (a.wildcard ? spec === a.prefix || spec.startsWith(a.prefix + "/") : spec === a.alias));
        if (hit) {
          const exact = spec === hit.prefix || spec === hit.alias;
          targetAbs = exact ? hit.target : resolve(hit.target, spec.slice(hit.prefix.length + 1));
          kind = "alias"; alias = hit.alias.replace(/\/\*$/, ""); publicEntry = exact;
        } else {
          markUsed(pkgName(spec), rel);
          continue;
        }
      }
      if (targetAbs && targetAbs.startsWith(dir + sep) && targetAbs.includes(`${sep}node_modules${sep}`)) {
        markUsed(pkgName(spec), rel);
        continue;
      }
      if (targetAbs && !targetAbs.startsWith(dir + sep)) {
        const other = packages.find((p) => targetAbs === join(ROOT, p) || targetAbs.startsWith(join(ROOT, p) + sep));
        if (!other) { out.notes.push(`${rel}: import "${spec}" leaves the package but lands outside any known package (ignored; may be inside a string/template)`); continue; }
        const to = other;
        if (to === name) continue;
        const testOnly = TEST_PATH.test(rel);
        const targetDir = relative(ROOT, targetAbs).split(sep).slice(0, 4).join("/");
        const key = `${name}|${to}|${kind}|${alias ?? ""}|${publicEntry}|${testOnly}|${targetDir}`;
        const e = edgeMap.get(key) ?? { from: name, to, kind, alias, resolvesTo: targetDir, viaPublicEntry: publicEntry, testOnly, count: 0, sample: `${rel} -> ${spec}` };
        e.count++;
        edgeMap.set(key, e);
      }
    }
  }

  const describe = (deps, type) =>
    Object.entries(deps).map(([dep, range]) => {
      (declaredVersions[dep] ??= {})[range] ??= [];
      declaredVersions[dep][range].push(name);
      const importedBy = used.get(dep) ?? null;
      const typesFor = dep.startsWith("@types/") ? dep.slice(7).replace("__", "/") : null;
      const inTooling = new RegExp(`(^|[^\\w@/-])${dep.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^\\w-]|$)`).test(toolingText);
      const status = importedBy ? "imported" : typesFor && used.has(typesFor) ? "types-for-imported" : stringRefs.has(dep) ? "referenced-as-string" : inTooling ? "used-by-tooling" : "no-reference-found";
      return { name: dep, range, type, sizeKb: sizeKb(dir, dep), status, sampleImport: importedBy ?? stringRefs.get(dep) ?? null };
    });

  const deps = [...describe(prod, "prod"), ...describe(dev, "dev")];
  const both = Object.keys(prod).filter((d) => d in dev);
  out.packages[name] = {
    installed,
    sourceFiles: files.length,
    counts: { prod: Object.keys(prod).length, dev: Object.keys(dev).length },
    totalSizeKb: installed ? deps.reduce((s, d) => s + (d.sizeKb ?? 0), 0) : null,
    declaredInBothProdAndDev: both,
    dependencies: deps.sort((a, b) => (b.sizeKb ?? -1) - (a.sizeKb ?? -1)),
  };
  if (!installed) out.notes.push(`${name}: node_modules missing — sizes unavailable (run pnpm install there)`);
}

out.internalEdges = [...edgeMap.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
out.versionDrift = Object.entries(declaredVersions)
  .filter(([, ranges]) => Object.keys(ranges).length > 1)
  .map(([dep, ranges]) => ({ dep, ranges }));
out.notes.push("sizeKb is the package's OWN folder (du -sk of the resolved path); transitive dependencies are not included.");
out.notes.push("status=no-reference-found is a candidate for 'unused', not proof: check dynamic requires and CLI usage before removing.");
out.notes = [...new Set(out.notes)];
console.log(JSON.stringify(out, null, 2));
