FROM harbor.huangyp.cn/dockerhub/debian:stable-slim

WORKDIR /app

ENV TZ=Asia/Shanghai
ENV DATA_DIR=/password-xl-service

COPY build/native/nativeCompile/password-xl-service .

EXPOSE 8080

VOLUME ["/password-xl-service"]

ENTRYPOINT ["/app/password-xl-service"]
