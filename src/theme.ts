export type ColorCategory =
    | 'motion'
    | 'looks'
    | 'sound'
    | 'event'
    | 'control'
    | 'sensing'
    | 'operator'
    | 'data'
    | 'data_lists'
    | 'procedures'
    | 'extensions'
    | 'internal';

export type BlockTheme = {[C in ColorCategory]: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
}};

export type Theme = {
    text: string;
    blocks: BlockTheme;
};

export const defaultTheme = {
    text: '#FFFFFF',
    blocks: {
        motion: {
            primary: '#4C97FF',
            secondary: '#4280D7',
            tertiary: '#3373CC',
            quaternary: '#3373CC',
        },
        looks: {
            primary: '#9966FF',
            secondary: '#855CD6',
            tertiary: '#774DCB',
            quaternary: '#774DCB',
        },
        sound: {
            primary: '#CF63CF',
            secondary: '#C94FC9',
            tertiary: '#BD42BD',
            quaternary: '#BD42BD',
        },
        control: {
            primary: '#FFAB19',
            secondary: '#EC9C13',
            tertiary: '#CF8B17',
            quaternary: '#CF8B17',
        },
        event: {
            primary: '#FFBF00',
            secondary: '#E6AC00',
            tertiary: '#CC9900',
            quaternary: '#CC9900',
        },
        sensing: {
            primary: '#5CB1D6',
            secondary: '#47A8D1',
            tertiary: '#2E8EB8',
            quaternary: '#2E8EB8',
        },
        operator: {
            primary: '#59C059',
            secondary: '#46B946',
            tertiary: '#389438',
            quaternary: '#389438',
        },
        data: {
            primary: '#FF8C1A',
            secondary: '#FF8000',
            tertiary: '#DB6E00',
            quaternary: '#DB6E00',
        },
        data_lists: {
            primary: '#FF661A',
            secondary: '#FF5500',
            tertiary: '#E64D00',
            quaternary: '#E64D00',
        },
        procedures: {
            primary: '#FF6680',
            secondary: '#FF4D6A',
            tertiary: '#FF3355',
            quaternary: '#FF3355',
        },
        extensions: {
            primary: '#0fBD8C',
            secondary: '#0DA57A',
            tertiary: '#0B8E69',
            quaternary: '#0B8E69',
        },
        internal: {
            primary: '#000000',
            secondary: '#000000',
            tertiary: '#000000',
            quaternary: '#000000',
        },
    },
} as const satisfies Theme;
