import AudioEngine from '../audio/audio-engine.js';
import {Block, BlockGenerator, ProtoBlock} from '../block.js';
import IO from '../io.js';
import Project, {Question} from '../project.js';
import Rectangle from '../rectangle.js';
import Renderer from '../renderer/renderer.js';
import Target from '../target.js';
import {TypedEvent} from '../typed-events.js';

import Interpreter from './interpreter.js';
import Thread, {PARK_THREAD, ThreadStatus} from './thread.js';

export type BlockContextParams = {
    io: IO;
    renderer: Renderer | null;
    audio: AudioEngine | null;
    stageBounds: Rectangle;
};

export default class BlockContext {
    private interpreter: Interpreter;
    public io: IO;
    public stageBounds: Rectangle;
    public project!: Project;
    public target!: Target;
    public stage!: Target;
    public thread!: Thread;
    public renderer: Renderer | null;
    public audio: AudioEngine | null;

    constructor(interpreter: Interpreter, params: BlockContextParams) {
        this.interpreter = interpreter;
        this.io = params.io;
        this.renderer = params.renderer;
        this.audio = params.audio;
        this.stageBounds = params.stageBounds;
    }

    *evaluate(input: Block | Block[] | string | number | boolean): BlockGenerator {
        if (Array.isArray(input)) {
            return yield* this.thread.evaluateScript(input);
        }
        if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
            return input;
        }
        return yield* this.thread.evaluateBlock(input);
    }

    /**
     * Faster version of evaluate that doesn't require a generator. Blocks are *not* allowed to perform side effects
     * before calling this, as it works by throwing a promise and then re-calling the block function with the resolved
     * value if it needs to evaluate an asynchronous reporter.
     * @param input The input to evaluate.
     */
    evaluateFast(input: Block | string | number | boolean): string | number | boolean {
        const generator = this.evaluate(input);
        const {done, value} = generator.next();
        if (done) {
            if (typeof value === 'undefined' || value === null) {
                throw new Error('Block returned undefined or null');
            }
            return value;
        } else {
            throw new Error('Operand tried to yield (currently not supported)');
        }
    }

    /**
     * Yield the current thread and move on to the next one.
     */
    *yieldThread() {
        yield;
    }

    /**
     * Await a promise. This is only necessary to get the correct type for the promise result, because TypeScript isn't
     * expressive enough to have the type of a yield expression depend on the type of the expression being yielded:
     * https://github.com/microsoft/TypeScript/issues/36967
     * @param promise The promise to await.
     * @returns The result of the promise.
     */
    *await<T>(promise: Promise<T>): Generator<Promise<T>, T, T> {
        return yield promise;
    }

    *waitForMS(ms: number) {
        const start = this.project.currentMSecs;
        // "wait" blocks always request a redraw, even if the wait time is 0
        this.interpreter.requestRedraw();
        // TODO: Even in scratch-vm, this has a tendency to busy-wait. See if there's a way to park threads without the
        // execution order or non-determinism issues that occurred with setTimeout.
        // Always yield at least once, even if the wait time is 0
        do {
            yield;
        } while (this.project.currentMSecs - start < ms);
    }

    stopOtherTargetThreads() {
        this.interpreter.stopTargetThreads(this.target, this.thread);
    }

    *stopThisScript() {
        // This throws an exception, so it technically doesn't need to be a generator function, but it makes it clearer.
        this.thread.stopThisScript();
    }

    *stopAll() {
        this.interpreter.stopAll();
        // We will never resume from this yield.
        yield;
    }

    *park() {
        yield PARK_THREAD;
    }

    /**
     * Yield until all given threads have finished running.
     */
    *waitOnThreads(threads: Thread[]) {
        const thisThread = this.thread;
        while (true) {
            let anyThreadsActive = false;

            for (const thread of threads) {
                // Yield if any threads are still running.
                if (thread.status === ThreadStatus.RUNNING) {
                    anyThreadsActive = true;
                }
                // If we're waiting on a parked thread, park ourselves until it unparks.
                if (thread.status === ThreadStatus.PARKED) {
                    thread.onUnpark(() => thisThread.resume());
                    yield* this.park();
                    anyThreadsActive = true;
                    break;
                }
            }

            if (!anyThreadsActive) {
                break;
            }

            yield;
        }
    }

    *ask(prompt: string | number | boolean) {
        yield* this.await(this.project.ask(new Question(prompt, this.target, this.thread, this.thread.generation)));
    }

    startHats<T extends string>(eventName: T, event: TypedEvent<T>): Thread[] | null {
        return this.interpreter.startHats(eventName, event);
    }

    getParam(name: string): string | number | boolean {
        return this.thread.getParam(name);
    }

    pushFrame(procedure: ProtoBlock, params: Record<string, string | number | boolean>, warp: boolean) {
        this.thread.pushFrame(procedure, params, warp);
    }

    popFrame(warp: boolean) {
        this.thread.popFrame(warp);
    }

    get currentTime() {
        return this.project.currentMSecs;
    }

    get warpMode() {
        return this.thread.warpMode;
    }

    isRecursiveCall(procedure: ProtoBlock) {
        return this.thread.isRecursiveCall(procedure);
    }

    lookupOrCreateVariable(name: string): number | string | boolean {
        let value = this.target.variables.get(name);
        // Check local variables first, then global variables
        if (value === undefined) value = this.stage.variables.get(name);
        if (value !== undefined) return value;
        // Create the variable locally if it doesn't exist
        this.target.variables.set(name, 0);
        return 0;
    }

    lookupOrCreateList(name: string): (number | string | boolean)[] {
        let value = this.target.lists.get(name);
        // Check local lists first, then global lists
        if (value === undefined) value = this.stage.lists.get(name);
        if (value !== undefined) return value;
        const list: (number | string | boolean)[] = [];
        this.target.lists.set(name, list);
        return list;
    }
}
