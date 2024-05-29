import {Block, BlockGenerator, ProtoBlock, SomeProtoBlock} from '../block.js';
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

/**
 * Symbol thrown to stop the current script. Custom procedure blocks will catch this and return from the procedure.
 * This *could* be done solely with generators, but we don't want anything other than the Thread class driving the
 * generator function.
 */
export const STOP_THIS_SCRIPT = Symbol('STOP_THREAD');

export const PARK_THREAD = Symbol('PARK_THREAD');

/**
 * Amount of time we can spend in warp mode before yielding (in milliseconds).
 */
const WARP_TIME = 500;

export default class Thread {
    public status: ThreadStatus;
    public script: Block[];
    public target: Target;

    private startingEvent: TypedEvent | null;
    private blockContext: BlockContext;
    private generator: BlockGenerator;
    /** Increments when we enter a warp-mode procedure; decrements when we exit one. */
    private warpCounter: number = 0;
    /** The time at which warp-mode was entered (warpCounter transitioned from 0 to a non-zero value). */
    private warpTimer: number = 0;
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
     * Generation counter, incremented every time the thread is restarted. This is used to avoid operating on stale
     * state after a thread has been restarted.
     */
    public generation: number = 0;
    private unparkListeners: (() => void)[] = [];

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
        this.resume();
        this.generation++;
        this.generator = this.evaluateScript(this.script);
        this.callStack.length = 0;
        this.warpCounter = 0;
        this.resolvedValue = undefined;
    }

    private emitUnpark() {
        for (const listener of this.unparkListeners) {
            listener();
        }
        this.unparkListeners.length = 0;
    }

    public onUnpark(listener: () => void) {
        this.unparkListeners.push(listener);
    }

    retire() {
        this.status = ThreadStatus.DONE;
        this.emitUnpark();
    }

    park() {
        this.status = ThreadStatus.PARKED;
    }

    resume() {
        this.status = ThreadStatus.RUNNING;
        this.emitUnpark();
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

    hatBlockMatches(event: TypedEvent): boolean {
        const protoBlock = this.topBlock.proto as SomeProtoBlock;
        if (protoBlock.hat?.type !== 'event') return false;
        if (!(event instanceof protoBlock.hat.event)) return false;

        const hatThread = new Thread(
            this.script,
            this.target,
            this.blockContext,
            event,
        );

        // Hats can be started in the middle of executing other scripts (e.g. "broadcast"), so we need to store
        // and restore the previous target and thread.
        const oldTarget = this.blockContext.target;
        const oldThread = this.blockContext.thread;

        this.blockContext.target = this.target;
        this.blockContext.thread = hatThread;

        const generator = protoBlock.execute(
            this.topBlock.inputValues,
            this.blockContext,
            event,
        );

        // Hat blocks must run synchronously and return a boolean.
        let returnedValue: boolean;
        while (true) {
            const {value, done} = generator.next();
            if (done) {
                if (typeof value !== 'boolean') {
                    throw new Error('Hat block did not return a boolean');
                }
                returnedValue = value;
                break;
            } else if (typeof value !== 'undefined') {
                throw new Error('Hat block did not complete synchronously');
            }
        }

        // Restore the previous target and thread.
        this.blockContext.target = oldTarget;
        this.blockContext.thread = oldThread;

        return returnedValue;
    }

    /**
     * Step the thread until it yields, parks, or finishes.
     */
    public step() {
        this.stepGenerator(this.generator);
    }

    private stepGenerator(generator: BlockGenerator): ReturnType<BlockGenerator['next']> | undefined {
        this.blockContext.target = this.target;
        this.blockContext.thread = this;

        if (this.warpCounter > 0) {
            // Reset the warp timer every tick / frame.
            this.warpTimer = Date.now();
        }

        let result;
        while (true) {
            // The thread was parked (or stopped), either last iteration or in a previous tick.
            if (this.status !== ThreadStatus.RUNNING) break;

            try {
                result = generator.next(this.resolvedValue);
                const {done, value} = result;
                if (done) {
                    this.retire();
                }
                if (typeof value === 'object' && value instanceof Promise) {
                    this.park();
                    const generation = this.generation;

                    // We handle promises by parking the thread and resuming it when the promise resolves. We then pass
                    // the resolved value of the promise back into the generator function.
                    value.then(resolved => {
                        // If the thread has been stopped or restarted, we're working with stale state and shouldn't do
                        // anything.
                        if (this.generation !== generation || this.status !== ThreadStatus.PARKED) return;
                        // On the next iteration of step(), this.resolvedValue will be passed back into the generator.
                        this.resolvedValue = resolved;
                        this.resume();
                    });
                } else if (value === PARK_THREAD) {
                    this.park();
                }
            } catch (e) {
                if (e === STOP_THIS_SCRIPT) {
                    this.retire();
                } else {
                    throw e;
                }
            }
            this.resolvedValue = undefined;

            // We've yielded out of the thread. If we're in warp mode and haven't run out of time, keep going.
            if (this.warpCounter === 0 || (Date.now() - this.warpTimer) > WARP_TIME) break;
        }
        return result;
    }

    getParam(name: string): string | number | boolean {
        // When the param isn't found in the call stack, the reporters default to returning 0 (even boolean ones!)
        if (this.callStack.length === 0) return 0;
        return this.callStack[this.callStack.length - 1]?.params[name] ?? 0;
    }

    pushFrame(procedure: ProtoBlock, params: Params, warp: boolean) {
        this.callStack.push({params, procedure});
        const wasNotInWarpMode = !this.warpMode;
        // Fun fact: Phosphorus does something different here. It increments the warp counter if the procedure is
        // warp-mode, *or if the thread is already in warp mode*. This means that popFrame could decrement the warp
        // counter without having to know if the procedure was warp-mode or not.
        if (warp) {
            this.warpCounter++;
            if (wasNotInWarpMode) this.warpTimer = Date.now();
        }
    }

    popFrame(warp: boolean) {
        this.callStack.pop();
        if (warp) this.warpCounter--;
    }

    stopThisScript() {
        throw STOP_THIS_SCRIPT;
    }

    /**
     * Check if a given procedure call is recursive by examining the last 5 stack frames. Why 5? Because that's what
     * Scratch does.
     */
    isRecursiveCall(procedure: ProtoBlock) {
        // We just pushed the procedure we're testing against to the stack, so skip over it
        for (let i = this.callStack.length - 2, j = 5; i >= 0 && j > 0; i--, j--) {
            if (this.callStack[i].procedure === procedure) return true;
        }
        return false;
    }
}
