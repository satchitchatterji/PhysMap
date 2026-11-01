const test = require('node:test');
const assert = require('node:assert/strict');
const { parseByteRange } = require('../electron/media.cjs');
const { createMediaProtocolHandler, getVideoInfo } = require('../electron/media.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('parses explicit and open-ended byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=0-100', 10), { start: 0, end: 9 });
});

test('parses suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-40', 10), { start: 0, end: 9 });
});

test('distinguishes missing and invalid ranges', () => {
  assert.equal(parseByteRange(null, 10), undefined);
  assert.equal(parseByteRange('bytes=10-', 10), null);
  assert.equal(parseByteRange('bytes=5-4', 10), null);
  assert.equal(parseByteRange('bytes=-0', 10), null);
  assert.equal(parseByteRange('bytes=0-1,4-5', 10), null);
  assert.equal(parseByteRange('items=0-1', 10), null);
  assert.equal(parseByteRange('bytes=0-', 0), null);
});

test('streams only the requested bytes and rejects unknown tokens', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'physmap-media-'));
  try {
    const file = path.join(dir, 'clip.mp4');
    await fs.writeFile(file, '0123456789');
    const protocol = createMediaProtocolHandler();
    const { url } = await getVideoInfo(file, protocol.makeVideoUrl);
    const partial = await protocol.handle(new Request(url, { headers: { Range: 'bytes=7-' } }));
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 7-9/10');
    assert.equal(partial.headers.get('content-length'), '3');
    assert.equal(await partial.text(), '789');
    const head = await protocol.handle(new Request(url, { method: 'HEAD' }));
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    const invalid = await protocol.handle(new Request(url, { headers: { Range: 'bytes=99-' } }));
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */10');
    assert.equal((await protocol.handle(new Request('physmap-media://video/missing'))).status, 404);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
