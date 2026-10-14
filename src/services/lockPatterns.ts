import { posix } from "node:path";

const GLOB_CHARS = /[*?[\]{}]/;

/**
 * Normalize a lock pattern so equivalent spellings compare equal:
 * backslashes become slashes, `./` is dropped, absolute paths inside the
 * workspace become workspace-relative, and a trailing slash (explicitly a
 * directory) becomes `/**`.
 */
export function normalizeLockPattern(pattern: string, workspaceRoot?: string): string {
  let p = pattern.trim().replace(/\\/g, "/");
  const isDirectory = p.endsWith("/");

  if (workspaceRoot) {
    const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const lowerP = p.toLowerCase();
    const lowerRoot = root.toLowerCase();
    if (lowerP === lowerRoot) {
      p = ".";
    } else if (lowerP.startsWith(lowerRoot + "/")) {
      p = p.slice(root.length + 1);
    }
  }

  p = posix.normalize(p).replace(/\/+$/, "");
  if (p === "" || p === ".") {
    return "**";
  }
  return isDirectory && !p.endsWith("/**") ? `${p}/**` : p;
}

/** Expand `{a,b}` alternatives into separate patterns (supports nesting). */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];

  let depth = 0;
  let close = -1;
  const commas: number[] = [];
  for (let i = open; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      close = i;
      break;
    } else if (ch === "," && depth === 1) commas.push(i);
  }
  if (close === -1 || commas.length === 0) return [pattern];

  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const bounds = [open, ...commas, close];
  const results: string[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const option = pattern.slice(bounds[i] + 1, bounds[i + 1]);
    results.push(...expandBraces(head + option + tail));
  }
  return results;
}

/**
 * Split a pattern into lower-cased path segments. A literal path whose last
 * segment has no extension (`src/auth`, `.github`) is taken to be a directory
 * and also covers everything below it; `src/index.ts` covers only itself.
 * Use a trailing slash or `/**` to lock a directory with a dot in its name.
 */
function toSegments(pattern: string): string[] {
  const segments = pattern.toLowerCase().split("/");
  const looksLikeFile = segments[segments.length - 1].lastIndexOf(".") > 0;
  if (!GLOB_CHARS.test(pattern) && !looksLikeFile) segments.push("**");
  return segments;
}

function segmentToRegExp(segment: string): RegExp {
  let source = "";
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "*") {
      source += ".*";
    } else if (ch === "?") {
      source += ".";
    } else if (ch === "[") {
      const end = segment.indexOf("]", i + 1);
      if (end === -1) {
        source += "\\[";
      } else {
        const body = segment.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\");
        source += `[${body}]`;
        i = end;
      }
    } else {
      source += ch.replace(/[.+^${}()|\\\]]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function literalPrefix(segment: string): string {
  const idx = segment.search(/[*?[]/);
  return idx === -1 ? segment : segment.slice(0, idx);
}

function literalSuffix(segment: string): string {
  const last = Math.max(segment.lastIndexOf("*"), segment.lastIndexOf("?"), segment.lastIndexOf("]"));
  return segment.slice(last + 1);
}

/**
 * Whether two single path segments can match a common name. When both contain
 * wildcards this is a conservative check on their literal prefix and suffix:
 * it may report overlap that does not exist, but never misses a real one.
 */
function segmentsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const aGlob = /[*?[]/.test(a);
  const bGlob = /[*?[]/.test(b);
  if (!aGlob && !bGlob) return false;
  if (!aGlob) return segmentToRegExp(b).test(a);
  if (!bGlob) return segmentToRegExp(a).test(b);

  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  const sa = literalSuffix(a);
  const sb = literalSuffix(b);
  return (pa.startsWith(pb) || pb.startsWith(pa)) && (sa.endsWith(sb) || sb.endsWith(sa));
}

function pathsOverlap(a: string[], b: string[]): boolean {
  const memo = new Map<string, boolean>();

  const visit = (i: number, j: number): boolean => {
    const key = `${i},${j}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let result: boolean;
    if (i === a.length && j === b.length) {
      result = true;
    } else if (a[i] === "**") {
      // `**` matches zero segments, or swallows one of the other side's segments
      result = visit(i + 1, j) || (j < b.length && visit(i, j + 1));
    } else if (b[j] === "**") {
      result = visit(i, j + 1) || (i < a.length && visit(i + 1, j));
    } else if (i === a.length || j === b.length) {
      result = false;
    } else {
      result = segmentsOverlap(a[i], b[j]) && visit(i + 1, j + 1);
    }

    memo.set(key, result);
    return result;
  };

  return visit(0, 0);
}

/**
 * Whether two lock patterns could refer to at least one common path.
 * Comparison is case-insensitive so locks behave the same on Windows, macOS and Linux.
 */
export function lockPatternsOverlap(a: string, b: string, workspaceRoot?: string): boolean {
  for (const x of expandBraces(normalizeLockPattern(a, workspaceRoot))) {
    for (const y of expandBraces(normalizeLockPattern(b, workspaceRoot))) {
      if (pathsOverlap(toSegments(x), toSegments(y))) return true;
    }
  }
  return false;
}
