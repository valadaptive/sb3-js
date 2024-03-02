const VERSION = '#version 300 es\n';
const PRECISION = 'precision highp float;\n';

export default class Shader {
    program: WebGLProgram;
    attribLocations: Record<string, number>;
    uniformLocations: Record<string, WebGLUniformLocation>;

    constructor(gl: WebGL2RenderingContext, vertSource: string, fragSource: string) {
        const vertShader = this.createShader(gl, VERSION + PRECISION + vertSource, gl.VERTEX_SHADER);
        const fragShader = this.createShader(gl, VERSION + PRECISION + fragSource, gl.FRAGMENT_SHADER);

        const program = gl.createProgram();
        if (!program) {
            throw new Error('Could not create WebGL program');
        }
        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            throw new Error('Could not compile WebGL program. \n' + info);
        }

        this.program = program;

        this.attribLocations = {};
        this.uniformLocations = {};

        const numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < numAttribs; i++) {
            const activeAttrib = gl.getActiveAttrib(program, i)!;
            this.attribLocations[activeAttrib.name] = gl.getAttribLocation(program, activeAttrib.name);
        }

        const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const activeUniform = gl.getActiveUniform(program, i)!;
            this.uniformLocations[activeUniform.name] = gl.getUniformLocation(program, activeUniform.name)!;
        }
    }

    private createShader(
        gl: WebGL2RenderingContext,
        source: string,
        type: WebGLRenderingContextBase['VERTEX_SHADER'] | WebGLRenderingContextBase['FRAGMENT_SHADER'],
    ) {
        const shader = gl.createShader(type);
        if (!shader) {
            throw new Error('Could not create WebGL shader');
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            throw new Error('Could not compile WebGL program. \n' + info);
        }

        return shader;
    }
}
