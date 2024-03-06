import TextWrapper from './text-wrapper.js';

const bubbleStyle = {
    maxLineWidth: 170,
    lineHeight: 16,

    minWidth: 50,
    strokeWidth: 4,
    padding: 10,
    borderRadius: 16,
    tailHeight: 12,

    font: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: 14,
    fontHeightRatio: 0.9,

    bubbleFill: 'white',
    bubbleStroke: 'rgba(0, 0, 0, 0.15)',
    textFill: 'hsl(226, 14.7%, 40%)',
};

export default class TextBubble {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gl;
    private texture: WebGLTexture | null = null;

    private renderedText: string | null = null;
    private renderedType: 'say' | 'think' | 'ask' | null = null;
    private renderedDirection: 'left' | 'right' | null = null;
    private renderedLayout: {
        lines: string[];
        longestLineWidth: number;
        innerSize: {width: number; height: number};
        outerSize: {width: number; height: number};
    } | null = null;
    private renderedScale: number | null = null;

    constructor(gl: WebGL2RenderingContext) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 100;
        this.canvas.height = 25;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create 2d context');
        }
        this.ctx = ctx;
        this.gl = gl;
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error('Failed to create texture');
        }
        this.texture = texture;
    }

    getDimensions(text: string, textWrapper: TextWrapper) {
        return this.layout(text, textWrapper).outerSize;
    }

    getTexture(
        scale: number,
        text: string,
        type: 'say' | 'think' | 'ask',
        direction: 'left' | 'right',
        textWrapper: TextWrapper,
    ): WebGLTexture | null {
        this.draw(text, type, direction, textWrapper, scale);
        return this.texture;
    }

    private layout(text: string, textWrapper: TextWrapper) {
        if (this.renderedText === text) {
            return this.renderedLayout!;
        }

        const lines = textWrapper.wrap(text, bubbleStyle.maxLineWidth, this.ctx);
        const longestLineWidth = Math.ceil(Math.max(...lines.map(line => this.ctx.measureText(line).width)));
        const textWidth = Math.max(bubbleStyle.minWidth, longestLineWidth) + (bubbleStyle.padding * 2);
        const textHeight = (lines.length * bubbleStyle.lineHeight) + (bubbleStyle.padding * 2);
        const layout = {
            lines,
            longestLineWidth,
            innerSize: {width: textWidth, height: textHeight},
            outerSize: {
                width: textWidth + bubbleStyle.strokeWidth,
                height: textHeight + bubbleStyle.strokeWidth + bubbleStyle.tailHeight,
            },
        };
        this.renderedText = text;
        this.renderedLayout = layout;
        this.renderedType = null;
        this.renderedDirection = null;
        this.renderedScale = null;
        return layout;
    }

    private draw(
        text: string,
        type: 'say' | 'think' | 'ask',
        direction: 'left' | 'right',
        textWrapper: TextWrapper,
        scale: number,
    ) {
        if (
            this.renderedText === text &&
            this.renderedType === type &&
            this.renderedDirection === direction &&
            this.renderedScale === scale
        ) {
            return;
        }

        const ctx = this.ctx;
        ctx.resetTransform();
        ctx.font = `${bubbleStyle.fontSize}px ${bubbleStyle.font}`;
        const layout = this.layout(text, textWrapper);
        const outerWidth = layout.outerSize.width;
        const outerHeight = layout.outerSize.height;
        const width = layout.innerSize.width;
        const height = layout.innerSize.height;

        this.canvas.width = outerWidth * scale;
        this.canvas.height = outerHeight * scale;
        ctx.clearRect(0, 0, outerWidth, outerHeight);

        const {borderRadius, strokeWidth} = bubbleStyle;
        ctx.scale(scale, scale);
        ctx.translate(strokeWidth / 2, strokeWidth / 2);

        if (direction === 'left') {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-width, 0);
        }

        ctx.beginPath();
        ctx.moveTo(borderRadius, height);
        ctx.arcTo(0, height, 0, height - borderRadius, borderRadius);
        ctx.arcTo(0, 0, width, 0, borderRadius);
        ctx.arcTo(width, 0, width, height, borderRadius);
        ctx.arcTo(width, height, width - borderRadius, height, borderRadius);

        ctx.save();
        ctx.translate(width - borderRadius, height);

        if (type === 'say' || type === 'ask') {
            // For a speech bubble, draw a single "tail"
            ctx.bezierCurveTo(0, 4, 4, 8, 4, 10);
            ctx.arcTo(4, 12, 2, 12, 2);
            ctx.bezierCurveTo(-1, 12, -11, 8, -16, 0);

            ctx.closePath();
        } else {
            // For a thinking bubble, draw a partial circle attached to the bubble...
            ctx.arc(-16, 0, 4, 0, Math.PI);

            ctx.closePath();

            // and two circles detached from it
            ctx.moveTo(-7, 7.25);
            ctx.arc(-9.25, 7.25, 2.25, 0, Math.PI * 2);
            ctx.closePath();

            ctx.moveTo(0, 9.5);
            ctx.arc(-1.5, 9.5, 1.5, 0, Math.PI * 2);
            ctx.closePath();
        }

        ctx.restore();

        if (direction === 'left') {
            ctx.restore();
        }

        ctx.fillStyle = bubbleStyle.bubbleFill;
        ctx.strokeStyle = bubbleStyle.bubbleStroke;
        ctx.lineWidth = strokeWidth;

        ctx.stroke();
        ctx.fill();

        ctx.fillStyle = bubbleStyle.textFill;
        ctx.font = `${bubbleStyle.fontSize}px ${bubbleStyle.font}`;
        for (let i = 0; i < layout.lines.length; i++) {
            ctx.fillText(
                layout.lines[i],
                bubbleStyle.padding,
                bubbleStyle.padding +
                    (i * bubbleStyle.lineHeight) +
                    (bubbleStyle.fontSize * bubbleStyle.fontHeightRatio),
            );
        }

        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);

        this.renderedText = text;
        this.renderedType = type;
        this.renderedDirection = direction;
        this.renderedScale = scale;
    }

    public destroy() {
        if (this.texture) {
            this.gl.deleteTexture(this.texture);
        }
    }
}
