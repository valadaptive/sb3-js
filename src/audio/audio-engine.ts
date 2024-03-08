export default class AudioEngine {
    public ctx: AudioContext = new AudioContext();

    public async loadSound(data: ArrayBuffer): Promise<AudioBuffer> {
        return await this.ctx.decodeAudioData(data);
    }
}
