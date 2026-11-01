import { solveHomography, projectPoint, previewPoint } from './geometry.js';
import './camera.css';

const CORNER_LABELS = ['top left', 'top right', 'bottom right', 'bottom left'];

function normalizedWorkspacePoints() {
  // Leave a small inset so targets remain visible on the projector.
  return [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
}

function isUsableCalibration(points, matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 9 || matrix.some((n) => !Number.isFinite(n))) return false;
  const area = Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
  return area > 1e-5;
}

export function createCameraSetup({
  getViewport = () => ({ width: 1, height: 1 }),
  getCalibration = () => null,
  onCalibration = () => {},
  onError = () => {},
  getWorkspaceSnapshot = null,
  onProjectorMarkers = () => {},
  onFrame = () => {},
} = {}) {
  let root, video, frameCanvas, frameCtx, workspaceCanvas, select, status, actions;
  let stream = null;
  let devices = [];
  let frozen = false;
  let frame = null;
  let frameWidth = 0;
  let frameHeight = 0;
  let cameraPoints = [];
  let workspacePoints = [];
  let calibration = getCalibration();
  let destroyed = false;
  let streamRequest = 0;

  const reportError = (error) => {
    const message = error?.message || String(error || 'Camera error');
    if (status) status.textContent = message;
    onError(error instanceof Error ? error : new Error(message));
  };

  function stopStream() {
    const active = stream;
    stream = null;
    if (active) active.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function drawFrame() {
    if (!frameCtx || !frame) return;
    frameCtx.clearRect(0, 0, frameWidth, frameHeight);
    frameCtx.drawImage(frame, 0, 0, frameWidth, frameHeight);
    cameraPoints.forEach(([x, y], i) => {
      frameCtx.beginPath();
      frameCtx.arc(x, y, Math.max(12, frameWidth * 0.012), 0, Math.PI * 2);
      frameCtx.fillStyle = '#ffd54a';
      frameCtx.fill();
      frameCtx.lineWidth = Math.max(3, frameWidth * 0.003);
      frameCtx.strokeStyle = '#14120a';
      frameCtx.stroke();
      frameCtx.fillStyle = '#14120a';
      frameCtx.font = `bold ${Math.max(15, frameWidth * 0.018)}px system-ui`;
      frameCtx.textAlign = 'center';
      frameCtx.textBaseline = 'middle';
      frameCtx.fillText(String(i + 1), x, y);
    });
  }

  function drawWorkspace() {
    if (!workspaceCanvas) return;
    const viewport = getViewport() || {};
    const width = Math.max(1, Math.round(viewport.width || 16));
    const height = Math.max(1, Math.round(viewport.height || 9));
    workspaceCanvas.width = width;
    workspaceCanvas.height = height;
    const ctx = workspaceCanvas.getContext('2d');
    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, width, height);
    const snapshot = getWorkspaceSnapshot?.();
    if (snapshot) {
      try { ctx.drawImage(snapshot, 0, 0, width, height); } catch { /* snapshot is optional */ }
    }
    workspacePoints.forEach(([x, y], i) => {
      const px = x * width, py = y * height;
      const radius = Math.max(9, Math.min(width, height) * 0.018);
      ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd54a'; ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, radius * 0.25); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = `bold ${radius}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), px, py);
    });
  }

  function refreshButtons() {
    if (!actions) return;
    actions.querySelector('[data-action="start"]').disabled = !!stream;
    actions.querySelector('[data-action="freeze"]').disabled = !stream || frozen;
    actions.querySelector('[data-action="retake"]').disabled = !frozen;
    actions.querySelector('[data-action="stop"]').disabled = !stream;
    actions.querySelector('[data-action="mask"]').disabled = !frozen || !calibration;
    const saved = getCalibration();
    actions.querySelector('[data-action="reuse"]').disabled = !frozen || !saved ||
      saved.frameWidth !== frameWidth || saved.frameHeight !== frameHeight ||
      (saved.cameraId && saved.cameraId !== select.value);
  }

  async function startCamera(deviceId = '') {
    stopStream();
    const request = ++streamRequest;
    frozen = false; frame = null; cameraPoints = [];
    if (frameCanvas) frameCanvas.hidden = true;
    if (video) video.hidden = false;
    calibration = null;
    workspacePoints = normalizedWorkspacePoints();
    onProjectorMarkers(workspacePoints.map(point => [...point]));
    refreshButtons();
    try {
      const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
      const acquired = await navigator.mediaDevices.getUserMedia(constraints);
      if (destroyed || request !== streamRequest || !video) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = acquired;
      await video.play();
      if (destroyed || request !== streamRequest) {
        acquired.getTracks().forEach((track) => track.stop());
        if (stream === acquired) stream = null;
        return;
      }
      devices = await navigator.mediaDevices.enumerateDevices(); // permission now reveals labels
      if (destroyed || request !== streamRequest) return;
      const track = acquired.getVideoTracks()[0];
      track?.addEventListener('ended', () => {
        if (stream !== acquired) return;
        stream = null;
        if (video) video.srcObject = null;
        refreshButtons();
        reportError(new Error('The camera disconnected. Start it again to continue.'));
      }, { once: true });
      populateDevices(track?.getSettings()?.deviceId || deviceId);
      setStatus('Live preview. Freeze a frame to mark the four corners.');
    } catch (error) {
      if (destroyed || request !== streamRequest) return;
      stopStream();
      reportError(error);
    }
    if (destroyed || request !== streamRequest) return;
    refreshButtons();
  }

  function populateDevices(selectedId = '') {
    if (!select) return;
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    select.replaceChildren();
    cameras.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      select.append(option);
    });
    if (selectedId) select.value = selectedId;
  }

  function freezeFrame() {
    if (!video.videoWidth || !video.videoHeight) return;
    calibration = null;
    frameWidth = video.videoWidth; frameHeight = video.videoHeight;
    frameCanvas.width = frameWidth; frameCanvas.height = frameHeight;
    frame = document.createElement('canvas');
    frame.width = frameWidth; frame.height = frameHeight;
    frame.getContext('2d').drawImage(video, 0, 0, frameWidth, frameHeight);
    frameCtx = frameCanvas.getContext('2d');
    cameraPoints = [];
    workspacePoints = normalizedWorkspacePoints();
    frozen = true;
    video.hidden = true; frameCanvas.hidden = false;
    drawWorkspace(); drawFrame();
    setStatus('Click corner 1: top left. Match each numbered target on the projector.');
    refreshButtons();
  }

  function completeCalibration() {
    try {
      const from = cameraPoints.map(([x, y]) => [x / frameWidth, y / frameHeight]);
      const matrix = solveHomography(from, workspacePoints);
      if (!isUsableCalibration(cameraPoints, matrix)) throw new Error('The selected points are too close together or cannot form a calibration. Retake and choose four distinct corners.');
      const projected = from.map((point) => projectPoint(matrix, point));
      if (projected.some((point, i) => point.some((value, axis) =>
        !Number.isFinite(value) || Math.abs(value - workspacePoints[i][axis]) > 1e-4))) {
        throw new Error('The selected points do not produce a stable calibration. Retake and choose four distinct corners.');
      }
      calibration = {
        matrix,
        cameraPoints: cameraPoints.map(([x, y]) => [x / frameWidth, y / frameHeight]),
        workspacePoints: workspacePoints.map((point) => [...point]),
        frameWidth,
        frameHeight,
        cameraId: select.value,
      };
      onCalibration(calibration);
      onProjectorMarkers(null);
      setStatus('Camera calibrated. Create a mask, or Retake to capture a new frame.');
    } catch (error) {
      cameraPoints = [];
      drawFrame();
      setStatus(error.message || 'Calibration failed. Retake and choose four distinct corners.');
      onError(error);
    }
    refreshButtons();
  }

  function handleFrameClick(event) {
    if (!frozen || cameraPoints.length >= 4) return;
    const point = previewPoint(event.clientX, event.clientY, frameCanvas.getBoundingClientRect(), frameWidth, frameHeight);
    if (!point) return;
    cameraPoints.push(point);
    drawFrame();
    if (cameraPoints.length < 4) {
      setStatus(`Click corner ${cameraPoints.length + 1}: ${CORNER_LABELS[cameraPoints.length]}.`);
    } else {
      completeCalibration();
    }
  }

  function open() {
    if (root) return;
    destroyed = false;
    root = document.createElement('section');
    root.className = 'camera-setup';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Camera setup');
    root.innerHTML = `
      <div class="camera-setup__panel">
        <header class="camera-setup__header"><div><p class="camera-setup__eyebrow">PHYS MAP · SETUP</p><h2>Camera calibration</h2></div><button class="camera-setup__close" type="button" aria-label="Close">×</button></header>
        <p class="camera-setup__intro">Freeze the camera view, then mark the four corners of the surface in order. Match the numbered points to the targets shown by the projector.</p>
        <label class="camera-setup__device-label" for="camera-setup-device">Camera</label>
        <select id="camera-setup-device" class="camera-setup__device"></select>
        <div class="camera-setup__body">
          <div class="camera-setup__preview-wrap"><video class="camera-setup__video" autoplay muted playsinline></video><canvas class="camera-setup__frame" hidden></canvas><div class="camera-setup__preview-hint">Live camera preview stays in this panel</div></div>
          <aside class="camera-setup__reference"><h3>Projector targets</h3><canvas class="camera-setup__workspace"></canvas><p>1 Top left · 2 Top right · 3 Bottom right · 4 Bottom left</p></aside>
        </div>
        <div class="camera-setup__status" aria-live="polite">Requesting camera access…</div>
        <footer class="camera-setup__actions"><button data-action="start" type="button">Start camera</button><button data-action="freeze" type="button">Freeze frame</button><button data-action="retake" type="button">Retake</button><button data-action="stop" type="button">Stop camera</button><span class="camera-setup__spacer"></span><button data-action="reuse" type="button">Use saved alignment</button><button data-action="mask" class="camera-setup__primary" type="button">Create mask</button></footer>
      </div>`;
    document.body.append(root);
    video = root.querySelector('video'); frameCanvas = root.querySelector('.camera-setup__frame');
    workspaceCanvas = root.querySelector('.camera-setup__workspace'); select = root.querySelector('select');
    status = root.querySelector('.camera-setup__status'); actions = root.querySelector('.camera-setup__actions');
    root.querySelector('.camera-setup__close').addEventListener('click', close);
    root.addEventListener('click', (event) => { if (event.target === root) close(); });
    root.querySelector('[data-action="freeze"]').addEventListener('click', freezeFrame);
    root.querySelector('[data-action="retake"]').addEventListener('click', () => {
      frozen = false; frame = null; cameraPoints = []; calibration = null; frameCanvas.hidden = true; video.hidden = false;
      onProjectorMarkers(workspacePoints.map((point) => [...point]));
      setStatus(stream ? 'Live preview. Freeze a frame to mark the four corners.' : 'Start the camera to continue calibration.'); refreshButtons();
    });
    root.querySelector('[data-action="start"]').addEventListener('click', () => startCamera(select.value));
    root.querySelector('[data-action="stop"]').addEventListener('click', () => { ++streamRequest; stopStream(); frozen = false; frameCanvas.hidden = true; video.hidden = false; setStatus('Camera stopped. Start it again to continue.'); refreshButtons(); });
    root.querySelector('[data-action="reuse"]').addEventListener('click', () => {
      calibration = getCalibration();
      cameraPoints = calibration.cameraPoints.map(([x,y]) => [x * frameWidth, y * frameHeight]);
      onProjectorMarkers(null); drawFrame(); refreshButtons();
      setStatus('Saved alignment restored. Create a mask, or Retake if the camera moved.');
    });
    root.querySelector('[data-action="mask"]').addEventListener('click', () => {
      if (!frame || !calibration) return;
      try {
        const imageData = frame.getContext('2d').getImageData(0, 0, frameWidth, frameHeight);
        onFrame({ imageData, calibration, width: frameWidth, height: frameHeight });
      } catch (error) { reportError(error); }
    });
    frameCanvas.addEventListener('click', handleFrameClick);
    select.addEventListener('change', () => startCamera(select.value));
    root._escape = (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    document.addEventListener('keydown', root._escape, true);
    workspacePoints = normalizedWorkspacePoints(); drawWorkspace(); refreshButtons();
    onProjectorMarkers(workspacePoints.map((point) => [...point]));
    startCamera();
  }

  function close() {
    if (!root) return;
    destroyed = true;
    ++streamRequest;
    stopStream();
    onProjectorMarkers(null);
    document.removeEventListener('keydown', root._escape, true);
    root.remove(); root = null; video = frameCanvas = frameCtx = workspaceCanvas = select = status = actions = null;
    frame = null; frozen = false;
  }

  return { open, close };
}
