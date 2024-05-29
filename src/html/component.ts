import h from './html.js';
import Runtime from '../runtime.js';
import {InternalStageElement, internalStage} from './stage.js';
import {LoadingScreenElement, internalLoadingScreen} from './loading-screen.js';
import {ZipSrc} from '../loader.js';

const style = `
#container {
    display: inline-flex;
    flex-direction: column;
}

#controls {
    display: flex;
    margin-bottom: 0.25rem;
}

.control-button {
    display: inline-flex;
    border: none;
    border-radius: 4px;
    padding: 0.5rem;
    background: none;
    transition: background 0.1s ease;
}

.control-button:hover {
    background: rgba(22, 117, 206, 0.25);
    cursor: pointer;
}

.control-button:active {
    background: rgba(22, 117, 206, 0.5);
}

#stage-container {
    border-radius: 4px;
    border: 1px solid rgba(127, 127, 127, 0.25);
    flex: 1 1 auto;
    display: flex;
    overflow: hidden;
    position: relative;
}

#loading-screen {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
}
`;

const template = h('template',
    h('style', style),
    h('div', {id: 'container'},
        h('div', {id: 'controls'},
            h('button', {className: 'control-button', id: 'green-flag'},
                h('img', {width: 24, height: 24, src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M3.471 15s5.029-3 8.5 0 8.5 0 8.5 0l2.116-12s-5.029 3-8.5 0-8.5 0-8.5 0' fill='%2368e95f'/%3E%3Cpath d='M2.06 23 5.94 1' style='fill:none;stroke:%23226437;stroke-width:2;stroke-linecap:round;stroke-linejoin:round'/%3E%3Cpath d='m13.587 3 3.824 1-2.116 12-3.824-1z' fill='%2347d258'/%3E%3Cpath d='M3.471 15s5.029-3 8.5 0 8.5 0 8.5 0l2.116-12s-5.029 3-8.5 0-8.5 0-8.5 0' style='fill:none;stroke:%23226437;stroke-width:2;stroke-linecap:butt;stroke-linejoin:round'/%3E%3C/svg%3E"}),
            ),
            h('button', {className: 'control-button', id: 'stop-all'},
                h('img', {width: 24, height: 24, src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath fill='%23eb2126' d='M8.272 21 3 15.728V8.272L8.272 3h7.456L21 8.272v7.456L15.728 21z'/%3E%3Cpath fill='%23f5f5f5' d='M7.443 1 1 7.443v9.114L7.443 23h9.114L23 16.557V7.443L16.557 1zm1.243 3h6.628L20 8.686v6.628L15.314 20H8.686L4 15.314V8.686z'/%3E%3Cpath fill='none' stroke='%23a71122' stroke-linejoin='round' stroke-width='2' d='M7.444 23 1 16.556V7.444L7.444 1h9.112L23 7.444v9.112L16.556 23z'/%3E%3C/svg%3E"}),
            ),
        ),
        h('div', {id: 'stage-container'},
            internalStage.h({id: 'stage'}),
            internalLoadingScreen.h({id: 'loading-screen'}),
        ),
    ),
);

export default class ProjectElement extends HTMLElement {
    private runtime: Runtime | null = null;
    private loadingScreen: LoadingScreenElement | null = null;
    constructor() {
        super();
    }

    connectedCallback() {
        this.runtime = new Runtime();
        const shadow = this.attachShadow({mode: 'open'});

        const templateContents = template.content.cloneNode(true);
        shadow.append(templateContents);
        const greenFlag = shadow.getElementById('green-flag') as HTMLButtonElement;
        greenFlag.addEventListener('click', () => {
            this.runtime?.greenFlag();
        });
        const stopAll = shadow.getElementById('stop-all') as HTMLButtonElement;
        stopAll.addEventListener('click', () => {
            this.runtime?.stopAll();
        });
        const stage = shadow.querySelector<InternalStageElement>(internalStage.tagName)!;
        this.runtime.attachStage(stage);

        const loadingScreen = shadow.getElementById('loading-screen') as LoadingScreenElement;
        this.loadingScreen = loadingScreen;
        this.loadingScreen.style.display = 'none';
    }

    private updateLoadingScreen(totalAssets: number, loadedAssets: number) {
        this.loadingScreen?.setAttribute('total-assets', String(totalAssets));
        this.loadingScreen?.setAttribute('loaded-assets', String(loadedAssets));
    }

    async loadProjectFromID(id: string) {
        if (!this.runtime) return;
        this.loadingScreen?.resetAnimation();
        this.loadingScreen?.style.removeProperty('display');
        const project = await this.runtime.loadProjectFromID(id, this.updateLoadingScreen.bind(this));
        this.runtime.setProject(project);
        //this.loadingScreen?.style.setProperty('display', 'none');
    }

    async loadProjectFromZip(zip: ZipSrc) {
        if (!this.runtime) return;
        this.loadingScreen?.resetAnimation();
        this.loadingScreen?.style.removeProperty('display');
        const project = await this.runtime.loadProjectFromZip(zip, this.updateLoadingScreen.bind(this));
        this.runtime.setProject(project);
        this.loadingScreen?.style.setProperty('display', 'none');
    }

    disconnectedCallback() {
        this.runtime?.destroy();
        this.runtime = null;
    }

    start() {
        this.runtime?.start();
    }

    stop() {
        this.runtime?.stop();
    }
}
