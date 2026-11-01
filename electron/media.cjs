const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');

const MEDIA_SCHEME = 'physmap-media';
const VIDEO_EXTENSIONS = new Set([
  '.avi', '.m4v', '.mkv', '.mov', '.mp4', '.ogv', '.ogg', '.webm',
]);
const CONTENT_TYPES = {
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.webm': 'video/webm',
};

function isAllowedVideoPath(filePath) {
  return typeof filePath === 'string' && VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// Returns undefined when no Range header was supplied, null for an invalid range,
// and an inclusive { start, end } range for a valid single byte range.
function parseByteRange(header, size) {
  if (header == null || header === '') return undefined;
  if (typeof header !== 'string' || !Number.isSafeInteger(size) || size < 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || size === 0 || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
      return null;
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function createMediaProtocolHandler() {
  const allowedPaths = new Map();
  const pathTokens = new Map();

  function makeVideoUrl(filePath) {
    const token = pathTokens.get(filePath) || randomUUID();
    pathTokens.set(filePath, token);
    allowedPaths.set(token, filePath);
    return `${MEDIA_SCHEME}://video/${token}`;
  }

  async function handle(request) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    let token;
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'video' || url.search || url.hash) {
        return new Response(null, { status: 404 });
      }
      token = url.pathname.slice(1);
      if (!token || token.includes('/')) return new Response(null, { status: 404 });
    } catch {
      return new Response(null, { status: 404 });
    }

    const filePath = allowedPaths.get(token);
    if (!filePath) return new Response(null, { status: 404 });

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (!stat.isFile()) return new Response(null, { status: 404 });

    const extension = path.extname(filePath).toLowerCase();
    if (!CONTENT_TYPES[extension]) return new Response(null, { status: 415 });
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': CONTENT_TYPES[extension],
      'Content-Length': String(stat.size),
    };
    const range = parseByteRange(request.headers.get('range'), stat.size);
    if (range === null) {
      headers['Content-Range'] = `bytes */${stat.size}`;
      headers['Content-Length'] = '0';
      return new Response(null, { status: 416, headers });
    }

    let status = 200;
    let start = 0;
    let end = stat.size - 1;
    if (range) {
      ({ start, end } = range);
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = String(end - start + 1);
    }

    if (request.method === 'HEAD' || stat.size === 0) {
      return new Response(null, { status, headers });
    }
    const fileStream = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(fileStream), { status, headers });
  }

  return { handle, makeVideoUrl };
}

async function getVideoInfo(filePath, makeVideoUrl) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('A video file path is required.');
  }
  if (!path.isAbsolute(filePath)) throw new Error('Choose a video using an absolute file path.');
  if (!isAllowedVideoPath(filePath)) throw new Error('Unsupported video file type.');
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch (error) {
    throw new Error(`Video file could not be opened: ${error.message}`);
  }
  if (!stat.isFile()) throw new Error('The selected video path is not a regular file.');
  return {
    path: filePath,
    name: path.basename(filePath),
    url: makeVideoUrl(filePath),
  };
}

module.exports = {
  MEDIA_SCHEME,
  VIDEO_EXTENSIONS,
  createMediaProtocolHandler,
  getVideoInfo,
  isAllowedVideoPath,
  parseByteRange,
};
