import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppText, type WaToken } from '../../src/lib/whatsappFormat.ts';

const flat = (tokens: WaToken[]): string =>
  tokens
    .map((t) => {
      switch (t.kind) {
        case 'text': return t.text;
        case 'link': return `[${t.text}](${t.href})`;
        case 'mono': return `<mono>${t.text}</mono>`;
        default: return `<${t.kind}>${flat(t.children)}</${t.kind}>`;
      }
    })
    .join('');

test('plain text passes through untouched', () => {
  assert.equal(flat(parseWhatsAppText('hello world')), 'hello world');
});

test('bold, italic, strike each wrap', () => {
  assert.equal(flat(parseWhatsAppText('a *b* c')), 'a <bold>b</bold> c');
  assert.equal(flat(parseWhatsAppText('a _b_ c')), 'a <italic>b</italic> c');
  assert.equal(flat(parseWhatsAppText('a ~b~ c')), 'a <strike>b</strike> c');
});

test('AI-style *Bold heading:* at start of line works', () => {
  assert.equal(
    flat(parseWhatsAppText('*Check-in:* 3 PM')),
    '<bold>Check-in:</bold> 3 PM'
  );
});

test('nesting: bold containing italic', () => {
  assert.equal(
    flat(parseWhatsAppText('*bold _both_*')),
    '<bold>bold <italic>both</italic></bold>'
  );
});

test('unmatched and empty markers stay literal', () => {
  assert.equal(flat(parseWhatsAppText('2 * 3 = 6')), '2 * 3 = 6');
  assert.equal(flat(parseWhatsAppText('a ** b')), 'a ** b');
  assert.equal(flat(parseWhatsAppText('snake_case_name stays')), 'snake_case_name stays');
});

test('markers do not span newlines', () => {
  assert.equal(flat(parseWhatsAppText('*a\nb*')), '*a\nb*');
});

test('mono block is verbatim, not re-parsed', () => {
  assert.equal(
    flat(parseWhatsAppText('run ```npm *install*``` now')),
    'run <mono>npm *install*</mono> now'
  );
});

test('unclosed triple backticks stay literal', () => {
  assert.equal(flat(parseWhatsAppText('```oops')), '```oops');
});

test('http and www links are detected, trailing punctuation trimmed', () => {
  assert.equal(
    flat(parseWhatsAppText('see https://example.com/x.')),
    'see [https://example.com/x](https://example.com/x).'
  );
  assert.equal(
    flat(parseWhatsAppText('visit www.example.com!')),
    'visit [www.example.com](https://www.example.com)!'
  );
});

test('links inside formatting still link', () => {
  assert.equal(
    flat(parseWhatsAppText('*see https://a.test/b*')),
    '<bold>see [https://a.test/b](https://a.test/b)</bold>'
  );
});

test('arabic text with markers formats without corruption', () => {
  assert.equal(
    flat(parseWhatsAppText('اضغط زر *Take Over* في الأعلى')),
    'اضغط زر <bold>Take Over</bold> في الأعلى'
  );
});

test('empty input yields no tokens', () => {
  assert.deepEqual(parseWhatsAppText(''), []);
});
