import { test } from "node:test";
import assert from "node:assert/strict";
import { expandBraces, lockPatternsOverlap, normalizeLockPattern } from "../dist/index.js";

test("normalizeLockPattern canonicalizes equivalent spellings", () => {
  assert.equal(normalizeLockPattern("src\\auth\\login.ts"), "src/auth/login.ts");
  assert.equal(normalizeLockPattern("./src/auth"), "src/auth");
  assert.equal(normalizeLockPattern("src//auth/../user/**"), "src/user/**");
  assert.equal(normalizeLockPattern("."), "**");
  assert.equal(normalizeLockPattern("./"), "**");
  assert.equal(normalizeLockPattern(""), "**");
});

test("normalizeLockPattern turns a trailing slash into an explicit subtree", () => {
  assert.equal(normalizeLockPattern("./src/auth/"), "src/auth/**");
  assert.equal(normalizeLockPattern("src\\v1.2\\"), "src/v1.2/**");
  assert.equal(normalizeLockPattern("src/**/"), "src/**");
});

test("normalizeLockPattern makes absolute workspace paths relative", () => {
  const root = "D:\\work\\repo";
  assert.equal(normalizeLockPattern("D:\\work\\repo\\src\\index.ts", root), "src/index.ts");
  assert.equal(normalizeLockPattern("d:/work/repo/src/**", root), "src/**");
  assert.equal(normalizeLockPattern("D:\\work\\repo", root), "**");
  assert.equal(normalizeLockPattern("D:\\work\\repository\\x.ts", root), "D:/work/repository/x.ts");
});

test("expandBraces expands alternatives, including nested ones", () => {
  assert.deepEqual(expandBraces("src/{auth,user}/**"), ["src/auth/**", "src/user/**"]);
  assert.deepEqual(expandBraces("{a,b{c,d}}.ts"), ["a.ts", "bc.ts", "bd.ts"]);
  assert.deepEqual(expandBraces("no-braces"), ["no-braces"]);
  assert.deepEqual(expandBraces("{single}"), ["{single}"]);
});

const cases = [
  // [a, b, overlaps]
  ["src/auth/**", "src/auth/login.ts", true],
  ["src/auth", "src/auth/login.ts", true],
  ["src/auth/", "src/auth/deep/nested/file.ts", true],
  [".github", ".github/workflows/ci.yml", true],
  ["src/v1.2/", "src/v1.2/index.ts", true],
  ["src/a/b.ts", "src/a/b.ts", true],
  ["src/a/b.ts", "src/a/b.ts.map", false],
  ["test/**/*.test.mjs", "test/helpers.mjs", false],
  ["**/*.ts", "Makefile", true],
  ["src/auth/**", "src/user/**", false],
  ["src/auth", "src/authz/index.ts", false],
  ["package.json", "package.json", true],
  ["package.json", "package-lock.json", false],
  ["src/*.ts", "src/index.ts", true],
  ["src/*.ts", "src/lib/index.ts", false],
  ["src/*", "src/lib", true],
  ["**/*.test.ts", "src/a/b.test.ts", true],
  ["**/*.test.ts", "src/a/b.ts", false],
  ["src/**/index.ts", "src/index.ts", true],
  ["src/{auth,user}/**", "src/user/x.ts", true],
  ["src/{auth,user}/**", "src/billing/x.ts", false],
  ["src/*.ts", "src/*.js", false],
  ["src/a*.ts", "src/*b.ts", true],
  ["src/file?.ts", "src/file1.ts", true],
  ["src/file?.ts", "src/file10.ts", false],
  ["src/[ab].ts", "src/a.ts", true],
  ["src/[ab].ts", "src/c.ts", false],
  ["src/[!ab].ts", "src/a.ts", false],
  ["SRC/Auth.ts", "src/auth.ts", true],
  ["src\\auth\\**", "src/auth/x.ts", true],
  ["**", "anything/here.ts", true],
  ["docs/**", "src/**", false],
  ["src/**/*.ts", "src/**/*.md", false],
  ["src/**/*.ts", "src/**", true],
];

for (const [a, b, expected] of cases) {
  test(`overlap(${a}, ${b}) === ${expected}`, () => {
    assert.equal(lockPatternsOverlap(a, b), expected);
    assert.equal(lockPatternsOverlap(b, a), expected, "overlap must be symmetric");
  });
}
