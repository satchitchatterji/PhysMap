// Runtime media stays outside scene snapshots. Browser File handles last this session.
const browserFiles = new Map();

export function browserVideo(file) {
  const id = crypto.randomUUID();
  browserFiles.set(id, file);
  return { kind: 'browser', id, name: file.name };
}

export function disposeVideo(shape) {
  shape._videoLoad = null;
  const video = shape._video;
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    shape._video = null;
  }
  if (shape._videoUrl) URL.revokeObjectURL(shape._videoUrl);
  shape._videoUrl = null;
}

export async function mountVideo(shape, pool, desktop, onUpdate = () => {}) {
  disposeVideo(shape);
  shape._videoError = '';
  if (!shape.video) return;
  const request = {};
  shape._videoLoad = request;
  try {
    let url;
    if (typeof shape.video === 'string') url = shape.video; // Legacy embedded video.
    else if (shape.video.kind === 'file' && desktop) {
      ({ url } = await desktop.resolveVideo(shape.video.path));
    } else if (shape.video.kind === 'browser') {
      const file = browserFiles.get(shape.video.id);
      if (!file) throw new Error('Reselect this video after reopening the browser.');
      url = URL.createObjectURL(file);
    } else throw new Error('Relink this local video in the desktop app.');
    if (shape._videoLoad !== request) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      return;
    }
    if (url.startsWith('blob:')) shape._videoUrl = url;
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.addEventListener('error', () => {
      shape._videoError = 'Cannot play this video. Try H.264 MP4 or relink the file.';
      onUpdate(shape);
    });
    for (const event of ['loadedmetadata', 'timeupdate', 'play', 'pause']) {
      video.addEventListener(event, () => onUpdate(shape));
    }
    shape._video = video;
    video.src = url;
    pool.appendChild(video);
    await video.play().catch(() => {});
  } catch (error) {
    if (shape._videoLoad !== request) return;
    shape._videoError = error.message;
    onUpdate(shape);
  }
}
