import {Block, BlockGenerator, ProtoBlock} from '../block.js';
import Target from '../target.js';
import {TypedEvent} from '../typed-events.js';
import BlockContext from './block-context.js';

export const enum ThreadStatus {
    RUNNING,
    PARKED,
    DONE,
}

export type Params = {
    [paramName: string]: string | number | boolean;
};

export default class Thread {
    public status: ThreadStatus;
    public script: Block[];
    public target: Target;

    private startingEvent: TypedEvent | null;
    private blockContext: BlockContext;
    private generator: BlockGenerator;
    /** Increments when we enter a warp-mode procedure; decrements when we exit one. */
    private warpCounter: number = 0;
    /**
     * Stack of custom procedure arguments frames. There *is* a way to implement custom procedure arguments with only
     * generator functions (have the "get procedure argument" block yield, and have the procedures_definition block
     * drive the generator itself and handle those yields by passing the params back into the generator), but that's
     * probably a lot slower and won't play nicely once we implement proper promise-throwing support to handle
     * evaluateFast. We want this class to be the only one that drives the generator function.
     */
    private callStack: {params: Params; procedure: ProtoBlock}[] = [];
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
        this.callStack.length = 0;
        this.warpCounter = 0;
        this.resolvedValue = undefined;
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

    getParam(name: string): string | number | boolean {
        // When the param isn't found in the call stack, the reporters default to returning 0 (even boolean ones!)
        if (this.callStack.length === 0) return 0;
        return this.callStack[this.callStack.length - 1]?.params[name] ?? 0;
    }

    pushFrame(procedure: ProtoBlock, params: Params, warp: boolean) {
        this.callStack.push({params, procedure});
        if (warp) this.warpCounter++;
    }

    popFrame(warp: boolean) {
        this.callStack.pop();
        if (warp) this.warpCounter--;
    }

    /**
     * Check if a given procedure call is recursive by examining the last 5 stack frames. Why 5? Because that's what
     * Scratch does.
     */
    isRecursiveCall(procedure: ProtoBlock) {
        for (let i = this.callStack.length - 1, j = 5; i >= 0 && j > 0; i--, j--) {
            if (this.callStack[i].procedure === procedure) return true;
        }
        return false;
    }
}
