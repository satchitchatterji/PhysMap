import './segmentation.css';

export function createMaskEditor({ onAccept = () => {}, onError = () => {} } = {}) {
  let root = null;
  let worker = null;
  let frameId = 0;
  let requestId = 0;
  let currentRequest = 0;
  let image = null;
  let frameWidth = 0;
  let frameHeight = 0;
  let points = [];
  let contour = null;
  let mask = null;
  let mode = 1;
  let pending = false;
  let ready = false;
  let canvas, ctx, overlay, overlayCtx, status, acceptButton, foregroundButton, backgroundButton;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setPending(value) {
    pending = value;
    if (acceptButton) acceptButton.disabled = pending || !contour;
    if (canvas) canvas.classList.toggle('is-busy', pending);
  }

  function paintMask() {
    if (!overlayCtx || !mask) return;
    const pixels = new Uint8ClampedArray(frameWidth * frameHeight * 4);
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i]) {
        const offset = i * 4;
        pixels[offset] = 66;
        pixels[offset + 1] = 231;
        pixels[offset + 2] = 180;
        pixels[offset + 3] = 118;
      }
    }
    overlayCtx.putImageData(new ImageData(pixels, frameWidth, frameHeight), 0, 0);
  }

  function draw() {
    if (!ctx || !image) return;
    ctx.clearRect(0, 0, frameWidth, frameHeight);
    ctx.putImageData(image, 0, 0);
    if (mask) {
      paintMask();
      ctx.drawImage(overlay, 0, 0);
    }
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(6, Math.min(frameWidth, frameHeight) * 0.009), 0, Math.PI * 2);
      ctx.fillStyle = point.label === 1 ? '#61edb6' : '#ff657c';
      ctx.strokeStyle = '#111820';
      ctx.lineWidth = Math.max(2, Math.min(frameWidth, frameHeight) * 0.003);
      ctx.fill();
      ctx.stroke();
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    foregroundButton?.classList.toggle('active', mode === 1);
    backgroundButton?.classList.toggle('active', mode === 0);
    canvas?.classList.toggle('background-mode', mode === 0);
  }

  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    ready = false;
    setPending(false);
  }

  function startWorker() {
    frameId += 1;
    stopWorker();
    points = [];
    contour = null;
    mask = null;
    setPending(false);
    draw();
    acceptButton.disabled = true;
    setStatus('Starting segmentation model…');
    worker = new Worker(new URL('./segmentation.worker.js', import.meta.url), { type: 'module' });
    const thisWorker = worker;
    const thisFrame = frameId;
    worker.onmessage = ({ data }) => {
      if (worker !== thisWorker || data.frameId !== frameId || data.frameId !== thisFrame) return;
      if (data.type === 'progress') {
        const percent = Number.isFinite(data.progress) ? ` ${Math.round(data.progress)}%` : '';
        setStatus(`${data.message || 'Loading model'}${percent}`);
      } else if (data.type === 'ready') {
        ready = true;
        setStatus('Model ready. Add a foreground point inside the object.');
        if (points.some((point) => point.label === 1)) segment();
      } else if (data.type === 'mask') {
        if (data.requestId !== currentRequest) return;
        setPending(false);
        mask = new Uint8Array(data.mask);
        contour = data.contour;
        draw();
        acceptButton.disabled = !contour;
        setStatus(contour
          ? `Mask preview ready (score ${Number(data.score).toFixed(2)}). Add points to refine.`
          : 'No connected mask at the first foreground point. Add another point or reset.');
      } else if (data.type === 'error') {
        if (data.requestId && data.requestId !== currentRequest) return;
        setPending(false);
        setStatus(data.message || 'Segmentation failed. Retry to restart the model.');
        onError(new Error(data.message || 'Segmentation failed'));
      }
    };
    worker.onerror = (event) => {
      if (worker !== thisWorker) return;
      setPending(false);
      setStatus(event.message || 'Segmentation worker failed. Retry to restart.');
      onError(new Error(event.message || 'Segmentation worker failed'));
    };
    const pixels = new Uint8ClampedArray(image.data);
    worker.postMessage({
      type: 'init', frameId, width: frameWidth, height: frameHeight, pixels: pixels.buffer,
    }, [pixels.buffer]);
  }

  function segment() {
    if (!worker || !ready || pending || !points.some((point) => point.label === 1)) return;
    currentRequest = ++requestId;
    setPending(true);
    acceptButton.disabled = true;
    setStatus('Finding the object mask…');
    worker.postMessage({
      type: 'segment', frameId, requestId: currentRequest,
      points: points.map(({ x, y, label }) => [x, y, label]),
    });
  }

  function addPoint(event) {
    if (!image || pending) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / frameWidth, rect.height / frameHeight);
    const width = frameWidth * scale, height = frameHeight * scale;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    const x = (event.clientX - left) / scale, y = (event.clientY - top) / scale;
    if (x < 0 || y < 0 || x >= frameWidth || y >= frameHeight) return;
    points.push({ x, y, label: mode });
    contour = null;
    draw();
    if (acceptButton) acceptButton.disabled = true;
    if (ready) segment();
    else setStatus('Loading model. Your point will be used when it is ready.');
  }

  function close() {
    frameId += 1;
    currentRequest = ++requestId;
    stopWorker();
    root?.remove();
    root = null;
    image = null;
    mask = null;
    contour = null;
    if (canvas) canvas.width = canvas.height = 0;
    if (overlay) overlay.width = overlay.height = 0;
    canvas = ctx = overlay = overlayCtx = status = acceptButton = foregroundButton = backgroundButton = null;
  }

  function open({ imageData, calibration, width, height }) {
    close();
    if (!imageData?.data || !width || !height) throw new TypeError('Expected camera ImageData and dimensions');
    image = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    frameWidth = width;
    frameHeight = height;
    frameId += 1;
    points = [];
    mode = 1;
    root = document.createElement('section');
    root.className = 'mask-editor';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Create mask');
    root.innerHTML = `
      <div class="mask-editor__panel">
        <header class="mask-editor__header">
          <div><div class="mask-editor__eyebrow">CAMERA MASK</div><h2>Mark the object</h2></div>
          <button type="button" class="mask-editor__close" data-action="close" aria-label="Close">×</button>
        </header>
        <p class="mask-editor__copy">Click inside the object to include it. Add points in the background to refine the edge.</p>
        <div class="mask-editor__tools">
          <button type="button" data-action="foreground" class="active">Foreground</button>
          <button type="button" data-action="background">Background</button>
          <span class="mask-editor__spacer"></span>
          <button type="button" data-action="reset">Reset points</button>
          <button type="button" data-action="retry">Retry model</button>
        </div>
        <div class="mask-editor__stage"><canvas></canvas></div>
        <div class="mask-editor__status" role="status" aria-live="polite">Starting segmentation model…</div>
        <footer class="mask-editor__footer">
          <button type="button" data-action="cancel">Cancel</button>
          <button type="button" data-action="accept" class="primary" disabled>Use mask</button>
        </footer>
      </div>`;
    document.body.append(root);
    canvas = root.querySelector('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
    overlay = document.createElement('canvas');
    overlay.width = width;
    overlay.height = height;
    overlayCtx = overlay.getContext('2d');
    status = root.querySelector('.mask-editor__status');
    acceptButton = root.querySelector('[data-action="accept"]');
    foregroundButton = root.querySelector('[data-action="foreground"]');
    backgroundButton = root.querySelector('[data-action="background"]');
    root.querySelector('[data-action="close"]').addEventListener('click', close);
    root.querySelector('[data-action="cancel"]').addEventListener('click', close);
    foregroundButton.addEventListener('click', () => setMode(1));
    backgroundButton.addEventListener('click', () => setMode(0));
    root.querySelector('[data-action="reset"]').addEventListener('click', () => {
      currentRequest = ++requestId;
      setPending(false);
      points = []; mask = null; contour = null; draw(); acceptButton.disabled = true;
      setStatus(ready ? 'Points reset. Add a foreground point inside the object.' : 'Loading model…');
    });
    root.querySelector('[data-action="retry"]').addEventListener('click', startWorker);
    acceptButton.addEventListener('click', () => {
      if (pending || !contour) return;
      const result = contour.map((point) => [...point]);
      close();
      onAccept(result);
    });
    canvas.addEventListener('click', addPoint);
    root.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }, true);
    root.tabIndex = -1;
    draw();
    setMode(1);
    root.focus();
    // Retain the calibration argument for the caller's context; point output is
    // intentionally in original camera pixels and the caller performs mapping.
    void calibration;
    startWorker();
  }

  return { open, close };
}
