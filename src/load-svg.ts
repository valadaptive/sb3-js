import Rectangle from './rectangle.js';

const fonts = {
    'Sans Serif': './assets/fonts/NotoSans-Medium.woff2',
    'Serif': './assets/fonts/SourceSerifPro-Regular.woff2',
    'Handwriting': './assets/fonts/handlee-regular.woff2',
    'Marker': './assets/fonts/Knewave.woff2',
    'Curly': './assets/fonts/Griffy-Regular.woff2',
    'Pixel': './assets/fonts/Grand9K-Pixel.woff2',
    'Scratch': './assets/fonts/ScratchSavers_b2.woff2',
};

type FontName = keyof typeof fonts;

const loadedFonts: Record<FontName, Promise<string> | null> = {
    'Sans Serif': null,
    'Serif': null,
    'Handwriting': null,
    'Marker': null,
    'Curly': null,
    'Pixel': null,
    'Scratch': null,
};

// Load fonts for SVG costumes on-demand.
const loadFonts = async(fontNames: Iterable<string>): Promise<Record<FontName, string>> => {
    for (const name of fontNames) {
        if (!Object.prototype.hasOwnProperty.call(loadedFonts, name)) {
            continue;
        }
        if (loadedFonts[name as FontName] === null) {
            loadedFonts[name as FontName] = fetch(import.meta.resolve(fonts[name as FontName]))
                .then(response => response.blob())
                .then(blob => blob.arrayBuffer())
                .then(buffer => {
                    let binary = '';
                    const bytes = new Uint8Array(buffer);
                    // Encode the bytes as a base64 string. It's more efficient to do so 8 bytes at a time.
                    // A blob URL does not appear to work here--in Chrome it doesn't do anything, and in Firefox it
                    // causes the font to render completely blank if the SVG is drawn too quickly and the blob URL
                    // doesn't get a chance to "load".
                    let i = 0;
                    for (; i < bytes.byteLength; i += 8) {
                        binary += String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3],
                            bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
                    }
                    for (; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    const base64 = btoa(binary);
                    return `data:font/woff2;base64,${base64}`;
                });
        }
    }

    const fontURLs = {} as Record<FontName, string>;
    const fontPromises = await Promise.all(Object.values(loadedFonts));
    for (let i = 0; i < fontPromises.length; i++) {
        fontURLs[Object.keys(loadedFonts)[i] as FontName] = fontPromises[i]!;
    }
    return fontURLs;
};

const loadSVG = async(src: Blob): Promise<{url: string; viewBox: Rectangle}> => {
    const svgText = await src.text();
    const svgDOM = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svgTag = svgDOM.documentElement as Element as SVGSVGElement;

    // If the viewBox is not set, use the width and height attributes
    let viewBox;
    if (svgTag.viewBox.baseVal === null) {
        viewBox = Rectangle.fromBounds(
            0,
            svgTag.width.baseVal.value,
            0,
            svgTag.height.baseVal.value,
        );
    } else {
        const {x, y, width, height} = svgTag.viewBox.baseVal;
        viewBox = Rectangle.fromBounds(
            x,
            x + width,
            y,
            y + height,
        );
    }

    // Inject fonts into the SVG
    if (svgText.includes('font-family')) {
        const nodeIterator = svgDOM.createNodeIterator(svgDOM.documentElement, NodeFilter.SHOW_ELEMENT);
        const foundFonts = new Set<string>();
        for (
            let node = nodeIterator.nextNode() as SVGElement;
            node !== null;
            node = nodeIterator.nextNode() as SVGElement
        ) {
            const font = node.getAttribute('font-family');
            if (font !== null) {
                foundFonts.add(font);
            }
        }

        if (foundFonts.size > 0) {
            const fontURLs = await loadFonts(foundFonts.values());

            // Inject fonts as data URLs into the SVG
            for (const fontName of foundFonts) {
                if (!Object.prototype.hasOwnProperty.call(fonts, fontName)) {
                    continue;
                }
                const defs = svgDOM.createElementNS('http://www.w3.org/2000/svg', 'defs');
                const style = svgDOM.createElementNS('http://www.w3.org/2000/svg', 'style');
                style.setAttribute('type', 'text/css');
                defs.appendChild(style);
                const fontURL = fontURLs[fontName as FontName];
                style.append(`@font-face { font-family: '${fontName}'; src: url(${JSON.stringify(fontURL)}); }`);
                svgTag.insertBefore(defs, svgTag.firstChild);
            }

            src = new Blob([new XMLSerializer().serializeToString(svgDOM)], {type: 'image/svg+xml'});
        }
    }

    const url = URL.createObjectURL(src);

    return {url, viewBox};
};

export default loadSVG;
