import Costume from '../costume.js';
import Silhouette from './silhouette.js';

import Skin from './skin.js';

export default class BitmapSkin implements Skin {
    private texture: WebGLTexture;
    private silhouette: Silhouette;
    constructor(gl: WebGL2RenderingContext, costume: Costume) {
        this.silhouette = new Silhouette(costume.image, false);
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error('Failed to create texture');
        }
        this.texture = texture;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, costume.image);
    }

    getTexture(): WebGLTexture | null {
        return this.texture;
    }

    getSilhouette(): Silhouette {
        return this.silhouette;
    }
}
