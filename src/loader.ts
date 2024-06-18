import {type ZipInfo, unzip, type ZipEntry, TypedArray, Reader} from 'unzipit';
import PromisePool from './util/promise-pool.js';

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
    private static projectMetaPath = `https://trampoline.turbowarp.org/api/projects`;
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

export type ZipSrc = ArrayBuffer | TypedArray | Blob | Reader;

export class ZipLoader extends Loader {
    private zip: Promise<ZipInfo>;

    constructor(zip: ZipSrc, signal?: AbortSignal) {
        super(100, signal);
        this.zip = unzip(zip);
    }

    private async getEntry(filename: string): Promise<ZipEntry> {
        const zip = await this.zip;
        const zipEntry = zip.entries[filename];
        if (!zipEntry) {
            throw new Error(`File not found: ${filename}`);
        }
        return zipEntry;
    }

    protected fetchAsset(filename: string, contentType: string): Promise<Blob> {
        return this.getEntry(filename).then(entry => entry.blob(contentType));
    }

    loadProjectManifest(): Promise<string> {
        return this.getEntry('project.json').then(entry => entry.text());
    }
}
