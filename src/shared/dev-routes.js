/**

 * @file Dev-only Vue routes (editor, calculations). Imported by router and navbar.

 * @module shared/dev-routes

 */



/** @typedef {{ path: string, name: string, component: () => Promise<unknown>, keepAliveName: string, navLabel: string, editorMode?: string, editorFile?: string }} DevRouteDef */



/** @type {DevRouteDef[]} */

export const DEV_ROUTE_DEFS = [

    {

        path: '/editor',

        name: 'editor',

        component: () => import('@/views/EditorView.vue'),

        keepAliveName: 'EditorView',

        navLabel: 'Editor',

        editorMode: 'skills',

        editorFile: 'skills.json',

    },

    {

        path: '/editor/subskills',

        name: 'subskillsEditor',

        component: () => import('@/views/EditorView.vue'),

        keepAliveName: 'EditorView',

        navLabel: 'Subskills',

        editorMode: 'subskills',

        editorFile: 'subskills.json',

    },

    {

        path: '/calculations',

        name: 'calculations',

        component: () => import('@/views/CalculationsView.vue'),

        keepAliveName: 'CalculationsView',

        navLabel: 'Calculations',

    },

];



/** Route `name` values for dev-only pages. */

export const DEV_ROUTE_NAMES = DEV_ROUTE_DEFS.map((r) => r.name);



/** `keep-alive` component `include` names for dev views. */

export const DEV_KEEP_ALIVE_NAMES = [...new Set(DEV_ROUTE_DEFS.map((r) => r.keepAliveName))];



/**

 * @param {string | symbol | null | undefined} routeName

 * @returns {boolean}

 */

export function isDevRouteName(routeName) {

    return typeof routeName === 'string' && DEV_ROUTE_NAMES.includes(routeName);

}



/**

 * Routes that show the version selector in the navbar.

 * @param {string | symbol | null | undefined} routeName

 * @returns {boolean}

 */

export function routeShowsVersionSelector(routeName) {

    if (typeof routeName !== 'string') return false;

    return (

        routeName === 'skills' ||

        routeName === 'planner' ||

        isDevRouteName(routeName)

    );

}

