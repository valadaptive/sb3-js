import {ProtoBlock, SingleBlockInput, StackInput} from '../block.js';
import {toBoolean} from '../cast.js';

/**
 * Internal wrapper block for edge-activated hats. Runs each tick, checking if the predicate is true and stopping the
 * thread if it isn't.
 * TODO: this doesn't work with edge-activated hats that restart existing threads, but there are no such hats in
 * Scratch.
 */
export const vm_stepEdgeActivatedHat = new ProtoBlock({
    opcode: 'vm_stepEdgeActivatedHat',
    inputs: {
        PREDICATE: SingleBlockInput,
        SCRIPT: StackInput,
    },
    *execute({PREDICATE, SCRIPT}, ctx) {
        const currentValue = toBoolean(yield* ctx.evaluate(PREDICATE));
        const oldValue = ctx.target.edgeActivatedHatValues.get(PREDICATE) ?? false;
        const isActivated = currentValue && !oldValue;
        ctx.target.edgeActivatedHatValues.set(PREDICATE, currentValue);

        if (!isActivated) {
            yield* ctx.stopThisScript();
        }
        yield* ctx.evaluate(SCRIPT);
    },
    colorCategory: 'internal',
});
