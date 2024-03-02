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
            (value.length === 5 && value.toLowerCase() === 'false')
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

export const isWhiteSpace = (value: string | number | boolean): boolean =>
    typeof value === 'string' && value.trim().length === 0;

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
    return compare(v1, v2) === 0;
};
