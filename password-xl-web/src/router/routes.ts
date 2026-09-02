const routes = [
    {
        path: '/',
        name: 'Index',
        component: () => import('@/views/IndexPage.vue'),
    },
    {
        path: '/login/:type(oss|cos|private|local)?',
        name: 'Login',
        component: () => import('@/views/LoginPage.vue'),
    },
    {
        path: '/note',
        name: 'Note',
        component: () => import('@/views/NotePage.vue'),
    }
]
export default routes
