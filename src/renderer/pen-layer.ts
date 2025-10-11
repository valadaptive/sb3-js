import {mat3, vec2, vec4} from 'gl-matrix';
import Rectangle from '../rectangle.js';
import Renderer, {FramebufferInfo} from './renderer.js';
import Silhouette from './silhouette.js';
import Samplable from './samplable.js';

const __samplePoint = vec2.create();

export default class PenLayer implements Samplable {
    private gl: WebGL2RenderingContext;
    private renderer: Renderer;
    private lastPenState: {rgba: vec4; thickness: number | null} = {
        rgba: vec4.fromValues(-1, -1, -1, -1),
        thickness: null,
    };
    public framebuffer: FramebufferInfo;
    public texture: WebGLTexture;
    public isEmpty = true;
    public bounds: Rectangle;
    public transform: mat3;
    private inverseTransform: mat3;
    private silhouette: Silhouette;
    private silhouetteData: Uint8ClampedArray<ArrayBuffer>;
    // Set to false by default because it initializes to fully transparent, saving a readPixels call if the project
    // never uses the pen layer.
    private silhouetteDirty = false;

    constructor(gl: WebGL2RenderingContext, renderer: Renderer, bounds: Rectangle) {
        this.gl = gl;
        this.renderer = renderer;
        const texture = gl.createTexture();
        if (!texture) throw new Error('Failed to create texture');
        this.texture = texture;
        this.silhouetteData = new Uint8ClampedArray(bounds.width * bounds.height * 4);
        this.silhouette = new Silhouette(new ImageData(this.silhouetteData, bounds.width, bounds.height), true);
        this.bounds = Rectangle.fromOther(bounds);


        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bounds.width, bounds.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) throw new Error('Failed to create framebuffer');
        this.framebuffer = {width: bounds.width, height: bounds.height, framebuffer};
        this.renderer.setFramebuffer(this.framebuffer);

        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
        );
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(gl.COLOR_BUFFER_BIT);

        this.transform = mat3.create();
        mat3.fromScaling(this.transform, [this.framebuffer.width, -this.framebuffer.height]);
        mat3.translate(this.transform, this.transform, [-0.5, -0.5]);
        this.inverseTransform = mat3.invert(mat3.create(), this.transform);
    }
    getSamplingBounds(silhouette: Silhouette, result: Rectangle): Rectangle {
        return Rectangle.fromOther(this.bounds, result);
    }

    sampleColorAtPoint(
        x: number,
        y: number,
        silhouette: Silhouette,
        dst: Uint8ClampedArray<ArrayBuffer>,
    ): Uint8ClampedArray<ArrayBuffer> {
        vec2.set(__samplePoint, x, y);
        vec2.transformMat3(__samplePoint, __samplePoint, this.inverseTransform);
        // Flip y
        __samplePoint[1] = 1 - __samplePoint[1];
        if (__samplePoint[0] < 0 || __samplePoint[0] > 1 || __samplePoint[1] < 0 || __samplePoint[1] > 1) {
            dst[0] = 0;
            dst[1] = 0;
            dst[2] = 0;
            dst[3] = 0;
            return dst;
        }
        silhouette.sample(__samplePoint[0], __samplePoint[1], dst);
        return dst;
    }

    checkPointCollision(x: number, y: number, silhouette: Silhouette): boolean {
        vec2.set(__samplePoint, x, y);
        vec2.transformMat3(__samplePoint, __samplePoint, this.inverseTransform);
        // Flip y
        __samplePoint[1] = 1 - __samplePoint[1];
        if (__samplePoint[0] < 0 || __samplePoint[0] > 1 || __samplePoint[1] < 0 || __samplePoint[1] > 1) {
            return false;
        }
        return silhouette.isTouching(__samplePoint[0], __samplePoint[1]);
    }

    public clear() {
        this.renderer.setFramebuffer(this.framebuffer);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.silhouetteDirty = true;
        this.isEmpty = true;
    }

    public getSilhouette() {
        if (this.silhouetteDirty) {
            this.renderer.setFramebuffer(this.framebuffer);
            this.gl.readPixels(
                0, 0,
                this.framebuffer.width, this.framebuffer.height,
                this.gl.RGBA,
                this.gl.UNSIGNED_BYTE,
                this.silhouetteData,
            );
            this.silhouetteDirty = false;
        }
        return this.silhouette;
    }

    public setSilhouetteDirty() {
        this.silhouetteDirty = true;
    }

    public penLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color: vec4,
        thickness: number,
    ) {
        this.renderer.setFramebuffer(this.framebuffer);
        const shaderChanged = this.renderer.setShader(this.renderer.penLineShader);

        // Uploading uniforms seems to be expensive; do it as little as possible
        if (shaderChanged) {
            this.gl.uniform2f(
                this.renderer.penLineShader.uniformLocations.u_penLayerSize,
                this.framebuffer.width,
                this.framebuffer.height,
            );
        }

        if (shaderChanged || !this.lastPenState.rgba || !vec4.exactEquals(this.lastPenState.rgba, color)) {
            // Premultiply by alpha
            this.gl.uniform4f(
                this.renderer.penLineShader.uniformLocations.u_penColor,
                color[0] * color[3],
                color[1] * color[3],
                color[2] * color[3],
                color[3],
            );
            vec4.copy(this.lastPenState.rgba, color);
        }

        if (shaderChanged || thickness !== this.lastPenState.thickness) {
            this.gl.uniform1f(
                this.renderer.penLineShader.uniformLocations.u_penThickness,
                thickness,
            );
            this.lastPenState.thickness = thickness;
        }

        const dx = x2 - x1;
        const dy = y2 - y1;

        // Offset pen lines of size 1 and 3 so they lie on integer coords.
        // https://github.com/LLK/scratch-render/blob/791b2750cef140e714b002fd275b5f8434e6df9b/src/PenSkin.js#L167-L170
        const offset = thickness === 1 || thickness === 3 ? 0.5 : 0;

        this.gl.uniform4f(
            this.renderer.penLineShader.uniformLocations.u_penPoints,
            x1 + offset,
            y1 + offset,
            dx,
            dy,
        );

        // Fun fact: Doing this calculation in the shader has the potential to overflow the floating-point range.
        // 'mediump' precision is only required to have a range up to 2^14 (16384), so any lines longer than 2^7 (128)
        // can overflow that, because you're squaring the operands, and they could end up as "infinity".
        // Even GLSL's `length` function won't save us here:
        // https://asawicki.info/news_1596_watch_out_for_reduced_precision_normalizelength_in_opengl_es
        const lineLength = Math.sqrt((dx * dx) + (dy * dy));
        this.gl.uniform1f(this.renderer.penLineShader.uniformLocations.u_lineLength, lineLength);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        this.silhouetteDirty = true;
        this.isEmpty = false;
    }
}
