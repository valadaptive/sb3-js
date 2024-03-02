import {TypedEvent} from './typed-events.js';

export class GreenFlagEvent extends TypedEvent<'greenflag'> {
    constructor() {
        super('greenflag');
    }
}
