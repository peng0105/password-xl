FROM debian:stable-slim

WORKDIR /app

COPY password-xl-service/build/native/nativeCompile/password-xl-service .

EXPOSE 8080

CMD ["./password-xl-service"]
