FROM harbor.huangyp.cn/dockerhub/debian:stable-slim

WORKDIR /app

COPY build/native/nativeCompile/password-xl-service .

COPY default.conf /password-xl-service/default.conf

EXPOSE 8080

VOLUME /password-xl-service

CMD ["./password-xl-service"]
