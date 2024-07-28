# Use a minimal base image for the native executable
FROM busybox:latest

# Set the working directory
WORKDIR /app

# Copy the native executable from the build context to the container
COPY build/native/nativeCompile/password-xl-service .

# Expose port 8080 (or the port your application uses)
EXPOSE 8080

# Run the application
CMD ["./password-xl-service"]
