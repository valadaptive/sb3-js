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
            height: 100%;
            overflow: auto;
            justify-content: center;
        }

        #loading-text {
            font-size: 1.5rem;
            font-weight: bold;
        }

        #loading-bar {
            width: 75%;
            height: 100%;
            max-height: 2rem;
            border-radius: 0.25rem;
            background-color: rgba(22, 117, 206, 0.25);
            position: relative;
            overflow: auto;
            transition: max-height 0.25s ease, background-color 0.25s ease;
        }

        #loading-bar-progress {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(22, 117, 206, 1);
            transform: translateX(-100%);
        }

        #loading-bar-progress.active {
            /* transition: transform 0.05s linear; */
        }

        #error-message {
            display: none;
            padding: 0.5rem;
            white-space: pre-wrap;
            font-family: monospace;
        }

        #loading-bar.error {
            max-height: 50%;
            background-color: rgba(255, 40, 0, 0.5);
        }

        #loading-bar.error #error-message {
            display: block;
        }

        #loading-bar.error #loading-bar-progress {
            display: none;
        }
    `),
    h('div', {id: 'loading-screen'},
        h('div', {id: 'loading-inner'},
            h('div', {id: 'loading-text'}),
            h('div', {id: 'loading-bar'},
                h('div', {id: 'loading-bar-progress'}),
                h('div', {id: 'error-message'}),
            ),
        ),
    ),
);

export class LoadingScreenElement extends HTMLElement {
    static observedAttributes = ['total-assets', 'loaded-assets', 'error'];

    private elems: {
        loadingText: HTMLDivElement;
        loadingBar: HTMLDivElement;
        loadingBarProgress: HTMLDivElement;
        errorMessage: HTMLDivElement;
    } | null = null;
    private loadedAssets = 0;
    private totalAssets = 0;
    private error = '';

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
            errorMessage: shadow.getElementById('error-message') as HTMLDivElement,
        };
    }

    reset() {
        if (!this.elems) return;
        this.loadedAssets = this.totalAssets = 0;
        this.error = '';
        const {loadingBarProgress} = this.elems;
        loadingBarProgress.classList.remove('active');
        this.update();
        loadingBarProgress.classList.add('active');
    }

    private update() {
        if (!this.elems) return;
        const {loadingText, loadingBar, loadingBarProgress, errorMessage} = this.elems;

        if (this.error !== '') {
            loadingBar.classList.add('error');
            loadingText.replaceChildren('Failed to load project');
            errorMessage.replaceChildren(this.error);
        } else {
            loadingBar.classList.remove('error');
            const message = this.totalAssets === 0 ?
                'Loading...' :
                `${this.loadedAssets}/${this.totalAssets} assets loaded`;
            loadingText.replaceChildren(message);

            const progress = this.totalAssets === 0 ?
                0 :
                this.loadedAssets / this.totalAssets;
            loadingBarProgress.style.transform = `translateX(-${(1 - progress) * 100}%)`;
        }
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
            case 'error': {
                this.error = newValue;
                break;
            }
            default: return;
        }
        this.update();
    }
}
export const internalLoadingScreen = defineInternalElement(LoadingScreenElement, 'sb3js-loading-screen');
