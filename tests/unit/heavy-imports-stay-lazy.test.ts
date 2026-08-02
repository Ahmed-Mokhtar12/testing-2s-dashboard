import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// pdfjs-dist and mammoth (plus bluebird, @xmldom/xmldom, xmlbuilder and
// dingbat-to-unicode underneath them) come to ~820 kB minified, and they live in
// exactly one module: src/utils/clientSideDocumentProcessor.ts.
//
// That module is reachable from the ENTRY chunk —
//   App -> DashboardShell -> RightChatPanel -> useChat -> useFileUpload
//        -> enhancedFileUploadHandler -> clientSideDocumentProcessor
// — so any static import of it puts the whole parser in the bundle downloaded
// before anything renders, on every route including /auth, where no document can
// be uploaded at all. That is where it was: entry chunk 1537 kB.
//
// TWO OF THE THREE EDGES EXISTED ONLY TO CARRY AN INTERFACE. `import { ProcessingProgress }`
// is a value import as far as the bundler is concerned, so the module was pulled in
// for its side effects; `import type { ProcessingProgress }` is erased and pulls in
// nothing. One keyword, 820 kB, and the two forms look identical in review — which
// is precisely why this is a test and not a comment.
//
// Deleting `type` from one of those imports, or adding a fourth static importer,
// restores the regression silently: the app still works, every other gate stays
// green, and the only symptom is a slower first paint on every page.
const SRC = 'src';
const HEAVY_MODULE = 'clientSideDocumentProcessor';
// The module that is allowed to import them, relative to SRC.
const OWNER = join(SRC, 'utils', 'clientSideDocumentProcessor.ts');
const HEAVY_PACKAGES = ['pdfjs-dist', 'mammoth'];

// Comments are stripped before any import is matched. Not fastidiousness: the very
// comments added to explain WHY these imports are type-only contain the words
// "import" and "from", and the first version of this test matched inside them and
// reported all three files as offenders — including the two it had just been
// written to protect. A test that reads prose as code is worse than no test.
//
// Approximate by design: a `//` inside a string literal on the same line as one of
// these imports would confuse it. None exists, and the anti-vacuity count below
// fails loudly if the pattern ever stops finding the real imports.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(SRC);

test('the source tree is being walked at all', () => {
  // ANTI-VACUITY for everything below: an empty file list passes every assertion.
  assert.ok(files.length > 50, `only found ${files.length} source files under ${SRC}`);
  assert.ok(files.includes(OWNER), `${OWNER} not found — has it been renamed?`);
});

test('every import of the document processor is type-only or dynamic', () => {
  // `import ... from '...clientSideDocumentProcessor'` — the static form. A
  // dynamic `await import('./clientSideDocumentProcessor')` does not match,
  // because there is no `from`.
  //
  // The middle group is a tempered match: `(?!\bfrom\b)` forbids it from crossing
  // another `from`, which pins the match to the import statement immediately
  // before the target specifier. Without that guard `[\s\S]*?` starts at the
  // FIRST import in the file and reads that statement's `type` keyword instead —
  // which reported all three files as offenders on the first run of this test,
  // including the two that had just been fixed.
  const staticImport = new RegExp(
    String.raw`import\s+(type\s+)?((?:(?!\bfrom\b)[\s\S])*?)from\s*['"][^'"]*${HEAVY_MODULE}['"]`,
    'g',
  );

  const offenders: string[] = [];
  let checked = 0;

  for (const file of files) {
    if (file === OWNER) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    if (!source.includes(HEAVY_MODULE)) continue;

    for (const match of source.matchAll(staticImport)) {
      checked += 1;
      const isTypeOnly = Boolean(match[1]);
      if (!isTypeOnly) {
        offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ').slice(0, 100)}`);
      }
    }
  }

  // ANTI-VACUITY: if the regex ever stops matching the real imports, this test
  // would report success while checking nothing. Three files import the
  // ProcessingProgress interface today.
  assert.ok(
    checked >= 3,
    `expected to find at least 3 static imports of ${HEAVY_MODULE} to check, found ${checked} — the pattern has probably drifted`,
  );

  assert.deepEqual(
    offenders,
    [],
    `these must use \`import type\` or \`await import()\`, or ~820 kB of pdfjs-dist and mammoth returns to the entry chunk:\n  ${offenders.join('\n  ')}`,
  );
});

test('nothing else in src imports pdfjs-dist or mammoth directly', () => {
  // The rule above guards one module's boundary. This one stops the parser
  // libraries being pulled in from somewhere new entirely, which would bypass it.
  for (const pkg of HEAVY_PACKAGES) {
    const importers = files.filter((file) => {
      if (file === OWNER) return false;
      const source = stripComments(readFileSync(file, 'utf8'));
      return new RegExp(String.raw`from\s+['"]${pkg}(/[^'"]*)?['"]`).test(source);
    });
    assert.deepEqual(
      importers,
      [],
      `${pkg} may only be imported by ${OWNER}, which is loaded on demand. Found: ${importers.join(', ')}`,
    );
  }
});
