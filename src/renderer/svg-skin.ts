import Costume from '../costume.js';
import Silhouette from './silhouette.js';

import Skin from './skin.js';

// This means that the smallest mipmap will be 1/(2**4)th the size of the sprite's "100%" size.
const MIPMAP_OFFSET = 4;

export default class SVGSkin implements Skin {
    private gl;
    private costume: Costume;
    private mipmaps: (WebGLTexture | null)[] = [];
    private silhouettes: (Silhouette | null)[] = [];
    private maxTextureSize: number;
    private canvas = document.createElement('canvas');
    private ctx;

    constructor(gl: WebGL2RenderingContext, costume: Costume) {
        this.gl = gl;
        this.costume = costume;
        // Make sure drawToCanvas always draws something the first time it's called
        this.canvas.width = this.canvas.height = 0;
        this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error('Failed to create texture');
        }
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create 2d context');
        }
        this.ctx = ctx;
    }

    private static mipLevelForScale(scale: number) {
        return Math.max(Math.ceil(Math.log2(scale)) + MIPMAP_OFFSET, 0);
    }

    private drawToCanvas(width: number, height: number) {
        if (width === this.canvas.width && height === this.canvas.height) {
            return;
        }
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this.costume.image, 0, 0, this.canvas.width, this.canvas.height);
    }

    private makeMipmap(level: number): WebGLTexture | null {
        // in case we backed off to a level that's already been created
        if (this.mipmaps[level] !== undefined) {
            return this.mipmaps[level];
        }
        const scale = 2 ** (level - MIPMAP_OFFSET);
        const width = this.costume.dimensions.width * scale;
        const height = this.costume.dimensions.height * scale;
        if (width < 1 || height < 1) {
            return null;
        }
        // back off until we find a size that's supported
        if (width > this.maxTextureSize || height > this.maxTextureSize) {
            return this.makeMipmap(level - 1);
        }
        this.drawToCanvas(width, height);
        const gl = this.gl;
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error('Failed to create texture');
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);

        return texture;
    }

    private makeSilhouetteMipmap(level: number): Silhouette | null {
        const scale = 2 ** (level - MIPMAP_OFFSET);
        const width = this.costume.dimensions.width * scale;
        const height = this.costume.dimensions.height * scale;
        if (width < 1 || height < 1) {
            return null;
        }
        this.drawToCanvas(width, height);
        return new Silhouette(this.ctx.getImageData(0, 0, width, height), false);
    }

    getTexture(scale: number): WebGLTexture | null {
        const mipLevel = SVGSkin.mipLevelForScale(scale);
        let texture = this.mipmaps[mipLevel];
        if (typeof texture === 'undefined') {
            texture = this.makeMipmap(mipLevel);
            this.mipmaps[mipLevel] = texture;
        }
        return texture;
    }

    getSilhouette(scale: number): Silhouette | null {
        const mipLevel = SVGSkin.mipLevelForScale(scale);
        let silhouette = this.silhouettes[mipLevel];
        if (typeof silhouette === 'undefined') {
            silhouette = this.makeSilhouetteMipmap(mipLevel);
            this.silhouettes[mipLevel] = silhouette;
        }
        return silhouette;
    }
}
