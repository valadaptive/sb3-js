import h from './html.js';
import {defineInternalElement} from './internal-element.js';

const loadingScreenTemplate = h('template',
    h('style', `
        #loading-screen {
            width: 100%;
            height: 100%;
            background-color: white;
            font-family: sans-serif;
            display: flex;
            align-items: center;
        }

        #loading-inner {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
        }

        #loading-text {
            font-size: 1.5rem;
            font-weight: bold;
        }

        #loading-bar {
            width: 75%;
            height: 2rem;
            border-radius: 0.25rem;
            background-color: rgba(22, 117, 206, 0.25);
            position: relative;
            overflow: hidden;

        }

        #loading-bar-progress {
            position: absolute;
            top: 0;
            left: 0;
            right: 100%;
            bottom: 0;
            background-color: rgba(22, 117, 206, 1);
        }

        #loading-bar-progress.active {
            transition: right 0.1s linear;
        }
    `),
    h('div', {id: 'loading-screen'},
        h('div', {id: 'loading-inner'},
            h('div', {id: 'loading-text'}),
            h('div', {id: 'loading-bar'},
                h('div', {id: 'loading-bar-progress'}),
            ),
        ),
    ),
);

export class LoadingScreenElement extends HTMLElement {
    static observedAttributes = ['total-assets', 'loaded-assets'];

    private elems: {
        loadingText: HTMLDivElement;
        loadingBar: HTMLDivElement;
        loadingBarProgress: HTMLDivElement;
    } | null = null;
    private loadedAssets = 0;
    private totalAssets = 0;

    constructor() {
        super();
    }

    connectedCallback() {
        const shadow = this.attachShadow({mode: 'open'});
        const contents = loadingScreenTemplate.content.cloneNode(true) as HTMLElement;
        shadow.append(contents);
        this.elems = {
            loadingText: shadow.getElementById('loading-text') as HTMLDivElement,
            loadingBar: shadow.getElementById('loading-bar') as HTMLDivElement,
            loadingBarProgress: shadow.getElementById('loading-bar-progress') as HTMLDivElement,
        };
    }

    resetAnimation() {
        if (!this.elems) return;
        const {loadingBarProgress} = this.elems;
        loadingBarProgress.classList.remove('active');
        loadingBarProgress.style.right = '100%';
        loadingBarProgress.classList.add('active');
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        switch (name) {
            case 'total-assets': {
                this.totalAssets = Number(newValue);
                break;
            }
            case 'loaded-assets': {
                this.loadedAssets = Number(newValue);
                break;
            }
            default: return;
        }


        if (!this.elems) return;

        const message = this.totalAssets === 0 ?
            'Loading...' :
            `${this.loadedAssets}/${this.totalAssets} assets loaded`;
        const {loadingText, loadingBarProgress} = this.elems;
        loadingText.replaceChildren(message);

        const progress = this.totalAssets === 0 ?
            0 :
            this.loadedAssets / this.totalAssets;
        loadingBarProgress.style.right = `${(1 - progress) * 100}%`;
    }
}
export const internalLoadingScreen = defineInternalElement(LoadingScreenElement, 'sb3js-loading-screen');
