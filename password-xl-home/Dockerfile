FROM harbor.huangyp.cn/dockerhub/nginx:alpine-slim
MAINTAINER password-xl-home
EXPOSE 80
RUN mkdir -p /html/images
COPY index.html /html
COPY images /html/images
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir /var/log/nginx/log/
