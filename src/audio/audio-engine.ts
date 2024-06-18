type MicrophoneRequestState =
    | {state: 'NotRequested'}
    | {state: 'Requested'}
    | {state: 'Granted'; microphoneDataArray: Float32Array; analyser: AnalyserNode; lastValue: number | null}
    | {state: 'Errored'};

export default class AudioEngine {
    public ctx: AudioContext = new AudioContext();
    private microphoneRequestState: MicrophoneRequestState = {state: 'NotRequested'};
    private cachedLoudness: number | null = null;

    public async loadSound(data: ArrayBuffer): Promise<AudioBuffer> {
        // Cloning seems necessary here to avoid getting a detached arraybuffer error in Firefox
        return await this.ctx.decodeAudioData(data.slice(0));
    }

    private async requestMicrophone() {
        try {
            this.microphoneRequestState = {state: 'Requested'};
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});

            const source = this.ctx.createMediaStreamSource(stream);
            const analyser = this.ctx.createAnalyser();
            source.connect(analyser);

            this.microphoneRequestState = {
                state: 'Granted',
                microphoneDataArray: new Float32Array(analyser.fftSize),
                analyser,
                lastValue: null,
            };
        } catch (e) {
            this.microphoneRequestState = {state: 'Errored'};
            if (!(e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'))) {
                throw e;
            }
        }
    }

    public getLoudness(): number {
        if (this.cachedLoudness !== null) {
            return this.cachedLoudness;
        }

        // In case the audio context was suspended due to a lack of user interaction
        if (this.ctx.state === 'suspended') {
            void this.ctx.resume();
        }

        if (this.microphoneRequestState.state === 'NotRequested') {
            void this.requestMicrophone();
        }

        if (this.microphoneRequestState.state !== 'Granted') {
            return -1;
        }

        const {analyser, microphoneDataArray, lastValue} = this.microphoneRequestState;
        analyser.getFloatTimeDomainData(microphoneDataArray);

        const sum = microphoneDataArray.reduce((acc, val) => acc + (val ** 2), 0);
        let rms = Math.sqrt(sum / microphoneDataArray.length);

        if (lastValue !== null) {
            rms = Math.max(rms, lastValue * 0.6);
        }
        this.microphoneRequestState.lastValue = rms;

        rms *= 1.63;
        rms = Math.sqrt(rms);
        rms = Math.round(rms * 100);
        rms = Math.min(rms, 100);
        this.cachedLoudness = rms;
        return rms;
    }

    public resetCachedLoudness() {
        this.cachedLoudness = null;
    }
}
