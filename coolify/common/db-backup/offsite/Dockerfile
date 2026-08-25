# offsite-backup — rclone + inotify-tools, so it can push each backup to the
# remote the moment it lands in /backups (event-driven) instead of once a day.
FROM rclone/rclone:1.68
RUN apk add --no-cache inotify-tools
ENTRYPOINT []

# スクリプトを焼き込む（bind mount は Coolify の 0750 で読めなくなりうる）。
COPY offsite-sync.sh /offsite-sync.sh
RUN chmod +x /offsite-sync.sh
