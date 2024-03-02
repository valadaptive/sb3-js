import {TypedEvent} from './typed-events.js';

export class GreenFlagEvent extends TypedEvent<'greenflag'> {
    static EVENT_NAME = 'greenflag';
    constructor() {
        super('greenflag');
    }
}

export class KeyPressedEvent extends TypedEvent<'keypressed'> {
    static EVENT_NAME = 'keypressed';
    constructor(public readonly key: string) {
        super('keypressed');
    }
}

export class SwitchBackdropEvent extends TypedEvent<'switchbackdrop'> {
    static EVENT_NAME = 'switchbackdrop';
    public readonly backdrop;
    constructor(backdrop: string) {
        super('switchbackdrop');
        this.backdrop = backdrop.toUpperCase();
    }
}

export class BroadcastEvent extends TypedEvent<'broadcast'> {
    static EVENT_NAME = 'broadcast';
    public readonly broadcast;
    constructor(broadcast: string) {
        super('broadcast');
        this.broadcast = broadcast.toUpperCase();
    }
}
