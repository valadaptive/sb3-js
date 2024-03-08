import AnswerBoxElement, {internalAnswerBox} from './answer-box.js';
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

        #answer-box {
            position: absolute;
            bottom: 0.5rem;
            left: 0.5rem;
            right: 0.5rem;
        }
    `),
    h('div', {id: 'stage'},
        h('canvas', {id: 'canvas', tabIndex: 0}),
        h('div', {id: 'monitors'}),
        internalAnswerBox.h({id: 'answer-box'}),
    ),
);

export class InternalStageElement extends HTMLElement {
    public canvas!: HTMLCanvasElement;
    public answerBox!: AnswerBoxElement;
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
        this.answerBox = shadow.getElementById('answer-box') as AnswerBoxElement;
        this.answerBox.style.display = 'none';
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
