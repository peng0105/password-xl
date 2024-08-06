FROM nginx
MAINTAINER password-xl-web
EXPOSE 80
COPY password-xl-web/dist/ /html/
COPY password-xl-web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY password-xl-web/nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir /var/log/nginx/log/
