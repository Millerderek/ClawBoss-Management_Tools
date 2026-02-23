export const resampleBuffer = (
  buffer: Buffer,
  fromRate: number,
  toRate: number
): Buffer => {
  if (fromRate === toRate) {
    return buffer;
  }

  const inputSamples = buffer.length / 2;
  if (inputSamples === 0) {
    return Buffer.alloc(0);
  }

  const ratio = toRate / fromRate;
  const outputSamples = Math.max(1, Math.floor(inputSamples * ratio));
  const input = new Int16Array(buffer.buffer, buffer.byteOffset, inputSamples);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i += 1) {
    const srcPos = i / ratio;
    const srcIndex = Math.floor(srcPos);
    const srcNext = Math.min(inputSamples - 1, srcIndex + 1);
    const frac = srcPos - srcIndex;
    const value = Math.round(input[srcIndex] + frac * (input[srcNext] - input[srcIndex]));
    output.writeInt16LE(value, i * 2);
  }

  return output;
};
