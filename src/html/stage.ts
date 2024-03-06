import h from './html.js';
import {defineInternalElement} from './internal-element.js';
import {MonitorElement, internalMonitor} from './monitor.js';

const stageTemplate = h('template',
    h('style', `
        #stage {
            position: relative;
            width: 480px;
            height: 360px;
            overflow: hidden;
        }

        #canvas, #monitors {
            position: absolute;
            width: 100%;
            height: 100%;
        }

        #monitors {
            /* Prevents text from being selected when double-clicking outside specific monitors */
            pointer-events: none;
        }

        .monitor {
            pointer-events: auto;
        }
    `),
    h('div', {id: 'stage'},
        h('canvas', {id: 'canvas'}),
        h('div', {id: 'monitors'}),
    ),
);

export class InternalStageElement extends HTMLElement {
    public canvas!: HTMLCanvasElement;
    private monitorContainer!: HTMLDivElement;
    constructor() {
        super();
    }

    connectedCallback() {
        const shadow = this.attachShadow({mode: 'open'});
        const stageContents = stageTemplate.content.cloneNode(true) as HTMLElement;
        shadow.append(stageContents);
        this.canvas = shadow.getElementById('canvas') as HTMLCanvasElement;
        this.monitorContainer = shadow.getElementById('monitors') as HTMLDivElement;
    }

    createMonitorView(): MonitorElement {
        const elem = internalMonitor.h({className: 'monitor'}) as MonitorElement;
        elem.style.position = 'absolute';
        this.monitorContainer.append(elem);
        return elem;
    }
}

export const internalStage = defineInternalElement(InternalStageElement, 'sb3js-stage');

export class StageElement extends InternalStageElement {}
