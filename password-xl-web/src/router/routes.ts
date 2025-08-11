const routes = [
    {
        path: '/',
        name: 'Index',
        component: () => import('@/views/IndexPage.vue'),
    },
    {
        path: '/login',
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
