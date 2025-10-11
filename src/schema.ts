type ObjectSchema<Keys extends string> = {
    type: 'object';
    props: {[K in Keys]: Schema};
    optional?: Keys[];
};

export type Schema =
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | readonly Schema[]
    | ObjectSchema<string>
    | {type: 'array'; items: Schema}
    | {type: 'tuple'; items: readonly Schema[]}
    | {type: 'literal'; value: unknown}
    | {type: 'map'; items: Schema};

type ObjectForObjectSchema<S extends ObjectSchema<string>> = {
    [K in keyof S['props']]: ObjectForSchema<S['props'][K]> | (
        S['optional'] extends string[] ?
            K extends S['optional'][number] ? undefined
                : never
            : never);
};

export type ObjectForSchema<S extends Schema> = S extends 'string'
    ? string
    : S extends 'number'
        ? number
        : S extends 'boolean'
            ? boolean
            : S extends 'null'
                ? null
                : S extends readonly Schema[]
                    ? ObjectForSchema<S[number]>
                    : S extends {type: 'object'; props: {[key: string]: Schema}}
                        ? ObjectForObjectSchema<S>
                        : S extends {type: 'array'; items: infer I extends Schema}
                            ? ObjectForSchema<I>[]
                            : S extends {type: 'tuple'; items: infer T extends readonly Schema[]}
                                ? {[K in keyof T]: ObjectForSchema<T[K]>}
                                : S extends {type: 'literal'; value: infer E}
                                    ? E
                                    : S extends {type: 'map'; items: infer I extends Schema}
                                        ? {[key: string]: ObjectForSchema<I>}
                                        : never;

export const validateJson = <S extends Schema>(schema: S, json: unknown): json is ObjectForSchema<S> => {
    if (schema === 'string') {
        return typeof json === 'string';
    }
    if (schema === 'number') {
        return typeof json === 'number';
    }
    if (schema === 'boolean') {
        return typeof json === 'boolean';
    }
    if (schema === 'null') {
        return json === null;
    }
    if (Array.isArray(schema)) {
        return schema.some(subschema => validateJson(subschema, json));
    }
    // Array.isArray doesn't narrow readonly arrays :(
    const schema2 = schema as Exclude<S, 'string' | 'number' | 'boolean' | 'null' | readonly Schema[]>;
    if (schema2.type === 'object') {
        if (typeof json !== 'object' || json === null || Array.isArray(json)) {
            return false;
        }
        return Object.keys(schema2.props).every(key => {
            if (!(key in json)) {

                return schema2.optional?.includes(key);
            }
            const value = json[key as keyof typeof json];
            return validateJson(schema2.props[key], value);
        });
    }
    if (schema2.type === 'array') {
        return Array.isArray(json) && json.every(item => {
            // eslint-disable-next-line @stylistic/max-len
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any
            return validateJson(schema2.items as any, item as any);
        });
    }
    if (schema2.type === 'literal') {
        return json === schema2.value;
    }
    if (schema2.type === 'tuple') {
        return Array.isArray(json) &&
            json.length === schema2.items.length &&
            // eslint-disable-next-line @stylistic/max-len
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any
            json.every((item, i) => validateJson(schema2.items[i] as any, item as any));
    }
    if (schema2.type === 'map') {
        return typeof json === 'object' && json !== null &&
            Object.keys(json).every(key => validateJson(schema2.items, json[key as keyof typeof json]));
    }
    return false;
};

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
export const validateJsonOrError = <S>(
    schema: S,
    json: unknown,
    path: string = '<root object>',
): ObjectForSchema<S extends Schema ? S : never> => {
    if (schema === 'string') {
        if (typeof json !== 'string') {
            throw new Error(`Expected ${path} to be a string; got ${JSON.stringify(json, null, 2)}`);
        }
        return json as any;
    }

    if (schema === 'number') {
        if (typeof json !== 'number') {
            throw new Error(`Expected ${path} to be a number; got ${JSON.stringify(json, null, 2)}`);
        }
        return json as any;
    }

    if (schema === 'boolean') {
        if (typeof json !== 'boolean') {
            throw new Error(`Expected ${path} to be a boolean; got ${JSON.stringify(json, null, 2)}`);
        }
        return json as any;
    }

    if (schema === 'null') {
        if (json !== null) {
            throw new Error(`Expected ${path} to be null; got ${JSON.stringify(json, null, 2)}`);
        }
        return json as any;
    }

    if (Array.isArray(schema)) {
        let succeeded = false;
        for (const subschema of schema) {
            try {
                validateJsonOrError<unknown>(subschema, json, path);
                succeeded = true;
            } catch (e) {
                continue;
            }
        }
        if (!succeeded) {
            throw new Error(`Expected ${path} to match one of the schemas ${schema.map(s => JSON.stringify(s, null, 2)).join(', ')}, but got ${JSON.stringify(json, null, 2)}`);
        }
        return json as any;
    }

    const schema2 = schema as Exclude<Schema, 'string' | 'number' | 'boolean' | 'null' | readonly Schema[]>;

    if (schema2.type === 'object') {
        if (typeof json !== 'object' || json === null || Array.isArray(json)) {
            throw new Error(`Expected ${path} to be an object; got ${JSON.stringify(json, null, 2)}`);
        }
        for (const key of Object.keys(schema2.props)) {
            if (!(key in json)) {
                if (schema2.optional?.includes(key)) {
                    continue;
                }
                throw new Error(`Expected ${path}.${key} to exist`);
            }
            validateJsonOrError<unknown>(schema2.props[key], json[key as keyof typeof json], `${path}.${key}`);
        }
        return json as any;
    }

    if (schema2.type === 'array') {
        if (!Array.isArray(json)) {
            throw new Error(`Expected ${path} to be an array; got ${JSON.stringify(json, null, 2)}`);
        }
        for (let i = 0; i < json.length; i++) {
            validateJsonOrError<unknown>(schema2.items, json[i], `${path}[${i}]`);
        }
        return json as any;
    }

    if (schema2.type === 'literal') {
        if (json !== schema2.value) {
            throw new Error(`Expected ${path} to be ${JSON.stringify(schema2.value)}; got ${JSON.stringify(json, null, 2)}`);
        }
        return json as any;
    }

    if (schema2.type === 'tuple') {
        if (!Array.isArray(json)) {
            throw new Error(`Expected ${path} to be an array; got ${JSON.stringify(json, null, 2)}`);
        }
        if (json.length !== schema2.items.length) {
            throw new Error(`Expected ${path} to have length ${schema2.items.length}; got ${json.length}`);
        }
        return json.map((item, i) => validateJsonOrError<unknown>(schema2.items[i], item, `${path}[${i}]`)) as any;
    }

    if (schema2.type === 'map') {
        if (typeof json !== 'object' || json === null) {
            throw new Error(`Expected ${path} to be an object; got ${JSON.stringify(json, null, 2)}`);
        }
        const obj: any = {};
        for (const key of Object.keys(json)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            obj[key] = validateJsonOrError<unknown>(schema2.items, json[key as keyof typeof json], `${path}[${JSON.stringify(key)}]`);
        }
        return obj;
    }

    throw new Error(`Unhandled schema type ${(schema2 as any)}`);
};
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
