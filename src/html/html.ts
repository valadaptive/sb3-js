type Listener<E extends Event> =
    | ((event: E) => void)
    | {listener: (event: E) => void; options?: AddEventListenerOptions};

type EventHandlers = {
    [Event in `$${keyof HTMLElementEventMap}`]?: Listener<HTMLElementEventMap[Event extends `$${infer E extends keyof HTMLElementEventMap}` ? E : never]>;
};

type Props<Elem extends HTMLElement> = {
    [Prop in keyof Elem]?: Elem[Prop];
};

export type CustomH<Elem extends HTMLElement> =
& ((
    ...children: (HTMLElement | string)[]
) => Elem)
& ((
    props: {[K in string]: K extends `$${infer E}` ? Listener<Event> : string},
    ...children: (HTMLElement | string)[]
) => Elem);

export default function h<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[Tag];

export default function h<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    props: (EventHandlers & Props<HTMLElementTagNameMap[Tag]>),
    ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[Tag];

export default function h<Elem extends HTMLElement>(
    tag: string,
    ...children: (HTMLElement | string)[]
): Elem;

export default function h<Elem extends HTMLElement>(
    tag: string,
    props: {[K in string]: K extends `$${infer E}` ? Listener<Event> : string},
    ...children: (HTMLElement | string)[]
): Elem;

export default function h<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    ...rest: [
        propsOrChildren: (EventHandlers & Props<HTMLElementTagNameMap[Tag]>) | (HTMLElement | string),
        ...children: (HTMLElement | string)[],
    ]
): HTMLElementTagNameMap[Tag] {
    const element = document.createElement(tag);
    const props = rest[0];
    let propsOffset = 0;
    if (typeof props === 'object' && !(props instanceof Node)) {
        propsOffset = 1;
        for (const prop in props) {
            if (!Object.prototype.hasOwnProperty.call(props, prop)) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const value = props[prop as keyof typeof props] as any;
            if (prop.startsWith('$')) {
                if (typeof value === 'function') {
                    element.addEventListener(prop.slice(2), value);
                } else {
                    element.addEventListener(prop.slice(2), value.listener, value.options);
                }
            } else {
                element[prop as keyof HTMLElementTagNameMap[Tag]] = value;
            }
        }
    }
    const dest = tag === 'template' ? (element as HTMLTemplateElement).content : element;

    for (let i = propsOffset; i < rest.length; i++) {
        dest.append((rest as (HTMLElement | string)[])[i]);
    }

    return element;
}
