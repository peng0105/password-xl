# Repository Guidelines

## Project Structure & Module Organization

This repository contains three deployable areas. `password-xl-web/` is the Vue 3 + Vite + TypeScript client, with source in `src/`, Electron entry points in `electron/`, nginx config in `nginx/`, and assets in `public/` plus `src/assets/`. `password-xl-service/` is the Spring Boot backend; Java code lives in `src/main/java/com/passwordxl/`, configuration in `src/main/resources/`, and `src/main/resources/static/` contains built frontend artifacts. Prefer editing frontend source and rebuilding instead of hand-editing those static assets. `password-xl-home/` is a static landing/home site. Deployment manifests live under `k8s/`; CI/deployment pipelines are in Jenkinsfiles and `.github/workflows/`.

## Build, Test, and Development Commands

Run frontend commands from `password-xl-web/`:

- `yarn install` installs dependencies from `yarn.lock`.
- `yarn start` starts the Vite dev server.
- `yarn build` runs `vue-tsc -b` and creates a production Vite build.
- `yarn preview` type-checks, builds, and serves the production build locally.
- `yarn start-exe` runs the Electron app entry point.

Run service commands from `password-xl-service/`:

- `.\gradlew.bat bootRun` starts the Spring Boot service on Windows.
- `.\gradlew.bat build` compiles and packages the backend.
- `.\gradlew.bat nativeCompile` builds the GraalVM native image when the local toolchain supports it.

## Coding Style & Naming Conventions

Frontend code uses TypeScript, Vue single-file components, Pinia stores, and Element Plus. Keep component names in PascalCase, for example `PasswordForm.vue`, and store files as `*Store.ts`. Follow the existing style: two-space indentation in Vue/TS, single quotes for most imports, semicolons only where the surrounding file uses them. Backend Java uses package `com.passwordxl`, Lombok annotations, Spring stereotypes, four-space indentation, and PascalCase classes with camelCase methods and fields.

## Testing Guidelines

No dedicated test suites are currently present. Before opening a PR, run `yarn build` for frontend changes and `.\gradlew.bat build` for backend changes. If tests are added, place frontend specs near the affected module or in a clear `src/**/__tests__/` location, and backend tests under `password-xl-service/src/test/java/` with `*Test.java` naming.

## Commit & Pull Request Guidelines

Recent commits are short Chinese summaries, often numbered, such as `1、部署配置优化` or direct descriptions like `nginx配置调整`. Keep commits concise and focused. PRs should describe the change, list validation commands run, mention config/deployment impact, link related issues, and include screenshots or screen recordings for UI changes.

## Security & Configuration Tips

This is a password manager, so avoid committing credentials, tokens, private endpoints, or real user vault data. Treat `password-xl.toml`, `application.yml`, OSS/COS settings, and build artifacts carefully; document local values instead of embedding secrets.
