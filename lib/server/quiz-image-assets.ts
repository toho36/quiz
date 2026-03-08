import { CONTRACT_LIMITS, QUIZ_IMAGE_CONTENT_TYPES, type QuizImageAssetReference, type QuizImageContentType } from '@/lib/shared/contracts';
import { InvalidOperationError } from '@/lib/server/service-errors';

export type StoredQuizImageAsset = QuizImageAssetReference & {
  data: Uint8Array;
};

export const QUIZ_IMAGE_STORED_BYTES_CAP = 8 * 1024 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<QuizImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const JPEG_START_OF_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export const QUIZ_IMAGE_ACCEPT_VALUE = QUIZ_IMAGE_CONTENT_TYPES.join(',');

export function buildQuizImageObjectKey(input: {
  quizId: string;
  questionId: string;
  optionId?: string;
  contentType: QuizImageContentType;
}) {
  const extension = CONTENT_TYPE_EXTENSIONS[input.contentType];
  const assetId = globalThis.crypto.randomUUID();
  return input.optionId
    ? `quiz-images/${input.quizId}/questions/${input.questionId}/options/${input.optionId}/${assetId}.${extension}`
    : `quiz-images/${input.quizId}/questions/${input.questionId}/${assetId}.${extension}`;
}

export async function storeQuizImageUpload(input: { file: File; objectKey: string }): Promise<StoredQuizImageAsset> {
  const contentType = validateQuizImageFile(input.file);

  const data = new Uint8Array(await input.file.arrayBuffer());
  if (data.byteLength < 1) {
    throw new InvalidOperationError('Choose a PNG, JPEG, or WebP image to upload.');
  }
  if (data.byteLength > CONTRACT_LIMITS.quizImageMaxBytes) {
    throw new InvalidOperationError('Images must be 5 MiB or smaller.');
  }

  const { width, height } = readImageDimensions(data, contentType);
  if (width > CONTRACT_LIMITS.quizImageMaxDimension || height > CONTRACT_LIMITS.quizImageMaxDimension) {
    throw new InvalidOperationError('Images must be 4096×4096 or smaller.');
  }

  return {
    storage_provider: 'cloudflare_r2',
    object_key: input.objectKey,
    content_type: contentType,
    bytes: data.byteLength,
    width,
    height,
    data,
  };
}

export function validateQuizImageFile(file: File) {
  const contentType = file.type as QuizImageContentType;
  if (!QUIZ_IMAGE_CONTENT_TYPES.includes(contentType)) {
    throw new InvalidOperationError('Only PNG, JPEG, and WebP images are supported.');
  }
  if (file.size < 1) {
    throw new InvalidOperationError('Choose a PNG, JPEG, or WebP image to upload.');
  }
  if (file.size > CONTRACT_LIMITS.quizImageMaxBytes) {
    throw new InvalidOperationError('Images must be 5 MiB or smaller.');
  }
  return contentType;
}

function readImageDimensions(data: Uint8Array, contentType: QuizImageContentType) {
  switch (contentType) {
    case 'image/png':
      return readPngDimensions(data);
    case 'image/jpeg':
      return readJpegDimensions(data);
    case 'image/webp':
      return readWebpDimensions(data);
  }
}

function readPngDimensions(data: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.byteLength < 24 || !signature.every((value, index) => data[index] === value)) {
    throw new InvalidOperationError('Could not read image dimensions from the uploaded PNG.');
  }
  const chunkType = String.fromCharCode(data[12]!, data[13]!, data[14]!, data[15]!);
  if (chunkType !== 'IHDR') {
    throw new InvalidOperationError('Could not read image dimensions from the uploaded PNG.');
  }
  return {
    width: readUint32BigEndian(data, 16),
    height: readUint32BigEndian(data, 20),
  };
}

function readJpegDimensions(data: Uint8Array) {
  if (data.byteLength < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new InvalidOperationError('Could not read image dimensions from the uploaded JPEG.');
  }

  let offset = 2;
  while (offset + 8 < data.byteLength) {
    while (offset < data.byteLength && data[offset] === 0xff) {
      offset += 1;
    }
    const marker = data[offset];
    offset += 1;
    if (marker === undefined) {
      break;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const segmentLength = readUint16BigEndian(data, offset);
    if (segmentLength < 2 || offset + segmentLength > data.byteLength) {
      break;
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      return {
        height: readUint16BigEndian(data, offset + 3),
        width: readUint16BigEndian(data, offset + 5),
      };
    }
    offset += segmentLength;
  }

  throw new InvalidOperationError('Could not read image dimensions from the uploaded JPEG.');
}

function readWebpDimensions(data: Uint8Array) {
  if (data.byteLength < 30 || readAscii(data, 0, 4) !== 'RIFF' || readAscii(data, 8, 4) !== 'WEBP') {
    throw new InvalidOperationError('Could not read image dimensions from the uploaded WebP image.');
  }

  const chunkType = readAscii(data, 12, 4);
  if (chunkType === 'VP8X') {
    return {
      width: 1 + readUint24LittleEndian(data, 24),
      height: 1 + readUint24LittleEndian(data, 27),
    };
  }
  if (chunkType === 'VP8 ') {
    if (readUint24LittleEndian(data, 23) !== 0x2a019d) {
      throw new InvalidOperationError('Could not read image dimensions from the uploaded WebP image.');
    }
    return {
      width: readUint16LittleEndian(data, 26) & 0x3fff,
      height: readUint16LittleEndian(data, 28) & 0x3fff,
    };
  }
  if (chunkType === 'VP8L') {
    const b1 = data[21];
    const b2 = data[22];
    const b3 = data[23];
    const b4 = data[24];
    if (data[20] !== 0x2f || b1 === undefined || b2 === undefined || b3 === undefined || b4 === undefined) {
      throw new InvalidOperationError('Could not read image dimensions from the uploaded WebP image.');
    }
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + (((b2 & 0xc0) >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }

  throw new InvalidOperationError('Could not read image dimensions from the uploaded WebP image.');
}

function readAscii(data: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...data.slice(offset, offset + length));
}

function readUint16BigEndian(data: Uint8Array, offset: number) {
  return (data[offset]! << 8) | data[offset + 1]!;
}

function readUint16LittleEndian(data: Uint8Array, offset: number) {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readUint24LittleEndian(data: Uint8Array, offset: number) {
  return data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16);
}

function readUint32BigEndian(data: Uint8Array, offset: number) {
  return (data[offset]! * 0x1000000) + ((data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!);
}