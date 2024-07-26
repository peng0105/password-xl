FROM nginx
MAINTAINER password-xl
EXPOSE 80
COPY dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir /var/log/nginx/log/
