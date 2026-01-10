FROM harbor.huangyp.cn/dockerhub/debian:stable-slim

WORKDIR /app

ENV TZ=Asia/Shanghai
ENV DATA_DIR=/password-xl-service

RUN useradd -r -u 10001 -g root appuser

RUN mkdir -p /app /password-xl-service && chown -R 10001:0 /app /password-xl-service && chmod -R g=u /app /password-xl-service

COPY build/native/nativeCompile/password-xl-service .

RUN chmod +x /app/password-xl-service

EXPOSE 8080

VOLUME ["/password-xl-service"]

USER 10001

ENTRYPOINT ["/app/password-xl-service"]
