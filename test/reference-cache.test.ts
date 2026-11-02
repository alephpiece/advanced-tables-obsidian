import { referenceEnvironment } from '../src/reference-cache';
import { createVisibleTextProjector } from '../src/visible-text';
import MarkdownIt from 'markdown-it';
import assert from 'node:assert/strict';
import test from 'node:test';

test('reference snapshots follow edits, undo and note changes in the same editor', () => {
  const owner = {};
  let document = '[ref]: /target';
  const projectReference = (): string =>
    createVisibleTextProjector(() => document, owner)('[label][ref]');
  assert.equal(projectReference(), 'label');
  assert.equal(projectReference(), 'label');
  document = 'No reference definitions';
  assert.equal(projectReference(), '[label][ref]');
  document = '[ref]: /target';
  assert.equal(projectReference(), 'label');
  document = '```md\n[ref]: /target\n```';
  assert.equal(projectReference(), '[label][ref]');
  const otherEditor = createVisibleTextProjector(() => '', {});
  assert.equal(otherEditor('[label][ref]'), '[label][ref]');
});

test('cell edits, row insertion and column changes reuse reference definitions', () => {
  const markdown = new MarkdownIt({ html: true });
  const owner = {};
  let document =
    '| A | B |\n| --- | --- |\n| [one][ref] | 1 |\n\n[ref]: /target\n\n| Other |\n| --- |\n| [two][ref] |\n';
  const initial = referenceEnvironment(markdown, document, owner);
  document = document.replace('[one][ref]', '[longer label][ref]');
  assert.equal(referenceEnvironment(markdown, document, owner), initial);
  document = document.replace('| 1 |', '| 1 |\n| added | 2 |');
  assert.equal(referenceEnvironment(markdown, document, owner), initial);
  const firstTableEnd = document.indexOf('\n\n');
  document =
    '| A | B | C |\n| --- | --- | --- |\n| changed | 1 | 2 |' +
    document.slice(firstTableEnd);
  assert.equal(referenceEnvironment(markdown, document, owner), initial);
  // The first table changed length; the second table's offsets must follow it.
  document = document.replace('[two][ref]', '[last][ref]');
  assert.equal(referenceEnvironment(markdown, document, owner), initial);
});

test('new rows at EOF reuse references with LF, CRLF and CR line endings', () => {
  const markdown = new MarkdownIt({ html: true });
  for (const newline of ['\n', '\r\n', '\r']) {
    const owner = {};
    const document = [
      '[ref]: /target',
      '',
      '| A |',
      '| --- |',
      '| [one][ref] |',
    ].join(newline);
    const initial = referenceEnvironment(markdown, document, owner);
    assert.equal(
      referenceEnvironment(
        markdown,
        document + newline + '| [two][ref] |',
        owner,
      ),
      initial,
    );
  }
});

test('table edits after a long prefix reuse references and retain correct offsets', () => {
  const markdown = new MarkdownIt({ html: true });
  const owner = {};
  const document =
    'Ordinary paragraph.\n\n'.repeat(220) +
    '[ref]: /target\n\n| A |\n| --- |\n| [one][ref] |';
  const initial = referenceEnvironment(markdown, document, owner);
  const edited = document.replace('[one]', '[longer 中文]');
  assert.equal(referenceEnvironment(markdown, edited, owner), initial);
  const outsideEdit = 'New paragraph.\n\n' + edited;
  const reparsed = referenceEnvironment(markdown, outsideEdit, owner);
  assert.notEqual(reparsed, initial);
  assert.equal(
    referenceEnvironment(
      markdown,
      outsideEdit.replace('[longer 中文]', '[last]'),
      owner,
    ),
    reparsed,
  );
});

test('structural edits fall back to a fresh parse of reference definitions', () => {
  const markdown = new MarkdownIt({ html: true });
  const original = '| A |\n| --- |\n| [one][ref] |\n\n[ref]: /target\n';
  const edits = [
    original.replace('/target', '/changed'),
    '```md\n' + original,
    original.replace('| --- |', 'not a table'),
    original.replace('\n\n[ref]', '\n[ref]'),
    original.replace(
      '| [one][ref] |',
      '| [one][ref] |\n\n[new]: /new\n\nparagraph',
    ),
  ];
  for (const document of edits) {
    const owner = {};
    const initial = referenceEnvironment(markdown, original, owner);
    const updated = referenceEnvironment(markdown, document, owner);
    assert.notEqual(updated, initial, document);
    assert.deepEqual(
      updated,
      referenceEnvironment(markdown, document),
      document,
    );
  }
});

test('table boundaries next to other blocks are conservatively reparsed', () => {
  const markdown = new MarkdownIt({ html: true });
  const owner = {};
  const document =
    '| A |\n| --- |\n| [one][ref] |\n# Heading\n\n[ref]: /target\n';
  const initial = referenceEnvironment(markdown, document, owner);
  const updated = referenceEnvironment(
    markdown,
    document.replace('[one]', '[two]'),
    owner,
  );
  assert.notEqual(updated, initial);
  assert.deepEqual(
    updated,
    referenceEnvironment(markdown, document.replace('[one]', '[two]')),
  );
});

test('indenting a table into a preceding list immediately updates new references', () => {
  const markdown = new MarkdownIt({ html: true });
  const owner = {};
  const before = '- item\n\n| A |\n| --- |\n| x |\n\n[ref]: /target\n';
  const after =
    '- item\n\n  | A |\n  | --- |\n  | x |\n[new]: /new\n\n[ref]: /target\n';
  const initial = referenceEnvironment(markdown, before, owner);
  const updated = referenceEnvironment(markdown, after, owner);
  assert.notEqual(updated, initial);
  assert.deepEqual(updated, referenceEnvironment(markdown, after));
  assert.equal(updated.references?.NEW?.href, '/new');
  assert.equal(
    createVisibleTextProjector(() => after, owner)('[label][new]'),
    'label',
  );
});

test('indented or pipe-less rows in either snapshot require a full reparse', () => {
  const markdown = new MarkdownIt({ html: true });
  const ordinary = '| A |\n| --- |\n| x |\n\n[ref]: /target\n';
  const variants = [
    ' | A |\n | --- |\n | x |\n\n[ref]: /target\n',
    '| A |\n| --- |\n  | x |\n\n[ref]: /target\n',
    '| A |\n| --- |\nx\n\n[ref]: /target\n',
  ];
  for (const variant of variants) {
    for (const [before, after] of [
      [ordinary, variant],
      [variant, ordinary],
    ]) {
      const owner = {};
      const initial = referenceEnvironment(markdown, before, owner);
      const updated = referenceEnvironment(markdown, after, owner);
      assert.notEqual(updated, initial);
      assert.deepEqual(updated, referenceEnvironment(markdown, after));
    }
  }
});

test('edits spanning two tables never reuse a partial reference snapshot', () => {
  const markdown = new MarkdownIt({ html: true });
  const owner = {};
  const document =
    '| A |\n| --- |\n| one |\n\n[ref]: /target\n\n| B |\n| --- |\n| two |\n';
  const initial = referenceEnvironment(markdown, document, owner);
  const edited = document
    .replace('one', 'changed one')
    .replace('two', 'changed two');
  const updated = referenceEnvironment(markdown, edited, owner);
  assert.notEqual(updated, initial);
  assert.deepEqual(updated, referenceEnvironment(markdown, edited));
});
