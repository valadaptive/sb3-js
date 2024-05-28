import Silhouette from './silhouette.js';

export default interface Skin {
    getTexture(scale: number): WebGLTexture | null;
    getSilhouette(scale: number): Silhouette | null;
}
