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
