import Costume from '../costume.js';

import Skin from './skin.js';

// This means that the smallest mipmap will be 1/(2**4)th the size of the sprite's "100%" size.
const MIPMAP_OFFSET = 4;

export default class SVGSkin implements Skin {
    private gl;
    private costume: Costume;
    private mipmaps: (WebGLTexture | null)[] = [];
    private maxTextureSize: number;
    private canvas = document.createElement('canvas');
    private ctx;

    constructor(gl: WebGL2RenderingContext, costume: Costume) {
        this.gl = gl;
        this.costume = costume;
        this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error('Failed to create texture');
        }
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create 2d context');
        }
        this.ctx = ctx;
        /*this.texture = texture;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, costume.image);*/
    }

    private static mipLevelForScale(scale: number) {
        return Math.max(Math.ceil(Math.log2(scale)) + MIPMAP_OFFSET, 0);
    }

    private makeMipmap(level: number): WebGLTexture | null {
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
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this.costume.image, 0, 0, this.canvas.width, this.canvas.height);

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

    getTexture(scale: number): WebGLTexture | null {
        const mipLevel = SVGSkin.mipLevelForScale(scale);
        let texture = this.mipmaps[mipLevel];
        if (typeof texture === 'undefined') {
            texture = this.makeMipmap(mipLevel);
            this.mipmaps[mipLevel] = texture;
        }
        return texture;
    }
}
