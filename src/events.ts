import {TypedEvent} from './typed-events.js';

export class GreenFlagEvent extends TypedEvent<'greenflag'> {
    constructor() {
        super('greenflag');
    }
}

export class KeyPressedEvent extends TypedEvent<'keypressed'> {
    constructor(public readonly key: string) {
        super('keypressed');
    }
}

export class SwitchBackdropEvent extends TypedEvent<'switchbackdrop'> {
    constructor(public readonly backdrop: string) {
        super('switchbackdrop');
    }
}
