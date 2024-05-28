import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
    input: 'src/index.ts',
    output: {
        file: 'dist/index.js',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        nodeResolve({browser: true}),
        typescript(),
        copy({
            targets: [
                { src: 'src/assets/**/*', dest: 'dist/assets' }
            ]
        })
    ]
};
