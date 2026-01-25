import { z } from 'zod';

/**
 * Size units for file size limits
 */
type SizeUnit = 'b' | 'kb' | 'mb' | 'gb';

/**
 * Parse a size string like "5mb" into bytes
 */
function parseSize(size: string | number): number {
  if (typeof size === 'number') {
    return size;
  }

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}. Use formats like "5mb", "1024kb", or "1gb"`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'b') as SizeUnit;

  const multipliers: Record<SizeUnit, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}

/**
 * Check if a MIME type matches a pattern
 * Supports wildcards like "image/*"
 */
function mimeTypeMatches(mimeType: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') {
    return true;
  }

  if (pattern.endsWith('/*')) {
    const category = pattern.slice(0, -2);
    return mimeType.startsWith(category + '/');
  }

  return mimeType === pattern;
}

/**
 * Options for file validation
 */
export interface FormFileOptions {
  /**
   * Maximum file size. Can be a number (bytes) or a string like "5mb"
   */
  maxSize?: string | number;

  /**
   * Minimum file size. Can be a number (bytes) or a string like "1kb"
   */
  minSize?: string | number;

  /**
   * Allowed MIME types. Supports wildcards like "image/*"
   * @example ['image/*', 'application/pdf']
   */
  types?: string[];

  /**
   * Allowed file extensions (without the dot)
   * @example ['jpg', 'png', 'pdf']
   */
  extensions?: string[];

  /**
   * Whether the file is required
   * @default true
   */
  required?: boolean;
}

/**
 * Validated file data returned after successful validation
 */
export interface ValidatedFile {
  /** Original file name */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  type: string;
  /** The File object (browser) or Blob */
  file: File | Blob;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** Get file as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Get file as text */
  text(): Promise<string>;
  /** Get file as readable stream */
  stream(): ReadableStream<Uint8Array>;
}

/**
 * Create a validated file object from a File
 */
function createValidatedFile(file: File): ValidatedFile {
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase() ?? ''
    : '';

  return {
    name: file.name,
    size: file.size,
    type: file.type,
    file,
    extension,
    arrayBuffer: () => file.arrayBuffer(),
    text: () => file.text(),
    stream: () => file.stream(),
  };
}

/**
 * Create a Zod schema for file validation with common file constraints.
 *
 * @example
 * ```typescript
 * import { formFile } from 'next-request';
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   avatar: formFile({ maxSize: '5mb', types: ['image/*'] }),
 *   document: formFile({ maxSize: '10mb', types: ['application/pdf'] }),
 *   attachment: formFile({ maxSize: '20mb', extensions: ['pdf', 'doc', 'docx'] }),
 * });
 * ```
 */
export function formFile(options: FormFileOptions = {}): z.ZodType<ValidatedFile> {
  const {
    maxSize,
    minSize,
    types,
    extensions,
    required = true,
  } = options;

  const maxSizeBytes = maxSize ? parseSize(maxSize) : undefined;
  const minSizeBytes = minSize ? parseSize(minSize) : undefined;

  const fileSchema = z
    .instanceof(File, { message: 'Expected a file' })
    .refine(
      (file) => {
        if (!required && file.size === 0) return true;
        return file.size > 0;
      },
      { message: 'File is required' }
    )
    .refine(
      (file) => {
        if (!maxSizeBytes) return true;
        return file.size <= maxSizeBytes;
      },
      {
        message: maxSize
          ? `File size must not exceed ${typeof maxSize === 'string' ? maxSize : `${maxSize} bytes`}`
          : 'File is too large',
      }
    )
    .refine(
      (file) => {
        if (!minSizeBytes) return true;
        return file.size >= minSizeBytes;
      },
      {
        message: minSize
          ? `File size must be at least ${typeof minSize === 'string' ? minSize : `${minSize} bytes`}`
          : 'File is too small',
      }
    )
    .refine(
      (file) => {
        if (!types || types.length === 0) return true;
        return types.some((pattern) => mimeTypeMatches(file.type, pattern));
      },
      {
        message: types
          ? `File type must be one of: ${types.join(', ')}`
          : 'Invalid file type',
      }
    )
    .refine(
      (file) => {
        if (!extensions || extensions.length === 0) return true;
        const fileExt = file.name.includes('.')
          ? file.name.split('.').pop()?.toLowerCase()
          : '';
        return extensions.some((ext) => ext.toLowerCase() === fileExt);
      },
      {
        message: extensions
          ? `File extension must be one of: ${extensions.join(', ')}`
          : 'Invalid file extension',
      }
    )
    .transform(createValidatedFile);

  // Use unknown cast to work around Zod's strict input type checking
  return fileSchema as unknown as z.ZodType<ValidatedFile>;
}

/**
 * Create a Zod schema for multiple file uploads
 *
 * @example
 * ```typescript
 * import { formFiles } from 'next-request';
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   images: formFiles({ maxSize: '5mb', types: ['image/*'], maxFiles: 5 }),
 * });
 * ```
 */
export function formFiles(
  options: FormFileOptions & {
    /** Minimum number of files */
    minFiles?: number;
    /** Maximum number of files */
    maxFiles?: number;
  } = {}
): z.ZodType<ValidatedFile[]> {
  const { minFiles, maxFiles, ...fileOptions } = options;
  const singleFileSchema = formFile({ ...fileOptions, required: true });

  let arraySchema = z.array(singleFileSchema);

  if (minFiles !== undefined) {
    arraySchema = arraySchema.min(minFiles, {
      message: `At least ${minFiles} file(s) required`,
    });
  }

  if (maxFiles !== undefined) {
    arraySchema = arraySchema.max(maxFiles, {
      message: `Maximum ${maxFiles} file(s) allowed`,
    });
  }

  return arraySchema;
}

/**
 * Type helper to extract the inferred type from a formFile schema
 */
export type InferFormFile = ValidatedFile;
export type InferFormFiles = ValidatedFile[];
