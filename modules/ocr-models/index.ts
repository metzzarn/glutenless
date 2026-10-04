import { requireOptionalNativeModule } from 'expo';

export type BenchInput = { name: string; shape: number[]; type?: 'float' | 'int64' };
export type BenchResult = { model: string; provider: string; loadMs: number; firstMs: number; medianMs: number; minMs: number };

type NativeOcrModels = {
  modelDir(): string | null;
  benchmarkAsync(modelFile: string, inputs: BenchInput[], runs: number, provider: string): Promise<BenchResult>;
};

// Android only for now.
const native = requireOptionalNativeModule<NativeOcrModels>('OcrModels');

export function modelDir(): string | null {
  return native?.modelDir() ?? null;
}

/** Times one ONNX model (a file in modelDir()) on random input: load time, first run, then the median of `runs`. */
export function benchmarkAsync(modelFile: string, inputs: BenchInput[], runs = 5, provider: 'cpu' | 'xnnpack' = 'cpu'): Promise<BenchResult> {
  if (!native) return Promise.reject(new Error('OCR models are only available on Android'));
  return native.benchmarkAsync(modelFile, inputs, runs, provider);
}
