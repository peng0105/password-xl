FROM dockerhub.huangyp.cn/library/nginx:alpine
MAINTAINER password-xl-web
EXPOSE 80
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY dist/ /html/
RUN mkdir /var/log/nginx/log/
