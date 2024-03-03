import {vertexShader, fragmentShader} from './shaders.js';
import Shader from './shader.js';
import Target from '../target.js';
import Drawable from './drawable.js';
import BitmapSkin from './bitmap-skin.js';
import SVGSkin from './svg-skin.js';

export default class Renderer {
    public readonly canvas;
    private readonly gl;
    private readonly stageSize: {width: number; height: number};
    private readonly spriteShader: Shader;
    private readonly spriteEffectsShader: Shader;

    private currentShader!: Shader;

    constructor(canvas: HTMLCanvasElement, stageSize: {width: number; height: number}) {
        this.canvas = canvas;
        // If the container width is a non-integer size, don't blur the canvas.
        this.canvas.style.imageRendering = 'pixelated';

        // Set the CSS-space width/height to the stage size.
        this.canvas.style.width = stageSize.width + 'px';
        this.canvas.style.height = stageSize.height + 'px';

        const gl = canvas.getContext('webgl2', {antialias: false});
        if (!gl) {
            throw new Error('WebGL2 is not supported');
        }
        this.gl = gl;
        this.stageSize = stageSize;

        this.canvas.width = stageSize.width;
        this.canvas.height = stageSize.height;
        gl.viewport(0, 0, stageSize.width, stageSize.height);

        // Initialize a bunch of WebGL state

        // Use premultiplied alpha
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

        // Initialize our one and only vertex buffer, used to draw a quad
        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 0,
            1, 0,
            0, 1,

            0, 1,
            1, 0,
            1, 1,
        ]), gl.STATIC_DRAW);

        gl.activeTexture(gl.TEXTURE0);

        this.spriteShader = new Shader(gl, vertexShader, fragmentShader);
        this.spriteEffectsShader = new Shader(gl, vertexShader, fragmentShader, ['GRAPHIC_EFFECTS']);
        this.setShader(this.spriteShader);
    }

    private setShader(shader: Shader) {
        if (this.currentShader === shader) return;

        const gl = this.gl;
        gl.useProgram(shader.program);

        const attribLocation = shader.attribLocations.a_position;
        gl.enableVertexAttribArray(attribLocation);
        // Bind the 'a_position' vertex attribute to the current contents of `gl.ARRAY_BUFFER`, which in this case
        // is a quadrilateral (as buffered earlier).
        gl.vertexAttribPointer(
            attribLocation,
            2, // every 2 array elements make one vertex.
            gl.FLOAT, // data type
            false, // normalized
            0, // stride (space between attributes)
            0, // offset (index of the first attribute to start from)
        );

        gl.uniform2f(shader.uniformLocations.u_stageSize, this.stageSize.width, this.stageSize.height);

        this.currentShader = shader;
    }

    /** Update the screen-space canvas resolution. */
    private resize() {
        const stageRect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio;
        const screenSpaceWidth = Math.round(stageRect.width * ratio);
        const screenSpaceHeight = Math.round(stageRect.height * ratio);
        if (this.canvas.width !== screenSpaceWidth || this.canvas.height !== screenSpaceHeight) {
            this.canvas.width = screenSpaceWidth;
            this.canvas.height = screenSpaceHeight;
            this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        }
    }

    public draw(targets: Target[]) {
        const gl = this.gl;
        this.resize();

        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const screenSpaceScalingFactor = this.canvas.width / this.stageSize.width;

        for (const target of targets) {
            if (!target.visible) continue;

            const costume = target.sprite.costumes[target.currentCostume];
            let skin = costume.skin;
            if (!skin) {
                switch (costume.type) {
                    case 'bitmap':
                        skin = new BitmapSkin(gl, costume);
                        break;
                    case 'svg':
                        skin = new SVGSkin(gl, costume);
                        break;
                }

                costume.skin = skin;
            }
            const texture = skin.getTexture(target.size * screenSpaceScalingFactor * 0.01);
            if (!texture) continue;

            this.setShader(target.effects.bitmask ? this.spriteEffectsShader : this.spriteShader);

            let drawable = target.drawable;
            if (!drawable) {
                drawable = target.drawable = new Drawable(gl, target);
            }

            drawable.setUniforms(this.currentShader);

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(this.currentShader.uniformLocations.u_texture, 0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }

    public destroy() {
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}
