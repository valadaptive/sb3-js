import {describe, test, expect} from '@jest/globals';
import {compare, equals} from '../src/cast.js';

describe('comparison and equality', () => {
    const testValues = [
        'apple',
        'banana',
        'ApPlE',
        'BANANA',
        'appl',
        '',
        '     ',
        ' apple ',
        '\n',
        '\r\t\n\t\n',
        '\u000b\u000c\ufeff',
        '\u3000',

        true,
        false,
        'true',
        'false',
        'TrUe',
        'FaLsE',

        0,
        5,
        -4,
        -0,
        0.1,
        NaN,
        Infinity,
        -Infinity,
        0xa11afacade,
        '0',
        '5',
        '-4',
        '-0',
        '0.1',
        'NaN',
        'Infinity',
        '-Infinity',
        '0xa11afacade',
        '691942378206', // '0xa11afacade' as decimal (should test equal to the hex version)
    ];

    /**
     * scratch-vm's implementation of compare.
     * https://github.com/scratchfoundation/scratch-vm/blob/40c6654bfd3130878a674778c74fee50fbcaddc9/src/util/cast.js#L121
     */
    const referenceImplementation = (v1: unknown, v2: unknown) => {
        function isWhiteSpace(val: unknown) {
            return val === null || (typeof val === 'string' && val.trim().length === 0);
        }

        let n1 = Number(v1);
        let n2 = Number(v2);
        if (n1 === 0 && isWhiteSpace(v1)) {
            n1 = NaN;
        } else if (n2 === 0 && isWhiteSpace(v2)) {
            n2 = NaN;
        }
        if (isNaN(n1) || isNaN(n2)) {
            // At least one argument can't be converted to a number.
            // Scratch compares strings as case insensitive.
            const s1 = String(v1).toLowerCase();
            const s2 = String(v2).toLowerCase();
            if (s1 < s2) {
                return -1;
            } else if (s1 > s2) {
                return 1;
            }
            return 0;
        }
        // Handle the special case of Infinity
        if (
            (n1 === Infinity && n2 === Infinity) ||
            (n1 === -Infinity && n2 === -Infinity)
        ) {
            return 0;
        }
        // Compare as numbers.
        return n1 - n2;
    };

    /** Like Math.sign, but returns 0 for -0. */
    const signOf = (n: number) => (n === 0 ? 0 : n > 0 ? 1 : -1);

    /** Used for printing the values we're comparing. Handles infinities, signed zero, and NaN. */
    const stringify = (value: unknown) => {
        if (Object.is(value, -0)) return '-0';
        if (typeof value === 'number') return `${value}`;
        return JSON.stringify(value);
    };

    for (let i = 0; i < testValues.length; i++) {
        for (let j = 0; j < testValues.length; j++) {
            const referenceResult = referenceImplementation(testValues[i], testValues[j]);

            test(`compare ${stringify(testValues[i])} ${stringify(testValues[j])}`, () => {
                const compareResult = compare(testValues[i], testValues[j]);
                expect(typeof compareResult).toBe('number');
                expect(compareResult).not.toBeNaN();
                expect(signOf(compareResult)).toMatchSnapshot();
                expect(signOf(compareResult)).toBe(signOf(referenceResult));

                const flippedResult = compare(testValues[j], testValues[i]);
                expect(signOf(compareResult)).toBe(signOf(-flippedResult));
            });

            test(`equals ${stringify(testValues[i])} ${stringify(testValues[j])}`, () => {
                const equalsResult = equals(testValues[i], testValues[j]);
                expect(typeof equalsResult).toBe('boolean');
                expect(equalsResult).toBe(referenceResult === 0);
            });
        }
    }
});
