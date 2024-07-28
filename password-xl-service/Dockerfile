# Base image
FROM ghcr.io/graalvm/native-image:ol7-java21-22.1.0

# Set working directory
WORKDIR /app

# Copy the native executable from the build context to the container
COPY ./build/native/nativeCompile/password-xl-service .

# Set the executable permission
RUN chmod +x password-xl-service

# Define the command to run the application
CMD ["./password-xl-service"]
