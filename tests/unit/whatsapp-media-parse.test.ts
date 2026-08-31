import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMediaColumn, hasMediaContent } from '../../src/lib/whatsappMedia.ts';

// Shapes below mirror what the live Media column actually holds (see the
// module header): blank strings, whitespace junk, Drive links with trailing
// newlines, structured objects, JSON-encoded strings, and arrays.

test('null and undefined mean no media', () => {
  assert.deepEqual(parseMediaColumn(null), {});
  assert.deepEqual(parseMediaColumn(undefined), {});
});

test('blank and whitespace-only strings mean no media (the 58 junk rows)', () => {
  assert.deepEqual(parseMediaColumn(''), {});
  assert.deepEqual(parseMediaColumn('\n'), {});
  assert.deepEqual(parseMediaColumn('  \n\t '), {});
});

test('a bare URL string becomes mediaUrl, trimmed of trailing newline', () => {
  assert.deepEqual(
    parseMediaColumn('https://drive.google.com/file/d/abc/view\n'),
    { mediaUrl: 'https://drive.google.com/file/d/abc/view' }
  );
});

test('a structured object with kind becomes an attachment', () => {
  const parsed = parseMediaColumn({
    url: 'https://example.supabase.co/storage/v1/object/sign/x',
    filename: 'invoice.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    kind: 'document',
  });
  assert.equal(parsed.mediaUrl, undefined);
  assert.equal(parsed.attachment?.url, 'https://example.supabase.co/storage/v1/object/sign/x');
  assert.equal(parsed.attachment?.filename, 'invoice.pdf');
  assert.equal(parsed.attachment?.kind, 'document');
});

test('an object without kind falls back to mediaUrl, honoring url/link/src', () => {
  assert.deepEqual(parseMediaColumn({ link: 'https://x.test/a' }), { mediaUrl: 'https://x.test/a' });
  assert.deepEqual(parseMediaColumn({ src: 'https://x.test/b' }), { mediaUrl: 'https://x.test/b' });
});

test('an object with a blank url is no media', () => {
  assert.deepEqual(parseMediaColumn({ url: '  ', kind: 'image' }), {});
  assert.deepEqual(parseMediaColumn({ filename: 'x.png' }), {});
});

test('a JSON-encoded object string parses like the object (poll-path parity)', () => {
  const parsed = parseMediaColumn('{"url":"https://x.test/c","kind":"image","filename":"c.png"}');
  assert.equal(parsed.attachment?.url, 'https://x.test/c');
  assert.equal(parsed.attachment?.kind, 'image');
});

test('a JSON-encoded bare string unwraps and then trims', () => {
  assert.deepEqual(parseMediaColumn('"https://x.test/d\\n"'), { mediaUrl: 'https://x.test/d' });
  assert.deepEqual(parseMediaColumn('"\\n"'), {});
});

test('arrays and non-object scalars are explicitly no media', () => {
  assert.deepEqual(parseMediaColumn(['\n', '\n']), {});
  assert.deepEqual(parseMediaColumn(123), {});
  assert.deepEqual(parseMediaColumn(true), {});
});

test('a malformed JSON-looking string degrades to a bare URL', () => {
  assert.deepEqual(parseMediaColumn('{not json'), { mediaUrl: '{not json' });
});

test('hasMediaContent agrees with parseMediaColumn', () => {
  assert.equal(hasMediaContent('\n'), false);
  assert.equal(hasMediaContent(''), false);
  assert.equal(hasMediaContent(null), false);
  assert.equal(hasMediaContent('https://x.test/e'), true);
  assert.equal(hasMediaContent({ url: 'https://x.test/f', kind: 'video' }), true);
});
