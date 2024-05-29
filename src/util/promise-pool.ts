type PoolItem<T> = {
    resolve: (value: T | PromiseLike<T>) => unknown;
    reject: (error: unknown) => unknown;
    task: Task<T>;
};

type Task<T> = () => Promise<T>;
/**
 * pool for executing promise-based tasks sequentially.
 */
export default class PromisePool {
    /**
     * All items queued behind the currently-executing items
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private items: PoolItem<any>[];
    private numExecuting: number;
    private parallelism: number;
    /**
     * Promise resolve callback to call once we're done executing all items in the pool
     */
    private waitCallback: (() => void) | null;
    /**
     * Promise that resolves once we're done executing all items in the pool
     */
    private waitPromise: Promise<void> | null;

    /**
     * @param parallelism The maximum number of tasks that can execute at once, or -1 for unlimited parallelism.
     */
    constructor(parallelism: number) {
        this.items = [];
        this.numExecuting = 0;
        if (parallelism < 1 && parallelism !== -1) throw new Error('Invalid parallelism value');
        this.parallelism = parallelism;
        this.waitCallback = null;
        this.waitPromise = null;
    }

    /**
     * Enqueue a task. It will be called once all items ahead of it in the pool are done.
     *
     * @param task The task to enqueue
     */
    public enqueue<T>(task: Task<T>) {
        return new Promise<T>((resolve, reject) => {
            const poolItem: PoolItem<T> = {resolve, reject, task};
            this.items.push(poolItem);
            if (this.parallelism === -1 || this.numExecuting < this.parallelism) {
                this.numExecuting++;
                this.next();
            }
        });
    }

    private next() {
        const nextItem = this.items.shift();
        if (!nextItem) {
            this.numExecuting--;
            if (this.numExecuting === 0) {
                // We've reached the end of the pool. If we're waiting for that, then resolve the promise
                if (this.waitCallback) {
                    this.waitCallback();
                    this.waitCallback = null;
                    this.waitPromise = null;
                }
            }
            return;
        }

        const {resolve, reject, task} = nextItem;

        task()
            .then(resolve, reject)
            .finally(this.next.bind(this));
    }

    /**
     * Wait for every task enqueued to finish executing.
     *
     * @returns a Promise that resolves once all tasks are done executing.
     */
    public waitForAllItems() {
        // If we're idle, we're done already.
        if (this.numExecuting === 0) return Promise.resolve();
        // Reuse one promise for this entire batch of work
        if (!this.waitPromise) {
            this.waitPromise = new Promise(resolve => {
                // This callback will be called once we reach the end of the pool
                this.waitCallback = resolve;
            });
        }
        return this.waitPromise;
    }
}
