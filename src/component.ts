import Runtime from './runtime.js';

const style = `
.container {
    display: inline-flex;
    flex-direction: column;
}

.controls {
    display: flex;
    margin-bottom: 0.25rem;
}

.control-button {
    display: inline-flex;
    border: none;
    border-radius: 4px;
    padding: 0.5rem;
    background: none;
    transition: background 0.1s ease;
}

.control-button:hover {
    background: rgba(22, 117, 206, 0.25);
    cursor: pointer;
}

.control-button:active {
    background: rgba(22, 117, 206, 0.5);
}

.stage {
    border-radius: 4px;
    border: 1px solid rgba(127, 127, 127, 0.25);
    flex: 1 1 auto;
    display: flex;
    overflow: hidden;
}
`;

export default class ProjectElement extends HTMLElement {
    public runtime: Runtime;
    constructor() {
        super();
        this.runtime = new Runtime();
    }

    connectedCallback() {
        const shadow = this.attachShadow({mode: 'open'});
        const document = shadow.ownerDocument;
        const styleElement = document.createElement('style');
        styleElement.append(style);
        shadow.append(styleElement);

        const container = document.createElement('div');
        container.className = 'container';

        const controls = document.createElement('div');
        controls.className = 'controls';

        const greenFlag = document.createElement('button');
        greenFlag.className = 'control-button';
        const greenFlagImage = document.createElement('img');
        greenFlagImage.width = greenFlagImage.height = 24;
        greenFlagImage.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M3.471 15s5.029-3 8.5 0 8.5 0 8.5 0l2.116-12s-5.029 3-8.5 0-8.5 0-8.5 0' fill='%2368e95f'/%3E%3Cpath d='M2.06 23 5.94 1' style='fill:none;stroke:%23226437;stroke-width:2;stroke-linecap:round;stroke-linejoin:round'/%3E%3Cpath d='m13.587 3 3.824 1-2.116 12-3.824-1z' fill='%2347d258'/%3E%3Cpath d='M3.471 15s5.029-3 8.5 0 8.5 0 8.5 0l2.116-12s-5.029 3-8.5 0-8.5 0-8.5 0' style='fill:none;stroke:%23226437;stroke-width:2;stroke-linecap:butt;stroke-linejoin:round'/%3E%3C/svg%3E";
        greenFlag.append(greenFlagImage);
        greenFlag.addEventListener('click', () => {
            this.runtime.greenFlag();
        });
        controls.append(greenFlag);

        const stopAll = document.createElement('button');
        stopAll.className = 'control-button';
        const stopAllImage = document.createElement('img');
        stopAllImage.width = stopAllImage.height = 24;
        stopAllImage.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath fill='%23eb2126' d='M8.272 21 3 15.728V8.272L8.272 3h7.456L21 8.272v7.456L15.728 21z'/%3E%3Cpath fill='%23f5f5f5' d='M7.443 1 1 7.443v9.114L7.443 23h9.114L23 16.557V7.443L16.557 1zm1.243 3h6.628L20 8.686v6.628L15.314 20H8.686L4 15.314V8.686z'/%3E%3Cpath fill='none' stroke='%23a71122' stroke-linejoin='round' stroke-width='2' d='M7.444 23 1 16.556V7.444L7.444 1h9.112L23 7.444v9.112L16.556 23z'/%3E%3C/svg%3E";
        stopAll.append(stopAllImage);
        stopAll.addEventListener('click', () => {
            this.runtime.stopAll();
        });
        controls.append(stopAll);

        container.append(controls);

        const stage = document.createElement('div');
        stage.className = 'stage';
        const stageCanvas = document.createElement('canvas');
        stage.append(stageCanvas);
        container.append(stage);
        this.runtime.setCanvas(stageCanvas);

        shadow.append(container);
    }

    disconnectedCallback() {
        this.runtime.destroy();
    }

    start() {
        this.runtime.start();
    }

    stop() {
        this.runtime.stop();
    }
}
