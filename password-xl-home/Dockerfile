FROM dockerhub.huangyp.cn/library/nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/
COPY images/ /usr/share/nginx/html/images/

EXPOSE 80
