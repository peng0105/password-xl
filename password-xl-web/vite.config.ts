import path from 'path';
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import legacy from '@vitejs/plugin-legacy'

const srcPath = path.resolve(__dirname, './src')

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@': srcPath
        },
        extensions: ['.d.ts', '.ts', '.vue']
    },
    server: {
        host: '0.0.0.0',
    },
    plugins: [
        vue(),
        legacy({
            targets: ['Chrome >= 49', 'Android >= 5', 'iOS >= 10'],
        }),
        AutoImport({
            imports: ['vue'],
            resolvers: [
                ElementPlusResolver(),
            ],
            dts: path.resolve(srcPath, 'auto-imports.d.ts'),
        }),
        Components({
            resolvers: [
                ElementPlusResolver(),
            ],
            dts: path.resolve(srcPath, 'components.d.ts'),
        }),
    ],
    build: {
        chunkSizeWarningLimit: 1500,
        target: 'es2015',
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        let node_modules = id.toString().split('node_modules/')
                        if (node_modules && node_modules.length > 1) {
                            let name = node_modules[1].split('/')[0].toString();
                            if (['@vue', 'element-plus', '@element-plus', 'cos-js-sdk-v5', 'ali-oss', 'exceljs', 'aieditor'].includes(name)) {
                                return name
                            }
                            return 'vendor'
                        }
                    }
                }
            }
        }
    },
    // 屏蔽控制台
    esbuild: {
        drop: ['console', 'debugger'],
    }
})
