/**
 * Scratch-style cast to number.
 * @param value Value to cast to a number.
 */
export const toNumber = (value: string | number | boolean | void): number => {
    if (typeof value === 'number') {
        // Scratch casts NaN to 0.
        if (Number.isNaN(value)) return 0;
        return value;
    }
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return n;
};

/**
 * Scratch-style cast to boolean.
 * @param value Value to cast to a boolean.
 */
export const toBoolean = (value: string | number | boolean | void): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        // These strings are considered false in Scratch.
        if (
            value === '' ||
            value === '0' ||
            // Don't perform toLowerCase (expensive) unless we know it's 5 characters long. and could be 'false'.
            value === 'false' || (value.length === 5 && value.toLowerCase() === 'false')
        ) return false;
        return true;
    }

    return Boolean(value);
};

/**
 * Scratch-style cast to string.
 * @param value Value to cast to a string.
 */
export const toString = (value: string | number | boolean | void): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'undefined') return '';
    return String(value);
};

/**
 * Cast a value to a 1-based list index, handling special values like 'last' and 'random'. Returns 0 if the index isn't
 * valid (e.g. out of bounds or some arbitrary string).
 * @param value The value to cast to a list index.
 * @param length The length of the list.
 * @returns 1-based list index, or 0 if the index isn't valid.
 */
export const toListIndex = (value: string | number | boolean | void, length: number): number => {
    if (typeof value !== 'number') {
        if (value === 'last') {
            return length;
        }

        if (value === 'random' || value === 'any') {
            if (length === 0) return 0;
            return Math.floor(Math.random() * length) + 1;
        }
    }
    value = Math.floor(toNumber(value));
    if (value < 1 || value > length) return 0;
    return value;
};

/**
 * Cast a value to a color. Supports raw numbers and hex strings (both shorthand like #fff and standard like #ffffff).
 * @param value The value to cast to a string.
 * @param dst Optionally, the destination array to write the result to. If not provided, a new array is created.
 * @returns The color as an array of 4 bytes (RGBA).
 */
export const toColor = (
    value: string | number | boolean | void,
    dst = new Uint8ClampedArray(4),
): Uint8ClampedArray => {
    let color;
    if (typeof value === 'string' && value[0] === '#') {
        if (/^#[\da-fA-F]{6}$/.test(value)) {
            // Standard hex color
            color = parseInt(value.slice(1), 16);
        } else if (/^#[\da-fA-F]{3}$/.test(value)) {
            // Shorthand hex color
            color = parseInt(`${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`, 16);
        } else {
            // Invalid hex color. Treat as black.
            color = 0;
        }
    } else if (typeof value === 'boolean') {
        color = value ? 1 : 0;
    } else {
        color = toNumber(value) & 0xffffffff;
    }

    dst[0] = (color >> 16) & 0xff;
    dst[1] = (color >> 8) & 0xff;
    dst[2] = color & 0xff;
    const alpha = (color >> 24) & 0xff;
    dst[3] = alpha === 0 ? 0xff : alpha;
    return dst;
};

export const isWhiteSpace = (value: string | number | boolean): boolean =>
    typeof value === 'string' && (value === '' || value.trim().length === 0);

/**
 * Compare two values using Scratch semantics.
 * @param v1 First value to compare.
 * @param v2 Second value to compare
 * @returns Positive if v1 > v2, negative if v1 < v2, 0 if v1 === v2.
 */
export const compare = (v1: string | number | boolean, v2: string | number | boolean): number => {
    // Fast path (fingers crossed we actually hit it)
    if (v1 === v2) return 0;

    let n1 = Number(v1);
    let n2 = Number(v2);

    if (n1 === 0 && isWhiteSpace(v1)) {
        n1 = NaN;
    } else if (n2 === 0 && isWhiteSpace(v2)) {
        n2 = NaN;
    }

    if (isNaN(n1) || isNaN(n2)) {
        // At least one argument can't be converted to a number. Compare as strings.
        // TODO: Try to reduce the number of isNaN checks and casts needed to get here.
        let s1 = String(v1);
        let s2 = String(v2);
        if (s1 === s2) return 0;
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        if (s1 < s2) return -1;
        if (s1 > s2) return 1;
        return 0;
    }

    if ((n1 === Infinity && n2 === Infinity) || (n1 === -Infinity && n2 === -Infinity)) {
        return 0;
    }

    return n1 - n2;
};

/**
 * Check if two values are equal using Scratch semantics.
 * @todo Use an optimized implementation instead of just calling compare.
 * @param v1 First value to compare
 * @param v2 Second value to compare
 * @returns true if v1 === v2, false otherwise.
 */
export const equals = (v1: string | number | boolean, v2: string | number | boolean): boolean => {
    if (v1 === v2) return true;

    if (typeof v1 === 'number' && typeof v2 === 'number') {
        // If the two compare equal, the fast path returns true. The only corner case is when both are NaN.
        return Number.isNaN(v1) && Number.isNaN(v2);
    }

    if (typeof v1 === 'string' && typeof v2 === 'string') {
        const n1 = Number(v1);
        if (Number.isNaN(n1) || isWhiteSpace(v1)) return v1.toLowerCase() === v2.toLowerCase();
        const n2 = Number(v2);
        if (Number.isNaN(n2) || isWhiteSpace(v2)) return v1.toLowerCase() === v2.toLowerCase();

        return equals(n1, n2);
    }

    // If v1 === v2, the fast path returns true.
    if (typeof v1 === 'boolean' && typeof v2 === 'boolean') {
        return false;
    }

    return compare(v1, v2) === 0;
};

/**
 * Check if a (loosely-typed) value is an integer. Notably, this returns false for decimal strings, een ones that are
 * representable as integers (e.g. "1.0").
 * @param value The value to check.
 */
export const isInt = (value: string | number | boolean): boolean => {
    if (typeof value === 'number') {
        // NaN counts as an integer to Scratch.
        return Number.isInteger(value) || Number.isNaN(value);
    }

    if (typeof value === 'boolean') {
        // After being cast to numbers, booleans are always integers.
        return true;
    }

    if (typeof value === 'string') {
        return !value.includes('.');
    }

    // This should be unreachable, but TypeScript can't infer that.
    return false;
};
