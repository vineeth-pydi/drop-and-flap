import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const modelPath = path.join(publicRoot, 'models', 'pose_landmarker_lite.task');
const manifestPath = path.join(publicRoot, 'model-assets.json');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
// Pinned from the official version-1 bundle; initial download also matched the
// MD5 checksum supplied by Google Cloud Storage's x-goog-hash response header.
const expectedModelSha256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
const require = createRequire(import.meta.url);
const wasmNames = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateModel(bytes) {
  if (bytes.length < 2_000_000 || bytes.length > 15_000_000) {
    throw new Error(`Unexpected pose model size: ${bytes.length} bytes.`);
  }
  // MediaPipe .task bundles are ZIP containers, sometimes with a small prefix.
  const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if (bytes.subarray(0, 64).indexOf(zipSignature) < 0) {
    throw new Error('The downloaded model is not a MediaPipe ZIP task bundle.');
  }
  if (!bytes.includes(Buffer.from('pose_detector.tflite')) || !bytes.includes(Buffer.from('pose_landmarks_detector.tflite'))) {
    throw new Error('The task bundle does not contain the expected pose detector and landmark models.');
  }
  if (sha256(bytes) !== expectedModelSha256) {
    throw new Error('The pose model does not match the pinned official version-1 SHA256.');
  }
}

async function existingModel() {
  try {
    const bytes = await readFile(modelPath);
    validateModel(bytes);
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.model?.sha256 && manifest.model.sha256 !== sha256(bytes)) {
        throw new Error('The local model no longer matches its recorded SHA256.');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return bytes;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Replacing invalid local model: ${error.message}`);
    }
    return null;
  }
}

async function downloadModel() {
  console.log('Downloading the official MediaPipe Pose Landmarker Lite model…');
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  validateModel(bytes);
  const expectedMd5 = response.headers.get('x-goog-hash')?.match(/(?:^|,)\s*md5=([^,]+)/)?.[1];
  if (expectedMd5 && createHash('md5').update(bytes).digest('base64') !== expectedMd5) {
    throw new Error('Model download did not match the official storage MD5 checksum.');
  }
  const temporaryPath = `${modelPath}.download`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, modelPath);
  return bytes;
}

await mkdir(path.dirname(modelPath), { recursive: true });
const packageRoot = path.dirname(require.resolve('@mediapipe/tasks-vision'));
const packageInfo = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const wasmRoot = path.join(publicRoot, 'wasm');
await mkdir(wasmRoot, { recursive: true });
const wasmFiles = [];
for (const name of wasmNames) {
  const original = path.join(packageRoot, 'wasm', name);
  const bytes = await readFile(original);
  await cp(original, path.join(wasmRoot, name), { force: true });
  wasmFiles.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
}
// forVisionTasks defaults useModule=false. The ES module pair is not used by
// this caller, including its GPU and CPU delegates. Remove only those two
// known generated files left by an earlier full-directory copy.
for (const name of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) {
  await rm(path.join(wasmRoot, name), { force: true });
}
const wasmBytes = wasmFiles.reduce((total, file) => total + file.bytes, 0);
await mkdir(path.join(publicRoot, 'licenses'), { recursive: true });
const licensePath = path.join(publicRoot, 'licenses', 'mediapipe-LICENSE.txt');
try {
  await cp(path.join(packageRoot, 'LICENSE'), licensePath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // The npm package may omit LICENSE. Obtain the full Apache 2.0 license from
  // the official MediaPipe repository. Reuse a valid local copy when offline.
  let existingLicense = '';
  try {
    existingLicense = await readFile(licensePath, 'utf8');
  } catch (licenseError) {
    if (licenseError.code !== 'ENOENT') throw licenseError;
  }
  if (!existingLicense.includes('Version 2.0, January 2004')) {
    const response = await fetch('https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE', {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`License download failed: HTTP ${response.status}.`);
    await writeFile(licensePath, await response.text());
  }
}

const bytes = await existingModel() ?? await downloadModel();
await writeFile(manifestPath, `${JSON.stringify({
  model: {
    name: 'MediaPipe Pose Landmarker Lite',
    version: 'float16/1',
    source: modelUrl,
    license: 'Apache-2.0',
    bytes: bytes.length,
    sha256: sha256(bytes),
  },
  wasm: {
    package: '@mediapipe/tasks-vision',
    version: packageInfo.version,
    source: 'https://www.npmjs.com/package/@mediapipe/tasks-vision',
    license: 'Apache-2.0',
    bytes: wasmBytes,
    files: wasmFiles,
  },
}, null, 2)}\n`);
console.log(`Local pose assets ready. Model: ${bytes.length} bytes. SHA256: ${sha256(bytes)}`);
console.log(`MediaPipe WASM ${packageInfo.version}: ${wasmFiles.length} required files, ${wasmBytes} bytes.`);
