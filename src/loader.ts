import PromisePool from './util/promise-pool.js';
import {AsyncUnzipInflate, Unzip} from 'fflate';

export abstract class Loader {
    private assetCache: Map<string, Promise<Blob>>;
    private pool;
    protected signal?: AbortSignal;

    constructor(concurrency = 100, signal?: AbortSignal) {
        this.assetCache = new Map();
        this.pool = new PromisePool(concurrency);
        this.signal = signal;
    }

    /** Actually fetch the asset if it's not in the cache. */
    protected abstract fetchAsset(filename: string, contentType: string): Promise<Blob>;

    abstract loadProjectManifest(): Promise<string>;

    async loadAsset(filename: string, contentType: string): Promise<Blob> {
        if (this.signal?.aborted) {
            throw new Error(this.signal.reason ? String(this.signal.reason) : 'The operation was aborted');
        }
        const assetKey = `${filename}_${contentType}`;
        const cachedAsset = this.assetCache.get(assetKey);
        if (cachedAsset) return cachedAsset;

        const assetPromise = this.pool.enqueue(() => this.fetchAsset(filename, contentType));
        this.assetCache.set(assetKey, assetPromise);
        return assetPromise;
    }
}

export class WebLoader extends Loader {
    private static projectMetaPath = 'https://trampoline.turbowarp.org/api/projects';
    private static projectPath = 'https://projects.scratch.mit.edu';
    private static assetPath = 'https://assets.scratch.mit.edu/internalapi/asset';

    private projectID: string;

    constructor(projectID: string, signal?: AbortSignal) {
        super(10, signal);
        this.projectID = projectID;
    }

    protected async fetchAsset(filename: string, contentType: string): Promise<Blob> {
        const response = await fetch(`${WebLoader.assetPath}/${filename}/get/`, {
            headers: {
                'Accept': contentType,
            },
            signal: this.signal,
        });
        return await response.blob();
    }

    async loadProjectManifest(): Promise<string> {
        const projectMetaResponse = await fetch(`${WebLoader.projectMetaPath}/${this.projectID}`, {
            signal: this.signal,
        });
        const projectMeta = await projectMetaResponse.json() as {project_token: string};
        const url = `${WebLoader.projectPath}/${this.projectID}?token=${encodeURIComponent(projectMeta.project_token)}`;
        const response = await fetch(url, {
            signal: this.signal,
        });
        return await response.text();
    }
}

export type ZipSrc = Uint8Array | Blob | ReadableStream<Uint8Array>;

const DECODER = new TextDecoder();
export class ZipLoader extends Loader {
    /** Map of filename -> promise that resolves with the file data */
    private files: Promise<Map<string, () => Promise<Uint8Array[]>>>;

    constructor(zip: ZipSrc, signal?: AbortSignal) {
        super(100, signal);
        let zipStream: ReadableStream<Uint8Array>;
        if (zip instanceof Blob) {
            zipStream = zip.stream();
        } else if (zip instanceof Uint8Array) {
            zipStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(zip);
                    controller.close();
                },
            });
        } else {
            zipStream = zip;
        }

        const reader = zipStream.getReader();

        const files = new Map<string, () => Promise<Uint8Array[]>>();

        const unzip = new Unzip(file => {
            // Convert a file pseudo-stream to a promise that resolves with the file data
            const dataChunks: Uint8Array[] = [];
            let filePromise: Promise<Uint8Array[]>;
            const fileHandler = () => {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                if (filePromise) return filePromise;
                filePromise = new Promise<Uint8Array[]>((resolve, reject) => {
                    file.ondata = (err, chunk, final) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        dataChunks.push(chunk);
                        if (final) resolve(dataChunks);
                    };
                    file.start();
                });
                return filePromise;
            };

            files.set(file.name, fileHandler);
        });
        unzip.register(AsyncUnzipInflate);

        this.files = (async() => {
            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) {
                        unzip.push(new Uint8Array(0), true);
                        break;
                    }
                    unzip.push(value);
                }
            } finally {
                reader.releaseLock();
            }
            return files;
        })();
    }

    private async getEntry(filename: string): Promise<Uint8Array[]> {
        const files = await this.files;
        const fileLoader = files.get(filename);
        if (!fileLoader) {
            throw new Error(`File not found: ${filename}`);
        }

        try {
            const file = await fileLoader();
            return file;
        } catch (err) {
            const error = err as Error;
            throw new Error(`Error reading file: ${error.message}`, {cause: error});
        }
    }

    protected fetchAsset(filename: string, contentType: string): Promise<Blob> {
        return this.getEntry(filename).then(entry => new Blob(entry, {type: contentType}));
    }

    async loadProjectManifest(): Promise<string> {
        const chunks = await this.getEntry('project.json');
        let result = '';
        for (let i = 0; i < chunks.length; i++) {
            result += DECODER.decode(chunks[i], {stream: i === chunks.length - 1});
        }
        return result;
    }
}
