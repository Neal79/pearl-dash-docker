# Docker commands for Pearl Dashboard

.PHONY: help build up down restart logs shell composer artisan migrate seed fresh test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build all Docker containers
	docker-compose build --no-cache

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

restart: ## Restart all services
	docker-compose restart

logs: ## Show logs for all services
	docker-compose logs -f

logs-app: ## Show logs for Laravel app
	docker-compose logs -f app

shell: ## Access Laravel app container shell
	docker-compose exec app bash

shell-db: ## Access database container shell
	docker-compose exec db mysql -u pearldashuser -p pearl_dash

composer: ## Run composer install
	docker-compose exec app composer install

artisan: ## Run artisan command (usage: make artisan cmd="migrate")
	docker-compose exec app php artisan $(cmd)

migrate: ## Run database migrations
	docker-compose exec app php artisan migrate

migrate-fresh: ## Fresh migration with seeding
	docker-compose exec app php artisan migrate:fresh --seed

seed: ## Run database seeders
	docker-compose exec app php artisan db:seed

cache-clear: ## Clear all Laravel caches
	docker-compose exec app php artisan cache:clear
	docker-compose exec app php artisan config:clear
	docker-compose exec app php artisan route:clear
	docker-compose exec app php artisan view:clear

optimize: ## Optimize Laravel application
	docker-compose exec app php artisan config:cache
	docker-compose exec app php artisan route:cache
	docker-compose exec app php artisan view:cache

test: ## Run tests
	docker-compose exec app php artisan test

# Workspace Container Commands (for development)
workspace: ## Access workspace container shell for Laravel CLI tasks
	sudo docker compose exec workspace bash

workspace-up: ## Start workspace container
	sudo docker compose up -d workspace

workspace-artisan: ## Run artisan command in workspace (usage: make workspace-artisan cmd="migrate")
	sudo docker compose exec workspace php artisan $(cmd)

workspace-composer: ## Run composer command in workspace (usage: make workspace-composer cmd="install")
	sudo docker compose exec workspace composer $(cmd)

workspace-npm: ## Run npm command in workspace (usage: make workspace-npm cmd="install")
	sudo docker compose exec workspace npm $(cmd)

workspace-tinker: ## Start Laravel Tinker in workspace
	sudo docker compose exec workspace php artisan tinker

setup: build up migrate ## Initial setup: build, start services, and migrate
	@echo "Pearl Dashboard is ready!"
	@echo "Visit: http://localhost"

clean: ## Remove all containers, volumes and images
	docker-compose down -v --rmi all
	docker system prune -f
