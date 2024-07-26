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
    }
]
export default routes
