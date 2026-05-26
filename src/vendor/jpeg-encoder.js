/*
 * Adapted from jpeg-js (https://github.com/jpeg-js/jpeg-js)
 *   Copyright (c) 2008, Adobe Systems Incorporated. BSD 3-clause.
 *   Original JS port: Andreas Ritter, www.bytestrom.eu, 11/2009.
 *
 * Modifications for claude-meter:
 *   - Converted to ES module.
 *   - `initQuantTables` accepts caller-supplied luma/chroma tables in natural
 *     (raster) order, matching Pillow's `qtables=[...]` argument. Quality-based
 *     scaling is bypassed when tables are provided.
 *   - 4:2:0 chroma subsampling (sampling factors H=2/V=2 for Y, 1/1 for Cb/Cr)
 *     to match Pillow's `subsampling=2`. 16x16 MCU with 4 Y blocks + 1 Cb +
 *     1 Cr. Required for the GeeKmagic firmware to accept the frame.
 */

const ZigZag = [
   0, 1, 5, 6,14,15,27,28,
   2, 4, 7,13,16,26,29,42,
   3, 8,12,17,25,30,41,43,
   9,11,18,24,31,40,44,53,
  10,19,23,32,39,45,52,54,
  20,22,33,38,46,51,55,60,
  21,34,37,47,50,56,59,61,
  35,36,48,49,57,58,62,63,
];

const std_dc_luminance_nrcodes = [0,0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0];
const std_dc_luminance_values  = [0,1,2,3,4,5,6,7,8,9,10,11];
const std_ac_luminance_nrcodes = [0,0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,0x7d];
const std_ac_luminance_values = [
  0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,
  0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,
  0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,
  0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,
  0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,
  0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,
  0x29,0x2a,0x34,0x35,0x36,0x37,0x38,0x39,
  0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,
  0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,
  0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,
  0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,
  0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,
  0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,
  0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,
  0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,
  0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,
  0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,
  0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,
  0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,
  0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,
  0xf9,0xfa,
];

const std_dc_chrominance_nrcodes = [0,0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0];
const std_dc_chrominance_values  = [0,1,2,3,4,5,6,7,8,9,10,11];
const std_ac_chrominance_nrcodes = [0,0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,0x77];
const std_ac_chrominance_values = [
  0x00,0x01,0x02,0x03,0x11,0x04,0x05,0x21,
  0x31,0x06,0x12,0x41,0x51,0x07,0x61,0x71,
  0x13,0x22,0x32,0x81,0x08,0x14,0x42,0x91,
  0xa1,0xb1,0xc1,0x09,0x23,0x33,0x52,0xf0,
  0x15,0x62,0x72,0xd1,0x0a,0x16,0x24,0x34,
  0xe1,0x25,0xf1,0x17,0x18,0x19,0x1a,0x26,
  0x27,0x28,0x29,0x2a,0x35,0x36,0x37,0x38,
  0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,
  0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,
  0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,
  0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,
  0x79,0x7a,0x82,0x83,0x84,0x85,0x86,0x87,
  0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,
  0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,
  0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,
  0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,
  0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,
  0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,
  0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,
  0xea,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,
  0xf9,0xfa,
];

const aasf = [
  1.0, 1.387039845, 1.306562965, 1.175875602,
  1.0, 0.785694958, 0.541196100, 0.275899379,
];

function computeHuffmanTbl(nrcodes, std_table) {
  let codevalue = 0;
  let pos_in_table = 0;
  const HT = [];
  for (let k = 1; k <= 16; k++) {
    for (let j = 1; j <= nrcodes[k]; j++) {
      HT[std_table[pos_in_table]] = [codevalue, k];
      pos_in_table++;
      codevalue++;
    }
    codevalue *= 2;
  }
  return HT;
}

const YDC_HT  = computeHuffmanTbl(std_dc_luminance_nrcodes, std_dc_luminance_values);
const UVDC_HT = computeHuffmanTbl(std_dc_chrominance_nrcodes, std_dc_chrominance_values);
const YAC_HT  = computeHuffmanTbl(std_ac_luminance_nrcodes, std_ac_luminance_values);
const UVAC_HT = computeHuffmanTbl(std_ac_chrominance_nrcodes, std_ac_chrominance_values);

const bitcode = new Array(65535);
const category = new Array(65535);
(function initCategoryNumber() {
  let nrlower = 1, nrupper = 2;
  for (let cat = 1; cat <= 15; cat++) {
    for (let nr = nrlower; nr < nrupper; nr++) {
      category[32767 + nr] = cat;
      bitcode[32767 + nr] = [nr, cat];
    }
    for (let nrneg = -(nrupper - 1); nrneg <= -nrlower; nrneg++) {
      category[32767 + nrneg] = cat;
      bitcode[32767 + nrneg] = [nrupper - 1 + nrneg, cat];
    }
    nrlower <<= 1;
    nrupper <<= 1;
  }
})();

const RGB_YUV_TABLE = new Array(2048);
(function initRGBYUVTable() {
  for (let i = 0; i < 256; i++) {
    RGB_YUV_TABLE[i]          =  19595 * i;
    RGB_YUV_TABLE[i +  256]   =  38470 * i;
    RGB_YUV_TABLE[i +  512]   =   7471 * i + 0x8000;
    RGB_YUV_TABLE[i +  768]   = -11059 * i;
    RGB_YUV_TABLE[i + 1024]   = -21709 * i;
    RGB_YUV_TABLE[i + 1280]   =  32768 * i + 0x807FFF;
    RGB_YUV_TABLE[i + 1536]   = -27439 * i;
    RGB_YUV_TABLE[i + 1792]   =  - 5329 * i;
  }
})();

function buildQuantTables(lumaNat, chromaNat) {
  const YTable = new Array(64);
  const UVTable = new Array(64);
  for (let i = 0; i < 64; i++) {
    YTable[ZigZag[i]] = clamp(lumaNat[i]);
    UVTable[ZigZag[i]] = clamp(chromaNat[i]);
  }
  const fdtbl_Y = new Array(64);
  const fdtbl_UV = new Array(64);
  let k = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      fdtbl_Y[k]  = 1.0 / (YTable [ZigZag[k]] * aasf[row] * aasf[col] * 8.0);
      fdtbl_UV[k] = 1.0 / (UVTable[ZigZag[k]] * aasf[row] * aasf[col] * 8.0);
      k++;
    }
  }
  return { YTable, UVTable, fdtbl_Y, fdtbl_UV };
}

function clamp(v) {
  v = Math.floor(v);
  if (v < 1) return 1;
  if (v > 255) return 255;
  return v;
}

// In-place DCT + quantization. `data` is a Float64Array(64). Returns the
// quantized integer coefficients in `out` (Int32Array(64)).
function fDCTQuant(data, fdtbl, out) {
  let dataOff = 0;
  for (let i = 0; i < 8; i++) {
    const d0 = data[dataOff], d1 = data[dataOff+1], d2 = data[dataOff+2], d3 = data[dataOff+3];
    const d4 = data[dataOff+4], d5 = data[dataOff+5], d6 = data[dataOff+6], d7 = data[dataOff+7];

    const tmp0 = d0 + d7, tmp7 = d0 - d7;
    const tmp1 = d1 + d6, tmp6 = d1 - d6;
    const tmp2 = d2 + d5, tmp5 = d2 - d5;
    const tmp3 = d3 + d4, tmp4 = d3 - d4;

    let tmp10 = tmp0 + tmp3, tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2, tmp12 = tmp1 - tmp2;

    data[dataOff]   = tmp10 + tmp11;
    data[dataOff+4] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[dataOff+2] = tmp13 + z1;
    data[dataOff+6] = tmp13 - z1;

    tmp10 = tmp4 + tmp5;
    tmp11 = tmp5 + tmp6;
    tmp12 = tmp6 + tmp7;

    const z5 = (tmp10 - tmp12) * 0.382683433;
    const z2 = 0.541196100 * tmp10 + z5;
    const z4 = 1.306562965 * tmp12 + z5;
    const z3 = tmp11 * 0.707106781;

    const z11 = tmp7 + z3, z13 = tmp7 - z3;

    data[dataOff+5] = z13 + z2;
    data[dataOff+3] = z13 - z2;
    data[dataOff+1] = z11 + z4;
    data[dataOff+7] = z11 - z4;

    dataOff += 8;
  }

  dataOff = 0;
  for (let i = 0; i < 8; i++) {
    const d0 = data[dataOff],     d1 = data[dataOff+8],  d2 = data[dataOff+16], d3 = data[dataOff+24];
    const d4 = data[dataOff+32],  d5 = data[dataOff+40], d6 = data[dataOff+48], d7 = data[dataOff+56];

    const tmp0 = d0 + d7, tmp7 = d0 - d7;
    const tmp1 = d1 + d6, tmp6 = d1 - d6;
    const tmp2 = d2 + d5, tmp5 = d2 - d5;
    const tmp3 = d3 + d4, tmp4 = d3 - d4;

    let tmp10 = tmp0 + tmp3, tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2, tmp12 = tmp1 - tmp2;

    data[dataOff]    = tmp10 + tmp11;
    data[dataOff+32] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[dataOff+16] = tmp13 + z1;
    data[dataOff+48] = tmp13 - z1;

    tmp10 = tmp4 + tmp5;
    tmp11 = tmp5 + tmp6;
    tmp12 = tmp6 + tmp7;

    const z5 = (tmp10 - tmp12) * 0.382683433;
    const z2 = 0.541196100 * tmp10 + z5;
    const z4 = 1.306562965 * tmp12 + z5;
    const z3 = tmp11 * 0.707106781;

    const z11 = tmp7 + z3, z13 = tmp7 - z3;

    data[dataOff+40] = z13 + z2;
    data[dataOff+24] = z13 - z2;
    data[dataOff+ 8] = z11 + z4;
    data[dataOff+56] = z11 - z4;

    dataOff++;
  }

  for (let i = 0; i < 64; i++) {
    const v = data[i] * fdtbl[i];
    out[i] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
  }
  return out;
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.byteCur = 0;
    this.bitPos = 7;
  }
  writeByte(v) { this.bytes.push(v & 0xFF); }
  writeWord(v) { this.writeByte((v >> 8) & 0xFF); this.writeByte(v & 0xFF); }
  writeBits(bs) {
    let value = bs[0];
    let posval = bs[1] - 1;
    while (posval >= 0) {
      if (value & (1 << posval)) this.byteCur |= (1 << this.bitPos);
      posval--;
      this.bitPos--;
      if (this.bitPos < 0) {
        if (this.byteCur === 0xFF) {
          this.writeByte(0xFF);
          this.writeByte(0);
        } else {
          this.writeByte(this.byteCur);
        }
        this.bitPos = 7;
        this.byteCur = 0;
      }
    }
  }
  flush() {
    if (this.bitPos >= 0) {
      const fill = [(1 << (this.bitPos + 1)) - 1, this.bitPos + 1];
      this.writeBits(fill);
    }
  }
  toBuffer() { return Buffer.from(this.bytes); }
}

function writeAPP0(w) {
  w.writeWord(0xFFE0);
  w.writeWord(16);
  w.writeByte(0x4A); w.writeByte(0x46); w.writeByte(0x49); w.writeByte(0x46); w.writeByte(0);
  w.writeByte(1); w.writeByte(1);
  w.writeByte(0);
  w.writeWord(1); w.writeWord(1);
  w.writeByte(0); w.writeByte(0);
}

function writeDQT(w, YTable, UVTable) {
  w.writeWord(0xFFDB);
  w.writeWord(132);
  w.writeByte(0);
  for (let i = 0; i < 64; i++) w.writeByte(YTable[i]);
  w.writeByte(1);
  for (let i = 0; i < 64; i++) w.writeByte(UVTable[i]);
}

function writeSOF0(w, width, height) {
  w.writeWord(0xFFC0);
  w.writeWord(17);
  w.writeByte(8);
  w.writeWord(height);
  w.writeWord(width);
  w.writeByte(3);
  w.writeByte(1); w.writeByte(0x22); w.writeByte(0); // Y: H=2 V=2 (4:2:0)
  w.writeByte(2); w.writeByte(0x11); w.writeByte(1); // Cb
  w.writeByte(3); w.writeByte(0x11); w.writeByte(1); // Cr
}

function writeDHT(w) {
  w.writeWord(0xFFC4);
  w.writeWord(0x01A2);

  w.writeByte(0);
  for (let i = 0; i < 16; i++) w.writeByte(std_dc_luminance_nrcodes[i + 1]);
  for (let i = 0; i <= 11; i++) w.writeByte(std_dc_luminance_values[i]);

  w.writeByte(0x10);
  for (let i = 0; i < 16; i++) w.writeByte(std_ac_luminance_nrcodes[i + 1]);
  for (let i = 0; i <= 161; i++) w.writeByte(std_ac_luminance_values[i]);

  w.writeByte(1);
  for (let i = 0; i < 16; i++) w.writeByte(std_dc_chrominance_nrcodes[i + 1]);
  for (let i = 0; i <= 11; i++) w.writeByte(std_dc_chrominance_values[i]);

  w.writeByte(0x11);
  for (let i = 0; i < 16; i++) w.writeByte(std_ac_chrominance_nrcodes[i + 1]);
  for (let i = 0; i <= 161; i++) w.writeByte(std_ac_chrominance_values[i]);
}

function writeSOS(w) {
  w.writeWord(0xFFDA);
  w.writeWord(12);
  w.writeByte(3);
  w.writeByte(1); w.writeByte(0x00);
  w.writeByte(2); w.writeByte(0x11);
  w.writeByte(3); w.writeByte(0x11);
  w.writeByte(0); w.writeByte(0x3f); w.writeByte(0);
}

const DU = new Int32Array(64);

function processDU(w, CDU, fdtbl, DC, HTDC, HTAC) {
  const EOB = HTAC[0x00];
  const M16zeroes = HTAC[0xF0];

  const tmp = new Int32Array(64);
  fDCTQuant(CDU, fdtbl, tmp);
  for (let j = 0; j < 64; j++) DU[ZigZag[j]] = tmp[j];

  const Diff = DU[0] - DC;
  DC = DU[0];
  if (Diff === 0) {
    w.writeBits(HTDC[0]);
  } else {
    const pos = 32767 + Diff;
    w.writeBits(HTDC[category[pos]]);
    w.writeBits(bitcode[pos]);
  }
  let end0pos = 63;
  while (end0pos > 0 && DU[end0pos] === 0) end0pos--;
  if (end0pos === 0) {
    w.writeBits(EOB);
    return DC;
  }
  let i = 1;
  while (i <= end0pos) {
    const startpos = i;
    while (DU[i] === 0 && i <= end0pos) i++;
    let nrzeroes = i - startpos;
    if (nrzeroes >= 16) {
      const lng = nrzeroes >> 4;
      for (let m = 1; m <= lng; m++) w.writeBits(M16zeroes);
      nrzeroes = nrzeroes & 0xF;
    }
    const pos = 32767 + DU[i];
    w.writeBits(HTAC[(nrzeroes << 4) + category[pos]]);
    w.writeBits(bitcode[pos]);
    i++;
  }
  if (end0pos !== 63) w.writeBits(EOB);
  return DC;
}

// Pull an 8x8 Y block out of RGBA data at full resolution. Edge pixels clamp.
function loadYBlock(data, w, h, x0, y0, out) {
  for (let py = 0; py < 8; py++) {
    const sy = Math.min(y0 + py, h - 1);
    for (let px = 0; px < 8; px++) {
      const sx = Math.min(x0 + px, w - 1);
      const idx = (sy * w + sx) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      out[py * 8 + px] = ((RGB_YUV_TABLE[r] + RGB_YUV_TABLE[g + 256] + RGB_YUV_TABLE[b + 512]) >> 16) - 128;
    }
  }
}

// 8x8 Cb and Cr blocks for a 16x16 MCU. Each sample averages a 2x2 RGB region.
function loadChromaBlocks(data, w, h, x0, y0, U, V) {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = Math.min(y0 + py * 2 + dy, h - 1);
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(x0 + px * 2 + dx, w - 1);
          const idx = (sy * w + sx) * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
        }
      }
      r >>= 2; g >>= 2; b >>= 2;
      U[py * 8 + px] = ((RGB_YUV_TABLE[r + 768]  + RGB_YUV_TABLE[g + 1024] + RGB_YUV_TABLE[b + 1280]) >> 16) - 128;
      V[py * 8 + px] = ((RGB_YUV_TABLE[r + 1280] + RGB_YUV_TABLE[g + 1536] + RGB_YUV_TABLE[b + 1792]) >> 16) - 128;
    }
  }
}

/**
 * Encode an RGBA image into baseline 4:2:0 JPEG bytes with the supplied
 * quantization tables (in natural raster order — same convention as Pillow's
 * `qtables` argument).
 *
 * @param {{data: Uint8Array|Buffer, width: number, height: number}} image
 * @param {number[]} lumaQTable   64 ints, natural order
 * @param {number[]} chromaQTable 64 ints, natural order
 * @returns {Buffer}
 */
export function encode(image, lumaQTable, chromaQTable) {
  const { width, height } = image;
  const data = image.data;
  const { YTable, UVTable, fdtbl_Y, fdtbl_UV } = buildQuantTables(lumaQTable, chromaQTable);

  const w = new BitWriter();
  w.writeWord(0xFFD8);
  writeAPP0(w);
  writeDQT(w, YTable, UVTable);
  writeSOF0(w, width, height);
  writeDHT(w);
  writeSOS(w);

  const Y0 = new Float64Array(64);
  const Y1 = new Float64Array(64);
  const Y2 = new Float64Array(64);
  const Y3 = new Float64Array(64);
  const Uf = new Float64Array(64);
  const Vf = new Float64Array(64);

  let DCY = 0, DCU = 0, DCV = 0;
  for (let y = 0; y < height; y += 16) {
    for (let x = 0; x < width; x += 16) {
      loadYBlock(data, width, height, x,     y,     Y0);
      loadYBlock(data, width, height, x + 8, y,     Y1);
      loadYBlock(data, width, height, x,     y + 8, Y2);
      loadYBlock(data, width, height, x + 8, y + 8, Y3);
      loadChromaBlocks(data, width, height, x, y, Uf, Vf);

      DCY = processDU(w, Y0, fdtbl_Y,  DCY, YDC_HT,  YAC_HT);
      DCY = processDU(w, Y1, fdtbl_Y,  DCY, YDC_HT,  YAC_HT);
      DCY = processDU(w, Y2, fdtbl_Y,  DCY, YDC_HT,  YAC_HT);
      DCY = processDU(w, Y3, fdtbl_Y,  DCY, YDC_HT,  YAC_HT);
      DCU = processDU(w, Uf, fdtbl_UV, DCU, UVDC_HT, UVAC_HT);
      DCV = processDU(w, Vf, fdtbl_UV, DCV, UVDC_HT, UVAC_HT);
    }
  }

  w.flush();
  w.writeWord(0xFFD9);
  return w.toBuffer();
}
