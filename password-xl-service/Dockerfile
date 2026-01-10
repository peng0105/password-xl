FROM harbor.huangyp.cn/dockerhub/debian:stable-slim

WORKDIR /app

COPY build/native/nativeCompile/password-xl-service .

EXPOSE 8080

VOLUME /password-xl-service

CMD ["./password-xl-service"]
