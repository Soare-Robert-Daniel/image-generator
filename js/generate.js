/**
 * generate.js
 * 
 * This script generates PNG images with random RGB pixels.
 * It takes the dimensions (width and height) and the number of images to generate as command-line arguments.
 * Each image will have its own unique hash, which is used to seed the random RGB values for the pixels.
 * 
 * Usage: node generate.js <width> <height> <number of images>
 * 
 * Relevant PNG documentation:
 * - PNG Specification: http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html
 * - Creating PNGs Programmatically: http://www.libpng.org/pub/png/libpng-manual.txt
 * - CRC-32 Algorithm: https://en.wikipedia.org/wiki/Cyclic_redundancy_check
 * - zlib Compression: https://www.ietf.org/rfc/rfc1950.txt
 * - zlib Decompression: https://www.ietf.org/rfc/rfc1951.txt
 */

const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

/**
 * Linear interpolation between two values a and b.
 * @param {number} a - The starting value.
 * @param {number} b - The ending value.
 * @param {number} t - The blend factor between a and b (0 <= t <= 1).
 * @returns {number} The interpolated value.
 */
function lerp(a, b, t) {
  return (1 - t) * a + t * b;
}

/**
 * Generate smooth color based on a hash and a blend factor.
 * @param {string} hash - The hash used to generate the colors.
 * @param {number} t - The blend factor (0 <= t <= 1).
 * @returns {number[]} An array representing the RGBA color.
 */
function generateColor(hash, t) {
  // Parse color components from the hash
  const baseR = parseInt(hash.slice(0, 2), 16);
  const baseG = parseInt(hash.slice(2, 4), 16);
  const baseB = parseInt(hash.slice(4, 6), 16);
  const nextR = parseInt(hash.slice(6, 8), 16);
  const nextG = parseInt(hash.slice(8, 10), 16);
  const nextB = parseInt(hash.slice(10, 12), 16);

  // Interpolate between the base and next colors
  const r = Math.floor(lerp(baseR, nextR, t));
  const g = Math.floor(lerp(baseG, nextG, t));
  const b = Math.floor(lerp(baseB, nextB, t));

  return [r, g, b, 255];
}

/**
 * Generate a CRC-32 checksum for a given buffer.
 * @param {Buffer} buf - The buffer to checksum.
 * @returns {number} The CRC-32 checksum.
 */
function crc32(buf) {
  // Initialize the CRC-32 table
  const table = Array.from({ length: 256 }, (_, i) => {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  });

  // Compute the checksum
  return buf.reduce((acc, byte) => {
    return table[(acc ^ byte) & 0xff] ^ (acc >>> 8);
  }, 0xffffffff) ^ 0xffffffff;
}

/**
 * Generate a PNG image with random RGB pixels.
 * @param {number} width - The width of the image in pixels.
 * @param {number} height - The height of the image in pixels.
 * @param {string} hash - The hash used to generate the colors.
 * @returns {Buffer} A Buffer containing the PNG image data.
 */
function generatePNG(width, height, hash) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = createIHDRChunk(width, height);
  const idat = createIDATChunk(width, height, hash);
  const iend = createIENDChunk();

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Create the IHDR chunk.
 * @param {number} width - The width of the image.
 * @param {number} height - The height of the image.
 * @returns {Buffer} A buffer containing the IHDR chunk.
 */
function createIHDRChunk(width, height) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // Chunk data length (13 bytes)
  ihdr.write("IHDR", 4);     // Chunk type
  // Chunk data
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16);  // Bit depth
  ihdr.writeUInt8(2, 17);  // Color type
  ihdr.writeUInt8(0, 18);  // Compression method
  ihdr.writeUInt8(0, 19);  // Filter method
  ihdr.writeUInt8(0, 20);  // Interlace method
  // CRC-32 checksum
  ihdr.writeUInt32BE(crc32(ihdr.slice(4, 21)), 21);
  return ihdr;
}

/**
 * Create the IDAT chunk.
 * @param {number} width - The width of the image.
 * @param {number} height - The height of the image.
 * @param {string} hash - The hash used to generate the colors.
 * @returns {Buffer} A buffer containing the IDAT chunk.
 */
function createIDATChunk(width, height, hash) {
  // Initialize pixels with a filter byte (0) followed by RGB triples
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    pixels[offset] = 0;  // Filter byte
    for (let x = 0; x < width; x++) {
      const idx = offset + 1 + x * 3;
      const t = (y / height + x / width) / 2;
      const [r, g, b] = generateColor(hash, t);
      pixels.set([r, g, b], idx);
    }
  }

  const compressedData = zlib.deflateSync(pixels);
  const idat = Buffer.alloc(12 + compressedData.length);
  idat.writeUInt32BE(compressedData.length, 0);  // Chunk data length
  idat.write("IDAT", 4);                         // Chunk type
  compressedData.copy(idat, 8);                  // Chunk data
  idat.writeUInt32BE(crc32(idat.slice(4, 8 + compressedData.length)), 8 + compressedData.length);  // CRC-32 checksum
  return idat;
}

/**
 * Create the IEND chunk.
 * @returns {Buffer} A buffer containing the IEND chunk.
 */
function createIENDChunk() {
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);   // Chunk data length
  iend.write("IEND", 4);      // Chunk type
  iend.writeUInt32BE(crc32(iend.slice(4, 8)), 8);  // CRC-32 checksum
  return iend;
}

// Parse and validate command-line arguments
const [width, height, nums] = process.argv.slice(2).map(Number);
if (![width, height, nums].every(Number.isFinite)) {
  console.error("Usage: node generate.js <width> <height> <number of images>");
  process.exit(1);
}

// Generate images based on the original hash and filename pattern
for (let i = 0; i < nums; i++) {
  const randomString = `${Date.now()}-${Math.random()}`;
  const hash = crypto.createHash('md5').update(randomString).digest('hex');
  const pngData = generatePNG(width, height, hash);
  const filename = `i${i}__${width}x${height}__${hash}.png`;
  fs.writeFileSync(filename, pngData);
}
