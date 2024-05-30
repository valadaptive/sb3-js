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

const isFont = Object.prototype.hasOwnProperty.bind(fonts) as (font: unknown) => font is keyof typeof fonts;

const fontPromises: Partial<Record<FontName, Promise<void>>> = {};

const fontURLs: Partial<Record<FontName, string>> = {};

// Load fonts for SVG costumes on-demand.
const loadFonts = async(fontNames: Iterable<string>) => {
    const promises: Promise<void>[] = [];
    for (const name of fontNames) {
        if (!isFont(name)) {
            continue;
        }
        const cachedPromise = fontPromises[name];
        promises.push(
            !cachedPromise ?
                fontPromises[name] = fetch(import.meta.resolve(fonts[name]))
                    .then(response => response.blob())
                    .then(blob => new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            fontURLs[name] = reader.result as string;
                            resolve();
                        };
                        reader.onerror = () => {
                            reject(reader.error);
                        };
                        reader.readAsDataURL(blob);
                    })) :
                cachedPromise,
        );
    }
    await Promise.all(promises);
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
            // Sometimes an empty group will have a font-family set. We can ignore it.
            if (font !== null && node.childNodes.length > 0) {
                foundFonts.add(font);
            }
        }

        if (foundFonts.size > 0) {
            await loadFonts(foundFonts.values());

            const css = [];

            // Inject fonts as data URLs into the SVG
            for (const fontName of foundFonts) {
                const fontURL = isFont(fontName) && fontURLs[fontName];
                if (fontURL) {
                    css.push("@font-face{font-family:'", fontName, "';src:url('", fontURL, "')}");
                }
            }

            const defs = svgDOM.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const style = svgDOM.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.setAttribute('type', 'text/css');
            defs.appendChild(style);
            style.append(...css);
            svgTag.insertBefore(defs, svgTag.firstChild);

            src = new Blob([new XMLSerializer().serializeToString(svgDOM)], {type: 'image/svg+xml'});
        }
    }

    const url = URL.createObjectURL(src);

    return {url, viewBox};
};

export default loadSVG;
