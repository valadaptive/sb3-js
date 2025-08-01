import AudioEngine from '../audio/audio-engine.js';
import {Block, BlockGenerator, ProtoBlock} from '../block.js';
import IO from '../io.js';
import Project, {Question} from '../project.js';
import Rectangle from '../rectangle.js';
import Renderer from '../renderer/renderer.js';
import Target from '../target.js';
import {TypedEvent} from '../typed-events.js';
import {Theme} from '../theme.js';

import Interpreter from './interpreter.js';
import Thread, {PARK_THREAD, ThreadStatus} from './thread.js';

export type BlockContextParams = {
    io: IO;
    renderer: Renderer | null;
    audio: AudioEngine | null;
    stageBounds: Rectangle;
    theme: Theme;
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
    public theme: Theme;

    constructor(interpreter: Interpreter, params: BlockContextParams) {
        this.interpreter = interpreter;
        this.io = params.io;
        this.renderer = params.renderer;
        this.audio = params.audio;
        this.stageBounds = params.stageBounds;
        this.theme = params.theme;
    }

    *evaluate(input: Block | Block[] | string | number | boolean): BlockGenerator {
        if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
            return input;
        }
        if (Array.isArray(input)) {
            return yield* this.thread.evaluateScript(input);
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
        // Fast path for scalar inputs; inlined to avoid a function call
        if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
            return input;
        }
        // Inline Thread#evaluateBlock. Significant speedup.
        const generator = (input.proto.execute as (...args: unknown[]) => BlockGenerator)(
            input.inputValues,
            this,
        );
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
        yield* this.thread.stopThisScript();
    }

    *stopAll() {
        this.target.runtime.stopAll();
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

    startHats(event: TypedEvent): Thread[] | null {
        return this.interpreter.startHats(event);
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
        if (typeof value !== 'undefined') return value;
        // Check local variables first, then global variables
        value = this.stage.variables.get(name);
        if (typeof value !== 'undefined') return value;
        // Create the variable locally if it doesn't exist
        this.target.variables.set(name, 0);
        return 0;
    }

    lookupOrCreateList(name: string): (number | string | boolean)[] {
        let value = this.target.lists.get(name);
        if (typeof value !== 'undefined') return value;
        // Check local lists first, then global lists
        value = this.stage.lists.get(name);
        if (typeof value !== 'undefined') return value;
        const list: (number | string | boolean)[] = [];
        this.target.lists.set(name, list);
        return list;
    }
}
