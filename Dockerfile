FROM nginx:alpine

# Custom Nginx configuration for SPA + PWA caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets
COPY . /usr/share/nginx/html

# Clean up build/source artifacts not needed in web server
RUN rm -rf /usr/share/nginx/html/.git \
           /usr/share/nginx/html/scripts \
           /usr/share/nginx/html/references \
           /usr/share/nginx/html/Dockerfile* \
           /usr/share/nginx/html/docker-compose* \
           /usr/share/nginx/html/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
