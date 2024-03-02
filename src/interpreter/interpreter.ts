import {Block} from '../block.js';
import Project from '../project.js';
import Target from '../target.js';
import {TypedEvent} from '../typed-events.js';

import BlockContext, {BlockContextParams} from './block-context.js';
import Thread, {ThreadStatus} from './thread.js';

export default class Interpreter {
    public turboMode: boolean = false;
    public currentMSecs = 0;

    private stepTime;
    private threads: Thread[];
    private blockContext: BlockContext;
    private redrawRequested = false;

    constructor(stepTime: number, contextParams: BlockContextParams) {
        this.stepTime = stepTime;
        this.threads = [];
        this.blockContext = new BlockContext(this, contextParams);
    }

    public setProject(project: Project | null) {
        // This is obviously a lie, but with no project, blocks should not be executing anyway
        this.blockContext.project = project!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        this.blockContext.stage = project?.stage!;
    }

    public requestRedraw() {
        this.redrawRequested = true;
    }

    public launch(script: Block[], target: Target, event: TypedEvent | null, restartExistingThreads: boolean) {
        if (restartExistingThreads) {
            for (const thread of this.threads) {
                if (thread.topBlock === script[0]) {
                    thread.restart(event);
                    return;
                }
            }
        }

        const thread = new Thread(script, target, this.blockContext, event);
        this.threads.push(thread);
    }

    public stopAll() {
        for (const thread of this.threads) {
            thread.retire();
        }
        this.threads.length = 0;
    }

    public stepThreads() {
        /** How long we can perform computations for before force-yielding. */
        const WORK_TIME = this.stepTime * 0.75;

        const startTime = this.currentMSecs = Date.now();
        let anyThreadsActive = true;

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

        this.redrawRequested = false;
    }
}
