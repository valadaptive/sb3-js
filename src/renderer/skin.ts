export default interface Skin {
    getTexture(scale: number): WebGLTexture | null;
}
