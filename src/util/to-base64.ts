/**
 * Encode the given binary data to Base64.
 * @param bytes The binary data to encode.
 * @returns The input, encoded as Base64.
 */
const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    // Convert the bytes into a binary string, which we then call btoa on to base64-encode it.
    // Doing it 8 bytes at a time seems fastest, from experimentation.
    let i = 0;
    for (; i + 7 < bytes.byteLength; i += 8) {
        binary += String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3],
            bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    }
    for (; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

export default toBase64;
