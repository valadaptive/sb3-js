import {Monitor, MonitorMode, MonitorSliderChangeEvent, MonitorView} from '../monitor.js';
import Rectangle from '../rectangle.js';
import h from './html.js';
import {defineInternalElement} from './internal-element.js';

const PADDING = 5;
// monitor placement should not be limited to 400x300; this was a limitation of scratch-gui not properly scaling
// monitors with small-stage mode. we do so for compatibility purposes.
const SCREEN_WIDTH = 400;
const SCREEN_HEIGHT = 300;
const SCREEN_EDGE_BUFFER = 40;
/**
 * Convoluted monitor placement algorithm, adapted from scratch-gui.
 * @todo revise this algorithm; it won't be 100% accurate but will be more robust and less convoluted.
 */
const placeMonitor = (monitorRects: Rectangle[], monitor: {width: number; height: number}): {x: number; y: number} => {
    const endXs = [0];
    const endYs = [0];
    for (const rect of monitorRects) {
        let x = rect.right;
        x = Math.ceil(x / 50) * 50;
        endXs.push(x);
        endYs.push(rect.top);
    }
    endXs.sort((a, b) => a - b);
    endYs.sort((a, b) => a - b);
    // plan B is used if the monitor can't fit in a preferred spot
    let planB = null;
    let lastX = null;
    let lastY = null;
    for (const x of endXs) {
        if (x === lastX) continue;
        lastX = x;
        outer:
        for (const y of endYs) {
            if (y === lastY) continue;
            lastY = y;
            const monitorRect = Rectangle.fromBounds(
                x + PADDING,
                x + PADDING + monitor.width,
                y + PADDING,
                y + PADDING + monitor.height,
            );
            const rect = Rectangle.fromBounds(
                x,
                x + monitor.width + (PADDING * 2),
                y,
                y + monitor.height + (PADDING * 2),
            );
            for (const other of monitorRects) {
                if (other.intersectsStrict(rect)) {
                    continue outer;
                }
            }
            if (rect.right > SCREEN_WIDTH || rect.top > SCREEN_HEIGHT) {
                if (!planB &&
                    (!(
                        rect.left + SCREEN_EDGE_BUFFER > SCREEN_WIDTH ||
                        rect.bottom + SCREEN_EDGE_BUFFER > SCREEN_HEIGHT))) {
                    planB = {x: monitorRect.left, y: monitorRect.bottom};
                }
                continue;
            }
            return {x: monitorRect.left, y: monitorRect.bottom};
        }
    }

    if (planB) return planB;
    // give up and just return a random position
    return {
        x: Math.ceil(Math.random() * (SCREEN_WIDTH / 2)),
        y: Math.ceil(Math.random() * (SCREEN_HEIGHT - SCREEN_EDGE_BUFFER)),
    };
};

export class MonitorElement extends HTMLElement implements MonitorView {
    private monitorElement: ScalarMonitorElement | ListMonitorElement | null = null;
    private monitorType: 'none' | 'scalar' | 'list' = 'none';
    private shadow: ShadowRoot;
    constructor() {
        super();
        this.shadow = this.attachShadow({mode: 'open'});
    }

    update(monitor: Monitor): void {
        const monitorType = monitor.mode.mode === 'list' ? 'list' : 'scalar';
        if (this.monitorType !== monitorType) {
            if (this.monitorElement) this.monitorElement.remove();
            this.monitorType = monitorType;
            if (monitorType === 'scalar') {
                this.monitorElement = internalScalarMonitor.create();
            } else {
                this.monitorElement = internalListMonitor.create();
            }
            this.shadow.append(this.monitorElement);
        }
        if (!this.monitorElement) throw new Error('Monitor element not created (this should not happen)');

        if (monitor.mode.mode === 'list') {
            (this.monitorElement as ListMonitorElement).setSize(monitor.mode.size.width, monitor.mode.size.height);
            (this.monitorElement as ListMonitorElement).setValue(
                Array.isArray(monitor.value) ?
                    monitor.value :
                    // eslint-disable-next-line eqeqeq
                    monitor.value == null ?
                        [] :
                        [monitor.value],
            );
        } else {
            (this.monitorElement as ScalarMonitorElement).setMode(monitor.mode);
            (this.monitorElement as ScalarMonitorElement).setValue(
                Array.isArray(monitor.value) ?
                    monitor.value.join(' ') :
                    monitor.value,
            );
        }
        if (monitor.position) this.setPosition(monitor.position);

        const label = !monitor.target || monitor.target?.sprite.isStage ?
            monitor.label :
            `${monitor.target.sprite.name}: ${monitor.label}`;

        this.monitorElement.setLabel(label);
    }
    setPosition(to: {x: number; y: number}): void {
        this.style.left = `${to.x}px`;
        this.style.top = `${to.y}px`;
    }
    setColor(fg: string, bg: string): void {
        if (this.monitorElement) this.monitorElement.setColor(fg, bg);
    }
    getBounds(): Rectangle | null {
        if (!this.monitorElement) return null;
        return Rectangle.fromBounds(
            this.offsetLeft,
            this.offsetLeft + this.offsetWidth,
            this.offsetTop,
            this.offsetTop + this.offsetHeight,
        );
    }
    layout(monitorRects: Rectangle[]): {x: number; y: number} | null {
        if (!this.monitorElement) return null;
        return placeMonitor(monitorRects, this.getBounds()!);
    }
}

const scalarTemplate = h('template',
    h('style', `
        #monitor {
            color: hsl(226, 14.7%, 40%);
            background-color: hsla(215, 100%, 95%, 1);
            border: 1px solid hsla(0, 0%, 0%, 0.15);
            border-radius: 0.25rem;
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 0.75rem;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 3px;
            box-sizing: border-box;
        }

        #top-row {
            display: flex;
        }

        #label {
            font-weight: bold;
            margin: 0 5px;
        }

        #value {
            min-width: 40px;
            margin: 0 5px;
            padding: 0 2px;
            border-radius: 0.25rem;
            white-space: pre;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }

        #monitor.large {
            padding: 0;
        }

        .large #label {
            display: none;
        }

        .large #value {
            min-height: 1.4rem;
            min-width: 3rem;
            margin: 0;
            padding: 0.1rem 0.25rem;
            font-size: 1rem;
            border-radius: 0;
        }
    `),
    h('div', {id: 'monitor'},
        h('div', {id: 'top-row'},
            h('div', {id: 'label'}),
            h('div', {id: 'value'}),
        ),
    ),
);

class ScalarMonitorElement extends HTMLElement {
    private monitorElement: HTMLDivElement;
    private labelElement: HTMLDivElement;
    private valueElement: HTMLDivElement;
    private sliderElement: HTMLInputElement | null = null;
    private value: string = '';
    private mode: MonitorMode | null = null;
    constructor() {
        super();
        const shadow = this.attachShadow({mode: 'open'});
        const contents = scalarTemplate.content.cloneNode(true) as HTMLElement;
        shadow.append(contents);
        this.monitorElement = shadow.getElementById('monitor') as HTMLDivElement;
        this.labelElement = shadow.getElementById('label') as HTMLDivElement;
        this.valueElement = shadow.getElementById('value') as HTMLDivElement;
        // Don't show the monitor until it's updated for the first time
        this.monitorElement.style.display = 'none';
    }

    setMode(to: MonitorMode): void {
        //if (to === this.mode) return;
        if (to.mode === 'large') {
            this.monitorElement.classList.add('large');
        } else {
            this.monitorElement.classList.remove('large');
        }

        if (to.mode === 'slider' && !this.sliderElement) {
            const slider = h('input', {
                type: 'range',
                min: String(to.min),
                max: String(to.max),
                step: to.isDiscrete ? '1' : 'any',
                value: this.value,
            });
            this.sliderElement = slider;
            this.monitorElement.append(slider);
            slider.addEventListener('input', () => {
                const evt = new MonitorSliderChangeEvent(Number(slider.value), {composed: true});
                this.dispatchEvent(evt);
            });
        } else if (to.mode !== 'slider' && this.sliderElement) {
            this.sliderElement.remove();
            this.sliderElement = null;
        }
    }
    setLabel(to: string): void {
        this.labelElement.replaceChildren(to);
    }
    setValue(to: string | number | boolean): void {
        this.value = typeof to === 'number' ?
        // Display up to 6 decimal places
            to.toFixed(6).replace(/\.?0+$/, '') :
            String(to);
        this.valueElement.replaceChildren(this.value);
        this.monitorElement.style.removeProperty('display');
        if (this.sliderElement) this.sliderElement.value = String(to);
    }
    setColor(fg: string, bg: string): void {
        this.valueElement.style.color = fg;
        this.valueElement.style.backgroundColor = bg;
    }
}

const LIST_ROW_HEIGHT = 24;

const listTemplate = h('template',
    h('style', `
        #monitor {
            color: hsl(226, 14.7%, 40%);
            background-color: hsla(215, 100%, 95%, 1);
            border: 1px solid hsla(0, 0%, 0%, 0.15);
            border-radius: 0.25rem;
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 0.75rem;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        }

        #label, #footer {
            font-weight: bold;
            text-align: center;
            flex: 0 0 auto;
            background: white;
            padding: 3px;
            border-width: 1px;
            border-color: hsla(0, 0%, 0%, 0.15);
        }

        #label {
            border-bottom-style: solid;
        }

        #footer {
            border-top-style: solid;
        }

        #contents {
            flex: 1 1 0;
            overflow: auto;
        }

        #scroller {
            position: relative;
            margin: 0 5px;
            display: flex;
        }

        .row {
            width: 100%;
            height: ${LIST_ROW_HEIGHT}px;
            display: flex;
            box-sizing: border-box;
            position: absolute;
            padding: 1px;
            overflow: auto;
        }

        .index {
            font-weight: bold;
            color: hsla(225, 15%, 40%, 1);
            margin-right: 6px;
            flex: 0 0 auto;
            align-self: center;
        }

        .value-wrapper {
            color: var(--fg);
            background-color: var(--bg);
            border-radius: 0.25rem;
            border: 1px solid hsla(0, 0%, 0%, 0.15);
            padding: 0 3px;
            flex: 1 1 auto;
            box-sizing: border-box;
            height: 22px;
            line-height: 22px;
            overflow: hidden;
            white-space: pre;
            text-overflow: ellipsis;
        }
    `),
    h('div', {id: 'monitor'},
        h('div', {id: 'label'}),
        h('div', {id: 'contents'}, h('div', {id: 'scroller'})),
        h('div', {id: 'footer'}),
    ),
);

const listRowTemplate = h('div', {className: 'row'},
    h('div', {className: 'index'}),
    h('div', {className: 'value-wrapper'}, h('span', {className: 'value'})),
);


class ListMonitorElement extends HTMLElement {
    private monitorElement: HTMLDivElement;
    private labelElement: HTMLDivElement;
    private contentsElement: HTMLDivElement;
    private scrollerElement: HTMLDivElement;
    private footerElement: HTMLDivElement;
    private scrollListener: () => void;

    private startElemIndex = 0;
    private endElemIndex = 0;

    private items: (string | number | boolean)[] = [];
    // This monitor will always be updated. We need to track previous values to avoid unnecessary DOM updates.
    private renderedValues: string[] = [];
    private label: string = '';
    private color: {fg: string; bg: string} = {fg: '', bg: ''};
    private size: {width: number; height: number} = {width: -1, height: -1};

    constructor() {
        super();
        const shadow = this.attachShadow({mode: 'open'});
        const contents = listTemplate.content.cloneNode(true) as HTMLElement;
        shadow.append(contents);
        this.monitorElement = shadow.getElementById('monitor') as HTMLDivElement;
        this.labelElement = shadow.getElementById('label') as HTMLDivElement;
        this.contentsElement = shadow.getElementById('contents') as HTMLDivElement;
        this.scrollerElement = shadow.getElementById('scroller') as HTMLDivElement;
        this.footerElement = shadow.getElementById('footer') as HTMLDivElement;

        this.scrollListener = this.updateDisplay.bind(this);

        this.setSize(0, 0);
    }

    connectedCallback() {
        // We need to do this every time a scroll event is received in addition to every runtime tick because the
        // user's screen probably is faster than the runtime tick rate
        this.contentsElement.addEventListener('scroll', this.scrollListener);
    }

    disconnectedCallback() {
        this.contentsElement.removeEventListener('scroll', this.scrollListener);
    }

    setLabel(to: string): void {
        if (this.label === to) return;
        this.labelElement.replaceChildren(to);
        this.label = to;
    }
    setValue(to: (string | number | boolean)[]): void {
        // Even if the list is the same as the previous one, update the display because the items themselves may have
        // changed
        this.items = to;
        this.updateDisplay();
    }
    setColor(fg: string, bg: string): void {
        // Avoid expensive CSS stuff unless the color really changed
        if (this.color.fg !== fg) {
            this.monitorElement.style.setProperty('--fg', fg);
            this.color.fg = fg;
        }
        if (this.color.bg !== bg) {
            this.monitorElement.style.setProperty('--bg', bg);
            this.color.bg = bg;
        }
    }
    setSize(width: number, height: number) {
        if (this.size.width === width && this.size.height === height) return;
        // Default to 100x200 if width or height are 0 (the || instead of ?? is deliberate)
        this.monitorElement.style.width = `${width || 100}px`;
        this.monitorElement.style.height = `${height || 200}px`;
        this.size.width = width;
        this.size.height = height;
    }
    private createRow(index: number): HTMLElement {
        const row = listRowTemplate.cloneNode(true) as HTMLElement;
        row.querySelector('.index')!.textContent = String(index + 1);
        row.style.top = `${index * LIST_ROW_HEIGHT}px`;
        return row;
    }
    private updateDisplay() {
        // Virtualized list--only renders what's on screen
        this.scrollerElement.style.height = `${this.items.length * LIST_ROW_HEIGHT}px`;

        const containerHeight = this.contentsElement.clientHeight;
        const scrollOffset = this.contentsElement.scrollTop;
        const firstIndexInView = Math.floor(scrollOffset / LIST_ROW_HEIGHT);
        const lastIndexInView = Math.min(
            this.items.length,
            Math.ceil((scrollOffset + containerHeight) / LIST_ROW_HEIGHT),
        );

        // Remove out-of-view rows. It's important only to call this when we actually have items in the list because
        // if the list is empty, startElemIndex and endElemIndex could be anywhere depending on state--all that an empty
        // list guarantees is that they'll be the same.
        if (this.startElemIndex !== this.endElemIndex) {
            if (firstIndexInView > this.startElemIndex) {
                this.renderedValues.splice(0, firstIndexInView - this.startElemIndex);
                while (this.startElemIndex < firstIndexInView && this.scrollerElement.firstChild) {
                    this.scrollerElement.firstChild.remove();
                    this.startElemIndex++;
                }
            }

            if (lastIndexInView < this.endElemIndex) {
                while (this.endElemIndex > lastIndexInView && this.scrollerElement.lastChild) {
                    this.scrollerElement.lastChild.remove();
                    this.endElemIndex--;
                    this.renderedValues.pop();
                }
            }
        }

        // List items were deleted. Remove all excess rows.
        if (this.endElemIndex > this.items.length) {
            const children = this.scrollerElement.children;
            for (let i = children.length - 1; i >= this.items.length; i--) {
                children[i].remove();
            }
            this.renderedValues.length = this.items.length;
            this.endElemIndex = this.items.length;
        }

        // We removed all rows; start from the first visible row
        if (this.startElemIndex === this.endElemIndex) {
            this.startElemIndex = this.endElemIndex = firstIndexInView;
        }

        // Add elements to the beginning
        if (firstIndexInView < this.startElemIndex) {
            const newElems = document.createDocumentFragment();
            const newRenderedValues = [];
            for (let i = firstIndexInView; i < this.startElemIndex; i++) {
                newElems.append(this.createRow(i));
                newRenderedValues.push('');
            }
            this.startElemIndex = firstIndexInView;
            this.scrollerElement.insertBefore(newElems, this.scrollerElement.firstChild);
            this.renderedValues.splice(0, 0, ...newRenderedValues);
        }

        // Remove elements from the end
        if (lastIndexInView > this.endElemIndex) {
            const newElems = document.createDocumentFragment();
            for (let i = this.endElemIndex; i < lastIndexInView; i++) {
                newElems.append(this.createRow(i));
                this.renderedValues.push('');
            }
            this.endElemIndex = lastIndexInView;
            this.scrollerElement.append(newElems);
        }

        // Update existing elements
        for (
            let i = 0, j = firstIndexInView, numElems = this.endElemIndex - this.startElemIndex;
            i < numElems;
            i++, j++
        ) {
            const row = this.scrollerElement.children[i] as HTMLElement;
            if (this.renderedValues[i] !== String(this.items[j])) {
                row.querySelector('.value')!.replaceChildren(String(this.items[j]));
                this.renderedValues[i] = String(this.items[j]);
            }
        }

        this.footerElement.replaceChildren(`length ${this.items.length}`);
    }
}

const internalScalarMonitor = defineInternalElement(ScalarMonitorElement, 'sb3js-scalar-monitor');
const internalListMonitor = defineInternalElement(ListMonitorElement, 'sb3js-list-monitor');
export const internalMonitor = defineInternalElement(MonitorElement, 'sb3js-monitor');
