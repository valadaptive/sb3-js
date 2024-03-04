import h from './html.js';

const randomId = (() => {
    const randBuf = new Uint32Array(1);
    return () => {
        crypto.getRandomValues(randBuf);
        return randBuf[0].toString(36);
    };
})();

const stageTemplate = h('template',
    h('style', `
        #stage {
            position: relative;
            width: 480px;
            height: 360px;
        }

        #canvas, #monitors {
            position: absolute;
            width: 100%;
            height: 100%;
        }
    `),
    h('div', {id: 'stage'},
        h('canvas', {id: 'canvas'}),
        h('div', {id: 'monitors'}),
    ),
);

export class InternalStageElement extends HTMLElement {
    public canvas: HTMLCanvasElement;
    constructor() {
        super();
        const shadow = this.attachShadow({mode: 'open'});
        const stageContents = stageTemplate.content.cloneNode(true) as HTMLElement;
        shadow.append(stageContents);
        this.canvas = shadow.getElementById('canvas') as HTMLCanvasElement;
    }
}

// Allow the library user to define which name they want for the stage element themselves, and use a random scoped name
// for our usages of it.
export const stageTagName = `sb3js-stage-internal-${randomId()}`;
customElements.define(stageTagName, InternalStageElement);
export const createStage = () => document.createElement(stageTagName) as InternalStageElement;

export class StageElement extends InternalStageElement {}
