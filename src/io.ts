import {toString} from './cast.js';
import {TypedEvent, TypedEventTarget} from './typed-events.js';

export class DragStartEvent extends TypedEvent<'dragstart'> {
    static EVENT_NAME = 'dragstart';
    public readonly x: number;
    public readonly y: number;
    constructor(x: number, y: number) {
        super('dragstart');
        this.x = x;
        this.y = y;
    }
}

export class DragStopEvent extends TypedEvent<'dragstop'> {
    static EVENT_NAME = 'dragstop';
    constructor() {
        super('dragstop');
    }
}

const DRAG_THRESHOLD = 3;

export default class IO extends TypedEventTarget<DragStartEvent | DragStopEvent> {
    private _mousePosition: {x: number; y: number} = {x: 0, y: 0};
    private _mouseDownPosition: {x: number; y: number} = {x: 0, y: 0};
    private _mouseDown: boolean = false;
    private keysDown: Set<string> = new Set();
    private mouseDownTimeout: NodeJS.Timeout | null = null;
    private dragging: boolean = false;
    public username: string = '';

    public pressKey(key: string): void {
        this.keysDown.add(key);
    }

    public releaseKey(key: string): void {
        this.keysDown.delete(key);
    }

    public resetKeys(): void {
        this.keysDown.clear();
    }

    public isKeyPressed(key: string): boolean {
        return this.keysDown.has(key);
    }

    public isAnyKeyPressed(): boolean {
        return this.keysDown.size > 0;
    }

    public pressMouse(x: number, y: number): void {
        this._mouseDownPosition.x = this._mousePosition.x = x;
        this._mouseDownPosition.y = this._mousePosition.y = y;
        this._mouseDown = true;
        // If the mouse is held down for 400ms, start dragging
        this.mouseDownTimeout = setTimeout(() => {
            this.clearMouseDownTimeout();
            this.dispatchEvent(new DragStartEvent(x, y));
            this.dragging = true;
        }, 400);
    }

    private clearMouseDownTimeout(): void {
        if (this.mouseDownTimeout) {
            clearTimeout(this.mouseDownTimeout);
            this.mouseDownTimeout = null;
        }
    }

    public releaseMouse(x: number, y: number): void {
        this._mousePosition.x = x;
        this._mousePosition.y = y;
        this._mouseDown = false;
        this.clearMouseDownTimeout();
        if (this.dragging) {
            this.dispatchEvent(new DragStopEvent());
            this.dragging = false;
        }
    }

    public moveMouse(x: number, y: number): void {
        this._mousePosition.x = x;
        this._mousePosition.y = y;
        if (
            this._mouseDown &&
            Math.hypot(x - this._mouseDownPosition.x, y - this._mouseDownPosition.y) > DRAG_THRESHOLD &&
            !this.dragging
        ) {
            this.clearMouseDownTimeout();
            this.dispatchEvent(new DragStartEvent(this._mouseDownPosition.x, this._mouseDownPosition.y));
            this.dragging = true;
        }
    }

    public get mousePosition(): {x: number; y: number} {
        return this._mousePosition;
    }

    public get mouseDown(): boolean {
        return this._mouseDown;
    }

    public static keyArgToScratchKey(key: string | number | boolean): string | null {
        // Note that like in Scratch, the argument must be a number (e.g. a block which returns a string is semantically
        // distinct from a block which returns a number).
        if (typeof key === 'number') {
            // Punctuation, numbers, and uppercase letters (notably, *not* lowercase; ASCII codes of lowercase letters
            // never match in Scratch).
            if (key >= 48 && key <= 90) {
                return String.fromCharCode(key);
            }
            switch (key) {
                case 32: return 'space';
                case 37: return 'left arrow';
                case 38: return 'up arrow';
                case 39: return 'right arrow';
                case 40: return 'down arrow';
            }
        }

        let keyStr = toString(key);
        if (keyStr.length === 0) return null;

        if (
            key === 'space' ||
            key === 'left arrow' ||
            key === 'up arrow' ||
            key === 'right arrow' ||
            key === 'down arrow' ||
            key === 'enter'
        ) {
            return keyStr;
        }

        keyStr = keyStr[0];
        if (keyStr === ' ') return 'space';
        return keyStr.toUpperCase();
    }

    public static domToScratchKey(key: string): string | null {
        switch (key) {
            case ' ': return 'space';
            case 'ArrowLeft': return 'left arrow';
            case 'ArrowRight': return 'right arrow';
            case 'ArrowUp': return 'up arrow';
            case 'ArrowDown': return 'down arrow';
            case 'Enter': return 'enter';
        }

        if (key.length === 1) {
            return key.toUpperCase();
        }

        return null;
    }
}
