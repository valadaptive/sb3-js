// Adapted from https://github.com/scratchfoundation/scratch-audio/blob/b418e6e703542cb8c18bbb48d91ab539408d62fa/src/ADPCMSoundDecoder.js

const STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107,
    118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894,
    6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
    32767,
];

const INDEX_TABLE = [
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8,
];

let __deltaTable: number[] | null = null;
const getDeltaTable = () => {
    if (__deltaTable) return __deltaTable;

    const deltaTable = new Array<number>(STEP_TABLE.length * INDEX_TABLE.length);

    for (let stepIndex = 0; stepIndex < STEP_TABLE.length; stepIndex++) {
        const step = STEP_TABLE[stepIndex];
        for (let code = 0; code < INDEX_TABLE.length; code++) {
            let delta = step >> 3;
            if (code & 4) delta += step;
            if (code & 2) delta += step >> 1;
            if (code & 1) delta += step >> 2;
            deltaTable[(stepIndex * INDEX_TABLE.length) + code] = (code & 8) ? -delta : delta;
        }
    }

    __deltaTable = deltaTable;
    return deltaTable;
};

type Chunk = {
    id: string;
    data: Uint8Array;
    byteLength: number;
} | {
    id: string;
    subchunks: Chunk[];
    byteLength: number;
};

const DECODER = new TextDecoder();

const decodeRiff = (data: Uint8Array, topLevel: boolean): Chunk => {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

    let id = DECODER.decode(data.subarray(0, 4));
    const size = dv.getUint32(4, true);
    if (topLevel && (id !== 'RIFF' || size + 8 !== data.byteLength)) throw new Error('Invalid RIFF file');

    if (id === 'RIFF' || id === 'LIST') {
        id = DECODER.decode(data.subarray(8, 12));
        const subchunks = [];
        let offset = 12;
        while (offset < size) {
            const subchunk = decodeRiff(data.subarray(offset), false);
            offset += subchunk.byteLength;
            subchunks.push(subchunk);
        }

        return {
            id,
            subchunks,
            byteLength: offset,
        };
    }

    return {
        id,
        data: data.subarray(8, size + 8),
        byteLength: size + 8,
    };
};

const decompress = (compressedData: DataView, blockSize: number, dst: Float32Array) => {
    let offset = 0;

    const size = dst.length;
    const samplesAfterBlockHeader = (blockSize - 4) * 2;

    const deltaTable = getDeltaTable();

    for (let i = 0; i < size;) {
        // read block header
        let sample = compressedData.getInt16(offset, true);
        let index = compressedData.getUint8(offset + 2);
        offset += 4; // skip extra header byte

        if (index > 88) index = 88;
        dst[i++] = sample / 32768;

        const blockLength = Math.min(samplesAfterBlockHeader, size - i);
        const blockStart = i;
        while (i - blockStart < blockLength) {
            // read 4-bit code and compute delta from previous sample
            let lastByte = compressedData.getUint8(offset++);

            for (let j = 0; j < 2; j++) {
                const code = lastByte & 0x0f;
                const delta = deltaTable[(index * 16) + code];
                // compute ntext index
                index += INDEX_TABLE[code];
                if (index > 88) {
                    index = 88;
                } else if (index < 0) {
                    index = 0;
                }
                sample += delta;
                if (sample > 32767) {
                    sample = 32767;
                } else if (sample < -32768) {
                    sample = -32768;
                }
                dst[i++] = sample / 32768;
                lastByte >>= 4;
            }
        }
    }
};

const decodeADPCM = (adpcm: Uint8Array): AudioBuffer => {
    const riff = decodeRiff(adpcm, true);
    if (riff.id !== 'WAVE' || !('subchunks' in riff)) throw new Error('Invalid WAV file: not a WAVE');

    const formatChunk = riff.subchunks[0];
    if (formatChunk.id !== 'fmt ' || !('data' in formatChunk)) throw new Error('Invalid WAV file: missing fmt chunk');
    const dataChunk = riff.subchunks.find(chunk => chunk.id === 'data');
    if (!dataChunk || !('data' in dataChunk)) throw new Error('Invalid WAV file: missing data chunk');

    const formatView = new DataView(formatChunk.data.buffer, formatChunk.data.byteOffset, formatChunk.data.byteLength);
    const formatTag = formatView.getUint16(0, true);
    // We need to throw this error here because samplesPerBlock extends past the end of the format chunk for non-ADPCM
    // formats
    if (formatTag !== 0x0011) throw new Error(`Not ADPCM; got format ${formatTag}`);

    const factChunk = riff.subchunks.find(chunk => chunk.id === 'fact');
    if (!factChunk || !('data' in factChunk)) throw new Error('Missing fact chunk');
    const factView = new DataView(factChunk.data.buffer, factChunk.data.byteOffset, factChunk.data.byteLength);
    const frameCount = factView.getUint32(0, true);

    const channels = formatView.getUint16(2, true);
    if (channels !== 1) {
        throw new Error(`Invalid channel count: ${channels}`);
    }
    const sampleRate = formatView.getUint32(4, true);
    // const bytesPerSecond = formatView.getUint32(8, true);
    // const blockAlign = formatView.getUint16(12, true);
    // const bitsPerSample = formatView.getUint16(14, true);
    const samplesPerBlock = formatView.getUint16(18, true);
    const blockSize = ((samplesPerBlock - 1) / 2) + 4;


    const buffer = new AudioBuffer({length: frameCount, numberOfChannels: 1, sampleRate});
    const channel = buffer.getChannelData(0);
    decompress(
        new DataView(dataChunk.data.buffer, dataChunk.data.byteOffset, dataChunk.data.byteLength),
        blockSize,
        channel,
    );

    return buffer;
};

export default decodeADPCM;
