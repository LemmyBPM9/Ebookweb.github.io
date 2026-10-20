/**
 * Lightweight, zero-dependency zip archive builder for EPUB test fixtures.
 * Uses Node.js built-in node:zlib and Buffer.
 */
const zlib = require('node:zlib');

/**
 * Creates a standard ZIP Buffer from an array of file entries.
 * @param {Array<{name: string, data: string|Buffer, compress?: boolean}>} files
 * @returns {Buffer}
 */
function createZipArchive(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = zlib.crc32(dataBuf);
    const uncompressedSize = dataBuf.length;

    let compMethod = 0;
    let compData = dataBuf;
    if (f.compress !== false && dataBuf.length > 0) {
      compMethod = 8; // Deflate
      compData = zlib.deflateRawSync(dataBuf);
    }
    const compressedSize = compData.length;

    // Local Header (30 bytes + filename)
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // Local file header signature
    lh.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    lh.writeUInt16LE(0, 6);          // General purpose bit flag
    lh.writeUInt16LE(compMethod, 8); // Compression method
    lh.writeUInt16LE(0, 10);         // Last mod time
    lh.writeUInt16LE(0, 12);         // Last mod date
    lh.writeUInt32LE(crc, 14);       // CRC-32
    lh.writeUInt32LE(compressedSize, 18);   // Compressed size
    lh.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);   // File name length
    lh.writeUInt16LE(0, 28);         // Extra field length
    nameBuf.copy(lh, 30);

    localHeaders.push(lh, compData);

    // Central Directory Header (46 bytes + filename)
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0); // Central file header signature
    ch.writeUInt16LE(20, 4);         // Version made by
    ch.writeUInt16LE(20, 6);         // Version needed to extract
    ch.writeUInt16LE(0, 8);          // General purpose bit flag
    ch.writeUInt16LE(compMethod, 10);// Compression method
    ch.writeUInt16LE(0, 12);         // Last mod time
    ch.writeUInt16LE(0, 14);         // Last mod date
    ch.writeUInt32LE(crc, 16);       // CRC-32
    ch.writeUInt32LE(compressedSize, 20);   // Compressed size
    ch.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    ch.writeUInt16LE(nameBuf.length, 28);   // File name length
    ch.writeUInt16LE(0, 30);         // Extra field length
    ch.writeUInt16LE(0, 32);         // Comment length
    ch.writeUInt16LE(0, 34);         // Disk number start
    ch.writeUInt16LE(0, 36);         // Internal attributes
    ch.writeUInt32LE(0, 38);         // External attributes
    ch.writeUInt32LE(offset, 42);    // Relative offset of local header
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);
    offset += lh.length + compData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(files.length, 8);  // Entries on disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of central dir
  eocd.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

module.exports = { createZipArchive };
