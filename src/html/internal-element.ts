import h, {type CustomH} from './html.js';

const randomId = (() => {
    const randBuf = new Uint32Array(1);
    return () => {
        crypto.getRandomValues(randBuf);
        return randBuf[0].toString(36);
    };
})();


/** Utility function to define internally-scoped custom elements with randomized non-colliding names. */
export const defineInternalElement = <Elem extends HTMLElement>(constructorFn: new () => Elem, tagName: string): {
    /** The element's randomized tag name. */
    readonly tagName: string;
    /** The `h` function for the element. */
    readonly h: CustomH<Elem>;
    /** Function which creates a new instance of the element. */
    readonly create: () => Elem;
} => {
    tagName = `${tagName}-internal-${randomId()}`;
    customElements.define(tagName, constructorFn);
    return {
        tagName,
        // eslint-disable-next-line @stylistic/max-len
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
        h: ((...args: any[]) => h(tagName, ...args)) as any,
        create: () => document.createElement(tagName) as Elem,
    };
};
