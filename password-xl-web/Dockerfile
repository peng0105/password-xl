ARG NGINX_IMAGE=nginx:alpine
FROM ${NGINX_IMAGE}

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf

COPY dist/ /usr/share/nginx/html/

EXPOSE 80
