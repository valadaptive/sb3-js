import {TypedEvent} from '../typed-events.js';
import h from './html.js';
import {defineInternalElement} from './internal-element.js';

const template = h('template',
    h('style', `
        #container {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;

            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            background: white;
            color: hsla(225, 15%, 40%, 1);
            border: 2px solid hsla(0, 0%, 0%, 0.15);
            border-radius: 0.5rem;
            overflow: hidden;
            padding: 1rem;
        }

        #prompt {
            font-size: 0.75rem;
            font-weight: bold;
        }

        #answer-row {
            position: relative;
        }

        #answer {
            box-sizing: border-box;
            height: 2rem;
            width: 100%;

            border-radius: 2rem;
            font-size: 0.75rem;
            background: white;
            color: hsla(225, 15%, 40%, 1);
            padding: 0 2rem 0 0.75rem;
            margin: 0;
            border: 1px solid hsla(0, 0%, 0%, 0.15);

            transition-duration: 0.1s;
            transition-property: border-color, box-shadow;
            transition-timing-function: ease;
        }

        #answer:focus {
            /* Transitions radius more smoothly than the outline property */
            box-shadow: 0 0 0 3px hsla(260, 60%, 60%, 0.35);
            outline: none;
            border-color: hsla(260, 60%, 60%, 1);
        }

        #submit {
            position: absolute;
            right: calc(0.5rem / 2);
            top: calc(0.5rem / 2);
            width: calc(2rem - 0.5rem);
            height: calc(2rem - 0.5rem);
            border: none;
            border-radius: 100%;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath fill='none' stroke='%23fff' stroke-linecap='round' stroke-linejoin='round' stroke-miterlimit='32' stroke-width='3.325' d='m15.336 6.265-7.473 7.473-3.198-3.196'/%3E%3C/svg%3E"), hsla(260, 60%, 60%, 1);
            background-size: 1.25rem;
            background-position: center;
            background-repeat: no-repeat;
            cursor: pointer;
        }
    `),
    h('div', {id: 'container'},
        h('div', {id: 'prompt'}),
        h('div', {id: 'answer-row'},
            h('input', {type: 'text', id: 'answer'}),
            h('button', {id: 'submit', title: 'Submit'}),
        ),
    ),
);

export class RespondEvent extends TypedEvent<'respond'> {
    constructor(public readonly answer: string, options?: EventInit) {
        super('respond', options);
    }
}

export default class AnswerBoxElement extends HTMLElement {
    private promptElement!: HTMLDivElement;
    private answerElement!: HTMLInputElement;
    private abortController: AbortController | null = null;

    connectedCallback() {
        const shadow = this.attachShadow({mode: 'open'});
        const contents = template.content.cloneNode(true) as HTMLElement;
        shadow.append(contents);
        this.promptElement = shadow.getElementById('prompt') as HTMLDivElement;
        this.answerElement = shadow.getElementById('answer') as HTMLInputElement;
        this.abortController = new AbortController();

        this.answerElement.addEventListener('keypress', event => {
            if (event.key === 'Enter') {
                this.dispatchEvent(new RespondEvent(this.answerElement.value, {composed: true}));
            }
        }, {signal: this.abortController.signal});
        const submitButton = shadow.getElementById('submit') as HTMLButtonElement;
        submitButton.addEventListener('click', () => {
            this.dispatchEvent(new RespondEvent(this.answerElement.value, {composed: true}));
        }, {signal: this.abortController.signal});

        this.setPrompt(this.getAttribute('prompt') ?? '');
    }

    disconnectedCallback() {
        this.abortController?.abort();
        this.abortController = null;
    }

    static get observedAttributes() {
        return ['prompt'];
    }

    private setPrompt(value: string) {
        this.promptElement.replaceChildren(value);
        if (value === '') {
            this.promptElement.style.display = 'none';
        } else {
            this.promptElement.style.removeProperty('display');
        }
    }

    attributeAddedCallback(name: string, value: string) {
        if (name === 'prompt') this.setPrompt(value);
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === 'prompt') this.setPrompt(newValue);
    }

    attributeRemovedCallback(name: string) {
        if (name === 'prompt') this.setPrompt('');
    }

    show() {
        this.answerElement.value = '';
        this.style.display = '';
        this.answerElement.focus();
    }

    hide() {
        this.style.display = 'none';
    }
}

export const internalAnswerBox = defineInternalElement(AnswerBoxElement, 'sb3js-answer-box');
