# Use a minimal base image for the native executable
FROM busybox:latest

# Set the working directory
WORKDIR /app

RUN apk add --no-cache libstdc++ zlib

# Copy the native executable from the build context to the container
COPY password-xl-service/build/native/nativeCompile/password-xl-service .

# Expose port 8080 (or the port your application uses)
EXPOSE 8080

# Run the application
CMD ["./password-xl-service"]
