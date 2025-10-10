import {Rules} from '@cto.af/linebreak';

let segmentString: (text: string) => Iterable<{segment: string}>;
if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', {granularity: 'grapheme'});
    segmentString = (text: string) => {
        return segmenter.segment(text);
    };
} else {
    // TODO: remove this once Intl.Segmenter has been supported a while longer (it made it into a Firefox release in
    // April 2024).
    segmentString = function*(text: string) {
        const regex = /\P{M}\p{M}*/uy;
        let match;
        while ((match = regex.exec(text)) !== null) {
            yield {segment: match[0]};
        }
    };
}

export default class TextWrapper {
    private cache = new Map<string, string[]>();
    private breaker: Rules = new Rules({string: true});
    constructor() {}

    public wrap(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
        const cacheKey = `${maxWidth}:${text}`;
        const cacheResult = this.cache.get(cacheKey);
        if (typeof cacheResult !== 'undefined') {
            return cacheResult;
        }
        let lastPosition = 0;
        let currentLine: string | null = null;
        const lines: string[] = [];

        for (const nextBreak of this.breaker.breaks(text)) {
            const word = text.slice(lastPosition, nextBreak.position);
            const proposedLine: string = (currentLine ?? '') + word;
            const proposedWidth = ctx.measureText(proposedLine).width;

            if (proposedWidth > maxWidth) {
                const wordWidth = ctx.measureText(word).width;
                if (wordWidth > maxWidth) {
                    // If the word itself is too long, split it
                    for (const {segment} of segmentString(word)) {
                        const splitLine: string = (currentLine ?? '') + segment;
                        if (ctx.measureText(splitLine).width <= maxWidth) {
                            currentLine = splitLine;
                        } else {
                            if (currentLine !== null) lines.push(currentLine);
                            currentLine = segment;
                        }
                    }
                } else {
                    // The next word can fit on the next line. Finish the current line and start a new one.
                    if (currentLine !== null) lines.push(currentLine);
                    currentLine = word;
                }
            } else {
                // The next word fits on this line
                currentLine = proposedLine;
            }

            // Next break is a required break, so finish the current line
            if (nextBreak.required) {
                if (currentLine !== null) lines.push(currentLine);
                currentLine = null;
            }

            lastPosition = nextBreak.position;
        }

        currentLine ??= '';
        if (currentLine.length > 0 || lines.length === 0) {
            lines.push(currentLine);
        }

        this.cache.set(cacheKey, lines);
        return lines;
    }
}
