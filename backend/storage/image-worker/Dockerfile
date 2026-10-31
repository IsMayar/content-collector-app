FROM clamav/clamav:stable_base@sha256:a01a78acf14e356f9d95c0eeb640ac9fa48a98a59933dea877f5a4d01573a0eb
USER root
RUN apk add --no-cache imagemagick=7.1.2.34-r0 imagemagick-jpeg=7.1.2.34-r0
COPY policy.xml /etc/ImageMagick-7/policy.xml
COPY process.sh /usr/local/bin/process-image
RUN chmod 0555 /usr/local/bin/process-image
ENTRYPOINT ["/usr/local/bin/process-image"]
