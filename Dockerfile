# Daily Devotion: static PWA + PocketBase (Google sign-in & journal storage)
# served together from one container on port 80.

FROM alpine:3.22 AS pocketbase
ARG PB_VERSION=0.40.6
ARG PB_SHA256=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f
RUN apk add --no-cache unzip \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - \
 && unzip -q /tmp/pb.zip pocketbase -d /out

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=pocketbase /out/pocketbase /pb/pocketbase

# Backend config (schema migrations, startup hooks, entrypoint)
COPY server/pb_migrations /pb/pb_migrations
COPY server/pb_hooks /pb/pb_hooks
COPY server/entrypoint.sh /pb/entrypoint.sh

# Frontend (see .dockerignore for what is excluded)
COPY . /pb/pb_public
RUN rm -rf /pb/pb_public/server && chmod +x /pb/entrypoint.sh

# Database + uploaded files. MUST be a persistent volume in Coolify.
VOLUME /pb/pb_data

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1/api/health || exit 1

CMD ["/pb/entrypoint.sh"]
