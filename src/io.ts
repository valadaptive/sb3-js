import {toString} from './cast.js';

export default class IO {
    public mousePosition: {x: number; y: number} = {x: 0, y: 0};
    public mouseDown: boolean = false;
    public keysDown: Set<string> = new Set();
    public username: string = '';

    public isKeyPressed(key: string): boolean {
        return this.keysDown.has(key);
    }

    public isAnyKeyPressed(): boolean {
        return this.keysDown.size > 0;
    }

    public static keyArgToScratchKey(key: string | number | boolean): string | null {
        // Note that like, in Scratch, the argument must be a number (e.g. a block which returns a string is
        // semantically distinct from a block which returns a number).
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
