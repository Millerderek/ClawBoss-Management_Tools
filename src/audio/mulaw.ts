const MU_LAW_BIAS = 0x84;
const MU_LAW_CLIP = 32635;

const toInt16 = (buffer: Buffer): Int16Array => {
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
};

export const decodeMuLaw = (muLawBuffer: Buffer): Buffer => {
  const decoded = Buffer.alloc(muLawBuffer.length * 2);
  for (let i = 0; i < muLawBuffer.length; i += 1) {
    const muVal = muLawBuffer[i] & 0xff;
    const linear = muLawToLinear(muVal);
    decoded.writeInt16LE(linear, i * 2);
  }
  return decoded;
};

export const encodeMuLaw = (pcmBuffer: Buffer): Buffer => {
  const encoded = Buffer.alloc(pcmBuffer.length / 2);
  const samples = toInt16(pcmBuffer);
  for (let i = 0; i < samples.length; i += 1) {
    encoded[i] = linearToMuLaw(samples[i]);
  }
  return encoded;
};

const muLawToLinear = (value: number): number => {
  value = ~value & 0xff;
  const sign = (value & 0x80) ? -1 : 1;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  const sample = ((mantissa << (exponent + 3)) + (MU_LAW_BIAS << exponent) - MU_LAW_BIAS);
  return sign * sample;
};

const linearToMuLaw = (sample: number): number => {
  let pcm = sample;
  const sign = pcm < 0 ? 0x80 : 0x00;
  pcm = Math.abs(pcm);
  if (pcm > MU_LAW_CLIP) {
    pcm = MU_LAW_CLIP;
  }
  pcm += MU_LAW_BIAS;
  let exponent = 7;
  for (let exp = 0; exp < 8; exp += 1) {
    if (pcm <= (0x1f << (exp + 3))) {
      exponent = exp;
      break;
    }
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  const muLawByte = ~(sign | (exponent << 4) | mantissa);
  return muLawByte & 0xff;
};
