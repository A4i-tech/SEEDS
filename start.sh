#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: ./start.sh [service...]

Starts one or more SEEDS services from the repo root.

Available services:
  mongodb     Start local MongoDB on 127.0.0.1:27017
  backend     Start backend-server
  teacher     Start teacher-webapp
  content     Start ContentWebApp
  websocket   Start websocket-service
  conference  Start ConferenceV2 on 0.0.0.0:9210
  tunnel      Start ngrok tunnel for ConferenceV2 using ConferenceV2/.env
  all         Start all services above

Examples:
  ./start.sh backend teacher
  ./start.sh all
EOF
}

require_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required but not installed." >&2
    exit 1
  fi
}

require_mongod() {
  if ! command -v mongod >/dev/null 2>&1; then
    echo "mongod is required but not installed." >&2
    exit 1
  fi
}

require_poetry() {
  if ! command -v poetry >/dev/null 2>&1; then
    echo "poetry is required but not installed." >&2
    exit 1
  fi
}

require_ngrok() {
  if ! command -v ngrok >/dev/null 2>&1; then
    echo "ngrok is required but not installed." >&2
    exit 1
  fi
}

ensure_dependencies() {
  local service_dir="$1"
  if [ ! -d "${service_dir}/node_modules" ]; then
    echo "Missing dependencies in ${service_dir}. Run 'npm install' there first." >&2
    exit 1
  fi
}

start_service() {
  local label="$1"
  local service_dir="$2"

  ensure_dependencies "${service_dir}"

  (
    cd "${ROOT_DIR}/${service_dir}"
    echo "Starting ${label} from ${service_dir}"
    exec npm start
  ) &
}

read_conf_env_value() {
  local key="$1"
  local env_file="${ROOT_DIR}/ConferenceV2/.env"

  if [ ! -f "${env_file}" ]; then
    echo "Missing ${env_file}" >&2
    exit 1
  fi

  local value
  value="$(sed -n "s/^${key}=//p" "${env_file}" | tail -n 1)"
  value="${value%\"}"
  value="${value#\"}"

  if [ -z "${value}" ]; then
    echo "Missing ${key} in ${env_file}" >&2
    exit 1
  fi

  printf '%s\n' "${value}"
}

start_mongodb() {
  local db_path="${ROOT_DIR}/.mongodb-data"
  mkdir -p "${db_path}"

  echo "Starting MongoDB with dbpath ${db_path}"
  (
    cd "${ROOT_DIR}"
    exec mongod --dbpath "${db_path}" --bind_ip 127.0.0.1 --port 27017
  ) &
}

start_conference() {
  echo "Starting ConferenceV2 from ConferenceV2"
  (
    cd "${ROOT_DIR}/ConferenceV2"
    local venv_dir
    venv_dir="$(find "${HOME}/.cache/pypoetry/virtualenvs" -maxdepth 1 -type d -name 'conferencev2-*' | head -n 1)"

    if [ -n "${venv_dir}" ] && [ -x "${venv_dir}/bin/uvicorn" ]; then
      exec "${venv_dir}/bin/uvicorn" app.main:app --host 0.0.0.0 --port 9210
    fi

    exec poetry run uvicorn app.main:app --host 0.0.0.0 --port 9210
  ) &
}

start_tunnel() {
  local tunnel_url
  tunnel_url="$(read_conf_env_value "EVENTS_WEBHOOK_EP")"

  echo "Starting ngrok tunnel for ConferenceV2 at ${tunnel_url}"
  (
    cd "${ROOT_DIR}"
    exec ngrok http 9210 --url "${tunnel_url}" --log stdout
  ) &
}

main() {
  if [ "$#" -eq 0 ]; then
    usage
    exit 1
  fi

  local services=("$@")
  if [ "$1" = "all" ]; then
    services=("mongodb" "backend" "teacher" "content" "websocket" "conference" "tunnel")
  fi

  for service in "${services[@]}"; do
    case "${service}" in
      mongodb)
        require_mongod
        start_mongodb
        ;;
      backend)
        require_npm
        start_service "backend-server" "backend-server"
        ;;
      teacher)
        require_npm
        start_service "teacher-webapp" "teacher-webapp"
        ;;
      content)
        require_npm
        start_service "ContentWebApp" "ContentWebApp"
        ;;
      websocket)
        require_npm
        start_service "websocket-service" "websocket-service"
        ;;
      conference)
        require_poetry
        start_conference
        ;;
      tunnel)
        require_ngrok
        start_tunnel
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown service: ${service}" >&2
        usage
        exit 1
        ;;
    esac
  done

  wait
}

main "$@"
