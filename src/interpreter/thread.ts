import {Block, BlockGenerator} from '../block.js';
import Target from '../target.js';
import {TypedEvent} from '../typed-events.js';
import BlockContext from './block-context.js';

export const enum ThreadStatus {
    RUNNING,
    PARKED,
    DONE,
}

export default class Thread {
    public status: ThreadStatus;
    public script: Block[];
    public target: Target;
    private startingEvent: TypedEvent | null;
    private blockContext: BlockContext;
    private generator: BlockGenerator;
    /** Increments when we enter a warp-mode procedure; decrements when we exit one. */
    private warpCounter: number = 0;
    /* The resolved value of the last promise we yielded to. */
    private resolvedValue: string | number | boolean | void = undefined;
    /**
     * Generation counter, incremented every time the thread is restarted. This is used so promises from an older
     * thread generation don't clobber the resolvedValue of the current one.
     */
    private generation: number = 0;

    constructor(script: Block[], target: Target, blockContext: BlockContext, startingEvent: TypedEvent | null) {
        this.status = ThreadStatus.RUNNING;
        this.script = script;
        this.target = target;
        this.blockContext = blockContext;
        this.startingEvent = startingEvent;
        this.generator = this.evaluateScript(this.script);
    }

    get topBlock() {
        if (this.script.length === 0) {
            throw new Error('Script has no top block! This should not happen.');
        }
        return this.script[0];
    }

    get warpMode() {
        return this.warpCounter > 0;
    }

    restart(startingEvent: TypedEvent | null) {
        this.startingEvent = startingEvent;
        this.status = ThreadStatus.RUNNING;
        this.generation++;
        this.generator = this.evaluateScript(this.script);
    }

    retire() {
        this.status = ThreadStatus.DONE;
    }

    // The following methods form the core of the interpreter's control flow. They use generators to implement yielding
    // and resuming threads.

    /**
     * Evaluate a single block and return the result.
     * @param block The block to evaluate.
     * @returns The block's return value, eventually.
     */
    *evaluateBlock(block: Block): BlockGenerator {
        return yield* (block.proto.execute as (...args: unknown[]) => BlockGenerator)(
            block.inputValues,
            this.blockContext,
            this.startingEvent,
        );
    }

    /**
     * Evaluate a stack of blocks, one after the other, and return the result of the last one.
     * @param script The stack of blocks to evaluate.
     * @returns The last block's return value, eventually.
     */
    *evaluateScript(script: Block[]): BlockGenerator {
        let evalResult;
        for (const block of script) {
            evalResult = yield* this.evaluateBlock(block);
        }
        return evalResult;
    }

    /**
     * Step the thread until it yields, parks, or finishes.
     */
    step() {
        this.blockContext.target = this.target;
        this.blockContext.thread = this;

        const {done, value} = this.generator.next(this.resolvedValue);
        if (done) {
            this.retire();
        }
        if (typeof value === 'object' && value instanceof Promise) {
            // TODO: proper thread park/unpark support will require a way to notify other threads that are parked on
            // this thread that they can unpark themselves too.
            this.status = ThreadStatus.PARKED;
            const generation = this.generation;
            value.then(resolved => {
                if (this.generation !== generation || this.status !== ThreadStatus.PARKED) return;
                this.resolvedValue = resolved;
                this.status = ThreadStatus.RUNNING;
            });
        }
        this.resolvedValue = undefined;
    }
}
