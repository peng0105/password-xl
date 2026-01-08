FROM harbor.huangyp.cn/dockerhub/debian:stable-slim

WORKDIR /app

COPY build/native/nativeCompile/password-xl-service .

EXPOSE 8080

CMD ["./password-xl-service"]
