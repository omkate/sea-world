import { AgXToneMapping, WebGPURenderer } from 'three/webgpu';

export interface RendererInfo {
  renderer: WebGPURenderer;
  backend: 'webgpu' | 'webgl2';
  maxTextureSize: number;
  gpuVendor: string | undefined;
}

export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export async function createRenderer(canvas: HTMLCanvasElement, forceWebGL: boolean): Promise<RendererInfo> {
  const hasWebGPU = 'gpu' in navigator;
  if (!hasWebGPU && !hasWebGL2()) throw new Error('No WebGPU or WebGL2 support');

  const renderer = new WebGPURenderer({ canvas, antialias: false, forceWebGL, powerPreference: 'high-performance' });
  await renderer.init();
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.info.autoReset = false;

  const backendObj = renderer.backend as unknown as { isWebGPUBackend?: boolean; device?: GPUDevice; adapter?: GPUAdapter };
  const backend = backendObj.isWebGPUBackend ? 'webgpu' : 'webgl2';
  let maxTextureSize = 8192;
  let gpuVendor: string | undefined;
  if (backend === 'webgpu' && backendObj.device) {
    maxTextureSize = backendObj.device.limits.maxTextureDimension2D;
    gpuVendor = backendObj.device.adapterInfo?.vendor;
  } else {
    const gl = (renderer.backend as unknown as { gl?: WebGL2RenderingContext }).gl;
    if (gl) {
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpuVendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
    }
  }
  return { renderer, backend, maxTextureSize, gpuVendor };
}
