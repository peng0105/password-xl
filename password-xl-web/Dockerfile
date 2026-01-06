FROM harbor.huangyp.cn/dockerhub/nginx
MAINTAINER password-xl-web
EXPOSE 80
COPY password-xl-web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY password-xl-web/nginx/nginx.conf /etc/nginx/nginx.conf
COPY password-xl-web/dist/ /html/
RUN mkdir /var/log/nginx/log/
