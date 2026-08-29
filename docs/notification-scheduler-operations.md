# Notification scheduler operations

The `scheduler` service invokes the group-buy ending-soon notification job daily at 14:00 UTC. `NOTIFICATION_JOB_SECRET` is required by Compose and must be identical in `app` and `scheduler`.

## Release checks

Before release, from the production Compose directory:

```sh
umask 077
rollback_dir="../keyatlas-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$rollback_dir"
release_sha=REPLACE_WITH_REVIEWED_CI_SHA
printf '%s\n' "$release_sha" > "$rollback_dir/release-sha"
cp docker-compose.yml "$rollback_dir/docker-compose.yml"
chmod 600 "$rollback_dir/docker-compose.yml"
(cd "$rollback_dir" && sha256sum docker-compose.yml > docker-compose.yml.sha256)
docker compose images --format json > "$rollback_dir/images.json"
docker compose ps --all --format json > "$rollback_dir/compose-ps.json"
project_name=$(docker compose config --format json | jq -r .name)
printf '%s\n' "$project_name" > "$rollback_dir/project-name"
docker ps --all --filter "label=com.docker.compose.project=$project_name" --format '{{json .}}' > "$rollback_dir/project-containers.jsonl"
docker volume ls --filter "label=com.docker.compose.project=$project_name" --format '{{.Name}}' > "$rollback_dir/volumes"
docker compose config --quiet
docker compose ps --all
docker compose logs --tail=20 app scheduler
```

Replace the SHA placeholder with the reviewed, successful CI revision before proceeding. The production directory is not a Git checkout; this metadata ties the host-file change to its source revision. Keep the rollback directory mode-restricted and do not upload it or attach it to tickets.

Deploy only through Compose:

```sh
docker compose pull
docker compose up -d
```

After release, prove service and user-facing health:

```sh
docker compose ps
docker compose logs --tail=40 app scheduler
curl --fail --silent --show-error https://keyatlas.io/api/health
```

Confirm the next 14:00 UTC scheduler log is successful, or use an owner-approved authenticated POST probe and verify a non-401 response. Never print the secret or authorization header. This Compose-only change does not modify database or upload volumes.

## Rollback

First inventory the live project and confirm the rollback target recorded before release. Restore the recorded Compose revision, review the rendered diff, then apply it through Compose only. `--remove-orphans` is required when the prior model does not contain `scheduler`.

```sh
rollback_dir=/path/to/the/recorded/keyatlas-rollback-timestamp
release_sha=$(cat "$rollback_dir/release-sha")
project_name=$(cat "$rollback_dir/project-name")
printf 'reverting release source: %s\n' "$release_sha"
docker compose ps --all
docker ps --all --filter "label=com.docker.compose.project=$project_name" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker volume ls --filter "label=com.docker.compose.project=$project_name" --format '{{.Name}}'
(cd "$rollback_dir" && sha256sum --check docker-compose.yml.sha256)
cp "$rollback_dir/docker-compose.yml" docker-compose.yml
docker compose config --quiet
docker compose pull
docker compose up -d --remove-orphans
docker compose ps --all
docker ps --all --filter "label=com.docker.compose.project=$project_name" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
test -z "$(docker ps --all --quiet --filter "label=com.docker.compose.project=$project_name" --filter 'label=com.docker.compose.service=scheduler')"
docker compose logs --tail=40 app
curl --fail --silent --show-error https://keyatlas.io/api/health
test "$(sort "$rollback_dir/volumes")" = "$(docker volume ls --filter "label=com.docker.compose.project=$project_name" --format '{{.Name}}' | sort)"
```

The empty scheduler-container check proves the removed service is no longer present; do not request scheduler logs after removal. The final comparison proves that the project-scoped named-volume inventory is unchanged. Never pass `--volumes` during production rollback: PostgreSQL, Redis, Meilisearch, and uploads data must remain intact.
