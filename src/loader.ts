import {type ZipInfo, unzip, type ZipEntry, TypedArray, Reader} from 'unzipit';

export interface Loader {
    loadAsset(filename: string, contentType: string): Promise<Blob>;
    loadProjectManifest(): Promise<string>;
}

export class WebLoader implements Loader {
    private static projectMetaPath = `https://trampoline.turbowarp.org/api/projects`;
    private static projectPath = 'https://projects.scratch.mit.edu';
    private static assetPath = 'https://assets.scratch.mit.edu/internalapi/asset';

    private projectID: string;

    constructor(projectID: string) {
        this.projectID = projectID;
    }

    async loadAsset(filename: string, contentType: string): Promise<Blob> {
        const response = await fetch(`${WebLoader.assetPath}/${filename}`, {
            headers: {
                'Accept': contentType,
            },
        });
        return await response.blob();
    }

    async loadProjectManifest(): Promise<string> {
        const projectMetaResponse = await fetch(`${WebLoader.projectMetaPath}/${this.projectID}`);
        const projectMeta = await projectMetaResponse.json() as {project_token: string};
        const response = await fetch(`${WebLoader.projectPath}/${this.projectID}?token=${encodeURIComponent(projectMeta.project_token)}`);
        return await response.text();
    }
}

export type ZipSrc = ArrayBuffer | TypedArray | Blob | Reader;

export class ZipLoader implements Loader {
    private zip: Promise<ZipInfo>;

    constructor(zip: ZipSrc) {
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

    loadAsset(filename: string, contentType: string): Promise<Blob> {
        return this.getEntry(filename).then(entry => entry.blob(contentType));
    }

    loadProjectManifest(): Promise<string> {
        return this.getEntry('project.json').then(entry => entry.text());
    }
}
