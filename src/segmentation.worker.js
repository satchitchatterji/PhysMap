import { AutoProcessor, env, RawImage, SamModel } from '@huggingface/transformers';
import wasmModuleUrl from '../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import wasmUrl from '../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import { maskContour } from './maskContour.js';

const MODEL_ID = 'Xenova/slimsam-77-uniform';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = { mjs: wasmModuleUrl, wasm: wasmUrl };
env.backends.onnx.wasm.numThreads = 1;

let model = null;
let processor = null;
let image = null;
let imageEmbeddings = null;
let imagePositionalEmbeddings = null;
let originalSizes = null;
let reshapedInputSizes = null;
let width = 0;
let height = 0;
let activeFrameId = 0;

function post(type, payload = {}, transfer = []) {
  self.postMessage({ type, frameId: activeFrameId, ...payload }, transfer);
}

async function initialize(data) {
  activeFrameId = data.frameId;
  width = data.width;
  height = data.height;
  const pixels = new Uint8ClampedArray(data.pixels);
  image = new RawImage(pixels, width, height, 4).rgb();
  if (!model || !processor) {
    const progress_callback = (progress) => {
      const label = progress.file ? `${progress.status}: ${progress.file}` : progress.status;
      post('progress', { message: label || 'Loading segmentation model', progress: progress.progress });
    };
    [model, processor] = await Promise.all([
      SamModel.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'q8', progress_callback }),
      AutoProcessor.from_pretrained(MODEL_ID, { progress_callback }),
    ]);
  }
  post('progress', { message: 'Preparing camera frame…' });
  const inputs = await processor(image);
  originalSizes = inputs.original_sizes;
  reshapedInputSizes = inputs.reshaped_input_sizes;
  ({ image_embeddings: imageEmbeddings, image_positional_embeddings: imagePositionalEmbeddings } =
    await model.get_image_embeddings(inputs));
  inputs.pixel_values.dispose();
  image = null;
  post('ready');
}

async function segment(data) {
  const points = data.points;
  const input_points = [[points.map(([x, y]) => [x, y])]];
  const input_labels = [[points.map(([, , label]) => label)]];
  const pointTensor = processor.reshape_input_points(input_points, originalSizes, reshapedInputSizes);
  const labelTensor = processor.image_processor.add_input_labels(input_labels, pointTensor);
  const outputs = await model({
    image_embeddings: imageEmbeddings,
    image_positional_embeddings: imagePositionalEmbeddings,
    input_points: pointTensor,
    input_labels: labelTensor,
  });
  const masks = await processor.post_process_masks(
    outputs.pred_masks,
    originalSizes,
    reshapedInputSizes,
  );
  const maskTensor = masks[0];
  const scores = outputs.iou_scores.data;
  let best = 0;
  for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[best]) best = i;
  const dims = maskTensor.dims;
  const planeSize = dims[dims.length - 1] * dims[dims.length - 2];
  const start = best * planeSize;
  const mask = new Uint8Array(width * height);
  const selected = maskTensor.data;
  const seed = points.find(([, , label]) => label === 1);
  for (let i = 0; i < mask.length; i += 1) mask[i] = selected[start + i] ? 1 : 0;
  const score = scores[best];
  pointTensor.dispose(); labelTensor.dispose();
  outputs.pred_masks.dispose(); outputs.iou_scores.dispose(); maskTensor.dispose();
  let contour = null;
  try {
    contour = maskContour(mask, width, height, seed, 2);
  } catch (error) {
    post('mask', {
      requestId: data.requestId, mask: mask.buffer, contour: null, score,
      message: error.message,
    }, [mask.buffer]);
    return;
  }
  post('mask', {
    requestId: data.requestId, mask: mask.buffer, contour, score,
  }, [mask.buffer]);
}

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'init') {
        await initialize(data);
      } else if (data.frameId === activeFrameId && data.type === 'segment') {
        await segment(data);
      }
    } catch (error) {
      post('error', { requestId: data.requestId, message: error?.message || String(error) });
    }
  });
};
