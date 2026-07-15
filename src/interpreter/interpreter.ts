import {Block, SomeProtoBlock} from '../block.js';
import {Monitor} from '../monitor.js';
import Project from '../project.js';
import Renderer from '../renderer/renderer.js';
import Target from '../target.js';
import {TypedEvent} from '../typed-events.js';

import BlockContext, {BlockContextParams} from './block-context.js';
import Thread, {ThreadStatus} from './thread.js';

export default class Interpreter {
    public turboMode: boolean = false;

    private stepTime;
    private threads: Thread[];
    private blockContext: BlockContext;
    private redrawRequested = false;
    private project: Project | null = null;

    constructor(stepTime: number, contextParams: BlockContextParams) {
        this.stepTime = stepTime;
        this.threads = [];
        this.blockContext = new BlockContext(this, contextParams);
    }

    public setProject(project: Project | null) {
        this.stopAllThreads();
        this.project = project;

        // This is obviously a lie, but with no project, blocks should not be executing anyway
        this.blockContext.project = project!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        this.blockContext.stage = project?.stage!;
    }

    public setRenderer(renderer: Renderer | null) {
        this.blockContext.renderer = renderer;
    }

    public requestRedraw() {
        this.redrawRequested = true;
    }

    public launch(script: Block[], target: Target, event: TypedEvent | null, restartExistingThreads: boolean) {
        if (restartExistingThreads) {
            for (const thread of this.threads) {
                if (thread.topBlock === script[0] && thread.target === target) {
                    if (event && !thread.hatBlockMatches(event)) {
                        continue;
                    }
                    thread.restart(event);
                    return thread;
                }
            }
        } else {
            // Give up if an existing thread is running
            for (const thread of this.threads) {
                if (thread.topBlock === script[0] && thread.target === target && thread.status !== ThreadStatus.DONE) {
                    if (event && !thread.hatBlockMatches(event)) {
                        continue;
                    }
                    return null;
                }
            }
        }

        const thread = new Thread(script, target, this.blockContext, event);
        if (event && !thread.hatBlockMatches(event)) {
            return null;
        }
        this.threads.push(thread);
        return thread;
    }

    public evaluateMonitor(monitor: Monitor) {
        const script = [monitor.block];
        const thread = new Thread(script, monitor.target, this.blockContext, null);
        const result = thread.step();
        if (!result?.done) {
            throw new Error('Monitor block did not finish synchronously');
        }
        // TODO: we should perhaps throw if the monitor block didn't return a value?
        monitor.update({value: result.value ?? ''});
    }

    public stopAllThreads() {
        for (const thread of this.threads) {
            thread.retire();
        }
        this.threads.length = 0;
    }

    public stopTargetThreads(target: Target, exceptFor?: Thread) {
        for (const thread of this.threads) {
            if (thread.target === target && thread !== exceptFor) {
                thread.retire();
            }
        }
    }

    public startHats(event: TypedEvent): Thread[] | null {
        const project = this.project;
        if (!project) return null;

        const startedThreads = [];
        // Sprites execute in top-to-bottom order
        for (let i = project.targets.length - 1; i >= 0; i--) {
            const target = project.targets[i];
            const hatScripts = target.getScriptsByHat(event.type);
            if (!hatScripts) continue;
            for (const script of hatScripts) {
                const topBlock = script[0];
                const protoBlock = topBlock.proto;
                if (!topBlock || !protoBlock.isHat()) continue;
                const thread = this.launch(
                    script,
                    target,
                    event,
                    (protoBlock as SomeProtoBlock).hat!.restartExistingThreads,
                );
                if (thread) startedThreads.push(thread);
            }
        }
        return startedThreads;
    }

    public stepThreads() {
        /** How long we can perform computations for before force-yielding. */
        const WORK_TIME = this.stepTime * 0.75;

        const startTime = Date.now();
        if (this.project) this.project.currentMSecs = startTime;
        let anyThreadsActive = true;

        this.redrawRequested = false;
        while (
            // We have at least one active thread.
            this.threads.length > 0 &&
            anyThreadsActive &&
            // We haven't run out of time.
            Date.now() - startTime < WORK_TIME &&
            // Either something visual has changed on-screen, or we're in turbo mode and execute as much as possible
            // each frame regardless.
            (this.turboMode || !this.redrawRequested)
        ) {
            anyThreadsActive = false;
            let anyThreadsStopped = false;

            const threads = this.threads;
            for (let i = 0; i < threads.length; i++) {
                const thread = threads[i];
                if (thread.status === ThreadStatus.RUNNING) {
                    thread.step();
                }

                if (thread.status === ThreadStatus.RUNNING) {
                    anyThreadsActive = true;
                } else if (thread.status === ThreadStatus.DONE) {
                    anyThreadsStopped = true;
                }
            }

            // In-place, filter out any threads with status DONE.
            if (anyThreadsStopped) {
                let nextActiveThreadIndex = 0;
                for (let i = 0; i < threads.length; i++) {
                    const thread = threads[i];
                    if (threads[i].status !== ThreadStatus.DONE) {
                        threads[nextActiveThreadIndex] = thread;
                        nextActiveThreadIndex++;
                    }
                }
                threads.length = nextActiveThreadIndex;
            }
        }
    }
}
