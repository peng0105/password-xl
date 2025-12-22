FROM harbor.huangyp.cn/dockerhub/nginx
MAINTAINER password-xl-web
EXPOSE 80
COPY dist/ /html/
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir /var/log/nginx/log/
