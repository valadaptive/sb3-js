declare class TypedEvent<T extends string = string> extends Event {
    readonly type: T;
    constructor(type: T, eventInitDict?: EventInit);
}

declare interface TypedEventConstructor<T extends string = string> {
    new(type: T, eventInitDict?: EventInit): TypedEvent<T>;
    EVENT_NAME: T;
}

type TypedEventListener<T> = (evt: T) => void | {
    handleEvent(object: T): void;
};

declare class TypedEventTarget<Event extends TypedEvent> {
    addEventListener<T extends Event['type']>(
        type: T,
        listener: TypedEventListener<Extract<Event, {type: T}>> | null,
        options?: AddEventListenerOptions | boolean
    ): void;

    removeEventListener<T extends Event['type']>(
        type: T,
        listener: TypedEventListener<Extract<Event, {type: T}>> | null,
        options?: AddEventListenerOptions | boolean
    ): void;

    dispatchEvent<T extends Event>(
        event: T
    ): boolean;
}

export {TypedEvent, TypedEventListener, TypedEventTarget, TypedEventConstructor};
